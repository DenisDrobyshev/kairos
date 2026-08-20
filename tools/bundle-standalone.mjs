/**
 * Fold the built site into a single self-contained HTML file.
 *
 * The app already has no runtime dependencies and makes no network calls, so
 * inlining the two assets produces a file that works from a USB stick, an email
 * attachment, or any host that will not serve a directory.
 *
 *   node tools/bundle-standalone.mjs             -> dist/kairos-standalone.html
 *   node tools/bundle-standalone.mjs --fragment  -> dist/kairos-fragment.html
 *
 * `--fragment` omits the document scaffolding for hosts that supply their own
 * <html>/<head>/<body> and inject the page content into it.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const fragment = process.argv.includes("--fragment");

const assets = readdirSync(join(dist, "assets"));
const jsName = assets.find((f) => f.endsWith(".js"));
const cssName = assets.find((f) => f.endsWith(".css"));
if (!jsName || !cssName) {
  throw new Error("no built assets in dist/assets -- run `npm run build` first");
}

const css = readFileSync(join(dist, "assets", cssName), "utf8");
const js = readFileSync(join(dist, "assets", jsName), "utf8")
  // The map is not inlined, so a live reference would just 404.
  .replace(/^\/\/# sourceMappingURL=.*$/m, "")
  // A literal </script> anywhere in the bundle would close the tag early.
  .replace(/<\/script/gi, "<\\/script");

const title = "kairos";
const body = `<div id="app"></div>
<noscript>
  Расчёт выполняется целиком в браузере, поэтому без JavaScript он не работает.
  <br />
  This runs entirely in your browser, so it needs JavaScript.
</noscript>`;

const parts = [
  `<title>${title}</title>`,
  `<style>\n${css}\n</style>`,
  body,
  `<script type="module">\n${js}\n</script>`,
];

const out = fragment
  ? parts.join("\n")
  : `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
${parts[0]}
${parts[1]}
</head>
<body>
${parts[2]}
${parts[3]}
</body>
</html>`;

const target = join(dist, fragment ? "kairos-fragment.html" : "kairos-standalone.html");
writeFileSync(target, out, "utf8");
console.log(`${target}  ${(Buffer.byteLength(out) / 1024).toFixed(1)} kB`);
