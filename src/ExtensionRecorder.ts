const chrome = globalThis.chrome;

import {
	isHarEventName,
  harFromNamedDebuggerEvents,
} from "./index.ts";
import type { DevToolsProtocolGetResponseBodyRequest, DevToolsProtocolGetResponseBodyResponse, HarEvent, HarEventNameAndObject } from "./types/HarDebuggerEvents.ts";
import { GetResponseBodyResponseMetaEventName } from "./types/type-constants.ts";

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
					eventName: GetResponseBodyResponseMetaEventName,
					event: {requestId, ...responseBodyObj} satisfies HarEvent<typeof GetResponseBodyResponseMetaEventName>
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
