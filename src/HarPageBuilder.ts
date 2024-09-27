import type { HarEntriesBuilder } from "./HarEntriesBuilder.ts";
import type { HarEntryBuilder } from "./HarEntryBuilder.ts";
import type { FrameId, Page, DevToolsProtocol, PageTimings, Timestamp, ISODateTimeString} from "./types/HttpArchiveFormat.ts";
import { calculateOnlyOnce, roundToThreeDecimalPlaces, } from "./util.ts";

export class HarPageBuilder {
	id?: string;
	frameAttachedEvents = [] as  DevToolsProtocol.Page.FrameAttachedEvent[];
	loadEventFiredEvent?: DevToolsProtocol.Page.LoadEventFiredEvent;
	domContentEventFiredEvent?: DevToolsProtocol.Page.DomContentEventFiredEvent;
	frameStartedLoadingEvent?: DevToolsProtocol.Page.FrameStartedLoadingEvent;
	frameRequestedNavigationEvent?: DevToolsProtocol.Page.FrameRequestedNavigationEvent;
	navigatedWithinDocumentEvent?: DevToolsProtocol.Page.NavigatedWithinDocumentEvent;

	frameIds: Set<FrameId>;

	constructor(protected readonly harEntriesBuilder: HarEntriesBuilder, readonly orderCreated: number, frameIds: FrameId[] = []) {
		this.frameIds = new Set<FrameId>(frameIds);
	}

	addFrameId = (frameId: FrameId): void => {
		this.frameIds.add(frameId);
	};

	protected get title(): string {
		return this.frameRequestedNavigationEvent?.url ?? this.navigatedWithinDocumentEvent?.url ?? this.earliestRequest.requestUrl ?? "unknown";
	}

	#getEarliestRequest: () => HarEntryBuilder = calculateOnlyOnce( () => 
		this.harEntriesBuilder.getHarEntriesBuildersForFrameIdsSortedByRequestSentTimeStamp(...this.frameIds)[0]
	);

	get isValid(): boolean {
		return this.#getEarliestRequest() != null;
	}

	/**
	 * To be used only after all builders' data has been populated and no new
	 * data is to be added.
	 */
	protected get earliestRequest(): HarEntryBuilder {
		const result = this.#getEarliestRequest();
		if (result == null) {
			throw new Error('Page is not valid as no request found for it. Property Page.earliestRequest should not have been accessed.');
		}
		return result;		
	}

	get timestamp(): Timestamp {
		return this.earliestRequest.timestamp;
	}

	protected get startedDateTime(): ISODateTimeString {
		return this.earliestRequest.startedDateTime;
	}

	get pageTimings(): PageTimings {
		const onContentLoad = this.domContentEventFiredEvent == null ? -1 :
			roundToThreeDecimalPlaces(
				(this.domContentEventFiredEvent.timestamp - this.timestamp) * 1000
			);
		const onLoad = this.loadEventFiredEvent == null ? -1 :
			roundToThreeDecimalPlaces(
				(this.loadEventFiredEvent.timestamp - this.timestamp) * 1000
			);

		return {
			onContentLoad,
			onLoad,
		};
	}

	get page(): Page {
		const {id, title, startedDateTime, pageTimings} = this;
		if (id == null) {
			throw new Error("Cannot construct new Har format page unless the builder's id field has been set.");
		}
		return {
			id,
			startedDateTime,
			title,
			pageTimings,
		} as const satisfies Page;
	}

}

export type HarPageGenerated	= HarPageBuilder['page'];
