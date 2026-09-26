/**
 * Snapshot the OpenStreetMap extract for the campus into
 * public/data/nitk-osm.json, so the world loads offline and deterministically.
 *
 *   npm run osm:fetch
 *
 * Without a snapshot the game fetches the same query live from Overpass in
 * the browser, and without network it falls back to a hand-approximated
 * layout (src/data/fallback.ts).
 *
 * Map data (c) OpenStreetMap contributors, ODbL 1.0.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const area = JSON.parse(readFileSync(join(HERE, "../src/area.json"), "utf8"));
const OUT = join(HERE, "../public/data/nitk-osm.json");

// Keep in sync with src/osm/query.ts (read from there at build time would
// need a TS loader; the query is small enough to mirror).
const querySrc = readFileSync(join(HERE, "../src/osm/query.ts"), "utf8");
const template = querySrc.match(/return `([\s\S]*?)`;/)[1];
const b = area.bbox;
const query = template.replaceAll("${bbox}", `${b.south},${b.west},${b.north},${b.east}`);

for (const url of area.overpass) {
  try {
    console.log(`fetching from ${url} ...`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "nitk-world/0.1" },
      body: new URLSearchParams({ data: query }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const json = JSON.parse(text);
    if (!Array.isArray(json.elements) || json.elements.length === 0) throw new Error("empty extract");
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, text);
    console.log(`wrote ${json.elements.length} elements (${Math.round(text.length / 1024)} KB) to public/data/nitk-osm.json`);
    process.exit(0);
  } catch (err) {
    console.warn(`  failed: ${err.message}`);
  }
}
console.error("every Overpass endpoint failed");
process.exit(1);
