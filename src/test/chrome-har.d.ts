declare module "chrome-har" {
  import type { Har } from "har-format";

  interface Message {
    method: string;
    params: unknown;
  }

  interface Options {
    includeTextFromResponseBody: boolean;
  }

  export const harFromMessages: (messages: Message[], options: Options) => Har;
}