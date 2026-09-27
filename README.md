# NITK: Fresher Year

A *Bully*-style college game set on the real NITK Surathkal campus, built from OpenStreetMap data. Nobody gets hurt: the missions are ordinary college challenges. It runs in the browser.

![The sunset finale of Chapter 1 on the lighthouse hill](docs/ch1-sunset.png)

It follows [SADAK](https://github.com/mittal-parth/sadak)'s approach: the whole world is generated in code from an OSM extract (no models, no textures to download), and it uses SADAK's cel-shaded look with toon ramps, tinted shadows and an ink-line pass.

```bash
npm install
npm run dev          # http://localhost:5173
```

## Where the campus comes from

The OpenStreetMap extract **ships with the game** as `public/data/nitk-osm.json` (about 0.5 MB), so nothing is downloaded from OpenStreetMap at start-up.

- **Refreshing it.** The GitHub workflow `.github/workflows/osm-snapshot.yml` fetches the extract from Overpass and commits the snapshot. Run it from the Actions tab (or change `src/area.json`), or run `npm run osm:fetch` locally.
- **If the snapshot is missing,** the game falls back to `src/data/fallback.ts`. That's a hand-approximated layout, traced from an OSM render centred on 13.009497, 74.795319 at zoom 17.
- **`?source=live`** fetches fresh data from Overpass (for checking new OSM edits). **`?source=fallback`** forces the approximate layout.

The map square is set in `src/area.json`: 13.0005–13.0205 N, 74.7815–74.8060 E. It covers the whole campus on both sides of NH66, the beach and the lighthouse.

## The game

Chapter 1, **Srinivasnagar**, is playable. It's your first days as a fresher, in August, during the monsoon. There are six missions:

| Mission | Giver | What happens |
|---|---|---|
| **Main Gate** | automatic | Get off the bus on NH66, cross by the overpass, collect your ID card from the Academic Section, and find Karavali (1st Block) |
| **Three Messes** | Rohan (roommate) | Pick 1st block veg, 2nd block non-veg, or race 90 s for the last seats at Sahyadri (7th block) |
| **Wheels** | Vikram (final year) | Buy his roadster for ₹300, or rush his lab record to LHC in 3 minutes. You get a cycle |
| **Log in to IRIS** | Ananya (IRIS team) | A password minigame with escalating rules (the highway, the year KREC was founded, …) |
| **Maggi in the Rain** | Rohan, after 3 PM | The monsoon hits. Beat the shutters to Nescafe |
| **The Sunset Rule** | Prakash (senior), 4:30–6:30 PM | Reach the lighthouse hill before the sun hits the sea, and don't disturb the bees. Chapter finale |

The Bully-style systems:

- **Missions and markers:** yellow "!" mission givers, a waypoint beam, an objective tracker with timers, and big MISSION PASSED / FAILED banners.
- **Time and stats:** a game clock (one game minute per real second) with a daily routine, plus Energy, Food, ₹ and Attendance.
- **Classes:** lectures at LHC at 9 AM and 2 PM on weekdays, each with a surprise quiz. Missing them drops your attendance below 75%.
- **Daily life:**
  - meals at your mess at meal times
  - Maggi at Nescafe, Oreo shakes at Nandini, and the night canteen
  - sleep, or rest an hour, at Karavali
- **Students:** about 180 walk the real footpaths, hang out in groups at Nescafe, Nandini, LHC and the mess, pop umbrellas in the rain, chatter in English, Hindi, Kannada and Tulu, and complain when you barge through them.
- **Cycles:** a few students ride the campus roads, racks stand outside the hostels, and you get your own roadster (E to ride, B for the bell).
- **Weather:** monsoon rain, with its own lighting and sound.
- **Saving:** progress saves to your browser automatically. The title screen offers Continue or New game.

The research behind it (hostels, clubs, fests, lore) and the plan for later chapters are in [`docs/GAME_BIBLE.md`](docs/GAME_BIBLE.md).

| | |
|---|---|
| ![Arrival in the rain](docs/ch1-arrival.png) | ![Mission card](docs/ch1-wheels.png) |
| ![IRIS password minigame](docs/ch1-iris.png) | ![Cycling at night](docs/cycling-night.png) |

**Dev shortcuts:**
- `?autostart` skips the title screen.
- `?skipto=ch1-maggi` (any mission id) starts just before that mission.
- `?explore` is free roam with no story.
- `window.nitk` exposes the game for debugging.

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
| `E` | talk, interact, get on or off your cycle |
| `B` | cycle bell (students jump aside) |
| drag / double-click | look around / lock the mouse |
| `←` `→` / wheel | turn / zoom |
| `M` | map, search and teleport |
| `F` | drone view (`Space` / `C` to climb or descend) |
| `T` | skip the clock ahead |
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
  player.ts          walker, cyclist, drone, camera
  ui/hud.ts          minimap, map, labels, objective blips
  game/              the game: mission runner (index.ts), chapter1.ts, cast,
                     crowd, cycles, rain/beacon/bees, UI, audio, save state
scripts/fetch-osm.mjs  snapshot the extract into public/data (also run by CI)
```

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL 1.0.

The cel pipeline (toon ramp patch, ink/grade pass, painted sky) is ported from SADAK. SADAK adapted it from [sakura-crossing](https://github.com/Kenton-GMI/sakura-crossing), MIT License, © 2026 Kenton Wang.
