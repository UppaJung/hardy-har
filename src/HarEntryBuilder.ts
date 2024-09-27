import type {ConnectionIdString, DevToolsProtocol, FrameId, Content, Chunk, ISODateTimeString, Milliseconds, MonotonicTimeInSeconds, SecondsFromUnixEpoch} from "./types/HttpArchiveFormat.ts";
import { networkCookieToHarFormatCookie, parseCookie, parseRequestCookies, parseResponseCookies } from "./cookies.ts";
import { calculateRequestHeaderSize, calculateResponseHeaderSize, getHeaderValue, headersRecordToArrayOfHarHeaders } from "./headers.ts";
import {
	parsePostData,
	isHttp1x,
	roundToThreeDecimalPlaces
} from "./util.ts";
import type { PopulatedOptions } from "./Options.ts";
import { WebSocketMessageOpcode, type WebSocketDirectionAndEvent  } from "./types/HttpArchiveFormat.ts";
import type { HarPageBuilder } from "./HarPageBuilder.ts";
import type { TimeLord } from "./TimeLord.ts";
import type { Har } from "./types/index.ts";


function getTimeDifferenceInMillisecondsRoundedToThreeDecimalPlaces(startMs: number | undefined, endMs: number | undefined) {
	if  (startMs == null || endMs == null || startMs < 0 || endMs < 0) return undefined;
	const difference = endMs - startMs;
	if (difference >= 0) {
		return roundToThreeDecimalPlaces(difference);
	}
	return undefined;
}

/**
 * This class is responsible for building the entries of a HAR
 * 
 * First, the HarEntriesBuilder class will construct it and then populate its events fields.
 * 
 * Once all the events have been collected, if `isValidForPageTimeCalculations` is true, the
 * entry may be used for page timing even if it is not valid for inclusion in the HAR archive
 * (e.g. if there was no response).
 * 
 * Then, for all entries that for which `isValidForInclusionInHarArchive` will have entries
 * generated.
 * 
 * This class is organized in a declarative manner so that you can look at the HAR entry
 * generated at the end and work your way back to how each value is calculated by examining
 * the definitions. (in vscode, just use the "Go to Definition" feature.)
 * 
 */
export class HarEntryBuilder {
	priorRedirects = 0;
	/**
	 * The requestWillBeSentEvent is unique in two important ways.
	 *
	 * First, it is the only event that a HAR entry cannot exist without. So, it's
	 * guaranteed to exist if we're generating a HAR entry. As such, we define it
	 * with an _, and then have a get accessor that throws an exception should it
	 * ever be accessed when _requestWillBeSentEvent is null.
	 * 
	 * Second, requestWillBeSentEvent is the only event that may contain data for
	 * two HAR entries. If the request is a redirect for a prior HAR entry, it will
	 * a redirectResponse for that prior HAR entry for the prior URL, but all of
	 * the events other fields will pertain to the redirected request to the new URL
	 * which are placed into a new HAR entry. Hence, the redirected response is
	 * for the prior HAR entry is omitted from the event data stored with this HAR entry.
	 * (see the typescript `Omit<>` in its typing.)
	 */
	_requestWillBeSentEvent?: Omit<DevToolsProtocol.Network.RequestWillBeSentEvent, 'redirectResponse'>;

	/**
	 * Each of the following are events that may or may not exist for a given HAR entry.
	 */
	redirectResponse?: DevToolsProtocol.Network.RequestWillBeSentEvent["redirectResponse"];
	responseReceivedEvent?: DevToolsProtocol.Network.ResponseReceivedEvent;
	requestWillBeSentExtraInfoEvent?: DevToolsProtocol.Network.RequestWillBeSentExtraInfoEvent;
	responseReceivedExtraInfoEvent?: DevToolsProtocol.Network.ResponseReceivedExtraInfoEvent;
	requestServedFromCacheEvent?: DevToolsProtocol.Network.RequestServedFromCacheEvent;
	loadingFinishedEvent?: DevToolsProtocol.Network.LoadingFinishedEvent;
	loadingFailedEvent?: DevToolsProtocol.Network.LoadingFailedEvent;
	resourceChangedPriorityEvent?: DevToolsProtocol.Network.ResourceChangedPriorityEvent;
	getResponseBodyResponse?: DevToolsProtocol.Network.GetResponseBodyResponse;

	/* There may be multiple dataReceivedEvents for a single HAR entry */
	dataReceivedEvents: DevToolsProtocol.Network.DataReceivedEvent[] = [];
	/**
	 * We need to augment WebSocket frame sent and received events with their
	 * direction, because only the event name, not the event itself,
	 * tells us whether their data was sent or received */
	webSocketEvents: WebSocketDirectionAndEvent[] = [];	

