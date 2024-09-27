
import type { DebuggerEventOrMetaEvent } from "./types/DebuggerEvent.ts";
import { HarEntriesBuilder } from "./HarEntriesBuilder.ts";
import { HarPagesBuilder } from "./HarPagesBuilder.ts";
import { defaultOptions, type Options, type PopulatedOptions } from "./Options.ts";
import type { HttpArchive } from "./types/HttpArchiveFormat.ts";
import type { ChromeHarMethodParamsObject, HarEventNameAndObject, HarEventNameAndObjectTuple,
	HarEventOrMetaEventName } from "./types/HarDebuggerEvents.ts";
import * as packageDetails from "./package.ts";

/**
 * This is the main class for the HAR Builder.
 * 
 * If you're looking to understand the library, start here.
 * 
 * A HAR is composed of pages and entries, and this class will
 * use an EntriesBuilder to build the entries and a PageBuilder
 * to build the pages.
 * 
 * To use this class, you will:
 *   - construct it
 *   - send all debugger events received from the chrome dev tools to either
 * 	   `onTypedDebuggerEvent` (yay for typed implementations) or
 *     `onDebuggerEvent` (legacy at your own risk),
 *   - call `getHarArchive` to get the completed HAR archive.
 *
 */
export class HarBuilder {
	readonly options: PopulatedOptions;
	pagesBuilder: HarPagesBuilder;
	entriesBuilder: HarEntriesBuilder;

	/**
	 * Constructor will pass the options down to the builders for pages and entries.
	 * @param options 
	 */
	constructor(options: Options = {}) {
		this.options = {...defaultOptions, ...options};
		this.entriesBuilder = new HarEntriesBuilder(this.options);
		this.pagesBuilder = new HarPagesBuilder(this.entriesBuilder, this.options);
	}

