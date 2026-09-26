# NITK World

A walkable 3D NITK Surathkal campus that runs in the browser, built from OpenStreetMap data.

It follows [SADAK](https://github.com/mittal-parth/sadak)'s approach: the whole world is generated in code from an OSM extract (no models, no textures to download), and it uses SADAK's cel-shaded look with toon ramps, tinted shadows and an ink-line pass.

```bash
npm install
npm run dev          # http://localhost:5173
```

## Where the campus comes from

The loader tries these sources in order (`src/osm/load.ts`):

1. **`public/data/nitk-osm.json`**: a committed snapshot of the OSM extract. Create it with `npm run osm:fetch`.
2. **Overpass API, live**: if there is no snapshot, the browser downloads the same extract from OpenStreetMap (roughly 10–30 s) and caches it.
3. **Approximate fallback** (`src/data/fallback.ts`): used only when offline. It is traced from an OSM render centred on 13.009497, 74.795319 at zoom 17. It is checked against published coordinates for the NITK gate, NITK Ground, SJA, JC Bose Guest House, the staff quarters and NITK Beach. Everything outside that traced window is an approximation.

The badge at the bottom right shows which source is live. You can force one with `?source=live|snapshot|fallback`.

The map square is set in `src/area.json`: 13.0005–13.0205 N, 74.7815–74.8060 E. It covers the whole campus on both sides of NH66, the beach and the lighthouse.

## What's in the world

- **OSM geometry, 1:1.** Every road (NH66 as a divided highway with a median), building footprint, landuse area, sports pitch, pool, barrier and mapped tree sits at its real position.
- **Buildings.** Heights come from `height` or `building:levels` when OSM has them, otherwise from sensible defaults. Façades are styled by kind:
  - cream-and-terracotta academic blocks
  - hostel blocks with grilled windows
  - glass-panel library and lecture halls
  - pastel houses with Mangalore-tile hip roofs and black rooftop water tanks
  - shopfronts with rolling shutters

  Windows light up at night.
- **Landmarks.** These are matched by OSM name or tag, so they land wherever the real map puts them:
  - the lighthouse on its knoll, with a sweeping beam after dusk
  - the Main Building's portico and trilingual nameboard (Kannada / Hindi / English)
  - the gate arch on NH66
  - signage on the Central Library, SJA and Lecture Hall Complex
  - the fountain, the tricolour and water towers
- **Coast.** The sea polygon is built from the OSM coastline. It has cel-banded shallows, swell lines, breakers and a surf line on the real shore, with sand and a casuarina belt behind it.
- **Vegetation.** Coconut palms, broadleaf canopy and casuarinas, scattered by land use.
- **Time of day.** Morning, noon, Arabian-Sea sunset and night, with lit windows, street-lamp pools and stars.
- **HUD.** A rotating minimap, a full map with click-to-teleport and place search, floating building labels, and a "you are near" banner.

## Controls

| | |
|---|---|
| `W A S D` | walk (`Shift` run, `Space` jump) |
| drag / double-click | look around / lock the mouse |
| `Q` `E` / wheel | turn / zoom |
| `F` | drone view (`Space` / `C` to climb or descend) |
| `M` | map, search and teleport |
| `T` | cycle the time of day |
| `H` | hide help |

On touch screens, the left half of the screen is a joystick and the right half looks around.

## Layout

```
src/
  area.json          map square + Overpass mirrors
  osm/               query, loader, OSM -> CampusMap compiler (parse.ts)
  data/fallback.ts   offline approximation
  world/             ground & sea, roads, buildings, landmarks, trees, props, grid
  fx/                toon materials, cel/ink pass, sky, time-of-day presets
  player.ts          walker, drone, camera
  ui/hud.ts          minimap, map, labels
scripts/fetch-osm.mjs  snapshot the extract into public/data
```

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL 1.0.

The cel pipeline (toon ramp patch, ink/grade pass, painted sky) is ported from SADAK. SADAK adapted it from [sakura-crossing](https://github.com/Kenton-GMI/sakura-crossing), MIT License, © 2026 Kenton Wang.
