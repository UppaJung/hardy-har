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

export class HarEntriesBuilder {
	timelord: TimeLord = new TimeLord();
	allEntryBuilders: HarEntryBuilder[] = [];
	entryBuildersByFrameId = new Map<FrameId, HarEntryBuilder[]>();
	entryBuildersByRequestId = new Map<string, HarEntryBuilder>();
	harEntryCreationIndex = 0;

	constructor(readonly options: PopulatedOptions) { }

	getCompletedHarEntryBuilders: () => HarEntryBuilder[] = calculateOnlyOnce( () =>
		this.allEntryBuilders.filter(e => e.isValidForInclusionInHarArchive) );

	getCompletedHarEntryBuildersSortedByRequestTime: () => HarEntryBuilder[] = calculateOnlyOnce( () =>
		this.getCompletedHarEntryBuilders()
			.sort( (a, b) => a.requestTimeInSeconds - b.requestTimeInSeconds )
	);

	getCompletedHarEntries: () => Entry[] = calculateOnlyOnce( () => {
		const sortedValidEntryBuilders = this.getCompletedHarEntryBuildersSortedByRequestTime();
		const harEntries = sortedValidEntryBuilders.map((entry) => entry.entry);
		const nonNullHarEntries = harEntries.filter(entry => entry != null);
		return nonNullHarEntries;
	});

	getHarEntriesBuildersForFrameIdsSortedByRequestSentTimeStamp = (...frameIds: FrameId[]): HarEntryBuilder[] =>
		([] as HarEntryBuilder[]).concat(
			...frameIds.map(frameId => this.entryBuildersByFrameId.get(frameId) ?? [])
		)
		.filter( e => e.isValidForPageTimeCalculations)
		.sort(  // this.options.mimicChromeHar ?
			// ((a, b) => a.orderArrived - b.orderArrived ) :
			((a, b) => a.timestamp - b.timestamp )
		);

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
			// console.log(`Ignoring event ${eventName}`);
		}

		// The client of this package can attach response bodies to the
		// `Network.loadingFinished` event, the `Network.responseReceived` event,
		// or any other event. Or, they can record those events immediately and,
		// after getting the body response, use the meta event
		// `Network.getResponseBodyResponse`.
		// This records response bodies from whatever event they are attached to or
		// from the meta event.
		if (hasGetResponseBodyResponseInResponse(untypedEvent)) {
			const entry = this.#getOrCreateForRequestId(untypedEvent.requestId);
			const {body, base64Encoded=false} = untypedEvent.response;
			entry.getResponseBodyResponse = {base64Encoded, body};
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
				const {requestId, frameId=""} = event;
				let priorRedirects = 0;
				const priorEntryForThisRequestId = this.entryBuildersByRequestId.get(requestId);
				if (priorEntryForThisRequestId != null && priorEntryForThisRequestId._requestWillBeSentEvent != null) {
					priorRedirects = priorEntryForThisRequestId.priorRedirects + 1;
					priorEntryForThisRequestId.redirectResponse = redirectResponse;
					this.entryBuildersByRequestId.delete(requestId);
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
				const entryBuilder = this.#getOrCreateForRequestId(requestId);
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
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entryBuilder = this.#getOrCreateForRequestId(event.requestId);
				entryBuilder.responseReceivedEvent = event;
				break;
			}
			case "Network.requestWillBeSentExtraInfo": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entryBuilder = this.#getOrCreateForRequestId(event.requestId);
				entryBuilder.requestWillBeSentExtraInfoEvent = event;
				break;
			}
			case "Network.responseReceivedExtraInfo": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entryBuilder = this.#getOrCreateForRequestId(event.requestId);
				entryBuilder.responseReceivedExtraInfoEvent = event;
				break;
			}
			case "Network.requestServedFromCache": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entryBuilder = this.#getOrCreateForRequestId(event.requestId);
				entryBuilder.requestServedFromCacheEvent = event;
				break;
			}
			case "Network.loadingFinished": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entryBuilder = this.#getOrCreateForRequestId(event.requestId);
				entryBuilder.loadingFinishedEvent = event;
				break;
			}
			case "Network.loadingFailed": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entryBuilder = this.#getOrCreateForRequestId(event.requestId);
				entryBuilder.loadingFailedEvent = event;
				break;
			}
			case "Network.dataReceived": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entryBuilder = this.#getOrCreateForRequestId(event.requestId);
				entryBuilder.dataReceivedEvents.push(event);
				break;
			}
			case "Network.resourceChangedPriority": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entryBuilder = this.#getOrCreateForRequestId(event.requestId);
				entryBuilder.resourceChangedPriorityEvent = event;
				break;
			}
			case "Network.getResponseBodyResponse": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entryBuilder = this.#getOrCreateForRequestId(event.requestId);
				entryBuilder.getResponseBodyResponse = event;
				break;
			}
			case "Network.webSocketFrameSent": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entryBuilder = this.#getOrCreateForRequestId(event.requestId);
				entryBuilder.webSocketEvents.push({type: "sent", event});
				break;
			}
			// case "Network.webSocketFrameReceived": {
			// 	const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
			// 	const entryBuilder = this.#getOrCreateForRequestId(event.requestId);
			// 	entryBuilder.webSocketEvents.push({type: "receive", event});
			// 	break;
			// }
			// default: {
			// 	// We could report unknown events here, but better to use lint
			// 	// switch-exhaustiveness-check
			// }
		}
	};
}
