import type { DebuggerEventOrMetaEvent } from "./DebuggerEvent.ts";
import { HarEntriesBuilder } from "./HarEntriesBuilder.ts";
import { HarPagesBuilder } from "./HarPagesBuilder.ts";
import { defaultOptions, type Options, type PopulatedOptions } from "./Options.ts";
import type { ChromeHarMethodParamsObject, EventNameAndObject, EventNameAndObjectTuple, HarArchive, HarEventOrMetaEventName } from "./types.ts";


// FIXME -- move centrally
const PackageName = "hardy-har";
const PackageVersion = "0.0.1";

export class HarBuilder {
	readonly options: PopulatedOptions;
	pagesBuilder: HarPagesBuilder;
	entriesBuilder: HarEntriesBuilder;

	constructor(options: Options = {}) {
		this.options = {...defaultOptions, ...options};
		this.entriesBuilder = new HarEntriesBuilder(this.options);
		this.pagesBuilder = new HarPagesBuilder(this.entriesBuilder, this.options);
	}
	
	getHarArchive = () => {
		this.pagesBuilder.assignEntriesToPages();
		this.pagesBuilder.assignPageIds();
		const {pages} = this.pagesBuilder;
		const entries = this.entriesBuilder.getCompletedHarEntries();

		return {
			log: {
				version: '1.2',
				creator: {
					name: PackageName,
					version: PackageVersion,
				},
				pages,
				entries,
			}
		} as const satisfies HarArchive
	}

	onDebuggerEvent = (eventName: string, untypedEvent: unknown) => {
		if (untypedEvent == null || typeof untypedEvent !== 'object' || typeof eventName !== "string") return;
		if (eventName.startsWith('Network.')) {
			this.entriesBuilder.onNetworkEvent(eventName, untypedEvent);
		} else if (eventName.startsWith('Page.')) {
			this.pagesBuilder.onPageEvent(eventName, untypedEvent);
		}
	}

	onTypedDebuggerEvent = (<NAME extends HarEventOrMetaEventName>(eventName: NAME, event: DebuggerEventOrMetaEvent<NAME>) => {
		this.onDebuggerEvent(eventName, event);
	}) satisfies (...args: EventNameAndObjectTuple) => void;

	fromUntypedDebuggerEventNameAndObjectTuples = (eventNameAndObjectTuples: Iterable<[string, unknown]>) => {
		for (const [eventName, untypedEvent] of eventNameAndObjectTuples) {
			this.onDebuggerEvent(eventName, untypedEvent);
		}
		return this.getHarArchive();
	}

	fromEventNameAndObjectTuples = (eventNameAndObjectTuples: Iterable<EventNameAndObjectTuple>) =>
		this.fromUntypedDebuggerEventNameAndObjectTuples(eventNameAndObjectTuples);

	static fromUntypedEventNameAndObjectTuples = (eventNameAndObjectTuples: Iterable<[string, unknown]>, options: Options) => {
		return new HarBuilder(options).fromUntypedDebuggerEventNameAndObjectTuples(eventNameAndObjectTuples);
	}

	static fromEventNameAndObjectTuples = (eventNameAndObjectTuples: Iterable<EventNameAndObjectTuple>, options?: Options) =>
			new HarBuilder(options).fromEventNameAndObjectTuples(eventNameAndObjectTuples);

	static fromUntypedNamedDebuggerEvents = (namedDebuggerEvents: Iterable<{eventName: string, event: unknown}>, options?: Options) =>
			new HarBuilder(options).fromUntypedDebuggerEventNameAndObjectTuples([...namedDebuggerEvents].map( ({eventName, event}) => [eventName, event] ));

	static fromNamedDebuggerEvents = (namedDebuggerEvents: Iterable<EventNameAndObject>, options?: Options) =>
			new HarBuilder(options).fromUntypedDebuggerEventNameAndObjectTuples([...namedDebuggerEvents].map( ({eventName, event}) => [eventName, event] ));

	static fromChromeHarMessageParams = (methodParamsObjects: ChromeHarMethodParamsObject[], options?: Options) =>
		new HarBuilder(options).fromUntypedDebuggerEventNameAndObjectTuples([...methodParamsObjects].map( ({method, params}) => [method, params] ));
}

export type HarArchiveGenerated = ReturnType<HarBuilder["getHarArchive"]>;
export type HarLogGenerated = HarArchiveGenerated["log"];