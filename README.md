# Hardy-Har: A Hardy HTTP Archive (HAR) Generator 

[HTTP Archives](http://www.softwareishard.com/blog/har-12-spec) (HARs) are the de-facto[^frozen] standard for exporting network debugger logs from browsers. The acronym HAR is used to refer to both the JSON object data format and the files into which the format is written, which use the extension `.har`.[^hardy-har-har]

This module will generate HTTP Archives in HAR format from `Page.` and `Network.` debugger events generated by the [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol). These events can be recorded by browser extensions and via headless browser tools such as Puppeteer and Playwright[^playwright].

`hardy-har` is backwards compatible with the [`chrome-har`](https://github.com/sitespeedio/chrome-har) API, from which it still borrows a small amount of code, a wealth of test cases, and a huge amount of expertise.[^port-or-rewrite] I created `hardy-har` because I wanted/needed:
  - support for archiving Web Sockets messages,
  - strong typings (a fully-typed all TypeScript codebase), and,
  - to understand the code well enough to be confident in its accuracy in a court of law.

Further, I wanted code that was I could easily understand. The code is architected with intention, using a declarative structure that ensures each value produced in a HAR archive can be traced to a single point of calculation. The style is intended not just to make the code easier to use, but to make it easier to read, maintain, verify, and debug: *hardy*.

### Installation
NPM's algorithms wouldn't let me register `hardy-har` because it was too close to someone else's abandoned package. The joke's on them, because their algorithm allowed the next incremental option (in unary).

```bash
npm install @uppajung/hardy-har
```

### Sample Use

#### From within a browser extension in strongly-typed TypeScript
```typescript
// requires types from @types/chrome
import {
  type HarEvent,
  type HarEventNameAndObject,
  type DevToolsProtocolGetResponseBodyRequest,
  type DevToolsProtocolGetResponseBodyResponse,
  GetResponseBodyResponseMetaEventName,
  isHarEventName,
  harFromNamedDebuggerEvents,
} from "hardy-har";

export const recordBrowserTabToHarFromWithinExtension = async (
  tabId: number,
  executeBrowserTaskToRecord: () => Promise<void>
) => {
  const debuggerEventArray = [] as HarEventNameAndObject[]; 
  
  const onDebugEvent = async (source: chrome.debugger.Debuggee, eventName: string, event: unknown) => {
    // Ignore debugger events for other tabs
    if (source.tabId !== tabId) return;
    // Ignore events that aren't needed to generate HARs 
    if (!isHarEventName(eventName)) return;
    debuggerEventArray.push({eventName, event: event as HarEvent<typeof eventName>});

    if (eventName === 'Network.loadingFinished') {
      // The chrome Network protocol doesn't provide response bodies unless you ask.
      const requestId = (event as HarEvent<typeof eventName>).requestId;
      // Request the response body
      const responseBodyObj = (await (chrome.debugger.sendCommand(
        {tabId},
        "Network.getResponseBody",
        {requestId} satisfies DevToolsProtocolGetResponseBodyRequest)
      )) as DevToolsProtocolGetResponseBodyResponse | undefined;
      if (responseBodyObj != null) {
        // Record a meta event consisting of the requestId and the response body, as if the Chrome DevTools protocol
        // had been generous enough to volunteer this information without us begging for it.
        debuggerEventArray.push({
          eventName: GetResponseBodyResponseMetaEventName,
          event: {requestId, ...responseBodyObj} satisfies HarEvent<typeof GetResponseBodyResponseMetaEventName>
        });
      }
    }		
  }

  try {
    await chrome.debugger.attach({tabId}, '1.3');
    await chrome.debugger.sendCommand({tabId}, "Page.enable");
    await chrome.debugger.sendCommand({tabId}, "Network.enable");
    chrome.debugger.onEvent.addListener(onDebugEvent);

    await executeBrowserTaskToRecord();
    return harFromNamedDebuggerEvents(debuggerEventArray);

  } finally {
    await chrome.debugger.detach({tabId});
  }
}
```

#### As a drop-in replacement for chrome-har

Just replace `harFromMessages` with `harFromChromeHarMessageParamsObjects`.
If you follow the `chrome-har` convention and embed captured response bodies
to a network event, such as `Network.loadingFinished`, `hardy-har` should
still find and include them.

```javascript
import {harFromChromeHarMessageParamsObjects} from "jsr:@stuartschechter/hardy-har";

// ... follow chrome-har example to generate events and options

harFromChromeHarMessageParamsObjects(harEvents, options);
```

### More info

For typings of the debugger events generated by the Chrome DevTools Protocol and consumed by this module, import the NPM [`devtools-protocol`](https://www.npmjs.com/package/devtools-protocol) package.

For HAR format typings, use the NPM [`@types/har-format`](https://www.npmjs.com/package/@types/har-format) package.

### To dos (help wanted)

 - Create additional test cases by recording a tab in Chrome via the debugger UI while also capturing the debugger API to generate a hardy-har .har. Then compare the two.
 - Add more examples.
 - More documentation (especially from @UppaJung before forgetting everything learned in building this).
 - File issues with the `chrome-har` team with all the bugs discovered investigating differences between outputs: negative body sizes, missing headers, duplicate headers due to mixed vs. lowercase header names, incorrect cookie dates due to failure to multiply seconds by 1000 before generating a date from milliseconds.


[^playwright]: Though Playwright has [built-in support for recording HAR files](https://playwright.dev/docs/api/class-browser#browser-new-context-option-record-har) from its internal data structures and the [code](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/har/harTracer.ts), while undocumented, looks fairly modern and well architected.

[^frozen]: The standard is "frozen" though supports extensions made by adding fields starting with underscores (`_`). Such extensions are how the "frozen" standard was extended by the Chrome Team to support Web Sockets.

[^hardy-har-har]: By implication, one might refer to a HTTP Archive file generated by this module as a hardy-har .har.

[^port-or-rewrite]: Whether `hardy-har` is a port or re-write of `chrome-har` is a question made largely irrelevant by the `chrome-har` team's generous use of the MIT License. Regardless, they are owed much gratitude.

## License
Released under the MIT License.