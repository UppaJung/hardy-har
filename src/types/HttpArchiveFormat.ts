import { ISODateTimeString } from './base.ts';
import type {DevToolsProtocol} from './DebuggerEvent.ts';
import type * as NpmHarFormatTypes from 'har-format';

export type {DevToolsProtocol};

export type SecondsFromUnixEpoch = number;
export type MonotonicTimeInSeconds = number;
export type Milliseconds = number;
export type Timestamp = number;
export type RequestId = string;
export type FrameId = string;
export type ConnectionIdString = string;



/**
 * A WebSocket message.
 * 
 * These entries are placed in an array within the "_webSocketMessages" property of the HAR entry for the request
 * to established the connection via the "ws:" or "wss:" protocol.
 * 
 * See the Chrome team's [announcement of the addition of WebSockets to their HAR files](https://developer.chrome.com/blog/new-in-devtools-76/#websocket)
 * and the [commit documentation](https://issues.chromium.org/issues/41180084#comment20).
 */
export interface WebSocketMessage {
	/**
	 * Whether the message is incoming (`receive`) or outgoing (`send`).
	 **/
	readonly type: "receive" | "send";
	/**
	 * The time in seconds since the UNIX epoch (fractions are not rounded).
	 */
	readonly time: number;
	/**
	 * Indicates whether the message data string is text in utf-8 format (`1`)
	 * or binary data encoded in base64 format (`2`).
	 * 
	 * Per the [commit documentation](https://issues.chromium.org/issues/41180084#comment20):
	 * > If the opcode is 2 and the message is binary, then the "data" is base64. Otherwise it is utf-8 for text messages.
	 */
	readonly opcode: WebSocketMessageOpcode;
	/**
	 * The message data in utf-8 or base64 format, depending on `opcode`.
	 */
	readonly data: string;
}

/**
 * This object contains list of all cookies (used in `request` and `response`
 * objects).
 *
 * http://www.softwareishard.com/blog/har-12-spec/#cookies
 */
export interface Cookie {
	/** The name of the cookie. */
	name: string;
	/** The cookie value. */
	value: string;
	/** The path pertaining to the cookie. */
	path?: string | undefined;
	/** The host of the cookie. */
	domain?: string | undefined;
	/**
	 * Cookie expiration time.
	 * (ISO 8601 - `YYYY-MM-DDThh:mm:ss.sTZD`,
	 * e.g. `2009-07-24T19:20:30.123+02:00`).
	 */
	expires?: ISODateTimeString | undefined;
	/** Set to true if the cookie is HTTP only, false otherwise. */
	httpOnly?: boolean | undefined;
	/** True if the cookie was transmitted over ssl, false otherwise. */
	secure?: boolean | undefined;
	/**  A comment provided by the user or the application */
	comment?: string | undefined;
}

/**
 * This object describes details about response content
 * (embedded in `response` object).
 *
 * http://www.softwareishard.com/blog/har-12-spec/#content
 */
export interface Content {
	/**
	 * Length of the returned content in bytes.
	 *
	 * Should be equal to `response.bodySize` if there is no compression and
	 * bigger when the content has been compressed.
	 */
	size: number;
	/**
	 * Number of bytes saved. Leave out this field if the information is not
	 * available.
	 */
	compression?: number | undefined;
	/**
	 * MIME type of the response text (value of the Content-Type response
	 * header).
	 *
	 * The charset attribute of the MIME type is included (if available).
	 */
	mimeType: string;
	/**
	 * Response body sent from the server or loaded from the browser cache.
	 *
	 * This field is populated with textual content only.
	 *
	 * The text field is either HTTP decoded text or a encoded (e.g. `base64`)
	 * representation of the response body.
	 *
	 * Leave out this field if the information is not available.
	 */
	text?: string | undefined;
	/**
	 * Encoding used for response text field e.g `base64`.
	 *
	 * Leave out this field if the text field is HTTP decoded
	 * (decompressed & unchunked), than trans-coded from its original character
	 * set into UTF-8.
	 */
	encoding?: string | undefined;
	/**  A comment provided by the user or the application */
	comment?: string | undefined;
}

/**
 * This object represents a parameter & value parsed from a query string,
 * if any (embedded in `request` object).
 *
 * http://www.softwareishard.com/blog/har-12-spec/#queryString
 */
export interface QueryString {
	name: string;
	value: string;
	/**  A comment provided by the user or the application */
	comment?: string | undefined;
}

