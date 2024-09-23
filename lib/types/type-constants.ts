import type { DebuggerPageEventName } from "./DebuggerEvent.ts";
import type { HarNetworkEventName, HarNetworkMetaEventName, HarPageEventName } from "./HarDebuggerEvents.ts";

export const HarPageEventNames: HarPageEventName[] = [
	'Page.frameAttached',
	'Page.loadEventFired',
	'Page.domContentEventFired',
	'Page.frameStartedLoading',
	'Page.frameRequestedNavigation',
	'Page.navigatedWithinDocument',
] as const satisfies DebuggerPageEventName[];
export const HarPageEventSet = new Set(HarPageEventNames);

export const HarNetworkEventNames: HarNetworkEventName[] = [
	"Network.requestWillBeSent",
	"Network.responseReceived",
	"Network.requestWillBeSentExtraInfo",
	"Network.responseReceivedExtraInfo",
	"Network.requestServedFromCache",
	"Network.loadingFinished",
	"Network.loadingFailed",
	"Network.dataReceived",
	"Network.resourceChangedPriority",
	"Network.webSocketFrameSent",
	"Network.webSocketFrameReceived",
] as const satisfies HarNetworkEventName[];
export const HarNetworkEventSet = new Set(HarNetworkEventNames);

export const GetResponseBodyResponseMetaEventName = "Network.getResponseBodyResponse" as const;
export const HarNetworkMetaEventNames: HarNetworkMetaEventName[] = [
	"Network.getResponseBodyResponse",
] as const satisfies HarNetworkMetaEventName[];
export const HarNetworkMetaEventSet = new Set(HarNetworkMetaEventNames);

