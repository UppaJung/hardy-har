// spell-checker: disable

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it as test } from "node:test";
import { expect } from "expect";

import { sortHarHeadersByName } from "../headers.ts";
import { harFromChromeHarMessageParamsObjects, type Options, type Har} from "../index.ts";

import * as ch from "chrome-har";
import * as path from "path";
import type { Entry } from "../types/HttpArchiveFormat.ts";
import {readdir, readFile} from "fs/promises";
const runAll = async () => {
const TestLogPath = path.resolve(import.meta.dirname!, 'test-logs');

const fixChromeHarHeaders = (headers: Har.Header[]): Har.Header[] => {
  // Convert names to lowercase and eliminate duplicates
  const headersMap = new Map<string, Har.Header>();
  for (const {name: nameMixedCase, ...rest} of headers) {
    const name = nameMixedCase.toLowerCase();
    if (!headersMap.has(name)) {
      headersMap.set(name, {name, ...rest});
    }
  }
  return sortHarHeadersByName([...headersMap.values()]);
};

/**
 * Validate that, for each tcp connection, the previous request is fully completed before then next starts.
 */
function validateRequestsOnSameConnectionDoNotOverlap(entries: Entry[]) {
  const entriesByConnection = entries
    .filter(
      entry => !['h3', 'h2', 'spdy/3.1'].includes(entry.response.httpVersion)
    )
    .filter(entry => !(entry.cache || {}).beforeRequest)
    .reduce((entries, entry) => {
      if (entry.connection == null) return entries;
      const e = entries.get(entry.connection) || [];
      e.push(entry);
      entries.set(entry.connection, e);
      return entries;
    }, new Map<string, Entry[]>());
  entriesByConnection.forEach((entries, /* _connection */) => {
    let previousEntry = entries.shift();
    for (const entry of entries) {
      if (previousEntry != null) {
        const previousEnd =
          previousEntry._requestTime! + previousEntry.time / 1000;
        const timings = entry.timings;
        const currentEntryStartTime = entry._requestTime! + Math.max(0, timings.blocked!) / 1000;
        expect(currentEntryStartTime).toBeGreaterThanOrEqual(previousEnd);
        //   currentEntryStartTime >= previousEnd,
        //   `Requests ${previousEntry._requestId } and ${entry._requestId} overlap on connection ${connection}`
        // ).toBe(true);
      }
      previousEntry = entry;
    }
  });
}

function perfLogPath(filename: string) {
  return path.resolve(TestLogPath, filename);
}

async function perflogs() {
  const dirListing = await readdir(TestLogPath, {withFileTypes: true});
  return dirListing.filter(e => e.isFile() && path.extname(e.name) === '.json').map( e => e.name );
}

const filenames = await perflogs();

async function parsePerflog(perflogPath: string, options?: Options) {
  const log = JSON.parse(await readFile(perflogPath, {encoding: 'utf8'}));
  const har = harFromChromeHarMessageParamsObjects(log, options);
  return har;
}

function sortedByRequestTime(entries: Entry[]) {
  return entries.sort((e1, e2) => e1._requestTime! - e2._requestTime!);
}

describe('Mimimcs chrome-har', () => {
  const options: Options = {mimicChromeHar: true};
  for (const filename of filenames
    .filter( f => f !== 'missing-response.json' )
  ) {
    test (`${filename}`, async () => {
      const debuggerLog = JSON.parse(await readFile(perfLogPath(filename), {encoding: 'utf8'}));
      const hardyHar = harFromChromeHarMessageParamsObjects(debuggerLog, options);
      expect(sortedByRequestTime(hardyHar.log.entries)).toEqual(hardyHar.log.entries);
      validateRequestsOnSameConnectionDoNotOverlap(hardyHar.log.entries);
      const chromeHar = ch.harFromMessages(debuggerLog,{includeTextFromResponseBody: false}) as unknown as Har.HttpArchive;



      chromeHar.log.entries.forEach( e => {
        // Chrome-har will list headers twice if it gets copies of them with lowercase and mixed-case names.
        // We'll also use this opportunity to sort them by name for reliable comparison with hardy-har.
        Object.assign(e.request, {headers: fixChromeHarHeaders(e.request.headers)});
        Object.assign(e.response, {headers: fixChromeHarHeaders(e.response.headers)});
        Object.assign(e.request, {cookies: [], headers: [], headersSize: 0});
        Object.assign(e.response, {cookies: [], headers: [], headersSize: 0, bodySize: -1});
        Object.assign(e, {pageref: undefined});
        delete e.response.content.compression;
        // Fix NaN values in initiator line, also fixing the incorrect typing of _initiator_line in the HAR types from npm.
        if ( isNaN(e._initiator_line as unknown as number) || ((e._initiator_line as unknown as number) == 1) ) {
          delete (e as {_initiator_line: unknown})._initiator_line;
        }
        if (filename === "iframe-not-attached.json") {
          Object.assign(e, {_chunks: []});
        }
      });

      hardyHar.log.entries.forEach( e => {
        Object.assign(e.request, {cookies: [], headers: [], headersSize: 0});
        Object.assign(e.response, {cookies: [], headers: [], headersSize: 0, bodySize: -1});
        Object.assign(e, {pageref: undefined});
        if ("_initiator_line" in e && e._initiator_line === 1) {
          delete (e as unknown as {_initiator_line?: number})._initiator_line;
        }
        if (filename === "iframe-not-attached.json") {
          Object.assign(e, {_chunks: []});
        }
      });

      // Chrome-har had a bogus [test case](https://github.com/sitespeedio/chrome-har/blob/5b076f8c8e578e929670761dcc31345e4e87103c/test/tests.js#L68) that purported to validate that
      // entries appeared in time-sorted order. The problem was, the test case used in-place sort
      // (`.sort`, instead of `[...entries].sort()`) or `.toSorted`, which mutated the original
      // array to match the mutated array. Hence, chrome-har appeared to be creating arrays in
      // a canonical order when, in fact, it was not. Mimicking that behavior is not something
      // we're going to try to do.

      chromeHar.log.entries.sort( 
        (a, b) => (a as unknown as {_requestTime: number})._requestTime -   
         (b as unknown as {_requestTime: number})._requestTime
      );
 //     chromeHar.log.entries.sort( (a, b) => a.startedDateTime.localeCompare(b.startedDateTime));

      for (let i = 0; i < chromeHar.log.entries.length; i ++) {
        const ch = chromeHar.log.entries[i];
        const hh = hardyHar.log.entries[i];
        if (ch._requestId !== hh._requestId) {
          // console.log(`Request ID mismatch at index ${i}`);
        }
        if ( Math.abs( new Date(ch.startedDateTime).getTime() - new Date(hh.startedDateTime).getTime() ) <= 2 ) {
          // This is within amillisecond rounding error in display time. Ignore both times.
          Object.assign(ch, {startedDateTime: hh.startedDateTime});
        }
      }

      const chromeHarEntriesMissingFromHardyHar = chromeHar.log.entries.filter(e => !hardyHar.log.entries.some(le => le._requestId === e._requestId));
      const hardyHarentriesNotInChromeHar = hardyHar.log.entries.filter(e => !chromeHar.log.entries.some(le => le._requestId === e._requestId));
      expect (hardyHarentriesNotInChromeHar.length).toBe(0);
      expect (chromeHarEntriesMissingFromHardyHar.length).toBe(0);

      for (let i = 0; i < hardyHar.log.entries.length; i++) {
        const hh = hardyHar.log.entries[i];
        const ch = chromeHar.log.entries[i]!;
        if (hh._requestId !== ch._requestId || hh._requestTime !== ch._requestTime) {
          console.log(`Request ID mismatch at index ${i}`);
        }
        expect(hh).toEqual(ch);
      }
        
      if (chromeHarEntriesMissingFromHardyHar.length > 0 || hardyHarentriesNotInChromeHar.length > 0) {
        console.log(`chrome-har entries missing: ${chromeHarEntriesMissingFromHardyHar.length}`);
      }
      expect(hardyHarentriesNotInChromeHar.length).toBe(0);
      expect(chromeHarEntriesMissingFromHardyHar.length).toBe(0);
      for (let i = 0; i < hardyHar.log.entries.length; i++) {
        expect(hardyHar.log.entries[i]).toEqual(chromeHar.log.entries[i]);
      }
    });
  }
});


describe('With default options', () => {
  for (const filename of filenames) {
    test (`Generate from ${filename}`, async () => {
      const har = await parsePerflog(perfLogPath(filename));        
      expect(sortedByRequestTime(har.log.entries)).toEqual(har.log.entries);
      validateRequestsOnSameConnectionDoNotOverlap(har.log.entries);
    });
  }
});

describe('With option {includeResourcesFromDiskCache: true}', () => {
  const options: Options = { includeResourcesFromDiskCache: true };
  for (const filename of filenames) {
    test (`Generate from ${filename}`, async () => {
      const har = await parsePerflog(perfLogPath(filename), options);        
      expect(sortedByRequestTime(har.log.entries)).toEqual(har.log.entries);
      validateRequestsOnSameConnectionDoNotOverlap(har.log.entries);
    });
  }
});

test('zdnet', async () => {
  const perflogPath = perfLogPath('www.zdnet.com.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  expect(log.pages?.length).toBe(1);
  expect(log.entries.length).toBe(343);
});

test('ryan', async () => {
  const perflogPath = perfLogPath('ryan.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  expect(log.pages?.length).toBe(1);
});

test('chrome66', async () => {
  const perflogPath = perfLogPath('www.sitepeed.io.chrome66.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  expect(log.entries.length).toBe(9);
});

test('Parses IPv6 address', async () => {
  const perflogPath = perfLogPath('www.google.ru.json');
  const har = await parsePerflog(perflogPath);
  expect(har.log.entries[0]?.serverIPAddress).toBe('2a00:1450:400f:80a::2003');
});

test('Forwards the resource type value', async () => {
  const perflogPath = perfLogPath('www.google.ru.json');
  const expected = {
    document: 1,
    image: 27,
    other: 4,
    script: 8,
    xhr: 1
  };
  const har = await parsePerflog(perflogPath);
  const collected = har.log.entries.map(x => x._resourceType);
  expect(
    Object.entries(expected).every(
      ([key, value]) => collected.filter(x => x == key).length == value
    )).toBe(true);
});

test('navigatedWithinDocument', async () => {
  const perflogPath = perfLogPath('navigatedWithinDocument.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  expect(log.entries.length).toBe(1);
});

test('Generates multiple pages', async () => {
  const perflogPath = perfLogPath('www.wikipedia.org.json');
  const har = await parsePerflog(perflogPath);
  expect(har.log.pages?.length).toBe(2);
});

test('Skips empty pages', async () => {
  const perflogPath = perfLogPath('www.wikipedia.org-empty.json');
  const har = await parsePerflog(perflogPath);
  expect(har.log.pages?.length).toBe(1);
});

test('Click on link in Chrome should create new page', async () => {
  const perflogPath = perfLogPath('linkClickChrome.json');
  const har = await parsePerflog(perflogPath);
  expect(har.log.pages?.length).toBe(1);
});

test('Includes pushed assets', async () => {
  const perflogPath = perfLogPath('akamai-h2push.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;

  expect(log.pages?.length).toBe(1);
  const images = har.log.entries.filter(e =>
    e.request.url.startsWith('https://http2.akamai.com/demo/tile-')
  );
  // chrome-har included three h2 requests where 
  expect(images.length).toBe(361); // 19*19 = 361 image tiles
  const pushedImages = images.filter(i => i._was_pushed === 1);
  expect(pushedImages.length).toBe(3);
});

test('Includes early hints requests', async () => {
  const perflogPath = perfLogPath('early-hints.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  const earlyHints = log.entries.filter(e => e.response.fromEarlyHints);
  expect(earlyHints.length).toBe(11);
});

test('Includes response bodies', async () => {
  const perflogPath = perfLogPath('www.sitepeed.io.chrome66.json');
  const har = await parsePerflog(perflogPath, {includeTextFromResponseBody: true});
  const {log} = har;
  const responsesWithContentText = log.entries.filter(e => e.response.content.text != null);
  expect(responsesWithContentText.length).toBe(1);
});

test('Includes canceled response', async () => {
  const perflogPath = perfLogPath('canceled-video.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;

  const videoAsset = log.entries.find(
    e => e.request.url === 'https://www.w3schools.com/tags/movie.mp4'
  );
  expect(videoAsset?.timings.receive).toBe(316.563);
  expect(videoAsset?.time).toBe(343.33099999999996);
});

test('Includes iframe request when frame is not attached', async () => {
  const perflogPath = perfLogPath('iframe-not-attached.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  const imageAsset = log.entries.filter(
    e => e.request.url === 'https://www.w3schools.com/html/img_girl.jpg'
  );
  expect(imageAsset.length).toBe(1);
});

test('Includes extra info in request', async () => {
  const perflogPath = perfLogPath('www.calibreapp.com.signin.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  const cssAsset = log.entries.find(e =>
    e.request.url.endsWith(
      'sign_up_in-8b32538e54b23b40f8fd45c28abdcee2e2d023bd7e01ddf2033d5f781afae9dc.css'
    )
  );
  // This test was incorrect because chrome-har counted referer and user-agent twice, once for mixed-case and once for lowercase.
  expect(cssAsset?.request.headers.length).toBe(13);
});

test('Includes extra info in response', async () => {
  const perflogPath = perfLogPath('www.calibreapp.com.signin.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  const cssAsset = log.entries.find(e =>
    e.request.url.endsWith(
      'sign_up_in-8b32538e54b23b40f8fd45c28abdcee2e2d023bd7e01ddf2033d5f781afae9dc.css'
    )
  );
  expect(cssAsset?.response.headers.length).toBe(14);
//  return log;
});

test('Excludes request blocked cookies', async () => {
  const perflogPath = perfLogPath('samesite-sandbox.glitch.me.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  const cookiesAsset = log.entries.find(e =>
    e.request.url.endsWith('cookies.json')
  );
  expect(cookiesAsset?.request.cookies.length).toBe(4);
//  return log;
});

test('Excludes response blocked cookies', async () => {
  const perflogPath = perfLogPath('response-blocked-cookies.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  const request = log.entries.find(
    e => e.request.url === 'https://ow5u1.sse.codesandbox.io/'
  );
  expect(request?.response.cookies.length).toBe(1);
});

test('Includes initial redirect', async () => {
  const perflogPath = perfLogPath('www.vercel.com.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;

  // const data = await fs.readFile(perflogPath).toBe({ encoding: 'utf8' });
  // const legacy = ch.harFromMessages(JSON.parse(data),{includeTextFromResponseBody: false});
  // const legacyEntriesMissing = legacy.log.entries.filter(e => !log.entries.some(le => le._requestId === e._requestId));
  // const entriesNotInLegacy = log.entries.filter(e => !legacy.log.entries.some(le => le._requestId === e._requestId));
  // expect(entriesNotInLegacy.length).toBe(0);
  // expect(legacyEntriesMissing.length).toBe(0);

  expect(log.pages?.length).toBe(1);
  expect(log.entries.length).toBe(99);
  expect(log.entries[0]?.response.status).toBe(308);
});

test('Network.responseReceivedExtraInfo may be fired before or after responseReceived', async () => {
  const perflogPath = perfLogPath('bing.com.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  const {entries} = log;
  const checkingEntries = entries.filter(x => x._requestId == '98243.71');
  expect(checkingEntries.length).toBe(1);
  const entry = checkingEntries[0];
  // set-cookie header only exists in Network.responseReceivedExtraInfo event
  expect(entry?.response.headers.filter(x => x.name == 'set-cookie').length).toBe(1);
});


};

runAll();