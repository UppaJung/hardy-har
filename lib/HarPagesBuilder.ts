import { DebuggerEvent } from "./DebuggerEvent.ts";
import { HarEntriesBuilder } from "./HarEntriesBuilder.ts";
import { HarPageBuilder } from "./HarPageBuilder.ts";
import { type FrameId, isHarPageEventName } from "./types.ts";
import { calculateOnlyOnce } from "./util.ts";


export class HarPagesBuilder {
	constructor(protected readonly harEntriesBuilder: HarEntriesBuilder) {}

	byFrameId = new Map<FrameId, HarPageBuilder>();
	pageStackWithTopAtIndex0 = [] as HarPageBuilder[];

	getOrCreateByFrameId(frameId: FrameId) {
		let page = this.byFrameId.get(frameId);
		if (page == null) {
			page = new HarPageBuilder(frameId, this.harEntriesBuilder);
			this.byFrameId.set(frameId, page);
			this.pageStackWithTopAtIndex0.unshift(page);
		}
		return page;
	}

	get topOfPageStack() { return this.pageStackWithTopAtIndex0[0]; }

	protected validPageBuilders = calculateOnlyOnce( () =>
		this.pageStackWithTopAtIndex0.toReversed().filter( page => page.isValid )
	);

	assignPageIds = () => {
		this.validPageBuilders().forEach( (page, index) => {
			// Assign the next sequential page number.
			page.id = `page_${index + 1}`;
			// Copy the page number into all the entries for this page.
			for (const frameId of page.frameIds) {
				for (const entry of this.harEntriesBuilder.byFrameId.get(frameId) ?? []) {
					entry.assignToPage(page);
				}
			}
		});
	}

	get pages() { 
		return this.validPageBuilders()
			.map( page => page.page );
	}

	onPageEvent = (eventName: string, untypedEvent: unknown) => {
		if (!isHarPageEventName(eventName)) return;
		const [topPageOfStack] = this.pageStackWithTopAtIndex0;
		switch (eventName) {
			case 'Page.frameAttached': {
				const frameAttachedEvent = untypedEvent as DebuggerEvent<typeof eventName>;
				// This event attaches a frame to a parent frame.
				// Since frames are constructed descendant order (root, then child, then grandchild, etc.),
				// frame attached events should be fired in descendant order, and so we should have already
				// associated a parent frame before the page before it's child is attached. So, we can map the
				// child to a page by looking up the page that the parent frame (and its FrameId) was already
				// attached to.
				const page = this.byFrameId.get(frameAttachedEvent.parentFrameId);
				if (page == null) {
					// We never saw the page load, and are only seeing this frame within a page that we are unable to
					// associate with a page. We'll drop it and all the entries related to it.
					// (an alternative would be to create some sort of meta-page for it)
					return;
				}
				page.addFrameId(frameAttachedEvent.frameId);
				this.byFrameId.set(frameAttachedEvent.frameId, page);
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