	/**
	 * Call after observing all debugger events via `onTypedDebuggerEvent` (preferred)
	 * or `onDebuggerEvent` (legacy).
   *
	 * @returns A HAR archive derived from all the observed debugger events.
	 */
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
	};

	/**
	 * Record a debugger events without typing
	 * @param eventName The event name (e.g. "Network.requestWillBeSent") 
	 * @param untypedEvent  The event object sent by the DevTools Protocol (CDP).
	 */
	onDebuggerEvent = (eventName: string, untypedEvent: unknown): void => {
		if (untypedEvent == null || typeof untypedEvent !== 'object' || typeof eventName !== "string") return;
		if (eventName.startsWith('Network.')) {
			this.entriesBuilder.onNetworkEvent(eventName, untypedEvent);
		} else if (eventName.startsWith('Page.')) {
			this.pagesBuilder.onPageEvent(eventName, untypedEvent);
		}
	};

	/**
	 * Record an event observed from the Chrome DevTools Protocol (CDP).
	 * @param eventName The event name (e.g. "Network.requestWillBeSent")
	 * @param event The event object sent by the DevTools Protocol (CDP).
	 */
	onTypedDebuggerEvent = <NAME extends HarEventOrMetaEventName>(eventName: NAME, event: DebuggerEventOrMetaEvent<NAME>): void => {
		this.onDebuggerEvent(eventName, event);
	};

	/**
	 * Generate a HAR archive from [name, event] pairs.
	 * @param eventNameAndObjectTuples [name, event] pairs where the name is an event name like "Network.requestWillBeSent"
	 * and the event is the raw object sent by the Chrome DevTools Protocol (CDP).
	 * @returns A HAR archive derived from all the observed debugger events.
	 */
	fromUntypedDebuggerEventNameAndObjectTuples = (eventNameAndObjectTuples: Iterable<[string, unknown]>): HttpArchive => {
		for (const [eventName, untypedEvent] of eventNameAndObjectTuples) {
			this.onDebuggerEvent(eventName, untypedEvent);
		}
		return this.getHarArchive();
	};

	/**
	 * Generate a HAR archive from an array of {eventName, event} objects.
	 * @param eventNameAndObjectTuples `eventName`s are Chrome DevTools Protocol (CDP) event names
	 * likes "Network.requestWillBeSent" and `event`s are the raw object sent by the CDP.
	 * @returns A HAR archive derived from all the observed debugger events.
	 */
	fromEventNameAndObjectTuples = (eventNameAndObjectTuples: Iterable<HarEventNameAndObjectTuple>): HttpArchive =>
		this.fromUntypedDebuggerEventNameAndObjectTuples(eventNameAndObjectTuples);

	/**
	 * Generate a HAR archive from an array of untyped [eventName, event] tuples.
	 * @param eventNameAndObjectTuples `eventName`s are Chrome DevTools Protocol (CDP) event names
	 * likes "Network.requestWillBeSent" and `event`s are the raw object sent by the CDP.
	 * @returns A HAR archive derived from all the observed debugger events.
	 */
	static fromUntypedEventNameAndObjectTuples = (eventNameAndObjectTuples: Iterable<[string, unknown]>, options: Options): HttpArchive => {
		return new HarBuilder(options).fromUntypedDebuggerEventNameAndObjectTuples(eventNameAndObjectTuples);
	};

	/**
	 * Generate a HAR archive from an array of typed [eventName, event] tuples.
	 * @param eventNameAndObjectTuples `eventName`s are Chrome DevTools Protocol (CDP) event names
	 * likes "Network.requestWillBeSent" and `event`s are the raw object sent by the CDP.
	 * @returns A HAR archive derived from all the observed debugger events.
	 */
	static fromEventNameAndObjectTuples = (eventNameAndObjectTuples: Iterable<HarEventNameAndObjectTuple>, options?: Options): HttpArchive =>
			new HarBuilder(options).fromEventNameAndObjectTuples(eventNameAndObjectTuples);


	static fromUntypedNamedDebuggerEvents = (namedDebuggerEvents: Iterable<{eventName: string, event: unknown}>, options?: Options): HttpArchive =>
			new HarBuilder(options).fromUntypedDebuggerEventNameAndObjectTuples([...namedDebuggerEvents].map( ({eventName, event}) => [eventName, event] ));

	/**
	 * Generate a HAR archive from an iterable of {eventName, event} objects.
	 * @param namedDebuggerEvents  `eventName`s are Chrome DevTools Protocol (CDP) event names
	 * likes "Network.requestWillBeSent" and `event`s are the raw object sent by the CDP.
	 * @returns A HAR archive derived from all the observed debugger events.
	 */
	static fromNamedDebuggerEvents = (namedDebuggerEvents: Iterable<HarEventNameAndObject>, options?: Options): HttpArchive =>
			new HarBuilder(options).fromUntypedDebuggerEventNameAndObjectTuples([...namedDebuggerEvents].map( ({eventName, event}) => [eventName, event] ));

	/**
	 * This is a drop-in replacement for the function exported by the `chrome-har` package,
	 * and should **only** be used for backwards-compatibility in code that requires the
	 * same format. We recommend using one of the typed interfaces in all TypeScript projects,
	 * or at least one of the interfaces that uses a less-confusing naming scheme.
	 * 
	 * Generate a HAR archive from an array of `chrome-har` style {message, param} objects.
	 * @param namedDebuggerEvents  the message property is the name of Chrome DevTools Protocol
	 * (CDP) event, which for clarity we call an `eventName` in non-legacy interfaces.
	 * The param property is the raw event object provided by the CDP, which for clarity
	 * we call an `event` in non-legacy interfaces.
	 * 
	 * @returns A HAR archive derived from all the observed debugger events.
	 */
	static fromChromeHarMessageParamsObjects = (methodParamsObjects: ChromeHarMethodParamsObject[], options?: Options): HttpArchive =>
		new HarBuilder(options).fromUntypedDebuggerEventNameAndObjectTuples([...methodParamsObjects].map( ({method, params}) => [method, params] ));
}

export type HarArchiveGenerated = ReturnType<HarBuilder["getHarArchive"]>;

export type HarLogGenerated = HarArchiveGenerated["log"];