	/**
	 * The page to which this entry is assigned after the HarPagesBuilder's
	 * assignEntriesToPages method is called, which in turn calls this
	 * HarEntryBuilder's assignToPage method.
	 */
	#assignedPage: HarPageBuilder | undefined;

	/**
	 * 
	 * @param timelord A timelord is used to map monotonic timestamps wall time.
	 * @param orderArrived The order in which the HAREntryBuilder was created, for debugging purposes
	 * @param options Package options
	 */
	constructor(private timelord: TimeLord, public readonly orderArrived: number, readonly options: PopulatedOptions) {}

	/**
	 * Does this entry builder have enough information to be used to calculate page timings?
	 */
	get isValidForPageTimeCalculations(): boolean {
		return this._requestWillBeSentEvent != null;
	}

	/**
	 * Does this entry builder have enough information to generate a HAR entry
	 * for inclusion in the HAR Archive?
	 */
	get isValidForInclusionInHarArchive(): boolean {
		const hasNoRequest = this._requestWillBeSentEvent == null;
		const hasNoResponse = this._response == null;
		if (hasNoRequest || hasNoResponse){
			 return false;
		}
		const isCancelled = this.loadingFailedEvent && (this.loadingFailedEvent.canceled && this.loadingFailedEvent.errorText !== 'net::ERR_ABORTED');
		if (isCancelled){
			 return false;
		}
		if (!this.isSupportedProtocol) {
			return false;
		}
		if (!this.options.includeResourcesFromDiskCache) {
			const isFromCache = this.requestServedFromCacheEvent != null || (this.response.fromDiskCache === true && !this.wasHttp2Push && !this.response.fromEarlyHints);
			if (isFromCache) {
				return false;
			}
		}
		return true;
	}

	/**
	 * A HAR entry cannot exist if there is no requestWillBeSentEvent.
	 * This getter is used by code that should only be called after
	 * ensuring _requestWillBeSentEvent is not null.
	 * 
	 * Both `isValidForInclusionInHarArchive` and `isValidForPageTimeCalculations`
	 * ensure _requestWillBeSentEvent is not null;
	 */
	private get requestWillBeSentEvent() {
		if (this._requestWillBeSentEvent != null) {
			return this._requestWillBeSentEvent;
		}
		throw new Error("Attempt to access requestWillBeSentEvent before it is set");
	}

	/**
	 * Associate this entry with a HarPageBuilder to represent the page that initiated
	 * network event represented by the HarEntry
	 * @param page 
	 */
	assignToPage = (page: HarPageBuilder): void => {
		this.#assignedPage = page;
	};

	/**
	 * Get the page that this entry is associated with.
	 */
	private get page() {
		return this.#assignedPage;
	}

	/**
	 * The frameId that initiated the network request represented by the HAR entry.
	 */
	get frameId(): FrameId | undefined {
		return this.requestWillBeSentEvent?.frameId;
	}

	/**
	 * The response to this network request, if it exists, which may come from a
	 * responseReceivedEvent or a subsequent requestWillBeSent event's
	 * redirectResponse field.
	 */
	private get _response() {
		if (this.responseReceivedEvent != null && this.redirectResponse != null) {
			throw new Error("Unexpected state with event having two types of responses.");
		}
		return this.responseReceivedEvent?.response ?? this.redirectResponse;
	}

	/**
	 * The response to this network request, if it exists, which may come from a
	 * responseReceivedEvent or a subsequent requestWillBeSent event's
	 * redirectResponse field.
	 * 
	 * This getter throws an exception if there is no response.
	 * 
	 * `isValidForInclusionInHarArchive` ensures that there is a response, so
	 * code used to generate a HAR entry after checking for validity may use
	 * this getter.
	 */
	private get response() {
		if (this._response == null) {
			throw new Error("Attempt to access a response even though there was no responseReceivedEvent or requestWillBeSent.redirectResponse event");
		}
		return this._response;
	}

	/**
	 * The body of the response to a network request (as a string), if it exists.
	 */
	private get responseBody() {
		return this.getResponseBodyResponse?.body;
	}

	/**
	 * The request's HTTP version, derived from the response's protocol field.
	 */
	private get httpVersion(): string | undefined {
		return this.response.protocol;
	}

	/**
	 * Tests if the request's HTTP version is HTTP/1.x
	 */
	private get isHttp1x() {
		return isHttp1x(this.httpVersion);
	}

