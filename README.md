# NITK: Fresher Year

A *Bully*-style college game set on the real NITK Surathkal campus, built from OpenStreetMap data. Nobody gets hurt: the missions are ordinary college challenges. It runs in the browser.

![The sunset finale of Chapter 1 on the lighthouse hill](docs/ch1-sunset.png)

It follows [SADAK](https://github.com/mittal-parth/sadak)'s approach: the whole world is generated in code from an OSM extract (no models, no textures to download), and it uses SADAK's cel-shaded look with toon ramps, tinted shadows and an ink-line pass.

```bash
npm install
npm run dev          # http://localhost:5173
```

## Two modes

- **Story Mode:** your fresher year, told in chapters of missions (below).
- **Explore Mode:** free roam of the real campus, view-only. Walk into the Main Building, Central Library, SJA, Mega Mess, Night Canteen and LHC-A. The season picker and rain toggle are there to check the campus across the year.

Story Mode is behind a build flag so a deploy can ship Explore Mode alone:

```bash
npm run build                          # production: Explore only
VITE_STORY_MODE=true npm run build     # production with Story Mode
npm run dev                            # dev: Story Mode on (VITE_STORY_MODE=false to hide it)
```

![Title](docs/title.png)

## Seasons and the academic year

The game runs on the real calendar: day 0 is Monday 3 August 2026, and NITK's odd semester runs August–December, the even semester January–May. Seasons follow the Karnataka coast:

| Season | Months | Semester / story | What changes |
|---|---|---|---|
| **Monsoon** | Jun–Sep | odd sem opens (Chapters 1–2) | frequent rain spells, lush green, grey skies, rough sea, umbrellas everywhere, frogs at night |
| **Post-monsoon** | Oct–Nov | Engineer, Deepavali | "October heat", afternoon thunderstorms with lightning and thunder |
| **Winter** | Dec–Feb | endsems, Crescendo | dry and clear, calm sea, drier grass, students in jackets |
| **Summer** | Mar–May | Incident, even-sem endsems | hot haze, straw-yellow grass, gulmohar and laburnum in flower, cicadas, pre-monsoon storms |

**Across the year:**
- Sunrise and sunset follow Surathkal's real times, so dusk comes around 6:05 PM in November and 6:55 PM in August.
- The weather is rolled every game hour from the season's odds. Missions that script the weather hold it until they end.
- Festival decorations go up on the 2026–27 dates:
  - tricolour bunting for Independence Day and Republic Day
  - red-and-yellow Kannada flags for Rajyotsava
  - marigold garlands for Ganesh Chaturthi
  - glowing akash kandil lanterns and diyas for Deepavali
  - paper stars for Christmas
- The journal shows the semester and season.

In Explore mode, a season picker jumps to Monsoon (15 Aug), Post-monsoon (8 Nov, Deepavali), Winter (25 Dec) or Summer (29 Mar), and a Rain button toggles the weather, so you can check assets across the year.

| | |
|---|---|
| ![Monsoon](docs/season-monsoon.png) | ![Summer](docs/season-summer.png) |
| ![Winter](docs/season-winter.png) | ![Deepavali](docs/festival-deepavali.png) |

## Sound

Everything is synthesized in the browser; there are no audio files to download.

- **Music:** seven tracks that follow the moment and crossfade as it changes:
  - *Srinivasnagar* (the main theme)
  - *Campus Days* (lo-fi)
  - *Coastal Groove* (tabla theka and bansuri over a Mohanam drone)
  - *Monsoon* (rain)
  - *Lighthouse Hill* (sunset)
  - *Night Canteen* (night)
  - *Against the Clock* (timed missions and chases)

  N or ⏭ skips a track, ♪ toggles the music, and 🔊 opens separate volume controls for master, music, effects and ambience. Add your own MP3s in `public/music/` (see [Music](#adding-music)).
- **Ambience:** mixed from where you are and when:
  - waves loudest on the real coastline
  - NH66 traffic rumble and horns
  - birds, busiest at dawn and dusk; crickets at night
  - frogs on monsoon nights, cicadas on summer afternoons, thunder in storm season
  - student chatter around the hangouts
  - temple bells at dawn and dusk near the Sadashiva temple
  - wind and monsoon rain
  - footsteps that change on tarmac and in the wet, and the tick of your cycle's freewheel

## Where the campus comes from

The OpenStreetMap extract **ships with the game** as `public/data/nitk-osm.json` (about 0.5 MB), so nothing is downloaded from OpenStreetMap at start-up.

- **Refreshing it.** The GitHub workflow `.github/workflows/osm-snapshot.yml` fetches the extract from Overpass and commits the snapshot. Run it from the Actions tab (or change `src/area.json`), or run `npm run osm:fetch` locally.
- **If the snapshot is missing,** the game falls back to `src/data/fallback.ts`. That's a hand-approximated layout, traced from an OSM render centred on 13.009497, 74.795319 at zoom 17.
- **`?source=live`** fetches fresh data from Overpass (for checking new OSM edits). **`?source=fallback`** forces the approximate layout.

The map square is set in `src/area.json`: 13.0005–13.0205 N, 74.7815–74.8060 E. It covers the whole campus on both sides of NH66, the beach and the lighthouse.

## The game

Chapters 1 and 2 are playable. Chapter 1, **Srinivasnagar**, covers your first days as a fresher, in August, during the monsoon. It has six missions:

| Mission | Giver | What happens |
|---|---|---|
| **Main Gate** | automatic | Get off the bus on NH66, cross by the overpass, collect your ID card from the Academic Section, and find Karavali (1st Block) |
| **Three Messes** | Rohan (roommate) | Pick 1st block veg, 2nd block non-veg, or race 90 s for the last seats at Sahyadri (7th block) |
| **Wheels** | Vikram (final year) | Buy his roadster for ₹300, or rush his lab record to LHC in 3 minutes. You get a cycle |
| **Log in to IRIS** | Ananya (IRIS team) | A password minigame with escalating rules (the highway, the year KREC was founded, …) |
| **Maggi in the Rain** | Rohan, after 3 PM | The monsoon hits. Beat the shutters to Nescafe |
| **The Sunset Rule** | Prakash (senior), 4:30–6:30 PM | Reach the lighthouse hill before the sun hits the sea, and don't disturb the bees. Chapter finale |

Chapter 2, **Recruitments**, follows. It's a month later, in September, and recruitment week has club stalls in an arc in front of the real Students' Activity Centre amphitheatre:

| Mission | Giver | What happens |
|---|---|---|
| **Recruitment Week** | automatic | Visit the club stalls (WebClub, Star Gazing, LSD, Linux Users Group, Music, Photography, E-FOREA, SPICMACAY) and sign up for three |
| **Come Back Next Year** | Ananya | Get politely rejected by IEEE, ACM, IE and IET; they go onto your "Next Year" list |
| **Freshers Cup** | Phoenix captain, after 4 PM | A penalty-shootout minigame on Main Ground 1, Karavali vs Aravali |
| **Flat Tyre** | Rohan | Kiran from Aravali let your tyres down on a Crescendo dare. Chase him across campus |
| **sudo make me a coffee** | Sid (LUG), after 6 PM | A Linux terminal minigame: fix Rohan's dual-boot Wi-Fi, then get him out of vim |
| **First Light** | Meera (Star Gazing), after 7:30 PM, no rain | Name constellations in the August sky (Saptarishi, Vrischika, Cassiopeia…) |

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
- **Journal (J):** your stats, respect with each group, the clubs you've joined, the Next Year list, and every mission by chapter.
- **Saving:** progress saves to your browser automatically. The title screen offers Continue or New game.

The research behind it (hostels, clubs, fests, lore) and the plan for later chapters are in [`docs/GAME_BIBLE.md`](docs/GAME_BIBLE.md).

| | |
|---|---|
| ![Arrival in the rain](docs/ch1-arrival.png) | ![Mission card](docs/ch1-wheels.png) |
| ![IRIS password minigame](docs/ch1-iris.png) | ![Cycling at night](docs/cycling-night.png) |
| ![Club stalls](docs/ch2-stall-row.png) | ![Penalty shootout](docs/ch2-penalties.png) |
| ![Linux terminal](docs/ch2-terminal.png) | ![Journal](docs/journal.png) |

**Dev shortcuts:**
- `?autostart` skips the title screen.
- `?skipto=ch1-maggi` (any mission id) starts just before that mission.
- `?explore` goes straight into Explore mode.
- `window.nitk` exposes the game for debugging.

## What's in the world

- **OSM geometry, 1:1.** Every road (NH66 as a divided highway with a median), building footprint, landuse area, sports pitch, pool, barrier and mapped tree sits at its real position.
- **Buildings.** Heights come from `height` or `building:levels` when OSM has them, otherwise from sensible defaults. Façades are matched to photographs of the campus and NITK's [virtual tour](https://vtour.nitk.ac.in/) (`src/world/archetypes.ts`, by OSM name):
  - the Main Building and the old departments: khaki-yellow render with continuous concrete sunshade ledges over recessed windows; the Main Building's wings add vertical fins (an egg-crate front)
  - the old hostel blocks: khaki render, sunshade ledges, louvred windows; tiled roofs only where OSM says pitched
  - the Mega Hostel towers: tan frame, cream panels, small grilled windows, a blue-glass stair core
  - LHC-A: exposed laterite; the Library, LHC-D, CRF, CIDS and SJA: white render with lavender-grey bands
  - pastel houses with Mangalore-tile hip roofs and black rooftop water tanks, and shopfronts with rolling shutters off campus

  Windows light up at night.
- **Walk-in interiors.** The Main Building (enquiry desk, stair, office corridor), Central Library (stacks, reading tables, issue desk), SJA (stage and seating), Mega Mess (steel tables, serving counter), Night Canteen and LHC-A (classrooms round the courtyard) open up. Walk through the lit front door: the shell and roof cut away and the camera looks down into the room (`src/world/interiors.ts`).
- **Landmarks.** These are matched by OSM name or tag, so they land wherever the real map puts them:
  - the lighthouse on its knoll, with a sweeping beam after dusk
  - the Main Building's olive entrance block: glass front between four yellow piers, three yellow arches over the porch, the blue fountains in front
  - the main gate on NH66: stone piers, security cabin and the curved black-granite trilingual name wall; inside it, two yellow pavilions with terracotta roofs and a balustrade with yellow ball finials
  - the front lawns from the gate to the Main Building: red-brick walks, croton beds, Ashoka rows
  - the SAC amphitheatre: green tiers, red stair flights, lavender stage under a canopy on yellow poles
  - the square red-and-white lighthouse with its gallery, lantern and sweeping radar
  - Chemical Engineering's curved canopy
  - signage on the Central Library, SJA and Lecture Hall Complex
  - the fountain, the tricolour and water towers
- **Coast.** The sea polygon is built from the OSM coastline. It has cel-banded shallows, swell lines, breakers and a surf line on the real shore, with sand and a casuarina belt behind it.
- **Vegetation.** Coconut palms, broadleaf canopy and casuarinas, scattered by land use. On campus: columnar Ashoka trees, rain-tree avenues arching over the roads, and bare laterite soil in their shade.
- **Street furniture.** Black-and-white painted kerbs and white globe lamps on campus roads; compound walls with a laterite plinth, jali screen and pillars.
- **Time of day.** Morning, noon, Arabian-Sea sunset and night, with lit windows, street-lamp pools and stars.
- **HUD.** A rotating minimap, a full map with click-to-teleport and place search, floating building labels, and a "you are near" banner.

## Controls

| | |
|---|---|
| `W A S D` | walk (`Shift` run, `Space` jump) |
| `E` | talk, interact, get on or off your cycle |
| `B` | cycle bell (students jump aside) |
| `J` | journal |
| `N` | next music track |
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
  game/              the game: mission runner (index.ts), chapter1.ts, chapter2.ts,
                     minigames, club stalls, journal, cast, crowd, cycles,
                     rain/beacon/bees, UI, save state,
                     audio (buses), music (sequencer + tracks), ambience
  game/seasons.ts    calendar, seasons, sun times, festivals, seasonal grading
  game/festivals.ts  festival decorations
  world/archetypes.ts per-building looks matched to photos
  world/interiors.ts walk-in ground floors and the cutaway
  world/overrides.ts per-building overrides (public/data/overrides.json)
  world/models.ts    custom .glb models on OSM footprints
scripts/fetch-osm.mjs  snapshot the extract into public/data (also run by CI)
```

## Working on the campus

Best first:

1. **Improve OpenStreetMap.** Add `building:levels` (or `height`), `roof:shape`, `roof:colour`, `building:colour` and `name`, then refresh the snapshot (`npm run osm:fetch`, or the **OSM snapshot** workflow in GitHub Actions).
2. **Match a building to photos** in `src/world/archetypes.ts` (façade style, wall colour, roof), or add hero details in `src/world/landmarks.ts`.
3. **Overrides** for what OSM shouldn't hold: `public/data/overrides.json`, keyed by OSM id, wins over everything else.

   ```json
   { "version": 1, "buildings": { "way/361006764": { "levels": 4, "colour": "#ecdfae", "style": "academic", "roofShape": "flat" } } }
   ```

   Fields: `name`, `levels`, `height`, `minHeight`, `style` (`academic`, `hostel`, `megahostel`, `laterite`, `modern`, `house`, `shop`, `plain`, `industrial`), `colour`, `roofShape`, `roofColour`, `hidden`, `model`, `note`.
4. **Custom models:** put a `.glb` in `public/models/` and reference it from the override (`"model": { "url": "models/main.glb", "scale": 1, "rotation": 0 }`). Metres, Y up, origin at the footprint centre on the ground, long side along +X. Materials are converted to cel shading, so keep them to a base colour and texture.

To add a walk-in building, add its OSM name and a room kind to `ROOMS` in `src/world/interiors.ts`.

### Adding music

Drop tracks into `public/music/` and list them in `public/music/manifest.json`:

```json
[{ "title": "Lighthouse Blues", "file": "lighthouse.mp3", "moods": ["sunset", "day"] }]
```

Moods: `title`, `day`, `rain`, `sunset`, `night`, `mission`.

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL 1.0.

The cel pipeline (toon ramp patch, ink/grade pass, painted sky) is ported from SADAK. SADAK adapted it from [sakura-crossing](https://github.com/Kenton-GMI/sakura-crossing), MIT License, © 2026 Kenton Wang.
