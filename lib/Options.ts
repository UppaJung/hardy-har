
export interface PopulatedOptions {
	includeResourcesFromDiskCache: boolean;
	includeTextFromResponseBody: boolean;
	mimicChromeHar: boolean;
}
export type Options = Partial<PopulatedOptions>;
export const defaultOptions = {
	includeResourcesFromDiskCache: false,
	includeTextFromResponseBody: false,
	mimicChromeHar: false,
} satisfies PopulatedOptions;
