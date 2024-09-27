import type {Protocol as DevToolsProtocol} from 'devtools-protocol';
export type {DevToolsProtocol};

type DebuggerPageEventNameAndObject =
	["Page.loadEventFired", DevToolsProtocol.Page.LoadEventFiredEvent] |
	["Page.domContentEventFired", DevToolsProtocol.Page.DomContentEventFiredEvent] |
	["Page.frameStartedLoading", DevToolsProtocol.Page.FrameStartedLoadingEvent] |
	["Page.frameAttached", DevToolsProtocol.Page.FrameAttachedEvent] |
	["Page.frameScheduledNavigation", DevToolsProtocol.Page.FrameScheduledNavigationEvent] |
	["Page.frameRequestedNavigation", DevToolsProtocol.Page.FrameRequestedNavigationEvent] |
	["Page.navigatedWithinDocument", DevToolsProtocol.Page.NavigatedWithinDocumentEvent] |
	never;
export type DebuggerPageEventName = DebuggerPageEventNameAndObject[0];
export type DebuggerPageEvent<T extends DebuggerPageEventName = DebuggerPageEventName> =
	Extract<DebuggerPageEventNameAndObject, [T, unknown]>[1]

export type DebuggerNetworkWebSocketEventNameAndObject =
	["Network.webSocketFrameSent", DevToolsProtocol.Network.WebSocketFrameSentEvent] |
	["Network.webSocketFrameReceived", DevToolsProtocol.Network.WebSocketFrameReceivedEvent] |
	["Network.webSocketCreated", DevToolsProtocol.Network.WebSocketCreatedEvent] |
	["Network.webSocketClosed", DevToolsProtocol.Network.WebSocketClosedEvent] |
	["Network.webSocketWillSendHandshakeRequest", DevToolsProtocol.Network.WebSocketWillSendHandshakeRequestEvent] |
	["Network.webSocketHandshakeResponseReceived", DevToolsProtocol.Network.WebSocketHandshakeResponseReceivedEvent] |
	never;
	export type DebuggerNetworkWebSocketEventName = DebuggerNetworkWebSocketEventNameAndObject[0];
	export type DebuggerNetworkWebSocketEvent<T extends DebuggerNetworkWebSocketEventName = DebuggerNetworkWebSocketEventName> =
	Extract<DebuggerNetworkWebSocketEventNameAndObject, [T, unknown]>[1]

export type DebuggerNetworkHttpEventNameAndObject =
	["Network.requestWillBeSent", DevToolsProtocol.Network.RequestWillBeSentEvent] |
	["Network.requestServedFromCache", DevToolsProtocol.Network.RequestServedFromCacheEvent] |
	["Network.dataReceived", DevToolsProtocol.Network.DataReceivedEvent] |
	["Network.responseReceived", DevToolsProtocol.Network.ResponseReceivedEvent] |
	["Network.resourceChangedPriority", DevToolsProtocol.Network.ResourceChangedPriorityEvent] |
	["Network.loadingFinished", DevToolsProtocol.Network.LoadingFinishedEvent] |
	["Network.loadingFailed", DevToolsProtocol.Network.LoadingFailedEvent] |
	["Network.requestWillBeSentExtraInfo", DevToolsProtocol.Network.RequestWillBeSentExtraInfoEvent] |
	["Network.responseReceivedExtraInfo", DevToolsProtocol.Network.ResponseReceivedExtraInfoEvent] |
	never;
	export type DebuggerNetworkHttpEventName = DebuggerNetworkHttpEventNameAndObject[0];
	export type DebuggerNetworkHttpEvent<T extends DebuggerNetworkHttpEventName = DebuggerNetworkHttpEventName> =
	Extract<DebuggerNetworkHttpEventNameAndObject, [T, unknown]>[1]

export type DebuggerMetaEventNameNetworkGetResponseBodyResponse = "Network.getResponseBodyResponse";
export type DebuggerNetworkMetaEventName = DebuggerMetaEventNameNetworkGetResponseBodyResponse;
export type DebuggerNetworkMetaEventNameAndObject =
	[DebuggerMetaEventNameNetworkGetResponseBodyResponse, {requestId: DevToolsProtocol.Network.RequestId} & DevToolsProtocol.Network.GetResponseBodyResponse] | 
	never
export type DebuggerNetworkMetaEvent<T extends DebuggerNetworkMetaEventName = DebuggerNetworkMetaEventName> =
	Extract<DebuggerNetworkMetaEventNameAndObject, [T, unknown]>[1]

type DebuggerEventNameAndObject =
	DebuggerPageEventNameAndObject |
	DebuggerNetworkHttpEventNameAndObject |
	DebuggerNetworkWebSocketEventNameAndObject |
	never;
export type DebuggerEventName = DebuggerEventNameAndObject[0]
export type DebuggerEvent<T extends DebuggerEventName = DebuggerEventName> =
	Extract<DebuggerEventNameAndObject, [T, unknown]>[1]

type DebuggerEventOrMetaEventNameAndObject =
	DebuggerEventNameAndObject |
	DebuggerNetworkMetaEventNameAndObject |
	never;
export type DebuggerEventOrMetaEventName = DebuggerEventOrMetaEventNameAndObject[0]
export type DebuggerEventOrMetaEvent<T extends DebuggerEventOrMetaEventName = DebuggerEventOrMetaEventName> =
	Extract<DebuggerEventOrMetaEventNameAndObject, [T, unknown]>[1]
