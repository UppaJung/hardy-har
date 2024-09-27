import {name, version as stringVersion} from "../package.json";

export type Version = `${number}.${number}.${number}`;
const version = stringVersion as Version;

export {name, version};

// For deno
// import type { PackageJson } from "jsr:@deno/dnt";


// const majorVersion = 0;
// const minorVersion = 1;
// const patchVersion = 0;
// export const name = "hardy-har";
// export const version = `${majorVersion}.${minorVersion}.${patchVersion}` as Version;
// export const description = `A Hardy HTTP Archive (HAR) Generator`;

// export const packageDetails = {
// 	name,
// 	version,
// 	description,
// 	license: "MIT",
// 	repository: {
// 		type: "git",
// 		url: "git+https://github.com/uppajung/hardy-har.git",
// 	},
// 	bugs: {
// 		url: "https://github.com/uppajung/hardy-har/issues",
// 	},
// } as const satisfies PackageJson;