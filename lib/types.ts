import type {DevToolsProtocol} from './DebuggerEvent.ts';
import type * as NpmHarFormatTypes from 'npm:@types/har-format';
import type { DebuggerEventOrMetaEvent, DebuggerNetworkHttpEventName, DebuggerNetworkMetaEventName, DebuggerPageEventName } from "./DebuggerEvent.ts";

export type {DevToolsProtocol, NpmHarFormatTypes};

export type RequestId = string;
export type FrameId = string;

export interface HarPage extends NpmHarFormatTypes.Page {
	_startedDateTime?: string;
	_pageTimings?: NpmHarFormatTypes.Timings;
}

export interface HarTimings extends NpmHarFormatTypes.Timings {
	_queued?: number;
}

export interface HarResponse extends NpmHarFormatTypes.Response {
	_transferSize: number;
	fromDiskCache: boolean;
	fromEarlyHints: boolean;
	fromServiceWorker: boolean;
	fromPrefetchCache: boolean;
}

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

/**
 * A WebSocket message.
 * 
 * These entries are placed in an array within the "_webSocketMessages" property of the HAR entry for the request
 * to established the connection via the "ws:" protocol.
 * 
 * See the Chrome team's [announcement of the addition of WebSockets to their HAR files](https://developer.chrome.com/blog/new-in-devtools-76/#websocket)
 * and the [commit documentation](https://issues.chromium.org/issues/41180084#comment20).
 */
export interface WebSocketMessage {
	/**
	 * Whether the message is incoming (`receive`) or outgoing (`send`).
	 **/
	type: "receive" | "send";
	/**
	 * The time in seconds since the UNIX epoch (fractions are not rounded).
	 */
	time: number;
	/**
	 * Indicates whether the message data string is text in utf-8 format (`1`)
	 * or binary data encoded in base64 format (`2`).
	 * 
	 * Per the [commit documentation](https://issues.chromium.org/issues/41180084#comment20):
	 * > If the opcode is 2 and the message is binary, then the "data" is base64. Otherwise it is utf-8 for text messages.
	 */
	opcode: WebSocketMessageOpcode;
	/**
	 * The message data in utf-8 or base64 format, depending on `opcode`.
	 */
	data: string;
}

/** The local dialect of HarEntry */
// Omit removes bad typings in har-format, and custom fields that we don't generate
// (which allows for better typings of the ones we do generate)
export type HarEntry = Omit<NpmHarFormatTypes.Entry, `_${string}`> & {
	response: HarResponse;
	timings: HarTimings;
	_requestId: string;
	_initialPriority: DevToolsProtocol.Network.ResourcePriority;
	_priority: DevToolsProtocol.Network.ResourcePriority;
	_requestTime?: number;
	_initiator?: string;
	_initiator_detail: string;
	_initiator_type: DevToolsProtocol.Network.Initiator["type"] | undefined;
	_resourceType?: string | null | undefined;
	_initiator_line?: number;
	_initiator_column?: number;
	_initiator_function_name?: string;
	_initiator_script_id?: string;
	_chunks?: NpmHarFormatTypes.Chunk[];
	_was_pushed?: number;
	_webSocketMessages?: WebSocketMessage[];
};

export interface HarRequest extends NpmHarFormatTypes.Request {
	_isLinkPreload?: boolean;
}


export interface ResponseMetadata {
	__receiveHeadersEnd: number;
}

export type HarLog = Omit<NpmHarFormatTypes.Log, 'entries'> & {entries: HarEntry[]};
export type HarArchive = Omit<NpmHarFormatTypes.Har, 'log'> & {log: HarLog};

export type HarRequestUnderConstruction = Omit<HarRequest, 'httpVersion'> & Partial<Pick<HarRequest, 'httpVersion'>>;
	
export type HarHeader = NpmHarFormatTypes.Header;


export const HarPageEventNames = [
	'Page.frameAttached',
	'Page.loadEventFired',
	'Page.domContentEventFired',
	'Page.frameStartedLoading',
	'Page.frameRequestedNavigation',
	'Page.navigatedWithinDocument',
] as const satisfies DebuggerPageEventName[];
export type HarPageEventName = NonNullable<typeof HarPageEventNames[number]>;
const HarPageEventSet = new Set(HarPageEventNames);
export const isHarPageEventName = (eventName: string): eventName is HarPageEventName =>
	HarPageEventSet.has(eventName as HarPageEventName);

const HarNetworkEventNames = [
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
export type HarNetworkEventName = NonNullable<(typeof HarNetworkEventNames)[number]>;
const HarNetworkEventSet = new Set(HarNetworkEventNames);
export const isHarNetworkEventName = (eventName: string): eventName is HarNetworkEventName =>
	HarNetworkEventSet.has(eventName as HarNetworkEventName);

export const GetResponseBodyResponseEventName =	"Network.getResponseBodyResponse" as const;
const HarNetworkMetaEventNames = [
	GetResponseBodyResponseEventName,
] as const satisfies DebuggerNetworkMetaEventName[];
export type HarNetworkMetaEventName = NonNullable<(typeof HarNetworkMetaEventNames)[number]>;
const HarNetworkMetaEventSet = new Set(HarNetworkMetaEventNames);
export const isHarNetworkMetaEventName = (eventName: string): eventName is HarNetworkMetaEventName =>
	HarNetworkMetaEventSet.has(eventName as HarNetworkMetaEventName);

export type HarNetworkOrPageEventName = HarNetworkEventName | HarPageEventName | HarNetworkMetaEventName;
export type HarEventName = HarNetworkOrPageEventName;
export type HarEventOrMetaEventName = HarNetworkOrPageEventName | HarNetworkMetaEventName;

export const isHarNetworkOrPageEventName = (eventName: string): eventName is HarNetworkOrPageEventName =>
	isHarNetworkEventName(eventName) || isHarPageEventName(eventName) || isHarNetworkMetaEventName(eventName);

export const isHarNetworkEventOrMetaEventName = (eventName: string): eventName is HarNetworkEventName | HarNetworkMetaEventName =>
	isHarNetworkEventName(eventName) || isHarNetworkMetaEventName(eventName);

export type EventNameAndObjectTuple<NAME extends HarEventOrMetaEventName = HarEventOrMetaEventName> = [NAME, DebuggerEventOrMetaEvent<NAME>];
export type EventNameAndObject<NAME extends HarEventOrMetaEventName = HarEventOrMetaEventName> = {eventName: NAME, event: DebuggerEventOrMetaEvent<NAME>};
export type ChromeHarMethodParamsObject = {method: string, params: unknown}
