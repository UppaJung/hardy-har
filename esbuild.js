import esbuild from "esbuild";
import { nodeExternalsPlugin } from "esbuild-node-externals";

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
      plugins: [nodeExternalsPlugin()],
    });
  }
  await build().then(console.log("Build complete"));