	/**
	 * The text of the responseHeaders, which is obtained from responseReceivedExtraInfoEvent.headersText
	 * if available or response.headersText for legacy logs that do not have extra info.
	 */
	private get responseHeadersText() {
		// extraInfo.headersText provides "Raw response header text as it was received over the wire."
		return this.responseReceivedExtraInfoEvent?.headersText ?? 
			// deprecated, but here for backward compatibility
			this.response.headersText;
	}

	/**
	 * The size of the response headers, or -1 if it cannot be reliably calculated.
	 * 
	 * Note this from the spec
	 * > *headersSize - The size of received response-headers is computed only from headers that are really received from the server.
	 * > Additional headers appended by the browser are not included in this number, but they appear in the list of header objects.
	 */
	private get responseHeadersSize() {
		return (this.responseHeadersText != null) ? this.responseHeadersText.length :
			(this.isHttp1x && !this.response.fromDiskCache && !this.response.fromEarlyHints) ?
			calculateResponseHeaderSize(this.response) :
			-1;
	}

	/**
	 * The network headers in object (as opposed to string) format where
	 * header names are keys (property names) and values are property values.
	 */
	private get networkResponseHeadersObj() {
		return this.responseReceivedExtraInfoEvent?.headers ?? this.response.headers;
	}

	/**
	 * Response headers in HAR format.
	 */
	private get responseHarHeaders() {
		return headersRecordToArrayOfHarHeaders(this.networkResponseHeadersObj);
	}

	/**
	 * get the value of a specific response header.
	 * @param caseInsensitiveName Header name (case-insensitive)
	 * @returns The value of the header or undefined if the header is not present.
	 */
	private getResponseHeader = (caseInsensitiveName: string) => {
		const nameLc = caseInsensitiveName.toLowerCase();
		return this.responseHarHeaders.find( v => v.name.toLowerCase() == nameLc);
	};

	/**
	 * The encoded data length of the response, if known, or undefined.
	 */
	private get responseEncodedDataLength(): number | undefined {
		return this.loadingFinishedEvent?.encodedDataLength; // ?? this.response.encodedDataLength;
	}



	/**
	 * The response body size if known, or -1 if it cannot be reliably calculated.
	 * 
	 * Per spec
	 * > bodySize [number] - Size of the received response body in bytes.
	 * > Set to zero in case of responses coming from the cache (304).
	 * > Set to -1 if the info is not available.
	 * 
	 * Implicitly, this means the size of the body AFTER it has been decompressed, and so
	 * it's not possible to calculate by looking at the number of raw bytes over the network.
	 *
	 * There is no definitive source for the size of the response body, or even a definitive
	 * expectation of what the size is in some circumstances (e.g., an interrupted request
	 * that fetched some of the body but will return none of it).
	 * 
	 * The only reliable source seems to be the content encoding.
	 */
	private get responseBodySize() {
		// If we have a response body, we can be certain of its size.
		if (this.responseBody != null) {
			return this.responseBody.length;
		}

		// Per [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110#name-content-semantics)
		// > All 1xx (Informational), 204 (No Content), and 304 (Not Modified) responses do not include content.
		const {status} = this.response;
		if ( (status >= 100 && status < 200) || status == 204 || status == 304) {
			// We can be certain there's no content and body size is 0
			return 0;
		}

		// The 'body' and 'content' appear to be synonymous since compression happens at lower levels of the HTTP protocol,
		// so we the response included a content-length header, we can use that as a signal of the body size.
		// https://www.rfc-editor.org/rfc/rfc9110#name-content-length
		const contentLengthValue = this.getResponseHeader('Content-Length')?.value;
		const contentLengthParsed = contentLengthValue == null ? undefined : parseInt(contentLengthValue, 10);
		const contentLength = contentLengthParsed == null || isNaN(contentLengthParsed) ? undefined : contentLengthParsed;
		if (contentLength != null) {
			return contentLength;
		}
		
		// When we can't determine the body size, the HAR spec requires us to indicate this with a value of -1.
		return -1;
	}

	/**
	 * The response cookie header (the cookies that the server is asking the client to set)
	 */
	private get responseCookeHeader() {
		const {networkResponseHeadersObj: responseHeaders} = this;
		if (responseHeaders == null) return undefined;
		if (this.options.mimicChromeHar) {
			// Chrome-har doesn't look for cookies in the `set-cookie` header in the responseReceivedExtraInfoEvent
			// chrome-har-bug
			return getHeaderValue(this.response.headers, 'Set-Cookie');
		}
		return getHeaderValue(responseHeaders, 'Set-Cookie');
	}

