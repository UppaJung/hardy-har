import type {DevToolsProtocol} from './DebuggerEvent.ts';
import type * as NpmHarFormatTypes from 'npm:@types/har-format@1.2.15';
import type { DebuggerEventOrMetaEvent, DebuggerNetworkHttpEventName, DebuggerNetworkMetaEventName, DebuggerPageEventName } from "./DebuggerEvent.ts";

export type {DevToolsProtocol, NpmHarFormatTypes};

export type SecondsFromUnixEpoch = number;
export type MonotonicTimeInSeconds = number;
export type Milliseconds = number;
export type Timestamp = number;
export type RequestId = string;
export type FrameId = string;
export type ConnectionIdString = string;
export type ISODateTimeString = `${number}-${number}-${number}T${number}:${number}:${number}.${number}Z`;



/**
 * A WebSocket message.
 * 
 * These entries are placed in an array within the "_webSocketMessages" property of the HAR entry for the request
 * to established the connection via the "ws:" protocol.
 * 
 * See the Chrome team's [announcement of the addition of WebSockets to their HAR files](https://developer.chrome.com/blog/new-in-devtools-76/#websocket)
 * and the [commit documentation](https://issues.chromium.org/issues/41180084#comment20).
 */
export interface HarWebSocketMessage {
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



export interface HarPageTimings {
	readonly onContentLoad: number;
	readonly onLoad: number;
}
const _validatePageTimings: NpmHarFormatTypes.PageTiming = undefined as unknown as HarPageTimings;

export interface HarPage extends NpmHarFormatTypes.Page {
	readonly id: string;
	readonly startedDateTime: ISODateTimeString;
	readonly title: string;
	readonly pageTimings: HarPageTimings;
}
const _validateHarPage: NpmHarFormatTypes.Page = undefined as unknown as HarPage;

export type HarCookie = NpmHarFormatTypes.Cookie;
export type HarContent = NpmHarFormatTypes.Content;
export type HarChunk = NpmHarFormatTypes.Chunk;

export interface HarTimings extends NpmHarFormatTypes.Timings {
	_queued?: number;
}

export interface HarResponse {
	readonly status: number;
	readonly statusText: string;
	readonly httpVersion: string;
	readonly cookies: HarCookie[];
	readonly headers: HarHeader[];
	readonly content: HarContent;
	readonly redirectURL: string;
	readonly headersSize: number;
	readonly bodySize: number;
	readonly _transferSize: number;
	readonly fromDiskCache: boolean;
	readonly fromEarlyHints: boolean;
	readonly fromServiceWorker: boolean;
	readonly fromPrefetchCache: boolean;
}
const _validateHarResponse: NpmHarFormatTypes.Response = undefined as unknown as HarResponse;

export type HarPostData = NpmHarFormatTypes.PostData;

export interface HarRequest {
	readonly method: string;
	readonly url: string;
	readonly httpVersion: string;
	readonly cookies: HarCookie[];
	readonly headers: HarHeader[];
	readonly queryString: NpmHarFormatTypes.QueryString[];
	readonly postData?: NpmHarFormatTypes.PostData | undefined;
	readonly headersSize: number;
	readonly bodySize: number;
}
const _validateHarRequest: NpmHarFormatTypes.Request = undefined as unknown as HarRequest;

export const WebSocketMessageOpcode = {
	Utf8Text: 1,
	Base64EncodedBinary: 2,
} as const;
export type WebSocketFrameDirection = "receive" | "send";
export type WebSocketDirectionAndEvent = {
	type: 'sent', event: DevToolsProtocol.Network.WebSocketFrameSentEvent,
} | {
	type: "receive", event: DevToolsProtocol.Network.WebSocketFrameReceivedEvent,
}
export type WebSocketMessageOpcode = typeof WebSocketMessageOpcode[keyof typeof WebSocketMessageOpcode];
type x = typeof WebSocketMessageOpcode[keyof typeof WebSocketMessageOpcode];

// Omit removes bad typings in har-format, and custom fields that we don't generate
// (which allows for better typings of the ones we do generate)
export interface HarEntry extends Omit<NpmHarFormatTypes.Entry, `_${string}`>,
	Partial<Pick<NpmHarFormatTypes.Entry, '_requestId'|
	'_requestTime'|
	'_initialPriority' |
	'_priority' |
	'_requestTime' |
	'_initiator' |
	'_initiator_detail' |
	'_initiator_type' |
	'_resourceType' |
//	'_initiator_line' | // incorrectly typed by @types/har-format
//	'_initiator_column' | // incorrectly typed by @types/har-format
	'_initiator_function_name' |
	'_initiator_script_id' |
	'_chunks' |
	'_was_pushed' |
	'_webSocketMessages'
	> >{
	readonly request: HarRequest;
	readonly response: HarResponse;
	readonly timings: HarTimings;
	readonly cache: NpmHarFormatTypes.Cache;
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
	readonly _resourceType?: NpmHarFormatTypes.Entry["_resourceType"] | undefined;
	readonly _initiator_line?: number;
	readonly _initiator_column?: number;
	readonly _initiator_function_name?: string;
	readonly _initiator_script_id?: string;
	readonly _chunks?: NpmHarFormatTypes.Chunk[];
	readonly _was_pushed?: number;
	readonly _webSocketMessages?: HarWebSocketMessage[];
};
const _validateHarEntry: Omit<NpmHarFormatTypes.Entry, `_${string}`>  = undefined as unknown as HarEntry;

export interface HarRequest extends NpmHarFormatTypes.Request {
	_isLinkPreload?: boolean;
}


export interface ResponseMetadata {
	__receiveHeadersEnd: number;
}

export type HarRequestUnderConstruction = Omit<HarRequest, 'httpVersion'> & Partial<Pick<HarRequest, 'httpVersion'>>;
	
export type HarHeader = NpmHarFormatTypes.Header;

export type HarPageEventName =
	'Page.frameAttached' |
	'Page.loadEventFired' |
	'Page.domContentEventFired' |
	'Page.frameStartedLoading' |
	'Page.frameRequestedNavigation' |
	'Page.navigatedWithinDocument';

export const HarPageEventNames: DebuggerPageEventName[] = [
	'Page.frameAttached',
	'Page.loadEventFired',
	'Page.domContentEventFired',
	'Page.frameStartedLoading',
	'Page.frameRequestedNavigation',
	'Page.navigatedWithinDocument',
] as const satisfies DebuggerPageEventName[];
// export type HarPageEventName = NonNullable<typeof HarPageEventNames[number]>;

const HarPageEventSet = new Set(HarPageEventNames);
export const isHarPageEventName = (eventName: string): eventName is HarPageEventName =>
	HarPageEventSet.has(eventName as HarPageEventName);

export type HarNetworkEventName =
	'Network.requestWillBeSent' |
	'Network.responseReceived' |
	'Network.requestWillBeSentExtraInfo' |
	'Network.responseReceivedExtraInfo' |
	'Network.requestServedFromCache' |
	'Network.loadingFinished' |
	'Network.loadingFailed' |
	'Network.dataReceived' |
	'Network.resourceChangedPriority';

const HarNetworkEventNames: DebuggerNetworkHttpEventName[] = [
	"Network.requestWillBeSent",
	"Network.responseReceived",
	"Network.requestWillBeSentExtraInfo",
	"Network.responseReceivedExtraInfo",
	"Network.requestServedFromCache",
	"Network.loadingFinished",
	"Network.loadingFailed",
	"Network.dataReceived",
	"Network.resourceChangedPriority",
] as const satisfies DebuggerNetworkHttpEventName[];
// export type HarNetworkEventName = NonNullable<(typeof HarNetworkEventNames)[number]>;

const HarNetworkEventSet = new Set(HarNetworkEventNames);
export const isHarNetworkEventName = (eventName: string): eventName is HarNetworkEventName =>
	HarNetworkEventSet.has(eventName as HarNetworkEventName);

export type GetResponseBodyResponseMetaEventName = "Network.getResponseBodyResponse";
export const GetResponseBodyResponseMetaEventName =	"Network.getResponseBodyResponse" as const;
// export type GetResponseBodyResponseMetaEventName = typeof GetResponseBodyResponseMetaEventName;
const HarNetworkMetaEventNames: DebuggerNetworkMetaEventName[] = [
	GetResponseBodyResponseMetaEventName,
] as const satisfies DebuggerNetworkMetaEventName[];
export type HarNetworkMetaEventName = NonNullable<(typeof HarNetworkMetaEventNames)[number]>;
const HarNetworkMetaEventSet = new Set(HarNetworkMetaEventNames);
export const isHarNetworkMetaEventName = (eventName: string): eventName is HarNetworkMetaEventName =>
	HarNetworkMetaEventSet.has(eventName as HarNetworkMetaEventName);

export type HarNetworkOrPageEventName = HarNetworkEventName | HarPageEventName | HarNetworkMetaEventName;
export type HarEventName = HarNetworkOrPageEventName;
export type HarEventOrMetaEventName = HarNetworkOrPageEventName | HarNetworkMetaEventName;
export type HarEvent<T extends HarEventOrMetaEventName> = DebuggerEventOrMetaEvent<T>;

export type HarEventNameAndObjectTuple<NAME extends HarEventOrMetaEventName = HarEventOrMetaEventName> = [NAME, HarEvent<NAME>];
export type HarEventNameAndObject<NAME extends HarEventOrMetaEventName = HarEventOrMetaEventName> = {eventName: NAME, event: HarEvent<NAME>};
export type ChromeHarMethodParamsObject = {method: string, params: unknown}

export type DevToolsProtocolGetResponseBodyRequest = DevToolsProtocol.Network.GetResponseBodyRequest;
export type DevToolsProtocolGetResponseBodyResponse = DevToolsProtocol.Network.GetResponseBodyResponse

export const isHarNetworkOrPageEventName = (eventName: string): eventName is HarNetworkOrPageEventName =>
	isHarNetworkEventName(eventName) || isHarPageEventName(eventName) || isHarNetworkMetaEventName(eventName);

export const isHarEventName = (eventName: string): eventName is HarEventName =>
	isHarNetworkEventName(eventName) || isHarPageEventName(eventName);

export const isHarNetworkEventOrMetaEventName = (eventName: string): eventName is HarNetworkEventName | HarNetworkMetaEventName =>
	isHarNetworkEventName(eventName) || isHarNetworkMetaEventName(eventName);
