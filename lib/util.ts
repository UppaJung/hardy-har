// 'use strict';
// const urlParser = require('url');
// const { name } = require('../package');
// const debug = require('debug')(name);
import type { NpmHarFormatTypes } from "./types.ts";
import urlParser from "node:url";

export const calculateOnlyOnce = <T>(calculation: () => T ) => {
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
	}, [] as NpmHarFormatTypes.QueryString[]);
}

export function parseUrlEncoded(data: string) {
	const params = urlParser.parse(`?${data}`, true).query;
	return toNameValuePairs(params);
}

export function parsePostData(contentType?: string, postData?: string) {
	if (!isNonEmptyString(contentType) || !isNonEmptyString(postData)) {
		return undefined;
	}
	try {
		if (/^application\/x-www-form-urlencoded/.test(contentType)) {
			return {
				mimeType: contentType,
				params: parseUrlEncoded(postData)
			};
		}
		if (/^application\/json/.test(contentType)) {
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
