
export interface PopulatedOptions {
	/**
	 * If true, include resources from disk cache in the HAR.
	 */
	includeResourcesFromDiskCache: boolean;
	/**
	 * If true, include the text from the response body in the HAR.
	 */
	includeTextFromResponseBody: boolean;
	/**
	 * **NOT RECOMMENDED** If true, mimic the HAR format used by Chrome.
	 * This option is intended to allow testing against the results of
	 * `chrome-har`, but is not recommended for other use.
	 */
	mimicChromeHar: boolean;
}
export type Options = Partial<PopulatedOptions>;
export const defaultOptions: PopulatedOptions = {
	includeResourcesFromDiskCache: false,
	includeTextFromResponseBody: false,
	mimicChromeHar: false,
} satisfies PopulatedOptions;
