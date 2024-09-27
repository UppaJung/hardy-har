import type {DevToolsProtocol, Entry} from "./types/HttpArchiveFormat.ts";
import { HarEntryBuilder } from "./HarEntryBuilder.ts";
import type { PopulatedOptions } from "./Options.ts";
import { type FrameId } from "./types/HttpArchiveFormat.ts";
import { isHarNetworkEventOrMetaEventName } from "./types/type-checkers.ts";
import { calculateOnlyOnce } from "./util.ts";
import type { DebuggerEventOrMetaEvent } from "./types/DebuggerEvent.ts";
import { TimeLord } from "./TimeLord.ts";

const hasGetResponseBodyResponseInResponse = (event: unknown): event is {requestId: DevToolsProtocol.Network.RequestId} & {response: DevToolsProtocol.Network.GetResponseBodyResponse} =>
	event != null && typeof event === "object" && "requestId" in event && typeof event.requestId === "string"  &&
	"response" in event && typeof event.response === "object" && event.response != null &&
	"body" in event.response && typeof event.response.body === "string";

/**
 * This class is responsible for building the entries of a HAR by handling
 * Network events through its `onNetworkEvent` method and then returning
 * the entries via its `entries` getter.
 */
export class HarEntriesBuilder {
	/**
	 * The time lord turns timestamps into monotonically-increasing wall times
	 * (whereas wall times on events are not guaranteed to be monotonically increasing).
	 */
	timelord: TimeLord = new TimeLord();
	/**
	 * All entries created are added to this list, regardless of whether we have enough
	 * data about them to create a valid HAR entry.
	 */
	allEntryBuilders: HarEntryBuilder[] = [];
	/**
	 * Track EntryBuilders by their frameId (to associate them with pages).
	 */
	entryBuildersByFrameId = new Map<FrameId, HarEntryBuilder[]>();
	/**
	 * Track EntryBuilders by their requestId so we can associate events
	 * for the same request.
	 * 
	 * Note that redirects have the same requestId, so when a redirect happens,
	 * the EntryBuilder for the request to the original/prior URL will
	 * be kicked out of this map and replaced by the request to the new
	 * (redirected) URL, as subsequent events pertain to the redirected/new URL.
	 */
	entryBuildersByRequestId = new Map<string, HarEntryBuilder>();

	/**
	 * For debugging and legacy purposes, we track the order in which we create entries
	 * and assign each new one an creation-order index.
	 */
	harEntryCreationIndex = 0;

	constructor(readonly options: PopulatedOptions) { }

	/**
	 * Computes a list of all EntryBuilders that are valid for inclusion in a HAR archive.
	 * 
	 * This should only be called after all the events are collected, as it will be
	 * computed only once and its results will be cached.
	 */
	getCompletedHarEntryBuilders: () => HarEntryBuilder[] = calculateOnlyOnce( () =>
		this.allEntryBuilders.filter(e => e.isValidForInclusionInHarArchive) );

	/**
	 * Computes a list of all EntryBuilders that are valid for inclusion in a HAR archive
	 * and then sorts them by their request time.
	 * 
	 * This should only be called after all the events are collected, as it will be
	 * computed only once and its results will be cached.
	 */
	getCompletedHarEntryBuildersSortedByRequestTime: () => HarEntryBuilder[] = calculateOnlyOnce( () =>
		this.getCompletedHarEntryBuilders()
			.sort( (a, b) => a.requestTimeInSeconds - b.requestTimeInSeconds )
	);

	/**
	 * Retrieves all the HAR Entry records computed by the HAR Entry Builders. They are
	 * sorted by request time.
	 * 
	 * This should only be called after all the events are collected, as it will be
	 * computed only once and its results will be cached.
	 */
	getCompletedHarEntries: () => Entry[] = calculateOnlyOnce( () => {
		const sortedValidEntryBuilders = this.getCompletedHarEntryBuildersSortedByRequestTime();
		const harEntries = sortedValidEntryBuilders.map((entry) => entry.entry);
		const nonNullHarEntries = harEntries.filter(entry => entry != null);
		return nonNullHarEntries;
	});

	/**
	 * An array of HAR Entry records sorted by request time ready for inclusion into the
	 * `entries` property of a HAR Log.
	 * 
	 * This should only be accessed after all the events are collected, as it will be
	 * computed only once and its results will be cached.
	 */
	public get entries(): Entry[] {
		return this.getCompletedHarEntries();
	}

	/**
	 * Gets all the HAREntryBuilders that have timestamps and can be associated with pages, sorted by request time,
	 * so that pages can find the first event associated with it and copy over their timestamp.
	 * @param frameIds 
	 * @returns 
	 */
	getHarEntriesBuildersForFrameIdsSortedByRequestSentTimeStamp = (...frameIds: FrameId[]): HarEntryBuilder[] =>
		([] as HarEntryBuilder[]).concat(
			...frameIds.map(frameId => this.entryBuildersByFrameId.get(frameId) ?? [])
		)
		.filter( e => e.isValidForPageTimeCalculations)
		.sort( ((a, b) => a.timestamp - b.timestamp )
		);

