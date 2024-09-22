import {chrome} from "npm:@types/chrome";
const chrome = globalThis.chrome;

// requires types from npm:@types/chrome
import {
	type HarEvent,
	type HarEventNameAndObject,
	type DevToolsProtocolGetResponseBodyRequest,
	type DevToolsProtocolGetResponseBodyResponse,
	GetResponseBodyResponseEventName,
	isHarEventName,
  harFromNamedDebuggerEvents,
} from "./index.ts";

export const recordBrowserTabToHarFromWithinExtension = async (
	tabId: number,
	executeBrowserTaskToRecord: () => Promise<void>
) => {
	const debuggerEventArray = [] as HarEventNameAndObject[]; 
	
	const onDebugEvent = async (source: chrome.debugger.Debuggee, eventName: string, event: unknown) => {
		// Ignore debugger events for other tabs
		if (source.tabId !== tabId) return;
		// Ignore events that aren't needed to generate HARs 
		if (!isHarEventName(eventName)) return;
		debuggerEventArray.push({eventName, event: event as HarEvent<typeof eventName>});

		if (eventName === 'Network.loadingFinished') {
			// The chrome Network protocol doesn't provide response bodies unless you ask.
			const requestId = (event as HarEvent<typeof eventName>).requestId;
			const responseBodyObj = (await (chrome.debugger.sendCommand(
				{tabId},
				"Network.getResponseBody",
				{requestId} satisfies DevToolsProtocolGetResponseBodyRequest)
			)) as DevToolsProtocolGetResponseBodyResponse | undefined;
			if (responseBodyObj != null) {
				debuggerEventArray.push({
					eventName: GetResponseBodyResponseEventName,
					event: {requestId, ...responseBodyObj} satisfies HarEvent<typeof GetResponseBodyResponseEventName>
				});
			}
		}		
	}

	try {
		await chrome.debugger.attach({tabId}, '1.3');
		await chrome.debugger.sendCommand({tabId}, "Page.enable");
		await chrome.debugger.sendCommand({tabId}, "Network.enable");
		chrome.debugger.onEvent.addListener(onDebugEvent);

		await executeBrowserTaskToRecord();
		return harFromNamedDebuggerEvents(debuggerEventArray);

	} finally {
		await chrome.debugger.detach({tabId});
	}
}
