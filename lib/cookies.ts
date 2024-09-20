// Ported by Stuart Schechter from original at
//   https://github.com/sitespeedio/chrome-har/blob/5b076f8c8e578e929670761dcc31345e4e87103c/index.js

import type {DevToolsProtocol} from "./types.ts";
import {Cookie} from 'npm:tough-cookie';
import dayjs from 'npm:dayjs';
import type {NpmHarFormatTypes as NpmHarFormatTypes} from './types.ts';

export const networkCookieToHarFormatCookie = ({expires, ...rest}: DevToolsProtocol.Network.Cookie): NpmHarFormatTypes.Cookie => ({
	...rest,
	expires: (expires as unknown as string) === 'Infinity'
        ? undefined
        : dayjs(expires).toISOString(),
})

export const toughCookieObjectToHarFormatCookie = ({
	value, expires, httpOnly, secure, ...toughCookie
}: Cookie): NpmHarFormatTypes.Cookie => ({
    name: toughCookie.key, // chrome-har added `|| cookie.name` but typings say cookie.name doesn't exist.
    value,
    path: toughCookie.path ?? undefined, // must be undefined, not null, to exclude empty path
    domain: toughCookie.domain ?? undefined, // must be undefined, not null, to exclude empty domain
    expires:
      expires === 'Infinity'
        ? undefined
        : dayjs(expires).toISOString(),
    httpOnly,
    secure
  }) satisfies NpmHarFormatTypes.Cookie;

export function parseCookie(cookieString: string) {
  const cookie = Cookie.parse(cookieString);
  if (!cookie) {
    return undefined;
  }
  return toughCookieObjectToHarFormatCookie(cookie);
}

const parseCookiesSeparatedBy = (delimiterSeparatingCookieEntries: string) =>
	(header: string) =>
		header
    	.split(delimiterSeparatingCookieEntries).filter(x => x != null)
    	.map(parseCookie).filter(x => x != null)

export const parseRequestCookies = parseCookiesSeparatedBy(';');
export const parseResponseCookies = parseCookiesSeparatedBy('\n');
