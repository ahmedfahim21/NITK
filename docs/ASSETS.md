# Working on campus assets

The campus is built from OpenStreetMap (OSM) at load time. There are three ways to make it look more like the real NITK, best first:

1. **Improve OpenStreetMap itself.** Everyone benefits, and the game picks it up on the next snapshot.
2. **Overrides** (`public/data/overrides.json`): per-building fixes that OSM can't or shouldn't hold.
3. **Custom 3D models** (`public/models/*.glb`): replace a building's extruded box with a real model.

The **Asset workbench** in Explore mode does all three. Pick **Explore** on the title screen, or open `/?explore`.

## Where the map stands

The current snapshot of the campus has 251 buildings:

| Tag | Buildings | Share |
|---|---|---|
| a name | 76 | 30% |
| a height or `building:levels` | 38 | 15% |
| a roof shape (`roof:shape`) | 35 | 14% |
| a colour (`building:colour`) | 6 | 2% |

Everything else gets a default: 3 levels for academic blocks, 4 for hostels, cream walls, a flat roof. So **height and levels are the single biggest win**. The workbench's **Coverage** tab lists the buildings missing each tag, biggest first.

## 1. Improving OSM

In the workbench, click a building, then **edit in iD ↗**. Add:

- `building:levels=4`, or `height=14.5` in metres. Levels are fine if you don't know the height; the game uses 3.4 m per floor.
- `roof:shape=flat|gabled|hipped|pyramidal`, `roof:colour=#b9562f`, `building:colour=#efe3c8`.
- `name=…` (for example "Department of Civil Engineering").
- For the lighthouse, water towers and so on: `man_made=*` and `height=*`.

Then refresh the game's snapshot: in GitHub go to **Actions → OSM snapshot → Run workflow**, or run `npm run osm:fetch` locally. The workflow commits `public/data/nitk-osm.json`.

## 2. Overrides

For anything you'd rather not put in OSM (an exact façade style, a colour matched from a photo, hiding a stale footprint):

1. Select the building, edit the fields, and press **Apply**. The edit is saved in this browser and the building rebuilds straight away.
2. Press **Export overrides.json**, save it as `public/data/overrides.json`, and commit it. From then on everyone gets it.

The file is keyed by OSM id:

```json
{
  "version": 1,
  "buildings": {
    "way/361006764": {
      "levels": 4,
      "colour": "#f2e6cf",
      "style": "academic",
      "roofShape": "flat",
      "note": "matched to photo, Sept 2026"
    }
  }
}
```

The fields are `name`, `levels`, `height`, `minHeight`, `style` (one of `academic`, `hostel`, `modern`, `house`, `shop`, `plain`, `industrial`), `colour`, `roofShape`, `roofColour`, `hidden`, `model` and `note`. Overrides win over OSM tags.

## 3. Custom models

Model a building in Blender (or anything that exports glTF), then:

1. In Explore mode, select the building and **drag the `.glb` onto the page**. It's placed immediately so you can check the fit.
2. Adjust **Scale**, **Rotation°** and **Offset**, or press **Fit model to footprint** to scale it to the footprint's length. Then **Apply**.
3. Copy the file to `public/models/` (keep the same file name), export `overrides.json`, and commit both.

The model then appears for everyone, in Story mode too.

**Model conventions:**

- **Units:** metres. Y is up.
- **Origin:** the centre of the building's footprint, at ground level.
- **Orientation:** the building's **long side along +X**. The game aligns +X with the long axis of the OSM footprint, then applies your rotation.
- **Materials:** keep them simple, base colour plus an optional texture. The game converts them to its cel shading, so PBR maps (roughness, metalness, normals) are ignored.
- **Budget:** 5–30k triangles is plenty for a campus building. Bake small details into textures.
- **Replacement:** by default the model replaces the extruded footprint. Tick **Keep footprint** for models that only add to it (a portico, a water tank, signage).

The Main Building's portico, the gate arch, the SJA sign and the lighthouse are code-built "hero" details in `src/world/landmarks.ts`. They still appear next to a custom model, so adjust them there if you replace those buildings.

## Photos

The project doesn't ship reference photos. Match colours with the colour picker against your own, or use the Wikimedia Commons photos linked from OSM (the lighthouse has a `wikimedia_commons` tag).

## Music

Drop your own tracks into `public/music/` and list them in `public/music/manifest.json`:

```json
[{ "title": "Lighthouse Blues", "file": "lighthouse.mp3", "moods": ["sunset", "day"] }]
```

The moods are `title`, `day`, `rain`, `sunset`, `night` and `mission`. Your tracks join the generated soundtrack for those moods, and N skips between them.