	/**
	 * The response cookies (the cookies that the server is asking the client to set)
	 */
	private get responseCookies() {
		const cookieHeader = this.responseCookeHeader;
		if (cookieHeader == null) return undefined;
		const responseCookies = parseResponseCookies(cookieHeader);
		const blockedCookies = this.responseReceivedExtraInfoEvent?.blockedCookies ?? [];
		const setOfBlockedCookieNames = new Set(blockedCookies.filter( c => c.blockedReasons.length > 0 ).map((c) => 
				c.cookie != null ? c.cookie.name :
				parseCookie(c.cookieLine)?.name ?? ""
		));
		return responseCookies.filter( c => !setOfBlockedCookieNames.has(c.name));
	}

	/**
	 * The value of the location header used to indicate where a request should be
	 * redirected to.
	 */
	private get locationHeaderValue() {
		const {networkResponseHeadersObj: responseHeaders} = this;
		if (responseHeaders == null) return undefined;
		return this.networkResponseHeadersObj == null ? undefined :
			getHeaderValue(this.networkResponseHeadersObj, 'Location');
	}

	/**
	 * The requestId
	 */
	private get requestId() {
		if (this.options.mimicChromeHar && this.redirectResponse != null) {
			// For chrome-har compatibility, since it appends 'r' to requests that were redirected.
			return `${this.requestWillBeSentEvent.requestId}r`;
		}
		return this.requestWillBeSentEvent.requestId;
	}

	/**
	 * The network request object attached to requestWillBeSentEvent
	 */
	private get request() {
		return this.requestWillBeSentEvent.request;
	}

	/**
	 * The network request headers in object format (as opposed to string format),
	 * with header names as keys and header values as property values.
	 */
	private get requestHeaders(): DevToolsProtocol.Network.Headers {
		if (this.options.mimicChromeHar) {
			return this.response.requestHeaders ??
			// Ordering matters below as chrome-har will do a linear search through headers and find the earliest ones first.
			// That means we should place the earlier ones later in the below clause so they replace the later ones.
			({...this.requestWillBeSentExtraInfoEvent?.headers, ...this.requestWillBeSentEvent.request.headers});
		}
		return { ...this.requestWillBeSentExtraInfoEvent?.headers, ...this.response.requestHeaders, ...this.request.headers};
	}

	/**
	 * The request headers in HAR Header format
	 */
	private get requestHarHeaders(): Har.Header[] {
		return headersRecordToArrayOfHarHeaders(this.requestHeaders);
	}

	/**
	 * The cookie header of the request, containing the cookies being sent out.
	 * 
	 * Note: at time of writing, behavior differs from `chrome-har`, which does
	 * not include cookies from the requestWillBeSentExtraInfoEvent.
	 */
	private get requestCookieHeader() {
		return getHeaderValue(this.requestHeaders, 'Cookie');
	}

	/**
	 * The request cookies converted to HAR format.
	 */
	private get requestHarCookies(): Har.Cookie[] {
		const blockedCookies = this.responseReceivedExtraInfoEvent?.blockedCookies ?? [];
		const setOfBlockedCookieNames = new Set(blockedCookies.filter( c => c.blockedReasons.length > 0 ).map((c) => 
				c.cookie != null ? c.cookie.name :
				parseCookie(c.cookieLine)?.name ?? ""
		));
	const cookiesFromHeader = (this.requestCookieHeader == null ? [] : parseRequestCookies(this.requestCookieHeader))
		.filter( c => !setOfBlockedCookieNames.has(c.name));
	const associatedCookies = (this.requestWillBeSentExtraInfoEvent?.associatedCookies ?? [])
			.filter(({ blockedReasons }) => !blockedReasons.length)
			.map(({cookie}) => networkCookieToHarFormatCookie(cookie));
	const associatedCookieNames = new Set(associatedCookies.map( c => c.name));
	// The approach of preferring associated cookies over cookies derived from the request header differs from chrome-har.
	// It's preferable because the associated cookies have richer information.
	const cookiesFromHeaderNotBetterDescribedByAssociatedCookies = cookiesFromHeader.filter( c => !associatedCookieNames.has(c.name));
	return [...cookiesFromHeaderNotBetterDescribedByAssociatedCookies, ...associatedCookies];
	}

	/**
	 * The size of the request headers, or -1 if it cannot be reliably calculated.
	 */
	private get requestHeadersSize() {
		const {response, request, httpVersion} = this;
		if (response != null && response.requestHeadersText != null) {
			return response.requestHeadersText.length;
			// Chrome-har only allows calculating request size if http is version 1.x
		} else if (request != null && httpVersion != null && (isHttp1x(httpVersion) || !this.options.mimicChromeHar)) {
			return calculateRequestHeaderSize({...request, httpVersion});
		} else {
			return -1;
		}
	}

