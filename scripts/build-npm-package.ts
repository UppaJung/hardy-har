// ex. scripts/build_npm.ts
import { build, emptyDir } from "jsr:@deno/dnt";
import {packageDetails} from "../lib/package.ts";

await emptyDir("./npm");

await build({
  entryPoints: ["./mod.ts"],
  outDir: "./npm",
  shims: {
    // see JS docs for overview and more options
    deno: true,
  },
  package: {
    ...packageDetails,
  },
  compilerOptions: {
    target: "ES2023",
  },
  filterDiagnostic(diagnostic) {
    if (
      diagnostic.file?.fileName.endsWith("chrome-har-tests.test.ts") ||
      (diagnostic.file?.fileName.indexOf("src/deps/jsr.io") ?? -1) >= 0 ||
      diagnostic.code === 6137 // cannot import type declaration files
    ) {
      return false; // ignore all diagnostics in this file
    }
    // etc... more checks here
    return true;
  },
  postBuild() {
    // steps to run after building and before running the tests
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});