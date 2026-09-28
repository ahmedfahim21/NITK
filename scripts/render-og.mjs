/**
 * Renders the link-preview image public/og.png (1200 x 630) from
 * public/og.svg with headless Chrome, so no image tooling is needed.
 *
 *   npm run og:render
 *
 * Set CHROME to the browser binary if it isn't in the usual macOS place.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = join(ROOT, "public/og.svg");
const out = join(ROOT, "public/og.png");
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(chrome)) throw new Error(`Chrome not found at ${chrome}; set CHROME to its binary`);

const page = join(mkdtempSync(join(tmpdir(), "og-")), "og.html");
writeFileSync(page, `<!doctype html><html><body style="margin:0"><img src="${pathToFileURL(svg)}" width="1200" height="630" style="display:block"></body></html>`);
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1200,630", `--screenshot=${out}`, pathToFileURL(page).href], { stdio: "ignore" });
if (!existsSync(out)) throw new Error("Chrome did not write the screenshot");
console.log(`wrote ${out}`);
