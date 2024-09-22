import type {DevToolsProtocol, NpmHarFormatTypes} from "./types.ts";
import { networkCookieToHarFormatCookie, parseCookie, parseRequestCookies, parseResponseCookies } from "./cookies.ts";
import { calculateRequestHeaderSize, calculateResponseHeaderSize, getHeaderValue, headersRecordToArrayOfHarHeaders } from "./headers.ts";
import {
	parsePostData,
	toNameValuePairs,
	isHttp1x,
	roundToThreeDecimalPlaces
} from "./util.ts";
import type { PopulatedOptions } from "./Options.ts";
import { WebSocketMessageOpcode, type HarEntry, type HarRequest, type HarResponse, type HarTimings, type WebSocketDirectionAndEvent, type WebSocketMessage } from "./types.ts";
import type { HarPageBuilder } from "./HarPageBuilder.ts";
import urlParser from "node:url";
import type { TimeLord } from "./TimeLord.ts";


function getTimeDifferenceInMillisecondsRoundedToThreeDecimalPlaces(startMs: number | undefined, endMs: number | undefined) {
	if  (startMs == null || endMs == null || startMs < 0 || endMs < 0) return undefined;
	const difference = endMs - startMs;
	if (difference >= 0) {
		return roundToThreeDecimalPlaces(difference);
	}
	return undefined;
}

export class HarEntryBuilder {
	priorRedirects: number = 0;
	/**
	 * Store the RequestWillBeSentEvent without any redirect response, as redirect responses belong to the
	 * prior entry (the one that resulted ina redirect, triggering this new entry to the redirected location.)
	 */
	_requestWillBeSentEvent?: Omit<DevToolsProtocol.Network.RequestWillBeSentEvent, 'redirectResponse'>;
	redirectResponse?: DevToolsProtocol.Network.RequestWillBeSentEvent["redirectResponse"];
	responseReceivedEvent?: DevToolsProtocol.Network.ResponseReceivedEvent;
	requestWillBeSentExtraInfoEvent?: DevToolsProtocol.Network.RequestWillBeSentExtraInfoEvent;
	responseReceivedExtraInfoEvent?: DevToolsProtocol.Network.ResponseReceivedExtraInfoEvent;
	requestServedFromCacheEvent?: DevToolsProtocol.Network.RequestServedFromCacheEvent;
	loadingFinishedEvent?: DevToolsProtocol.Network.LoadingFinishedEvent;
	loadingFailedEvent?: DevToolsProtocol.Network.LoadingFailedEvent;
	dataReceivedEvents: DevToolsProtocol.Network.DataReceivedEvent[] = [];
	resourceChangedPriorityEvent?: DevToolsProtocol.Network.ResourceChangedPriorityEvent;
	getResponseBodyResponse?: DevToolsProtocol.Network.GetResponseBodyResponse;
	webSocketEvents: WebSocketDirectionAndEvent[] = [];	

	#assignedPage: HarPageBuilder | undefined;

	constructor(protected timelord: TimeLord, public readonly orderArrived: number, readonly options: PopulatedOptions) {}

	get isValidForPageTimeCalculations() {
		return this._requestWillBeSentEvent != null;
	}

