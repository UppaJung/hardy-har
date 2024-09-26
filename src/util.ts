import type { Options } from "./Options.ts";
import type { PostData, QueryString } from "./types/HttpArchiveFormat.ts";

export const calculateOnlyOnce = <T>(calculation: () => T ): () => T => {
	let hasBeenCalculated: boolean = false;
	let result: T | undefined;
	return () => {
		if (!hasBeenCalculated) {
			hasBeenCalculated = true;
			result = calculation();
		}
		return result as T;
	}
}


export const isNonEmptyString = (o: string | undefined): o is string => typeof o === 'string' && o.length > 0;

export function isHttp1x(version?: string) {
	return version?.toLowerCase().startsWith('http/1.');
}

export function roundToThreeDecimalPlaces(time: number | string, fractionalDigits = 3) {
	return Number(Math.max(0, Number(time)).toFixed(fractionalDigits));
}

export function toNameValuePairs(object: Record<string, string | string[] | undefined>) {
	return Object.entries(object ?? {}).reduce((result, [name, value]) => {
		if (Array.isArray(value)) {
			return result.concat(
				value.map(v => {
					return { name, value: v };
				})
			);
		} else {
			return result.concat([{ name, value: value ?? '' }]);
		}
	}, [] as QueryString[]);
}

export function parseUrlEncoded(data: string) {
	try {
		const result: QueryString[] =
		 [...new URL(`http://localhost/?${data}`).searchParams]
		 .map(( [name, value] ) => ({name, value}));
		 return result;
	} catch {
		return [];
	}
}

export function parsePostData(contentType: string | undefined, postData: string | undefined, options: Options): PostData | undefined {
	if (!isNonEmptyString(contentType) || !isNonEmptyString(postData)) {
		return undefined;
	}
	try {
		if (/^application\/x-www-form-urlencoded/.test(contentType) && !options.mimicChromeHar) {
			return {
				mimeType: contentType,
				params: parseUrlEncoded(postData)
			};
		}
		if (/^application\/json/.test(contentType) && !options.mimicChromeHar) {
			return {
				mimeType: contentType,
				params: toNameValuePairs(JSON.parse(postData))
			};
		}
		// FIXME parse multipart/form-data as well.
	} catch {
		// Fall back to include postData as text.
	}
	return {
		mimeType: contentType,
		text: postData
	};
};
