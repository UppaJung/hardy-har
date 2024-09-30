import esbuild from "esbuild";
import { nodeExternalsPlugin } from "esbuild-node-externals";
import { polyfillNode } from "esbuild-plugin-polyfill-node";
// import { polyfillNode } from "esbuild-plugin-polyfill-node";

const build = async () => {
  await esbuild
    .build({
      entryPoints: ["./src/index.ts"],
      outfile: "dist/index.js",
      bundle: true,
      minify: false,
      treeShaking: true,
      platform: "node",
      format: "esm",
      target: "es2023",
      plugins: [
        nodeExternalsPlugin({
          allowList: ["tough-cookie"],
        }),
        polyfillNode({
          include: ["url"],
        })],
    });
  }
  await build().then(console.log("Build complete"));