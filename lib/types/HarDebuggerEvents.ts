import type { Protocol as DevToolsProtocol } from "npm:devtools-protocol@0.0.1358005";
import type { DebuggerEventOrMetaEvent } from "./DebuggerEvent.ts";

export type HarPageEventName =
	'Page.frameAttached' |
	'Page.loadEventFired' |
	'Page.domContentEventFired' |
	'Page.frameStartedLoading' |
	'Page.frameRequestedNavigation' |
	'Page.navigatedWithinDocument';


export type HarNetworkEventName = 
	'Network.requestWillBeSent' |
	'Network.responseReceived' |
	'Network.requestWillBeSentExtraInfo' |
	'Network.responseReceivedExtraInfo' |
	'Network.requestServedFromCache' |
	'Network.loadingFinished' |
	'Network.loadingFailed' |
	'Network.dataReceived' |
	'Network.resourceChangedPriority' |
	'Network.webSocketFrameSent' |
	'Network.webSocketFrameReceived' |
	never;

	// export type HarNetworkEventName = NonNullable<(typeof HarNetworkEventNames)[number]>;
export type GetResponseBodyResponseMetaEventName = "Network.getResponseBodyResponse";
export type HarMetaEventName = GetResponseBodyResponseMetaEventName;
export type HarNetworkMetaEventName = GetResponseBodyResponseMetaEventName;

export type HarNetworkOrPageEventName = HarNetworkEventName | HarPageEventName | HarNetworkMetaEventName;
export type HarEventName = HarNetworkOrPageEventName;
export type HarEventOrMetaEventName = HarNetworkOrPageEventName | HarNetworkMetaEventName;
export type HarEvent<T extends HarEventOrMetaEventName> = DebuggerEventOrMetaEvent<T>;

export type HarEventNameAndObjectTuple<NAME extends HarEventOrMetaEventName = HarEventOrMetaEventName> = [NAME, HarEvent<NAME>];
export type HarEventNameAndObject<NAME extends HarEventOrMetaEventName = HarEventOrMetaEventName> = { eventName: NAME; event: HarEvent<NAME>; };
export type ChromeHarMethodParamsObject = { method: string; params: unknown; };

export type DevToolsProtocolGetResponseBodyRequest = DevToolsProtocol.Network.GetResponseBodyRequest;
export type DevToolsProtocolGetResponseBodyResponse = DevToolsProtocol.Network.GetResponseBodyResponse;