/**
 * This object describes details about response content
 * (embedded in `response` object).
 *
 * http://www.softwareishard.com/blog/har-12-spec/#content
 */
export interface Content {
	/**
	 * Length of the returned content in bytes.
	 *
	 * Should be equal to `response.bodySize` if there is no compression and
	 * bigger when the content has been compressed.
	 */
	size: number;
	/**
	 * Number of bytes saved. Leave out this field if the information is not
	 * available.
	 */
	compression?: number | undefined;
	/**
	 * MIME type of the response text (value of the Content-Type response
	 * header).
	 *
	 * The charset attribute of the MIME type is included (if available).
	 */
	mimeType: string;
	/**
	 * Response body sent from the server or loaded from the browser cache.
	 *
	 * This field is populated with textual content only.
	 *
	 * The text field is either HTTP decoded text or a encoded (e.g. `base64`)
	 * representation of the response body.
	 *
	 * Leave out this field if the information is not available.
	 */
	text?: string | undefined;
	/**
	 * Encoding used for response text field e.g `base64`.
	 *
	 * Leave out this field if the text field is HTTP decoded
	 * (decompressed & unchunked), than trans-coded from its original character
	 * set into UTF-8.
	 */
	encoding?: string | undefined;
	/**  A comment provided by the user or the application */
	comment?: string | undefined;
}

export interface Chunk {
	bytes: number;
	ts: Milliseconds;
}


export interface PageTimings {
	readonly onContentLoad: number;
	readonly onLoad: number;
}

export interface Page {
	readonly id: string;
	readonly startedDateTime: ISODateTimeString;
	readonly title: string;
	readonly pageTimings: PageTimings;
	[customField: `_${string}`]: unknown | null | undefined;
}


export interface Timings {
    /**
     * Time spent in a queue waiting for a network connection.
     *
     * Use `-1` if the timing does not apply to the current request.
     */
    blocked?: number | undefined;
    /**
     * DNS resolution time. The time required to resolve a host name.
     *
     * Use `-1` if the timing does not apply to the current request.
     */
    dns?: number | undefined;
    /**
     * Time required to create TCP connection.
     *
     * Use `-1` if the timing does not apply to the current request.
     */
    connect?: number | undefined;
    /**
     * Time required to send HTTP request to the server.
     *
     * _Not optional and must have non-negative values._
     */
    send?: number | undefined;
    /**
     * Waiting for a response from the server.
     *
     * _Not optional and must have non-negative values._
     */
    wait: number;
    /**
     * Time required to read entire response from the server (or cache).
     *
     * _Not optional and must have non-negative values._
     */
    receive: number;
    /**
     * Time required for SSL/TLS negotiation.
     *
     * If this field is defined then the time is also included in the connect
     * field (to ensure backward compatibility with HAR 1.1).
     *
     * Use `-1` if the timing does not apply to the current request.
     */
    ssl?: number | undefined;
    /**  A comment provided by the user or the application */
    comment?: string | undefined;	_queued?: number;
}

export interface Response {
	readonly status: number;
	readonly statusText: string;
	readonly httpVersion: string;
	readonly cookies: Cookie[];
	readonly headers: Header[];
	readonly content: Content;
	readonly redirectURL: string;
	readonly headersSize: number;
	readonly bodySize: number;
	readonly _transferSize: number;
	readonly fromDiskCache: boolean;
	readonly fromEarlyHints: boolean;
	readonly fromServiceWorker: boolean;
	readonly fromPrefetchCache: boolean;
}


/**
 * List of posted parameters, if any (embedded in `postData` object).
 *
 * http://www.softwareishard.com/blog/har-12-spec/#params
 */
export interface Param {
	/** name of a posted parameter. */
	name: string;
	/** value of a posted parameter or content of a posted file */
	value?: string | undefined;
	/** name of a posted file. */
	fileName?: string | undefined;
	/** content type of a posted file. */
	contentType?: string | undefined;
	/**  A comment provided by the user or the application */
	comment?: string | undefined;
}

/**
 * This object describes posted data, if any (embedded in `request` object).
 *
 * http://www.softwareishard.com/blog/har-12-spec/#postData
 */
export type PostData = PostDataCommon & (PostDataParams | PostDataText);

/**
 * The common properties of PostData
 */
export interface PostDataCommon {
    /** Mime type of posted data. */
    mimeType: string;
    /**  A comment provided by the user or the application */
    comment?: string | undefined;
}

