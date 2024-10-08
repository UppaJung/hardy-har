import type { DebuggerNetworkHttpEventName, DebuggerNetworkWebSocketEventName, DebuggerPageEventName } from "./types/DebuggerEvent.ts";

export const NamesOfDebuggerWebSocketEventsToRecord = [
	"Network.webSocketFrameSent",
	"Network.webSocketFrameReceived",
	"Network.webSocketCreated",
	"Network.webSocketClosed",
	"Network.webSocketWillSendHandshakeRequest",
	"Network.webSocketHandshakeResponseReceived",
] as const satisfies DebuggerNetworkWebSocketEventName[];


export const NamesOfDebuggerNetworkHttpEventsToRecord = [
	"Network.requestWillBeSent",
	"Network.requestServedFromCache",
	"Network.dataReceived",
	"Network.responseReceived",
	"Network.resourceChangedPriority",
	"Network.loadingFinished",
	"Network.loadingFailed",
	"Network.requestWillBeSentExtraInfo",
	"Network.responseReceivedExtraInfo",
] as const satisfies DebuggerNetworkHttpEventName[];


export const NamesOfDebuggerPageEventsToRecord = [
	"Page.loadEventFired",
	"Page.domContentEventFired",
	"Page.frameStartedLoading",
	"Page.frameAttached",
	"Page.frameScheduledNavigation",
	"Page.frameRequestedNavigation",
	"Page.navigatedWithinDocument",
] as const satisfies DebuggerPageEventName[];

/**
 * A list of all the Chrome DevTools events
 * that should be passed to hardy-har.
 */
export const NamesOfDebuggerEventsToRecord = [
	...NamesOfDebuggerNetworkHttpEventsToRecord,
	...NamesOfDebuggerWebSocketEventsToRecord,
	...NamesOfDebuggerPageEventsToRecord,
] as const;