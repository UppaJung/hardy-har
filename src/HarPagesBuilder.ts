import type { DebuggerEvent } from "./types/DebuggerEvent.ts";
import type { HarEntriesBuilder } from "./HarEntriesBuilder.ts";
import { HarPageBuilder } from "./HarPageBuilder.ts";
import type { Options } from "./Options.ts";
import type {Har} from "./types/index.ts";
import { type FrameId } from "./types/HttpArchiveFormat.ts";
import { calculateOnlyOnce } from "./util.ts";
import { isHarPageEventName } from "./types/type-checkers.ts";


export class HarPagesBuilder {
	constructor(protected readonly harEntriesBuilder: HarEntriesBuilder, protected readonly options: Options) {}

	byFrameId = new Map<FrameId, HarPageBuilder>();
	pageStackWithTopAtIndex0: HarPageBuilder[] = [];

	getOrCreateByFrameId = (frameId: FrameId): HarPageBuilder => {
		let page = this.byFrameId.get(frameId);
		if (page == null) {
			page = new HarPageBuilder(this.harEntriesBuilder, this.pageStackWithTopAtIndex0.length + 1, [frameId]);
			this.byFrameId.set(frameId, page);
			this.pageStackWithTopAtIndex0.unshift(page);
		}
		return page;
	};

	createForEntriesWithNoPage = (frameIds: FrameId[]): HarPageBuilder => {
		const page = new HarPageBuilder(this.harEntriesBuilder, 0, frameIds);
		for (const frameId of frameIds) {
			this.byFrameId.set(frameId, page);
		}
		this.pageStackWithTopAtIndex0.unshift(page);
		return page;
	};

	get topOfPageStack(): HarPageBuilder { return this.pageStackWithTopAtIndex0[0]; }

	protected validPageBuilders: () => HarPageBuilder[] = calculateOnlyOnce( () =>
		this.pageStackWithTopAtIndex0
			.filter( page => page.isValid )
			.toSorted( this.options.mimicChromeHar ?
				((a,b) => a.orderCreated - b.orderCreated) :
				((a,b) => a.timestamp - b.timestamp)
			)
	);

	assignEntriesToPages = (): void => {
		const entryBuildersSortedWithPage = this.harEntriesBuilder.getCompletedHarEntryBuilders()
			.map( entryBuilder => ({entryBuilder, pageBuilder: entryBuilder.frameId == null ? undefined : this.byFrameId.get(entryBuilder.frameId)}) );
		const entryBuildersWithPagesIdentifiedByTheirFrames =
			entryBuildersSortedWithPage.filter( ({pageBuilder}) => pageBuilder != null );
		const pagelessEntryBuilders = entryBuildersSortedWithPage.filter( ({pageBuilder}) => pageBuilder == null );

		if (pagelessEntryBuilders.length > 0) {
			// Create a new page for the pageless entries.
			const pageBuilderForPagelessEntries = this.createForEntriesWithNoPage(pagelessEntryBuilders.map( e => e.entryBuilder.frameId ?? ""));
			for (const {entryBuilder} of pagelessEntryBuilders) {
				entryBuilder.assignToPage(pageBuilderForPagelessEntries);
			}
		}
		for (const {entryBuilder, pageBuilder} of entryBuildersWithPagesIdentifiedByTheirFrames) {
			if (pageBuilder != null) {
				entryBuilder.assignToPage(pageBuilder);
			}
		}
	};

	assignPageIds = (): void => {
		this.validPageBuilders()
			.forEach( (page, index) => {
			// Assign the next sequential page number.
			page.id = `page_${index + 1}`;
		});
	};

	get pages(): Har.Page[]  { 
		return this.validPageBuilders()
			.map( page => page.page );
	}

	onPageEvent = (eventName: string, untypedEvent: unknown): void => {
		if (!isHarPageEventName(eventName)) return;
		const [topPageOfStack] = this.pageStackWithTopAtIndex0;
		switch (eventName) {
			case 'Page.frameAttached': {
				const frameAttachedEvent = untypedEvent as DebuggerEvent<typeof eventName>;
				const {frameId, parentFrameId} = frameAttachedEvent;
				if (parentFrameId == null || parentFrameId.length === 0 || parentFrameId === frameId) {
					this.getOrCreateByFrameId(frameId);
					break;
				}
				// This event attaches a frame to a parent frame.
				// Since frames are constructed descendant order (root, then child, then grandchild, etc.),
				// frame attached events should be fired in descendant order, and so we should have already
				// associated a parent frame before the page before it's child is attached. So, we can map the
				// child to a page by looking up the page that the parent frame (and its FrameId) was already
				// attached to.
				const page = this.byFrameId.get(parentFrameId);
				if (page == null) {
					// We never saw the page load, and are only seeing this frame within a page that we are unable to
					// associate with a page. We'll drop it and all the entries related to it.
					// (an alternative would be to create some sort of meta-page for it)
					return;
				}
				page.addFrameId(frameId);
				this.byFrameId.set(frameId, page);
				break;
			}
			// The remaining events will be attached to a PageBuilder, so that we can process them at
			// the end without having to worry about the order in which they are fired/received.
			case 'Page.loadEventFired': {
				if (topPageOfStack == null) break;
				const loadEventFiredEvent = untypedEvent as DebuggerEvent<typeof eventName>;
				topPageOfStack.loadEventFiredEvent = loadEventFiredEvent;
				break;
			}
			case 'Page.domContentEventFired': {
				if (topPageOfStack == null) break;
				const domContentEventFiredEvent = untypedEvent as DebuggerEvent<typeof eventName>;
				topPageOfStack.domContentEventFiredEvent = domContentEventFiredEvent;
				break;
			}
			case 'Page.frameStartedLoading': {
				const frameStartedLoadingEvent = untypedEvent as DebuggerEvent<typeof eventName>;
				const page = this.getOrCreateByFrameId(frameStartedLoadingEvent.frameId);
				page.frameStartedLoadingEvent = frameStartedLoadingEvent;
				break;
			}
			case 'Page.frameRequestedNavigation': {
				const frameRequestedNavigationEvent = untypedEvent as DebuggerEvent<typeof eventName>;
				const page = this.getOrCreateByFrameId(frameRequestedNavigationEvent.frameId);
				page.frameRequestedNavigationEvent = frameRequestedNavigationEvent;
				break;
			}
			case 'Page.navigatedWithinDocument': {
				const navigatedWithinDocumentEvent = untypedEvent as DebuggerEvent<typeof eventName>;
				const page = this.getOrCreateByFrameId(navigatedWithinDocumentEvent.frameId);
				page.navigatedWithinDocumentEvent = navigatedWithinDocumentEvent;
				break;
			}
		}
	};
}
