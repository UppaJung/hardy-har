
export interface PopulatedOptions {
	includeResourcesFromDiskCache: boolean;
	includeTextFromResponseBody: boolean;
	mimicChromeHar: boolean;
}
export type Options = Partial<PopulatedOptions>;
export const defaultOptions: PopulatedOptions = {
	includeResourcesFromDiskCache: false,
	includeTextFromResponseBody: false,
	mimicChromeHar: false,
} satisfies PopulatedOptions;