	/**
	 * The size of the request body, or 0 if there is no body
	 */
	private get requestBodySize() {
		return this.request.postData?.length ?? 0;
	}

	/**
	 * The request's URL as a URL class, which needs to be reconstructed
	 * to include the URL fragment (the section following the hash "#',
	 * which is not sent to the server) if it exists.
	 */
	private get requestParsedUrl() {
		const toParse = this.request.url + (this.request.urlFragment ?? '');
		try {
			return new URL(toParse);
		} catch {
			return undefined;
		}
	}

	/**
	 * The request's URL in string format.
	 */
	get requestUrl(): string | undefined {
		if (this.options.mimicChromeHar) {
			return this.requestParsedUrl?.href
				.replaceAll('{', '%7B').replaceAll('}', '%7D').replaceAll('|', '%7C').replaceAll("'", '%27');
		} else {
			return this.requestParsedUrl?.href;
		}
	}

	/**
	 * The request's query as an array of HAR QueryString objects
	 */
	private get queryStringHar(): Har.QueryString[] {
		const result = [] as Har.QueryString[];
		this.requestParsedUrl?.searchParams.forEach((value, name) => {
			result.push({name, value});
		});
		return result;
	}

	/**
	 * The constructed HAR post data object representing the data
	 * sent in the request body.
	 */
	private get postDataHar(): Har.PostData | undefined {
		const requestHeaders = this.options.mimicChromeHar ? this.requestWillBeSentEvent.request.headers : this.request.headers;
		const contentTypeHeader = getHeaderValue(requestHeaders, 'Content-Type');
		if (contentTypeHeader == null) return undefined;
		return parsePostData(contentTypeHeader, this.request.postData, this.options);
	}

	private get _isLinkPreloadObj(): {_isLinkPreload: true} | undefined {
		return this.request.isLinkPreload ? {_isLinkPreload: true} : undefined;
	}

	/**
	 * The request method (e.g. "GET", "POST", etc.)
	 */
	private get method(): string {
		return this.request.method;
	}

	/**
	 * The content size of the response
	 * 
	 * Per spec
	 * > size [number] - Length of the returned content in bytes. Should be equal to response.bodySize if there is no compression and
	 * bigger when the content has been compressed.
	 */
	private get contentSize(): number {
		if (this.dataReceivedEvents.length > 0) {
			// calculate the content length by summing data received events
			const sumOfDataReceivedDataLengths = this.dataReceivedEvents
				.reduce((total, dataReceivedEvent) => total + dataReceivedEvent.dataLength, 0);
			return sumOfDataReceivedDataLengths;
		}
		// if not data receivedEvents were received, see if the responseBodyText
		// is set and, if so, take it's length.
		// @UppaJung TODO - double check that this is guaranteed to be one byte per char.
		return this.responseBody?.length ?? 0;
	}

	/**
	 * An object containing the content `compression` property if and only if
	 * dhe data was compressed.
	 */
	private get compression_obj(): {compression: number} | undefined {
		if (this.options.mimicChromeHar || this.responseEncodedDataLength == null) {
			return undefined;
		}
		const compression = this.contentSize - this.responseEncodedDataLength;
		return compression > 0 ? {compression} : undefined;
	}

	/**
	 * The HAR response.content object
	 */
	private get responseContent(): Har.Content {
		const {
			contentSize, compression_obj
		} = this;
		const {
			mimeType,
		} = this.response;

		const responseBodyText = this.options.includeTextFromResponseBody ? this.responseBody : undefined;

		const encoding = this.options.mimicChromeHar ?
			(this.response as {encoding?: string}).encoding :
			this.getResponseBodyResponse?.base64Encoded ? 'base64' : undefined;
		const encodingObj = this.options.mimicChromeHar || encoding != null ? {encoding} : {};

		return {
			mimeType,
			size: contentSize,
			text: responseBodyText,
			...encodingObj,
			...compression_obj,
		} satisfies Content;
				
	}

	private get _initialPriority():  DevToolsProtocol.Network.ResourcePriority {
		return this.request.initialPriority;
	}

	private get _priority(): DevToolsProtocol.Network.ResourcePriority {
		return this.resourceChangedPriorityEvent?.newPriority ?? this._initialPriority;
	}

