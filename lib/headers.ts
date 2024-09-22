

import type {DevToolsProtocol, HarHeader, NpmHarFormatTypes } from "./types.ts";

/**
 * Calculate the size of an HTTP request header represented by a HAR request.
 * 
 * For clarity (certainly not efficiency!), it does this this by re-generating the
 * request format and taking the length.
 * 
 * The white space on each field lin between the colon ":" that follows the
 * header name and the header value, is "optional white space (OWS)" in the spec.
 * We can't be sure the header that generated this request contained exactly one space
 * after each colon. It is a very strong convention, but it would be follow to assume
 * as a certainly as the convention is easy to defy.
 * 
 * This code should never be copied into any application that would assume it correctly
 * calculates the length of that portion of a message buffer.
 * 
 * For reference on the request format:
 * https://httpwg.org/specs/rfc9112.html#message.format
 * https://developer.mozilla.org/en-US/docs/Glossary/HTTP_header
 * 
 * @param harRequest 
 * @returns An approximation of size in bytes of the request header that generated
 * this HAR request, which will be accurate if the request followed norms that
 * are not formal conventions. 
 */
export const calculateRequestHeaderSize = ({
	method, url, httpVersion, headers
}: {method: string, url: string, httpVersion: string, headers: DevToolsProtocol.Network.Headers}) =>
	// Request line
	// https://httpwg.org/specs/rfc9112.html#request.line
	`${method} ${url} ${httpVersion}\r\n${
				Object.entries(headers).map( ([field, value]) =>
			 // header field lines https://httpwg.org/specs/rfc9112.html#header.field.syntax
				`${field}: ${value}\r\n`
		).join("")
	// empty line to indicate end of headers
	}\r\n`.length;

export const calculateResponseHeaderSize = ({
	protocol,
	status,
	statusText,
	headers
}: DevToolsProtocol.Network.Response & Partial<DevToolsProtocol.Network.GetResponseBodyResponse>) => 
	`${protocol} ${status} ${statusText}\r\n${
		Object.entries(headers).map( ([field, value]) =>
			`${field}: ${value}\r\n`
		).join("")
	}\r\n`.length;

export const sortHarHeadersByName = (headers: HarHeader[]) =>
	headers.toSorted((a, b) => a.name.localeCompare(b.name));

/**
 * Turn headers of the from of a {[name: string]: string} object into an array of Har Header objects
 * with all header names in lowercase.
 * 
 * @param headers Headers in the form returned by the Chrome DevTools Protocol, which are JavaScript
 * objects with header names as keys and values as property values. Some CDP apis used mixed case for
 * names and some use lowercase, so we'll make them all lowercase.
 */
export const headersRecordToArrayOfHarHeaders = <T extends Record<string, string>>(headers?: T) => {
	// First, make all names lowercase (this will eliminate some redundant headers)
	const headersRecordWithLowercaseKeys = Object.entries(headers ?? {}).reduce(
		(r, [name, value]) => {
			r[name.toLowerCase()] = value;
			return r;
		},
		{} as Record<string, string>
	);
	// Convert to har headers
	const harHeaders = Object.entries(headersRecordWithLowercaseKeys ?? {}).reduce(
		(result, [name, value]) => {
			result.push({ name, value });
			return result;
		}, [] as HarHeader[]
	);
	return sortHarHeadersByName(harHeaders);
}

/**
 * Perform case-insensitive search for a header in a headers object.
 */
export const getHarHeaderValue = <T extends Record<string, string>>(headers: NpmHarFormatTypes.Header[] | undefined, headerToFind: string): string | undefined => {
	const headerToFindLc = headerToFind.toLowerCase();
	return (headers ?? []).find(({name}) => name.toLowerCase() === headerToFindLc)?.value;
}

// export const getHeaderValue = <T extends Record<string, string>>(headers: T, headerToFind: string): string | undefined => {
// 	if (!headers) {
// 		return;
// 	}
// 	const headerToFindLc = headerToFind.toLowerCase();
// 	const matchingKey = Object.keys(headers).find(key => key.toLowerCase() === headerToFindLc);
// 	return headers[matchingKey as keyof T];
// }

export const getHeaderValue = (headers: DevToolsProtocol.Network.Headers, headerToFind: string) => {
	const headerToFindLc = headerToFind.toLowerCase();
	return Object.entries(headers).find(([name]) => name.toLowerCase() === headerToFindLc)?.[1];
}
