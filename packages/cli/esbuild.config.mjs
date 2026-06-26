import { build } from "esbuild";
import { cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

await build({
  bundle: true,
  entryNames: "[dir]/[name]",
  entryPoints: ["./src/index.ts"],
  format: "esm",
  outbase: "./src",
  outdir: "./dist",
  outExtension: { ".js": ".mjs" },
  packages: "external",
  platform: "node",
  target: "node24",
});

// Copy markdown templates into the build output so the published CLI
// (package.json files: ["dist"]) can resolve them at runtime. Without
// this, both `od-kernel init --template <name>` and `od-kernel templates`
// resolve dist/templates/ via __dirname and fail in the installed package
// — the templates only existed under src/, which the source-importing
// tests masked.
cpSync(join(here, "src", "templates"), join(here, "dist", "templates"), {
  recursive: true,
});