	/**
	 * Initiator fields for the HAR entry
	 */
	private get initiatorFields(): Partial<Har.Entry> {
		const {initiator} = this.requestWillBeSentEvent;
		const baseFields = {
			_initiator_detail: JSON.stringify(initiator),
			_initiator_type: initiator.type,
		};
		if (initiator.type == 'parser') {
			return {
				...baseFields,
				_initiator: initiator.url,
				_initiator_line: (initiator.lineNumber ?? 0) + 1,
			};
		} else if (initiator.type == 'script' && initiator.stack && initiator.stack.callFrames.length > 0) {
			const [topCallFrame] = initiator.stack.callFrames;
			if (topCallFrame != null) {
				return {
					...baseFields,
					_initiator: topCallFrame.url,
					_initiator_line: topCallFrame.lineNumber + 1,
					_initiator_column: topCallFrame.columnNumber + 1,
					_initiator_function_name: topCallFrame.functionName,
					_initiator_script_id: topCallFrame.scriptId,
				};
			}
		}
		return baseFields;
	}

	/**
	 * The entry's _resourceType field.
	 */
	private get resourceType(): Har.Entry["_resourceType"] | undefined {
		// chrome-har team notes: Chrome's DevTools Frontend returns this field in lower case
		return (this.requestWillBeSentEvent?.type?.toLowerCase() ?? undefined) as Har.Entry["_resourceType"] | undefined;
	}

	/**
	 * Is this a network request over a protocol that can be represented in HAR format.
	 */
	private get isSupportedProtocol(): boolean {
		const {url} = this.request;
		return /^https?:/.test(url) || 
			// web sockets are supported, except when mimicking chrome-har, which did not support web sockets.
			(/^wss?:/.test(url) && !this.options.mimicChromeHar);
	}

	/**
	 * Event time in [seconds since arbitrary point in time we will call TimeStamp] [https://chromedevtools.github.io/devtools-protocol/tot/Network/#type-MonotonicTime]
	 * 
	 * See also:
	 * 	- https://developer.mozilla.org/en-US/docs/Web/API/DOMHighResTimeStamp
	 */
	get timestamp(): MonotonicTimeInSeconds {
		return this.requestWillBeSentEvent.timestamp;
		/* this.response.timing?.requestTime ?? */
	}

	/** Event time in [seconds since UNIX Epoch](https://chromedevtools.github.io/devtools-protocol/tot/Network/#type-TimeSinceEpoch) */
	get wallTime(): SecondsFromUnixEpoch {
		return this.requestWillBeSentEvent.wallTime;
	}

	/**
	 * The start time of the request in seconds since the unix epoch, which with the assistance of the
	 * TimeLord can be assured to also be monotonically increasing with the timestamps
	 * of the events.
	 * 
	 * Spec:
	 * > startedDateTime [string] - Date and time stamp of the request start (ISO 8601 - YYYY-MM-DDThh:mm:ss.sTZD).
	 * 
	 * We interpret request start to be the requestTime from the timing object, rather than the timestamp of the
	 * requestWillBeSentEvent, as the requestWillBeSent event occurs during the request, which may be after
	 * the requested started by many milliseconds. Failing the presence of a timing object in the response,
	 * we fall back to the timestamp on the requestWillBeSent event.
	 */
	get requestStartTimeInSecondsFromUnixEpoch(): SecondsFromUnixEpoch {
		return this.timelord.getApproximateWallTimeInSecondsFromUnixEpochFromMonotonicallyIncreasingTimestamp(this.timing?.requestTime ?? this.timestamp);
	}

	/**
	 * The start of the request in seconds since the unix epoch, which with the assistance of the
	 * TimeLord can be assured to also be monotonically increasing with the timestamps, so that
	 * if a request's timestamp is greater than another's request, it's startedDateTime will
	 * also be greater. 
	 */
	get startedDateTime(): ISODateTimeString {
	 	return new Date(this.requestStartTimeInSecondsFromUnixEpoch * 1000).toISOString() as ISODateTimeString;
	}

	/**
	 * The time required for the request
	 */
	private get time(): Milliseconds {
		const {blocked=0, dns=0, connect=0, send=0, wait, receive} = this.timings;
		return Math.max(0, blocked) + Math.max(0, dns) + Math.max(0, connect) + send + wait + receive;
	}

	/**
	 * The HAR cache record for the request
	 */
	private get cache(): Har.Cache {
		if (this.requestServedFromCacheEvent == null) return {};
		return {
			beforeRequest: {
				// expires: ... // we do not have data to populate this field and it is not required
				lastAccess: this.startedDateTime,
				eTag: '', // we do not have data to populate this field, but it is required
				hitCount: 0, // we do not have data to populate this field, but it is required
			}
		};
	}

