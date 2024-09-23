// Ported by Stuart Schechter from original at
//   https://github.com/sitespeedio/chrome-har/blob/5b076f8c8e578e929670761dcc31345e4e87103c/index.js

import type {DevToolsProtocol, ISODateTimeString} from "./types/HttpArchiveFormat.ts";
import {Cookie} from "npm:tough-cookie@5.0.0";
import type { Har } from "./types/index.ts";

export const networkCookieToHarFormatCookie = ({expires, ...rest}: DevToolsProtocol.Network.Cookie): Har.Cookie => ({
	...rest,
	expires: (expires as unknown as string) === 'Infinity'
        ? undefined
        : new Date(expires * 1000).toISOString() as ISODateTimeString,
})

export const toughCookieObjectToHarFormatCookie = ({
	value, expires, httpOnly, secure, ...toughCookie
}: Cookie): Har.Cookie => ({
    name: toughCookie.key, // chrome-har added `|| cookie.name` but typings say cookie.name doesn't exist.
    value,
    path: toughCookie.path ?? undefined, // must be undefined, not null, to exclude empty path
    domain: toughCookie.domain ?? undefined, // must be undefined, not null, to exclude empty domain
    expires:
      expires === 'Infinity' || expires == null
        ? undefined
        : expires.toISOString() as ISODateTimeString,
    httpOnly,
    secure
  }) satisfies Har.Cookie;

export function parseCookie(cookieString: string): Har.Cookie | undefined {
  const cookie = Cookie.parse(cookieString);
  if (!cookie) {
    return undefined;
  }
  return toughCookieObjectToHarFormatCookie(cookie);
}

const parseCookiesSeparatedBy = (delimiterSeparatingCookieEntries: string) =>
	(header: string): Har.Cookie[] =>
		header
    	.split(delimiterSeparatingCookieEntries).filter(x => x != null)
    	.map(parseCookie).filter(x => x != null)

export const parseRequestCookies = parseCookiesSeparatedBy(';');
export const parseResponseCookies = parseCookiesSeparatedBy('\n');
