/**
 * Snapshot the terrain under the map square into public/data/nitk-dem.json:
 * a 30 m grid of heights above sea level, in the world frame (metres around
 * area.origin, x east, z south), so the world loads it offline.
 *
 *   npm run dem:fetch
 *
 * Heights are the mean of SRTM and ASTER (both 30 m, via the public
 * OpenTopoData API, one request a second). Both are surface models, so
 * they include tree canopy and roofs; src/world/terrain.ts smooths that out
 * and pins the beach and the sea.
 *
 * SRTM: NASA/USGS, public domain. ASTER GDEM: NASA/METI.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const area = JSON.parse(readFileSync(join(HERE, "../src/area.json"), "utf8"));
const OUT = join(HERE, "../public/data/nitk-dem.json");
const API = "https://api.opentopodata.org/v1";
const DATASETS = ["srtm30m", "aster30m"];
const SPACING = 30;
const BATCH = 100;

// The same projection as src/geo.ts.
const LAT0 = area.origin.lat;
const LON0 = area.origin.lon;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const project = (lat, lon) => [(lon - LON0) * M_PER_DEG_LON, -(lat - LAT0) * M_PER_DEG_LAT];
const unproject = (x, z) => ({ lat: LAT0 - z / M_PER_DEG_LAT, lon: LON0 + x / M_PER_DEG_LON });

const b = area.bbox;
const [minX, maxZ] = project(b.south, b.west);
const [maxX, minZ] = project(b.north, b.east);
const cols = Math.ceil((maxX - minX) / SPACING) + 1;
const rows = Math.ceil((maxZ - minZ) / SPACING) + 1;
const points = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) points.push(unproject(minX + c * SPACING, minZ + r * SPACING));
console.log(`${cols} x ${rows} = ${points.length} points, ${DATASETS.length} datasets, ${Math.ceil(points.length / BATCH) * DATASETS.length} requests`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBatch(ds, batch) {
  const locations = batch.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join("|");
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/${ds}?locations=${locations}`, { headers: { "User-Agent": "nitk-world/0.1" } });
    if (res.ok) {
      const json = await res.json();
      if (json.status !== "OK") throw new Error(`${ds}: ${json.error ?? json.status}`);
      return json.results.map((r) => r.elevation);
    }
    // Rate limited or a hiccup: back off and retry a few times, then give up loudly.
    if (attempt >= 4) throw new Error(`${ds}: HTTP ${res.status} after ${attempt} attempts`);
    console.warn(`  ${ds}: HTTP ${res.status}, retrying`);
    await sleep(2000 * attempt);
  }
}

const byDataset = {};
for (const ds of DATASETS) {
  const out = [];
  for (let i = 0; i < points.length; i += BATCH) {
    out.push(...(await fetchBatch(ds, points.slice(i, i + BATCH))));
    process.stdout.write(`\r  ${ds}: ${Math.min(points.length, i + BATCH)}/${points.length}`);
    await sleep(1100);
  }
  process.stdout.write("\n");
  byDataset[ds] = out;
}

// Mean of whichever datasets have a value (voids are null).
const h = points.map((_, i) => {
  const vals = DATASETS.map((ds) => byDataset[ds][i]).filter((v) => v !== null && v !== undefined);
  if (!vals.length) throw new Error(`no dataset has a height at point ${i}`);
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
});

mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify({
  fetched: new Date().toISOString(),
  source: `OpenTopoData ${DATASETS.join(" + ")} (mean)`,
  spacing: SPACING,
  minX: Math.round(minX * 100) / 100,
  minZ: Math.round(minZ * 100) / 100,
  cols,
  rows,
  h,
});
writeFileSync(OUT, json);
const lo = Math.min(...h);
const hi = Math.max(...h);
console.log(`wrote ${h.length} heights (${lo} to ${hi} m, ${Math.round(json.length / 1024)} KB) to public/data/nitk-dem.json`);
