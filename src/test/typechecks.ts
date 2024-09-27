import type * as NpmHarFormatTypes from "har-format";
import type * as Har from "../types/HttpArchiveFormat.ts";

const _validatePageTimings: NpmHarFormatTypes.PageTiming = undefined as unknown as Har.PageTimings;
const _validateHarPage: NpmHarFormatTypes.Page = undefined as unknown as Har.Page;
const _validateHarResponse: NpmHarFormatTypes.Response = undefined as unknown as Har.Response;
const _validateHarRequest: NpmHarFormatTypes.Request = undefined as unknown as Har.Request;

export const typeCheckCount = [_validatePageTimings, _validateHarPage, _validateHarResponse, _validateHarRequest].length;