	/**
	 * Internal function to get a HarEntryBuilder for a given requestId, or create a new one
	 * if one does not exist.
	 * 
	 * @param requestId The requestId of the network event
	 * @returns A HarEntryBuilder for the requestId
	 */
	#getOrCreateForRequestId(requestId: string) {
		let entry = this.entryBuildersByRequestId.get(requestId);
		if (entry == null) {
			entry = new HarEntryBuilder(this.timelord, this.harEntryCreationIndex++, this.options);
			this.entryBuildersByRequestId.set(requestId, entry);
			this.allEntryBuilders.push(entry);
		}
		return entry;
	}

	/**
	 * Handle a Chrome DevTools Protocol network event by
	 *  1. fetching the entry associated with it's requestId,
	 *     or creating a new entry if one does not exist
	 *  2. adding the event to the entry.
	 * 
	 * Processing the event data itself will happen after all the
	 * events have been collected.
	 * 
	 * @param eventName The event name (e.g. "Network.requestWillBeSent")
	 * @param untypedEvent The raw event dat provided by the Chrome DevTools
	 * Protocol for the event type specified by eventName
	 */
	onNetworkEvent = (eventName: string, untypedEvent: unknown): void => {
		if (!isHarNetworkEventOrMetaEventName(eventName)) {
			return;
		}
		const {requestId} = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
		let entryBuilder = this.#getOrCreateForRequestId(requestId);

		// The client of this package can attach response bodies to the
		// `Network.loadingFinished` event, the `Network.responseReceived` event,
		// or any other event. Or, they can record those events immediately and,
		// after getting the body response, use the meta event
		// `Network.getResponseBodyResponse`.
		// This records response bodies from whatever event they are attached to or
		// from the meta event.
		if (hasGetResponseBodyResponseInResponse(untypedEvent)) {
			const {body, base64Encoded=false} = untypedEvent.response;
			entryBuilder.getResponseBodyResponse = {base64Encoded, body};
		}

		// Handle all network events using well-defined typings
		switch (eventName) {
			case "Network.requestWillBeSent": {
				/**
				 * `Network.requestWillBeSent` is the only event that every
				 * entry must have. It's also potentially the most confusing,
				 * because of its `redirectResponse` property. The `redirectResponse`
				 * is the response not the this request, but to the prior
				 * `Network.requestWillBeSent` entry, which will have the same
				 * `requestId` as this one, and which received an HTTP redirect
				 * causing this subsequent request to the URL it was redirected to.
				 * 
				 * Thus, we need to pull the `redirectResponse` out of this event
				 * and associate it with a *prior* entry.
				 */
				const {redirectResponse, ...event} = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const {frameId=""} = event;
				let priorRedirects = 0;
				if (entryBuilder._requestWillBeSentEvent != null) {
					priorRedirects = entryBuilder.priorRedirects + 1;
					entryBuilder.redirectResponse = redirectResponse;
					this.entryBuildersByRequestId.delete(requestId);
					entryBuilder = this.#getOrCreateForRequestId(requestId);
				}

				// Wall times are not monotonically increasing, whereas timestamps are.
				// Let the timelord know the timestamp and wallTime so that it can
				// later map timestamps to monotonically-increasing event wall times
				// in ISO format, which may be slightly different from the reported
				// wall times.
				const {timestamp, wallTime} = event;
				this.timelord.addTimestampWallTimePair({timestamp, wallTime});

				// As with every other event, we add this one to the entry
				// associated with its requestId.
				entryBuilder._requestWillBeSentEvent = event;

				// Also count the number of prior redirects, which can help debug
				// redirect chains.
				entryBuilder.priorRedirects = priorRedirects;
 
				// `Network.requestWillBeSent` is the only event associating a request
				// to a frameId, which is how it is mapped to a page.
				// So, here we maintain a list of entry builders for each frameId.
				let entryBuilderForFrameId = this.entryBuildersByFrameId.get(frameId);
				if (entryBuilderForFrameId == null) {
					entryBuilderForFrameId = [];
					this.entryBuildersByFrameId.set(frameId, entryBuilderForFrameId);
				}
				entryBuilderForFrameId.push(entryBuilder);
				break;
			}
			/**
			 * For all other events, we just add them to their associated entryBuilder
			 * and process them after all events have been collected.
			 */
			case "Network.responseReceived": {
				entryBuilder.responseReceivedEvent = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				break;
			}
			case "Network.requestWillBeSentExtraInfo": {
				entryBuilder.requestWillBeSentExtraInfoEvent = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				break;
			}
			case "Network.responseReceivedExtraInfo": {
				entryBuilder.responseReceivedExtraInfoEvent = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				break;
			}
			case "Network.requestServedFromCache": {
				entryBuilder.requestServedFromCacheEvent = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				break;
			}
			case "Network.loadingFinished": {
				entryBuilder.loadingFinishedEvent = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				break;
			}
			case "Network.loadingFailed": {
				entryBuilder.loadingFailedEvent = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				break;
			}
			case "Network.dataReceived": {
				entryBuilder.dataReceivedEvents.push(untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>);
				break;
			}
			case "Network.resourceChangedPriority": {
				entryBuilder.resourceChangedPriorityEvent = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				break;
			}
			case "Network.getResponseBodyResponse": {
				entryBuilder.getResponseBodyResponse = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				break;
			}
			case "Network.webSocketFrameSent": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				entryBuilder.webSocketEvents.push({type: "send", event});
				break;
			}
			case "Network.webSocketFrameReceived": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				entryBuilder.webSocketEvents.push({type: "receive", event});
				break;
			}
			// default: {
			// 	Left out to ensure linter rule will catch events without a case statement.
			// }
		}
	};
}
