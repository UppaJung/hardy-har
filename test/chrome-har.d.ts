declare module "chrome-har" {
  import type { Har } from "har-format";

  type Message = {
    method: string;
    params: unknown;
  }

  type Options = {
    includeTextFromResponseBody: boolean;
  }

  export const harFromMessages: (messages: Message[], options: Options) => Har;
}