	/**
	 * The IP address of the server that responded to the request.
	 */
	private get serverIPAddress(): string | undefined {
		const {remoteIPAddress} = this.response;
		if (remoteIPAddress == null || typeof remoteIPAddress !== "string") return undefined;
		// Per chrome-har documentation:
		// > IPv6 addresses are listed as [2a00:1450:400f:80a::2003]
		return remoteIPAddress.replace(/^\[|]$/g, '');
	}

	/**
	 * The ID of the HTTP connection over which the request was sent.
	 * (With keep-alive and other features, the same connection may handle
	 * many requests.)
	 */
	private get connection(): ConnectionIdString {
		return this.response.connectionId.toString();
	}

	/**
	 * The Chrome DevTools Protocol's response timing object
	 * used to calculate HAR timings.
	 */
	private get timing(): DevToolsProtocol.Network.ResourceTiming | undefined {
		return this.response.timing;
	}

	/**
	 * The timestamp of when the request started
	 */
	get requestTimeInSeconds(): MonotonicTimeInSeconds {
		return this.response.timing?.requestTime ?? (() => {throw new Error("timing not set");})(); //  ?? this.requestWillBeSentEvent.timestamp;
	}

	/**
	 * A reference time in units of seconds
	 */
	private	get _requestTime(): MonotonicTimeInSeconds {
		return this.requestTimeInSeconds;
	}

	/**
	 * True if this request was handled by an HTTP2 push
	 */
	private get wasHttp2Push(): boolean {
		return (this._response?.timing?.pushStart ?? 0) > 0;
	}

	private	get _was_pushed_obj(): {readonly _was_pushed?: 1} {
		return this.wasHttp2Push ? {_was_pushed: 1} : {};
	}

	/**
	 * The non-standard HAR _chunks field containing the number of bytes
	 * and timestamp of each chunk.
	 */
	private get _chunks_obj(): {readonly _chunks?: Har.Chunk[]} {
		if (this.dataReceivedEvents == null || this.dataReceivedEvents.length == 0) {
			return {};
		}
		return {
			_chunks: this.dataReceivedEvents.map( (e) => ({
					ts: this.page == null ?
						roundToThreeDecimalPlaces( (e.timestamp - this.timestamp) * 1000) :
						// @UppaJung TODO -- verify that these timestamp offsets are really supposed to be offset from the page.
						roundToThreeDecimalPlaces( (e.timestamp - this.page.timestamp) * 1000),
					bytes: e.dataLength
				} satisfies Chunk as Chunk
			))
		};
	}

	get pagerefObj(): {pageref?: string} {
		if (this.page == null || this.page.id == null) {
			return {};
		} else {
			return {pageref: this.page.id};
		}
	}

	/**
	 * An entry field containing all the web socket messages sent over a requestId generated via the "ws:" protocol.
	 */
	get _webSocketMessagesObj(): {readonly _webSocketMessages?: Har.WebSocketMessage[]} {
		if (this.webSocketEvents.length == 0 || this.options.mimicChromeHar) {
			return {};
		}
		return {
			_webSocketMessages: this.webSocketEvents.map( ({type, event}) => ({
				type,
				// While the Chrome team says that messages encoded with base64 should have opcode 2, and this reflects
				// the similar opcode field in the chrome devtools protocol, the only promise made by the chrome devtools
				// is that an opcode will be 1 for utf8 and that base-64 encoding will be indicated by any value other than 1.
				// Hence, rather than simply copy the opcode provided by the devtools protocol here, we ensure that any
				// opcode other than 1 is converted to a 2. 
				opcode: event.response.opcode === 1 ? WebSocketMessageOpcode.Utf8Text : WebSocketMessageOpcode.Base64EncodedBinary,
				time: event.timestamp,
				data: event.response.payloadData
			} satisfies Har.WebSocketMessage as Har.WebSocketMessage))
		};
	}

