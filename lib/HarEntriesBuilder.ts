import type {DevToolsProtocol} from "./types.ts";
import { HarEntryBuilder } from "./HarEntryBuilder.ts";
import type { PopulatedOptions } from "./Options.ts";
import { type FrameId, isHarNetworkEventOrMetaEventName } from "./types.ts";
import { calculateOnlyOnce } from "./util.ts";
import type { DebuggerEventOrMetaEvent } from "./DebuggerEvent.ts";

const hasGetResponseBodyResponseInResponse = (event: unknown): event is {requestId: DevToolsProtocol.Network.RequestId} & {response: DevToolsProtocol.Network.GetResponseBodyResponse} =>
	event != null && typeof event === "object" && "requestId" in event && typeof event.requestId === "string"  &&
	"response" in event && typeof event.response === "object" && event.response != null &&
	"body" in event.response && typeof event.response.body === "string";

export class HarEntriesBuilder {
	allEntryBuilders: HarEntryBuilder[] = [];
	entryBuildersByFrameId: Map<FrameId, HarEntryBuilder[]> = new Map();
	entryBuildersByRequestId: Map<string, HarEntryBuilder> = new Map();
	harEntryCreationIndex = 0;

	constructor(readonly options: PopulatedOptions) { }

	#getCompletedHarEntries = calculateOnlyOnce( () => {
		const validEntryBuilders = this.allEntryBuilders.filter(e => e.isValidForInclusionInHarArchive)
		const sortedValidEntryBuilders = // this.options.mimicChromeHar ?
			// validEntryBuilders :
			validEntryBuilders.toSorted( (a, b) => a.requestTimeInSeconds - b.requestTimeInSeconds );
		const harEntries = sortedValidEntryBuilders.map((entry) => entry.entry);
		const nonNullHarEntries = harEntries.filter(entry => entry != null)
		return nonNullHarEntries;
	});

	get entries() {
		return this.#getCompletedHarEntries();
	}

	getHarEntriesBuildersForFrameIdsSortedByRequestSentTimeStamp = (...frameIds: FrameId[]) =>
		([] as HarEntryBuilder[]).concat(
			...frameIds.map(frameId => this.entryBuildersByFrameId.get(frameId) ?? []))
		.filter( e => e.isValidForPageTimeCalculations)
		.sort( this.options.mimicChromeHar ?
			((a, b) => a.orderArrived - b.orderArrived ) :
			((a, b) => a.requestWillBeSentEvent.timestamp - b.requestWillBeSentEvent.timestamp )
		);

	#getOrCreateForRequestId(requestId: string) {
		let entry = this.entryBuildersByRequestId.get(requestId);
		if (entry == null) {
			entry = new HarEntryBuilder(this.harEntryCreationIndex++, this.options);
			this.entryBuildersByRequestId.set(requestId, entry);
			this.allEntryBuilders.push(entry);
		}
		return entry;
	}

	onNetworkEvent = (eventName: string, untypedEvent: unknown) => {
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
				const {redirectResponse, ...event} = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const {requestId, frameId} = event;
				let priorRedirects = 0;
				const priorEntryForThisRequestId = this.entryBuildersByRequestId.get(requestId);
				if (priorEntryForThisRequestId != null && priorEntryForThisRequestId._requestWillBeSentEvent != null) {
					priorRedirects = priorEntryForThisRequestId.priorRedirects + 1;
					priorEntryForThisRequestId.redirectResponse = redirectResponse;
					this.entryBuildersByRequestId.delete(requestId);
				}
				const entry = this.#getOrCreateForRequestId(requestId);
				entry._requestWillBeSentEvent = event;
				entry.priorRedirects = priorRedirects;
				if (frameId != null) {
					let entriesForFrameId = this.entryBuildersByFrameId.get(frameId);
					if (entriesForFrameId == null) {
						entriesForFrameId = [];
						this.entryBuildersByFrameId.set(frameId, entriesForFrameId);
					}
					entriesForFrameId.push(entry);
				}
				break;
			}
			case "Network.responseReceived": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entry = this.#getOrCreateForRequestId(event.requestId);
				entry.responseReceivedEvent = event;
				break;
			}
			case "Network.requestWillBeSentExtraInfo": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entry = this.#getOrCreateForRequestId(event.requestId);
				entry.requestWillBeSentExtraInfoEvent = event;
				break;
			}
			case "Network.responseReceivedExtraInfo": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entry = this.#getOrCreateForRequestId(event.requestId);
				entry.responseReceivedExtraInfoEvent = event;
				break;
			}
			case "Network.requestServedFromCache": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entry = this.#getOrCreateForRequestId(event.requestId);
				entry.requestServedFromCacheEvent = event;
				break;
			}
			case "Network.loadingFinished": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entry = this.#getOrCreateForRequestId(event.requestId);
				entry.loadingFinishedEvent = event;
				break;
			}
			case "Network.loadingFailed": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entry = this.#getOrCreateForRequestId(event.requestId);
				entry.loadingFailedEvent = event;
				break;
			}
			case "Network.dataReceived": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entry = this.#getOrCreateForRequestId(event.requestId);
				entry.dataReceivedEvents.push(event);
				break;
			}
			case "Network.resourceChangedPriority": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entry = this.#getOrCreateForRequestId(event.requestId);
				entry.resourceChangedPriorityEvent = event;
				break;
			}
			case "Network.getResponseBodyResponse": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entry = this.#getOrCreateForRequestId(event.requestId);
				entry.getResponseBodyResponse = event;
				break;
			}
			case "Network.webSocketFrameSent": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entry = this.#getOrCreateForRequestId(event.requestId);
				entry.webSocketEvents.push({type: "sent", event});
				break;
			}
			case "Network.webSocketFrameReceived": {
				const event = untypedEvent as DebuggerEventOrMetaEvent<typeof eventName>;
				const entry = this.#getOrCreateForRequestId(event.requestId);
				entry.webSocketEvents.push({type: "receive", event});
				break;
			}
			default: {
				// console.log(`Ignoring event ${eventName}`);
			}
		}
	};
}