/**
 * Post data with `params` specified.
 */
export interface PostDataParams {
    /**
     * List of posted parameters (in case of URL encoded parameters).
     */
    params: Param[];

    /**
     * _`params` and `text` fields are mutually exclusive._
     */
    text?: never | undefined;
}

/**
 * Post data with `text` specified.
 */
export interface PostDataText {
    /**
     * Plain text posted data
     */
    text: string;

    /**
     * _`params` and `text` fields are mutually exclusive._
     */
    params?: never | undefined;
}

export interface Request {
	readonly method: string;
	readonly url: string;
	readonly httpVersion: string;
	readonly cookies: Cookie[];
	readonly headers: Header[];
	readonly queryString: QueryString[];
	readonly postData?: PostData | undefined;
	readonly headersSize: number;
	readonly bodySize: number;
}

export const WebSocketMessageOpcode = {
	Utf8Text: 1,
	Base64EncodedBinary: 2,
} as const;
export type WebSocketFrameDirection = "receive" | "send";
export type WebSocketDirectionAndEvent = {
	type: 'send', event: DevToolsProtocol.Network.WebSocketFrameSentEvent,
} | {
	type: "receive", event: DevToolsProtocol.Network.WebSocketFrameReceivedEvent,
}
export type WebSocketMessageOpcode = typeof WebSocketMessageOpcode[keyof typeof WebSocketMessageOpcode];
// type _x = typeof WebSocketMessageOpcode[keyof typeof WebSocketMessageOpcode];

export interface CacheDetails {
	expires?: ISODateTimeString | undefined;
	lastAccess: ISODateTimeString;
	/** Etag */
	eTag: string;
	/** The number of times the cache entry has been opened. */
	hitCount: number;
	/**  A comment provided by the user or the application */
	comment?: string | undefined;
}

/**
 * This objects contains info about a request coming from browser cache.
 *
 * http://www.softwareishard.com/blog/har-12-spec/#cache
 */
export interface Cache {
	/**
	 * State of a cache entry before the request.
	 *
	 * Leave out this field if the information is not available.
	 */
	beforeRequest?: CacheDetails | null | undefined;
	/**
	 * State of a cache entry after the request.
	 *
	 * Leave out this field if the information is not available.
	 */
	afterRequest?: CacheDetails | null | undefined;
	/**  A comment provided by the user or the application */
	comment?: string | undefined;
}

// Omit removes bad typings in har-format, and custom fields that we don't generate
// (which allows for better typings of the ones we do generate)
export interface Entry {
	readonly request: Request;
	readonly response: Response;
	readonly timings: Timings;
	readonly cache: Cache;
	readonly startedDateTime: ISODateTimeString,
	readonly connection: string,
	readonly time: Milliseconds,
	readonly serverIPAddress?: string,
	readonly _requestId: string;
	readonly _initialPriority: DevToolsProtocol.Network.ResourcePriority;
	readonly _priority: DevToolsProtocol.Network.ResourcePriority;
	readonly _requestTime: number;
	readonly _initiator?: string;
	readonly _initiator_detail?: string;
	readonly _initiator_type?: DevToolsProtocol.Network.Initiator["type"] | undefined;
	readonly _resourceType?: string | undefined;
	readonly _initiator_line?: number;
	readonly _initiator_column?: number;
	readonly _initiator_function_name?: string;
	readonly _initiator_script_id?: string;
	readonly _chunks?: NpmHarFormatTypes.Chunk[];
	readonly _was_pushed?: number;
	readonly _webSocketMessages?: WebSocketMessage[];
};
// const _validateHarEntry: Omit<NpmHarFormatTypes.Entry, `_${string}`>  = undefined as unknown as Entry;

export interface Request extends NpmHarFormatTypes.Request {
	_isLinkPreload?: boolean;
}

export interface HttpArchiveLog {
	readonly version: "1.2";
	readonly creator: {
		readonly name: string;
			readonly version: `${number}.${number}.${number}`;
	};
	readonly pages: Page[];
	readonly entries: Entry[];
	readonly comment: string;
}

export interface HttpArchive {
	log: HttpArchiveLog;
}
	
/**
 * This object represents a headers (used in `request` and `response` objects).
 *
 * http://www.softwareishard.com/blog/har-12-spec/#headers
 */
export interface Header {
	name: string;
	value: string;
	/**  A comment provided by the user or the application */
	comment?: string | undefined;
}