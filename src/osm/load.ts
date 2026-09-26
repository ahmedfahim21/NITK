/**
 * Where the campus comes from, best first:
 *
 *   1. public/data/nitk-osm.json   committed snapshot (`npm run osm:fetch`)
 *   2. Overpass API, live          fetched in the browser, cached locally
 *   3. src/data/fallback.ts        hand-approximated layout, offline
 *
 * `?source=live|snapshot|fallback` in the URL forces one.
 */
import area from "../area.json";
import { overpassQuery } from "./query";
import { parseOsm } from "./parse";
import type { CampusMap, OsmJson } from "./types";

const CACHE_NAME = "nitk-osm-v1";
const CACHE_KEY = "https://nitk-world.local/osm.json";

async function fromSnapshot(): Promise<OsmJson | null> {
  try {
    const res = await fetch("./data/nitk-osm.json", { cache: "no-cache" });
    if (!res.ok) return null;
    const json = (await res.json()) as OsmJson;
    return Array.isArray(json.elements) && json.elements.length ? json : null;
  } catch {
    return null;
  }
}

async function fromCache(): Promise<OsmJson | null> {
  try {
    if (typeof caches === "undefined") return null;
    const c = await caches.open(CACHE_NAME);
    const hit = await c.match(CACHE_KEY);
    if (!hit) return null;
    const json = (await hit.json()) as OsmJson;
    return json.elements?.length ? json : null;
  } catch {
    return null;
  }
}

async function toCache(text: string) {
  try {
    if (typeof caches === "undefined") return;
    const c = await caches.open(CACHE_NAME);
    await c.put(CACHE_KEY, new Response(text, { headers: { "Content-Type": "application/json" } }));
  } catch {
    /* private mode, quota: the next visit just fetches again */
  }
}

async function fromOverpass(progress: (msg: string) => void): Promise<OsmJson | null> {
  const body = new URLSearchParams({ data: overpassQuery() });
  for (const url of area.overpass) {
    const host = new URL(url).host;
    progress(`Downloading NITK from OpenStreetMap (${host})…`);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 90000);
    try {
      const res = await fetch(url, { method: "POST", body, signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const json = JSON.parse(text) as OsmJson;
      if (!json.elements?.length) throw new Error("empty");
      void toCache(text);
      return json;
    } catch (err) {
      console.warn(`[osm] ${host}: ${String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export async function loadCampus(progress: (msg: string) => void): Promise<CampusMap> {
  const force = new URLSearchParams(location.search).get("source");

  if (force !== "live" && force !== "fallback") {
    progress("Looking for the OpenStreetMap snapshot…");
    const snap = await fromSnapshot();
    if (snap) return parseOsm(snap, "snapshot");
  }

  if (force !== "fallback" && force !== "snapshot") {
    const cached = force === "live" ? null : await fromCache();
    if (cached) return parseOsm(cached, "live");
    const live = await fromOverpass(progress);
    if (live) return parseOsm(live, "live");
  }

  progress("Offline: using the approximate campus layout…");
  const { FALLBACK_OSM } = await import("../data/fallback");
  return parseOsm(FALLBACK_OSM, "fallback");
}
