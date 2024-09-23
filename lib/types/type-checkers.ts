import type { HarPageEventName } from "./HarDebuggerEvents.ts";
import { HarNetworkOrPageEventName, HarEventName, HarNetworkEventName, HarNetworkMetaEventName } from "./HarDebuggerEvents.ts";
import {HarNetworkEventSet, HarNetworkMetaEventSet, HarPageEventSet} from "./type-constants.ts";

export const isHarPageEventName = (eventName: string): eventName is HarPageEventName =>
	HarPageEventSet.has(eventName as HarPageEventName);


export const isHarNetworkEventName = (eventName: string): eventName is HarNetworkEventName => HarNetworkEventSet.has(eventName as HarNetworkEventName);


export const isHarNetworkMetaEventName = (eventName: string): eventName is HarNetworkMetaEventName => HarNetworkMetaEventSet.has(eventName as HarNetworkMetaEventName);

export const isHarNetworkOrPageEventName = (eventName: string): eventName is HarNetworkOrPageEventName => isHarNetworkEventName(eventName) || isHarPageEventName(eventName) || isHarNetworkMetaEventName(eventName);

export const isHarEventName = (eventName: string): eventName is HarEventName => isHarNetworkEventName(eventName) || isHarPageEventName(eventName);
export const isHarNetworkEventOrMetaEventName = (eventName: string): eventName is HarNetworkEventName | HarNetworkMetaEventName => isHarNetworkEventName(eventName) || isHarNetworkMetaEventName(eventName);

