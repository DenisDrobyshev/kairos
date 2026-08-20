/**
 * Boot the built bundle and check that it renders.
 *
 * The unit tests import source modules. This imports `dist/`, which is what
 * actually ships, so it catches the class of failure the unit tests cannot see:
 * a bad build config, a broken entry point, a top-level call that throws only
 * against a real document.
 *
 *   npm run build && node tools/smoke-bundle.mjs
 */

import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Window } from "happy-dom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = join(root, "dist", "assets");
const entry = readdirSync(assetDir).find((f) => f.endsWith(".js"));
if (!entry) throw new Error("no built bundle -- run `npm run build` first");

const window = new Window({ url: "https://example.test/kairos/" });
const { document } = window;
document.body.innerHTML = '<div id="app"></div>';

// The bundle expects browser globals to exist as globals, not as window props.
//
// These are installed with defineProperty rather than assignment because Node
// ships some of them itself: since Node 21 `globalThis.navigator` is a
// getter-only accessor, and a plain assignment to it throws. defineProperty
// works whether the name is absent, writable, or an existing accessor.
for (const key of [
  "window", "document", "navigator", "location", "history", "localStorage",
  "HTMLElement", "Event", "Node", "getComputedStyle", "requestAnimationFrame",
  "setTimeout", "clearTimeout", "prompt",
]) {
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? window : window[key],
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

let failed = false;
const fail = (msg) => {
  console.error("FAIL:", msg);
  failed = true;
};

await import(pathToFileURL(join(assetDir, entry)).href);

const app = document.getElementById("app");
const text = app?.textContent ?? "";

if (!app || app.children.length === 0) fail("bundle rendered nothing into #app");
if (!text.includes("kairos")) fail("headline missing");

const weeks = document.querySelectorAll(".weeks .week").length;
if (weeks !== 95 * 52) fail(`expected ${95 * 52} week cells, got ${weeks}`);

const figure = Number(document.querySelector(".figure")?.textContent?.replace(",", "."));
if (!Number.isFinite(figure) || figure < 30 || figure > 110) {
  fail(`median age figure is not plausible: ${figure}`);
}

const rows = document.querySelectorAll(".cat-row").length;
if (rows < 10) fail(`expected the full category list, got ${rows} rows`);

const levers = document.querySelectorAll(".lever").length;
if (levers === 0) fail("no levers rendered");

// A change must actually flow through: move the first slider and confirm the
// ledger responds rather than the page being a static first paint.
const before = document.querySelector(".meter-label")?.textContent ?? "";
const slider = document.querySelector('input[type="range"]');
slider.value = "3";
slider.dispatchEvent(new window.Event("input", { bubbles: true }));
const after = document.querySelector(".meter-label")?.textContent ?? "";
if (before === after) fail("moving a slider did not change the committed-hours readout");

if (!failed) {
  console.log(
    `bundle boots: ${weeks} week cells, ${rows} categories, ${levers} levers, median ${figure}`,
  );
}

await window.happyDOM.close();

// The bundle mounts a view that owns a running clock, and nothing here can
// reach its dispose. happyDOM.close() clears its own timers on some Node
// versions and not on others -- it did on 20 and did not on 22, where this
// script simply never returned. A one-shot check has nothing left to do at
// this point, so it says so explicitly rather than waiting to be tidied up.
process.exit(failed ? 1 : 0);
