import type { DebuggerEventOrMetaEvent } from "./types/DebuggerEvent.ts";
import { HarEntriesBuilder } from "./HarEntriesBuilder.ts";
import { HarPagesBuilder } from "./HarPagesBuilder.ts";
import { defaultOptions, type Options, type PopulatedOptions } from "./Options.ts";
import type { HttpArchive } from "./types/HttpArchiveFormat.ts";
import type { ChromeHarMethodParamsObject, HarEventNameAndObject, HarEventNameAndObjectTuple,
	HarEventOrMetaEventName } from "./types/HarDebuggerEvents.ts";
import * as packageDetails from "./package.ts";

export class HarBuilder {
	readonly options: PopulatedOptions;
	pagesBuilder: HarPagesBuilder;
	entriesBuilder: HarEntriesBuilder;

	constructor(options: Options = {}) {
		this.options = {...defaultOptions, ...options};
		this.entriesBuilder = new HarEntriesBuilder(this.options);
		this.pagesBuilder = new HarPagesBuilder(this.entriesBuilder, this.options);
	}
	
	getHarArchive = (): HttpArchive => {
		this.pagesBuilder.assignEntriesToPages();
		this.pagesBuilder.assignPageIds();
		const {pages} = this.pagesBuilder;
		const entries = this.entriesBuilder.getCompletedHarEntries();

		const {name, version} = packageDetails;

		return {
			log: {
				version: '1.2',
				creator: {
					name,
					version,
				},
				pages,
				entries,
				comment: this.entriesBuilder.timelord.commentOnSkew
			}
		} as const satisfies HttpArchive;
	}

	onDebuggerEvent = (eventName: string, untypedEvent: unknown): void => {
		if (untypedEvent == null || typeof untypedEvent !== 'object' || typeof eventName !== "string") return;
		if (eventName.startsWith('Network.')) {
			this.entriesBuilder.onNetworkEvent(eventName, untypedEvent);
		} else if (eventName.startsWith('Page.')) {
			this.pagesBuilder.onPageEvent(eventName, untypedEvent);
		}
	}

	onTypedDebuggerEvent = <NAME extends HarEventOrMetaEventName>(eventName: NAME, event: DebuggerEventOrMetaEvent<NAME>): void => {
		this.onDebuggerEvent(eventName, event);
	}

	fromUntypedDebuggerEventNameAndObjectTuples = (eventNameAndObjectTuples: Iterable<[string, unknown]>): HttpArchive => {
		for (const [eventName, untypedEvent] of eventNameAndObjectTuples) {
			this.onDebuggerEvent(eventName, untypedEvent);
		}
		return this.getHarArchive();
	}

	fromEventNameAndObjectTuples = (eventNameAndObjectTuples: Iterable<HarEventNameAndObjectTuple>): HttpArchive =>
		this.fromUntypedDebuggerEventNameAndObjectTuples(eventNameAndObjectTuples);

	static fromUntypedEventNameAndObjectTuples = (eventNameAndObjectTuples: Iterable<[string, unknown]>, options: Options): HttpArchive => {
		return new HarBuilder(options).fromUntypedDebuggerEventNameAndObjectTuples(eventNameAndObjectTuples);
	}

	static fromEventNameAndObjectTuples = (eventNameAndObjectTuples: Iterable<HarEventNameAndObjectTuple>, options?: Options): HttpArchive =>
			new HarBuilder(options).fromEventNameAndObjectTuples(eventNameAndObjectTuples);

	static fromUntypedNamedDebuggerEvents = (namedDebuggerEvents: Iterable<{eventName: string, event: unknown}>, options?: Options): HttpArchive =>
			new HarBuilder(options).fromUntypedDebuggerEventNameAndObjectTuples([...namedDebuggerEvents].map( ({eventName, event}) => [eventName, event] ));

	static fromNamedDebuggerEvents = (namedDebuggerEvents: Iterable<HarEventNameAndObject>, options?: Options): HttpArchive =>
			new HarBuilder(options).fromUntypedDebuggerEventNameAndObjectTuples([...namedDebuggerEvents].map( ({eventName, event}) => [eventName, event] ));

	static fromChromeHarMessageParamsObjects = (methodParamsObjects: ChromeHarMethodParamsObject[], options?: Options): HttpArchive =>
		new HarBuilder(options).fromUntypedDebuggerEventNameAndObjectTuples([...methodParamsObjects].map( ({method, params}) => [method, params] ));
}

export type HarArchiveGenerated = ReturnType<HarBuilder["getHarArchive"]>;
export type HarLogGenerated = HarArchiveGenerated["log"];