	get isValidForInclusionInHarArchive() {
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

	get requestWillBeSentEvent() {
		if (this._requestWillBeSentEvent != null) {
			return this._requestWillBeSentEvent;
		}
		throw new Error("Attempt to access requestWillBeSentEvent before it is set");
	}

	assignToPage = (page: HarPageBuilder) => {
		this.#assignedPage = page;
	}

	get page() {
		return this.#assignedPage;
	}

	get frameId() {
		return this.requestWillBeSentEvent?.frameId;
	}

	protected get _response() {
		if (this.responseReceivedEvent != null && this.redirectResponse != null) {
			throw new Error("Unexpected state with event having two types of responses.");
		}
		return this.responseReceivedEvent?.response ?? this.redirectResponse;
	}

	get response() {
		if (this._response == null) {
			throw new Error("Attempt to access a response even though there was no responseReceivedEvent or requestWillBeSent.redirectResponse event");
		}
		return this._response;
	}

	protected get responseBody() {
		return this.getResponseBodyResponse?.body;
	}
	protected get responseBase64Encoded() {
		return this.getResponseBodyResponse?.base64Encoded;
	}

	protected get httpVersion(): string | undefined {
		return this.response.protocol;
	}

	protected get isHttp1x() {
		return isHttp1x(this.httpVersion);
	}

	protected get responseHeadersText() {
		// extraInfo.headersText provides "Raw response header text as it was received over the wire."
		return this.responseReceivedExtraInfoEvent?.headersText ?? 
			// deprecated, but here for backward compatibility
			this.response.headersText;
	}

	/**
	 * Note this from the spec
	 * > *headersSize - The size of received response-headers is computed only from headers that are really received from the server.
	 * > Additional headers appended by the browser are not included in this number, but they appear in the list of header objects.
	 */
	protected get responseHeadersSize() {
		return (this.responseHeadersText != null) ? this.responseHeadersText.length :
			(this.isHttp1x && !this.response.fromDiskCache && !this.response.fromEarlyHints) ?
			calculateResponseHeaderSize(this.response) :
			-1;
	}

	protected get networkResponseHeadersObj() {
		return this.responseReceivedExtraInfoEvent?.headers ?? this.response.headers;
	}

	protected get responseHeaders() {
		return headersRecordToArrayOfHarHeaders(this.networkResponseHeadersObj);
	}

	getResponseHeader = (caseInsensitiveName: string) => {
		const nameLc = caseInsensitiveName.toLowerCase();
		return this.responseHeaders.find( v => v.name.toLowerCase() == nameLc);
	}

	get responseEncodedDataLength() {
		return this.loadingFinishedEvent?.encodedDataLength; // ?? this.response.encodedDataLength;
	}



	/**
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
	protected get responseBodySize() {
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

	protected get responseCookeHeader() {
		const {networkResponseHeadersObj: responseHeaders} = this;
		if (responseHeaders == null) return undefined;
		if (this.options.mimicChromeHar) {
			// Chrome-har doesn't look for cookies in the `set-cookie` header in the responseReceivedExtraInfoEvent
			// chrome-har-bug
			return getHeaderValue(this.response.headers, 'Set-Cookie');
		}
		return getHeaderValue(responseHeaders, 'Set-Cookie');
	}

	protected get responseCookies() {
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

	protected get locationHeaderValue() {
		const {networkResponseHeadersObj: responseHeaders} = this;
		if (responseHeaders == null) return undefined;
		return this.networkResponseHeadersObj == null ? undefined :
			getHeaderValue(this.networkResponseHeadersObj, 'Location');
	}

	protected get requestId() {
			// For chrome-har compatibility
			const suffix = (this.options.mimicChromeHar && this.redirectResponse != null) ? 'r' : '';
			return this.requestWillBeSentEvent.requestId + suffix;

	}

	protected get request() {
		return this.requestWillBeSentEvent.request;
	}

	protected get requestHeaders(): DevToolsProtocol.Network.Headers {
		if (this.options.mimicChromeHar) {
			return this.response.requestHeaders ??
			// Ordering matters below as chrome-har will do a linear search through headers and find the earliest ones first.
			// That means we should place the earlier ones later in the below clause so they replace the later ones.
			({...this.requestWillBeSentExtraInfoEvent?.headers, ...this.requestWillBeSentEvent.request.headers});
		}
		return { ...this.requestWillBeSentExtraInfoEvent?.headers, ...this.response.requestHeaders, ...this.request.headers};
	}

	protected get requestHarHeaders() {
		return headersRecordToArrayOfHarHeaders(this.requestHeaders);
	}

	protected get requestCookieHeader() {
		// if (this.options.mimicChromeHar) {
		// 	// Chrome-har doesn't look for cookies in the `Cookie` header in the requestWillBeSentExtraInfoEvent
		// 	return getHeaderValue(this.request.headers, 'Cookie') ?? 
		// 		(this.response.requestHeaders != null ? getHeaderValue(this.response.requestHeaders, 'Cookie') : undefined);
		// }
		return getHeaderValue(this.requestHeaders, 'Cookie');
	}

	protected get requestCookies() {
		// response.requestHeaders, just use cookies from that

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

	protected get requestHeadersSize() {
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

	protected get requestBodySize() {
		return this.request.postData?.length ?? 0;
	}

	protected get requestParsedUrl() {
		return urlParser.parse(
				this.request.url + (this.request.urlFragment ?? ''),
				true
			)
	}

	get requestUrl() {
		return urlParser.format(this.requestParsedUrl);
	}

	protected get queryString() {
		return toNameValuePairs(this.requestParsedUrl.query);
	}

	protected get postData() {
		const requestHeaders = this.options.mimicChromeHar ? this.requestWillBeSentEvent.request.headers : this.request.headers;
		return parsePostData(getHeaderValue(requestHeaders, 'Content-Type'), this.request.postData, this.options);
	}

	protected get _isLinkPreloadObj() {
		return this.request.isLinkPreload ? {_isLinkPreload: true} : {};
	}

	protected get method() {
		return this.request.method;
	}

	/**
	 * Per spec
	 * > size [number] - Length of the returned content in bytes. Should be equal to response.bodySize if there is no compression and
	 * bigger when the content has been compressed.
	 */
	get contentSize() {
		if (this.dataReceivedEvents.length > 0) {
			// calculate the content length by summing data received events
			const sumOfDataReceivedDataLengths = this.dataReceivedEvents
				.reduce((total, dataReceivedEvent) => total + dataReceivedEvent.dataLength, 0);
			return sumOfDataReceivedDataLengths;
		}
		// if not data receivedEvents were received, see if the responseBodyText
		// is set and, if so, take it's length.
		// TODO - double check that this is guaranteed to be one byte per char.
		return this.responseBody?.length ?? 0;
	}

	get compression_obj() {
		if (this.options.mimicChromeHar || this.responseEncodedDataLength == null) {
			return {};
		}
		const compression = this.contentSize - this.responseEncodedDataLength;
		return compression > 0 ? {compression} : {};
	}

	protected get responseContent() {
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
		const encodingObj = this.options.mimicChromeHar || encoding != null ? {encoding} : {}

		return {
			mimeType,
			size: contentSize,
			text: responseBodyText,
			...encodingObj,
			...compression_obj,
		} satisfies NpmHarFormatTypes.Content
				
	}

	protected get _initialPriority() {
		return this.request.initialPriority;
	}

	protected get _priority() {
		return this.resourceChangedPriorityEvent?.newPriority ?? this._initialPriority;
	}

	protected get initiatorFields() {
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
			}
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
				}
			}
		}
		return baseFields;
	}

	protected get resourceType() {
		// chrome-har team notes: Chrome's DevTools Frontend returns this field in lower case
		return this.requestWillBeSentEvent?.type?.toLowerCase() ?? '';
	}

	protected get isSupportedProtocol() {
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
	get timestamp() {
		return this.requestWillBeSentEvent.timestamp;
		/* this.response.timing?.requestTime ?? */
	}

	/** Event time in [seconds since UNIX Epoch](https://chromedevtools.github.io/devtools-protocol/tot/Network/#type-TimeSinceEpoch) */
	get wallTime() {
		return this.requestWillBeSentEvent.wallTime;
	}

	/**
	 * Spec:
	 * > startedDateTime [string] - Date and time stamp of the request start (ISO 8601 - YYYY-MM-DDThh:mm:ss.sTZD).
	 * 
	 * We interpret request start to be the requestTime from the timing object, rather than the timestamp of the
	 * requestWillBeSentEvent, as the requestWillBeSent event occurs during the request, which may be after
	 * the requested started by many milliseconds. Failing the presence of a timing object in the response,
	 * we fall back to the timestamp on the requestWillBeSent event.
	 */
	get requestStartTimeInSecondsFromUnixEpoch() {
		return this.timelord.getApproximateWallTimeInSecondsFromUnixEpochFromMonotonicallyIncreasingTimestamp(this.timing?.requestTime ?? this.timestamp);
	}

	protected get time() {
		const {blocked=0, dns=0, connect=0, send=0, wait, receive} = this.timings;
		return Math.max(0, blocked) + Math.max(0, dns) + Math.max(0, connect) + send + wait + receive;
	}


	get startedDateTime(): string {
		// if (this.options.mimicChromeHar) {
		// 	return  dayjs.unix(this.startedTimeInSeconds).toISOString();
		// }
	 	return new Date(this.requestStartTimeInSecondsFromUnixEpoch * 1000).toISOString();
	}

	protected get cache(): NpmHarFormatTypes.Cache {
		if (this.requestServedFromCacheEvent == null) return {};
		return {
			beforeRequest: {
				// expires: ... // we do not have data to populate this field and it is not required
				lastAccess: this.startedDateTime,
				eTag: '', // we do not have data to populate this field, but it is required
				hitCount: 0, // we do not have data to populate this field, but it is required
			}
		}
	}


	protected get serverIPAddress() {
		const {remoteIPAddress} = this.response;
		if (remoteIPAddress == null || typeof remoteIPAddress !== "string") return undefined;
		// Per chrome-har documentation:
		// > IPv6 addresses are listed as [2a00:1450:400f:80a::2003]
		return remoteIPAddress.replace(/^\[|]$/g, '');
	}

	protected get connection() {
		return this.response.connectionId.toString();
	}

	protected get timing() {
		return this.response.timing;
	}

	get requestTimeInSeconds() {
		return this.response.timing?.requestTime ?? (() => {throw new Error("timing not set")})(); //  ?? this.requestWillBeSentEvent.timestamp;
	}

	/**
	 * A reference time in units of seconds
	 */
	protected	get _requestTime() {
		return this.requestTimeInSeconds;
	}


	protected	get time_obj() {
		const timings = this.timings;
		if (timings == null) return {};
		const {blocked, dns, connect, send, wait, receive, /* ssl // excluded, see not below  */} = timings;
		// Per spec:
		// > time [number] - Total elapsed time of the request in milliseconds. This is the sum of all timings available in the timings object (i.e. not including -1 values).
		//
		// However: the spec is wrong in that SSL time is encompassed in the connect time, and so including them would add it twice.
		//
		// So, we'll sum up the values other than SSL all using reduce to only add values that are > 0.
		//
		const timeMs = [blocked, dns, connect, send, wait, receive, /* ssl // excluded, see note above */].reduce<number>(
			(sum, val) => val != null && val > 0 ? sum + val : sum,
			0
		);
		return {time: timeMs};
	}

	protected get wasHttp2Push() {
		return (this._response?.timing?.pushStart ?? 0) > 0;
	}

	protected	get _was_pushed_obj() {
		return this.wasHttp2Push ? {_was_pushed: 1} : {};
	}

	protected get _chunks_obj() {
		if (this.dataReceivedEvents == null || this.dataReceivedEvents.length == 0) {
			return {}
		}
		return {
			_chunks: this.dataReceivedEvents.map( (e) => ({
					ts: this.page == null ?
						roundToThreeDecimalPlaces( (e.timestamp - this.timestamp) * 1000) :
						// TODO -- verify that these timestamp offsets are really supposed to be offset from the page.
						roundToThreeDecimalPlaces( (e.timestamp - this.page.timestamp) * 1000),
					bytes: e.dataLength
				} satisfies NpmHarFormatTypes.Chunk as NpmHarFormatTypes.Chunk
			))
		}
	}

	get pagerefObj() {
		if (this.page == null) {
			return {}
		} else {
			return {pageref: this.page.id};
		}
	}

	/**
	 * An entry field containing all the web socket messages sent over a requestId generated via the "ws:" protocol.
	 */
	get _webSocketMessagesObj() {
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
			} as WebSocketMessage))
		};
	}

	protected get timings(): HarTimings {
		// Important notes because these damn protocols use names that don't specify their units
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

	protected get harRequest() {
		return {
			method: this.method,
			url: this.requestUrl,
			queryString: this.queryString,
			postData: this.postData,
			bodySize: this.requestBodySize,
			cookies: this.requestCookies,
			headers: this.requestHarHeaders,
			headersSize: this.requestHeadersSize,
			httpVersion: this.httpVersion ?? '',
			...this._isLinkPreloadObj,
		} as const satisfies HarRequest
	}

	protected get harResponse() {
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
			headers: this.responseHeaders,
			_transferSize,
			fromDiskCache: this.response.fromDiskCache ?? false,
			fromEarlyHints: this.response.fromEarlyHints ?? false,
			fromServiceWorker: this.response.fromServiceWorker ?? false,
			fromPrefetchCache: this.response.fromPrefetchCache ?? false,
		} as const satisfies HarResponse;
	}

	/**
	 * The final HarEntry object **except for `pageRef`**, which should be populated later.
	 */
	get entry() {
		if (!this.isValidForInclusionInHarArchive) return undefined;
		return {
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
			...this.pagerefObj,
			...this._chunks_obj,
			...this.time_obj,
			...this._was_pushed_obj,
			...this.initiatorFields,
			...this._webSocketMessagesObj,
			// turn on to make it possible to get back to the builder from entries when you are in the debugger.
			// ...({__builder: this} as {}),
		} as const satisfies HarEntry;
	}

}

export type HarEntryGenerated = NonNullable<HarEntryBuilder["entry"]>