	/**
	 * The HAR timings object
	 */
	private get timings(): Har.Timings {
		// Important notes because these protocols use names that don't specify their units
		// all timestamps in seconds
		// all fields of response.timing are in milliseconds

		const timing = this.response.timing;

		// Per spec:
		// > blocked [number, optional] - Time spent in a queue waiting for a network connection.
		//
		// We treat the request as blocked until the earliest of when it can start resolving DNS, connecting, or sending.
		const nonNegativeStarTimes = [timing?.dnsStart ?? -1, timing?.connectStart ?? -1, timing?.sendStart ?? -1].filter( x => x >= 0);
		const blockedMs = nonNegativeStarTimes.length > 0 ? Math.min(...nonNegativeStarTimes) : undefined;

		// Per spec:
		// > receive [number] - Time required to read entire response from the server (or cache).
		const loadingFinishedOrFailedTimestamp =  this.loadingFailedEvent?.timestamp ?? this.loadingFinishedEvent?.timestamp;
		const receiveMs = timing != null && loadingFinishedOrFailedTimestamp != null ?
			 (loadingFinishedOrFailedTimestamp - timing.requestTime) * 1000 - timing.receiveHeadersEnd :
			 0;
		
		const _queued = timing == null ? 0 : roundToThreeDecimalPlaces(1000 * (timing.requestTime - this.requestWillBeSentEvent.timestamp)) ?? 0;
		const _queuedObj = _queued > 0 ? {_queued} : {};

		return {
			blocked: blockedMs != null ? roundToThreeDecimalPlaces(blockedMs) : -1,
			dns: getTimeDifferenceInMillisecondsRoundedToThreeDecimalPlaces(timing?.dnsStart, timing?.dnsEnd) ?? -1,
			connect: getTimeDifferenceInMillisecondsRoundedToThreeDecimalPlaces(timing?.connectStart, timing?.connectEnd) ?? -1,
			send: getTimeDifferenceInMillisecondsRoundedToThreeDecimalPlaces(timing?.sendStart, timing?.sendEnd) ?? 0,
			wait: getTimeDifferenceInMillisecondsRoundedToThreeDecimalPlaces(timing?.sendEnd, timing?.receiveHeadersEnd) ?? 0,
			ssl: getTimeDifferenceInMillisecondsRoundedToThreeDecimalPlaces(timing?.sslStart, timing?.sslEnd) ?? -1,
			receive: roundToThreeDecimalPlaces(receiveMs) ?? 0,
			..._queuedObj
		};
	}

	/**
	 * The HAR entry.request object
	 */
	private get harRequest(): Har.Request {
		return {
			method: this.method,
			url: this.requestUrl ?? '',
			queryString: this.queryStringHar,
			postData: this.postDataHar,
			bodySize: this.requestBodySize,
			cookies: this.requestHarCookies,
			headers: this.requestHarHeaders,
			headersSize: this.requestHeadersSize,
			httpVersion: this.httpVersion ?? '',
			...this._isLinkPreloadObj,
		} as const satisfies Har.Request;
	}

	/**
	 * The HAR entry.response object
	 */
	private get harResponse(): Har.Response {
		const { response } = this;
		const _transferSize = this.options.mimicChromeHar ?
			(this.loadingFinishedEvent?.encodedDataLength ?? this.response.encodedDataLength) :
			(this.responseEncodedDataLength ?? -1);
//			(this.responseEncodedDataLength ?? (this.isHttp1x ? this.response.encodedDataLength :  -1));
		return {
			headersSize: this.responseHeadersSize,
			httpVersion: this.httpVersion ?? '',
			redirectURL: this.locationHeaderValue ?? '',
			status: this.responseReceivedExtraInfoEvent?.statusCode ?? this.response.status,
			statusText: response.statusText,
			bodySize: this.responseBodySize,
			content: this.responseContent,
			cookies: this.responseCookies ?? [],
			headers: this.responseHarHeaders,
			_transferSize,
			fromDiskCache: this.response.fromDiskCache ?? false,
			fromEarlyHints: this.response.fromEarlyHints ?? false,
			fromServiceWorker: this.response.fromServiceWorker ?? false,
			fromPrefetchCache: this.response.fromPrefetchCache ?? false,
		} as const satisfies Har.Response;
	}

	/**
	 * The HAR entry object that is the final product of the HarEntryBuilder.
	 * 
	 * If you want to know how any value is calculated, just work backwards from
	 * here using vscode's "Go to Definition" feature.
	 */
	get entry(): Har.Entry | undefined {
		if (!this.isValidForInclusionInHarArchive) return undefined;
		return {
			...this.initiatorFields,
			...this.pagerefObj,
			...this._chunks_obj,
			...this._was_pushed_obj,
			...this._webSocketMessagesObj,
			request: this.harRequest,
			response: this.harResponse,
			timings: this.timings,
			cache: this.cache,
			startedDateTime: this.startedDateTime,
			connection: this.connection,
			time: this.time,
			serverIPAddress: this.serverIPAddress,
			_requestId: this.requestId,
			_initialPriority: this._initialPriority,
			_priority: this._priority,
			_resourceType: this.resourceType,
			_requestTime: this._requestTime,
			// turn on to make it possible to get back to the builder from entries when you are in the debugger.
			// ...({__builder: this} as {}),
		};
	}
}
