const chrome = globalThis.chrome;

/**
 * Sample code for generating a HAR file from within a browser extension.
 */
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
	
	/**
	 * Handle events from the Chrome DevTools Protocol.
	 */
	const onDebuggerEvent = async (source: chrome.debugger.Debuggee, eventName: string, event: unknown) => {
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
				// Add a meta-event that contains the response body
				debuggerEventArray.push({
					eventName: GetResponseBodyResponseMetaEventName,
					event: {requestId, ...responseBodyObj} satisfies HarEvent<typeof GetResponseBodyResponseMetaEventName>
				});
			}
		}		
	};

	try {
		/**
		 * Attach debugger to the tab to be observed and listen for events
		 * 
		 * (if this fails, make sure you extension has the "debugger"
		 *  permission in its manifest)
		 */
		await chrome.debugger.attach({tabId}, '1.3');
		await chrome.debugger.sendCommand({tabId}, "Page.enable");
		await chrome.debugger.sendCommand({tabId}, "Network.enable");
		chrome.debugger.onEvent.addListener(onDebuggerEvent);

		/*
		 * This is where you do whatever you want to record.
		 *
		 * Alternatively, the code above could be in a function called
		 * `startRecording` and the code below the following line
		 * could be in a function called `stopRecording`.

		 */
		await executeBrowserTaskToRecord();

		/**
		 * Call the strongly-typed API to hardy-har because type checkers
		 * prevent bugs!
		 */
		return harFromNamedDebuggerEvents(debuggerEventArray);

	} finally {
		await chrome.debugger.detach({tabId});
	}
};
