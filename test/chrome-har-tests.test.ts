import { describe, it as test } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";

import { HarEntry, harFromChromeHarMessageParams, Options } from "../lib/index.ts";
import { HarEntryGenerated } from "../lib/HarEntryBuilder.ts";
// import * as ch from 'npm:chrome-har';
// spell-checker: disable
import * as path from "jsr:@std/path";

const TestLogPath = path.resolve(import.meta.dirname!, 'test-logs');

/**
 * Validate that, for each tcp connection, the previous request is fully completed before then next starts.
 */
function validateRequestsOnSameConnectionDoNotOverlap(entries: HarEntryGenerated[]) {
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
    }, new Map<string, HarEntryGenerated[]>());
  entriesByConnection.forEach((entries, connection) => {
    let previousEntry = entries.shift();
    for (const entry of entries) {
      if (previousEntry != null) {
        const previousEnd =
          previousEntry._requestTime! + previousEntry.time / 1000;
        const timings = entry.timings;
        const currentEntryStartTime = entry._requestTime! + Math.max(0, timings.blocked!) / 1000;
        // if (currentEntryStartTime <= previousEnd) {
        //   debugger;
        // }
        expect(
          currentEntryStartTime >= previousEnd,
          `Requests ${previousEntry._requestId } and ${entry._requestId} overlap on connection ${connection}`
        ).toBe(true);
      }
      previousEntry = entry;
    }
  });
}

function perflog(filename: string) {
  return path.resolve(TestLogPath, filename);
}
async function perflogs() {
  const dirListing = await Array.fromAsync(Deno.readDir(TestLogPath));
  return dirListing.filter(e => e.isFile && path.extname(e.name) === '.json').map( e => e.name );
}

async function parsePerflog(perflogPath: string, options?: Options) {
  const data = await Deno.readTextFile(perflogPath);
  const log = JSON.parse(data);
  const har = harFromChromeHarMessageParams(log, options);
  return har;
}

function sortedByRequestTime(entries: HarEntry[]) {
  return entries.sort((e1, e2) => e1._requestTime! - e2._requestTime!);
}

// async function testAllHARs(options?: Options) {
//   const filenames = await perflogs();
//   await Promise.all(
//     filenames.map( async (filename) => {
//       try {
//         const har = await parsePerflog(perflog(filename), options);        
//         assert.deepEqual(sortedByRequestTime(har.log.entries), har.log.entries);
//         validateConnectionOverlap(har.log.entries);
//       } catch (e) {
//         console.error(`Failed to generate valid HAR from ${filename}`);
//         throw e;
//       }
//     })
//   );
// }

const filenames = await perflogs();

describe('With deafult options', () => {
  for (const filename of filenames) {
    test (`Generate from ${filename}`, async () => {
      const har = await parsePerflog(perflog(filename));        
      expect(sortedByRequestTime(har.log.entries)).toEqual(har.log.entries);
      validateRequestsOnSameConnectionDoNotOverlap(har.log.entries);
    });
  }
});

describe('With option {includeResourcesFromDiskCache: true}', () => {
  const options: Options = { includeResourcesFromDiskCache: true };
  for (const filename of filenames) {
    test (`Generate from ${filename}`, async () => {
      const har = await parsePerflog(perflog(filename), options);        
      expect(sortedByRequestTime(har.log.entries)).toEqual(har.log.entries);
      validateRequestsOnSameConnectionDoNotOverlap(har.log.entries);
    });
  }
});

test('zdnet', async () => {
  const perflogPath = perflog('www.zdnet.com.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  
  // const data = await fs.readFile(perflogPath, { encoding: 'utf8' });
  // const legacy = ch.harFromMessages(JSON.parse(data),{includeTextFromResponseBody: false});
  // const legacyEntriesMissing = legacy.log.entries.filter(e => !log.entries.some(le => le._requestId === e._requestId));
  // const entriesNotInLegacy = log.entries.filter(e => !legacy.log.entries.some(le => le._requestId === e._requestId));
  // expect(entriesNotInLegacy.length, 0);
  // expect(legacyEntriesMissing.length, 0);

  expect(log.pages?.length).toBe(1);
  expect(log.entries.length).toBe(343);
});

test('ryan', async () => {
  const perflogPath = perflog('ryan.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  expect(log.pages?.length).toBe(1);
});

test('chrome66', async () => {
  const perflogPath = perflog('www.sitepeed.io.chrome66.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  expect(log.entries.length).toBe(9);
});

test('Parses IPv6 address', async () => {
  const perflogPath = perflog('www.google.ru.json');
  const har = await parsePerflog(perflogPath);
  expect(har.log.entries[0]?.serverIPAddress).toBe('2a00:1450:400f:80a::2003')
});

test('Forwards the resource type value', async () => {
  const perflogPath = perflog('www.google.ru.json');
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
  const perflogPath = perflog('navigatedWithinDocument.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  expect(log.entries.length).toBe(1);
});

test('Generates multiple pages', async () => {
  const perflogPath = perflog('www.wikipedia.org.json');
  const har = await parsePerflog(perflogPath);
  expect(har.log.pages?.length).toBe(2);
});

test('Skips empty pages', async () => {
  const perflogPath = perflog('www.wikipedia.org-empty.json');
  const har = await parsePerflog(perflogPath);
  expect(har.log.pages?.length).toBe(1);
});

test('Click on link in Chrome should create new page', async () => {
  const perflogPath = perflog('linkClickChrome.json');
  const har = await parsePerflog(perflogPath);
  expect(har.log.pages?.length).toBe(1);
});

test('Includes pushed assets', async () => {
  const perflogPath = perflog('akamai-h2push.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;

  // const data = await fs.readFile(perflogPath, { encoding: 'utf8' });
  // const legacy = ch.harFromMessages(JSON.parse(data),{includeTextFromResponseBody: false});
  // const legacyEntriesMissing = legacy.log.entries.filter(e => !log.entries.some(le => le._requestId === e._requestId));
  // const entriesNotInLegacy = log.entries.filter(e => !legacy.log.entries.some(le => le._requestId === e._requestId));

  // expect(entriesNotInLegacy.length).toBe(0);
  // expect(legacyEntriesMissing.length).toBe(0);

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
  const perflogPath = perflog('early-hints.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  const earlyHints = log.entries.filter(e => e.response.fromEarlyHints);
  expect(earlyHints.length).toBe(11);
});

test('Includes response bodies', async () => {
  const perflogPath = perflog('www.sitepeed.io.chrome66.json');
  const har = await parsePerflog(perflogPath, {includeTextFromResponseBody: true});
  const {log} = har;
  const responsesWithContentText = log.entries.filter(e => e.response.content.text != null);
  expect(responsesWithContentText.length).toBe(1);
});

test('Includes canceled response', async () => {
  const perflogPath = perflog('canceled-video.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;

  // const data = await fs.readFile(perflogPath, { encoding: 'utf8' });
  // const legacy = ch.harFromMessages(JSON.parse(data),{includeTextFromResponseBody: false});
  // const legacyEntriesMissing = legacy.log.entries.filter(e => !log.entries.some(le => le._requestId === e._requestId));
  // const entriesNotInLegacy = log.entries.filter(e => !legacy.log.entries.some(le => le._requestId === e._requestId));

  // expect(entriesNotInLegacy.length).toBe(0);
  // expect(legacyEntriesMissing.length).toBe(0);

  // const legacyVideoAsset = legacy.log.entries.find(
  //   e => e.request.url === 'https://www.w3schools.com/tags/movie.mp4'
  // );

  const videoAsset = log.entries.find(
    e => e.request.url === 'https://www.w3schools.com/tags/movie.mp4'
  );
  expect(videoAsset?.timings.receive).toBe(316.563);
  expect(videoAsset?.time).toBe(343.33099999999996);
});

test('Includes iframe request when frame is not attached', async () => {
  const perflogPath = perflog('iframe-not-attached.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  const imageAsset = log.entries.filter(
    e => e.request.url === 'https://www.w3schools.com/html/img_girl.jpg'
  );
  expect(imageAsset.length).toBe(1);
});

test('Includes extra info in request', async () => {
  const perflogPath = perflog('www.calibreapp.com.signin.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  const cssAsset = log.entries.find(e =>
    e.request.url.endsWith(
      'sign_up_in-8b32538e54b23b40f8fd45c28abdcee2e2d023bd7e01ddf2033d5f781afae9dc.css'
    )
  );
  expect(cssAsset?.request.headers.length).toBe(15);
});

test('Includes extra info in response', async () => {
  const perflogPath = perflog('www.calibreapp.com.signin.json');
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
  const perflogPath = perflog('samesite-sandbox.glitch.me.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  const cookiesAsset = log.entries.find(e =>
    e.request.url.endsWith('cookies.json')
  );
  expect(cookiesAsset?.request.cookies.length).toBe(4);
//  return log;
});

test('Excludes response blocked cookies', async () => {
  const perflogPath = perflog('response-blocked-cookies.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  const request = log.entries.find(
    e => e.request.url === 'https://ow5u1.sse.codesandbox.io/'
  );
  expect(request?.response.cookies.length).toBe(1);
});

test('Includes initial redirect', async () => {
  const perflogPath = perflog('www.vercel.com.json');
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
  const perflogPath = perflog('bing.com.json');
  const har = await parsePerflog(perflogPath);
  const {log} = har;
  const {entries} = log;
  const checkingEntries = entries.filter(x => x._requestId == '98243.71');
  expect(checkingEntries.length).toBe(1);
  const entry = checkingEntries[0];
  // set-cookie header only exists in Network.responseReceivedExtraInfo event
  expect(entry?.response.headers.filter(x => x.name == 'set-cookie').length).toBe(1);
});
