/**
 * Hand-approximated NITK layout, used only when neither the committed OSM
 * snapshot nor the live Overpass API is reachable.
 *
 * It is emitted in the same Overpass JSON shape as the real extract so the
 * whole pipeline (parse -> world) is exercised identically.
 *
 * The core campus is traced from an OpenStreetMap render centred on
 * 13.009497, 74.795319 at zoom 17 (about 1.164 m per pixel), so most of the
 * geometry below is written in that image's pixel coordinates via `I(px, py)`.
 * The trace is cross-checked against published pins:
 *
 *   NITK (institute pin)   13.010967, 74.794361  -> the Main Road gate on NH66
 *   NITK Ground            13.009952, 74.796657  -> beside Main Ground 2
 *   JC Bose Guest House    13.012430, 74.792220  -> west of NH66
 *   NITK staff quarters    13.013852, 74.795981  -> north-east, off the trace
 *   NITK Beach (path end)  13.010583, 74.788191
 *   Munchur Road dhaba     13.004357, 74.794607  -> where Munchur Rd meets NH66
 *
 * Outside the traced window (the west campus, the beach, the lighthouse and
 * the surrounding villages) the layout is a plausible approximation only.
 * Run `npm run osm:fetch`, or open the game online, for the real map.
 */
import { mulberry32, pointInPoly, project, unproject, type Pt } from "../geo";
import type { OsmElement, OsmJson, Tags } from "../osm/types";

type P = [number, number]; // [east, north] metres

let nextId = 1;
const els: OsmElement[] = [];

/* ---- the trace's pixel frame ---- */
const CENTRE = project(13.009497, 74.795319);
const MPP = 1.1637;
const I = (px: number, py: number): P => [CENTRE[0] + (px - 228) * MPP, -(CENTRE[1] + (py - 196) * MPP)];
const Ip = (pts: [number, number][]): P[] => pts.map(([x, y]) => I(x, y));

const ll = ([e, n]: P) => unproject(e, -n);

function way(pts: P[], tags: Tags, closed = false) {
  const g = pts.map(ll);
  if (closed) g.push(g[0]);
  els.push({ type: "way", id: nextId++, geometry: g, tags });
}

function node(p: P, tags: Tags) {
  const q = ll(p);
  els.push({ type: "node", id: nextId++, lat: q.lat, lon: q.lon, tags });
}

/** Rectangle centred at (e, n), long side `len` rotated `deg` from east. */
function rect(e: number, n: number, len: number, wid: number, deg = 0): P[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return ([
    [-len / 2, -wid / 2],
    [len / 2, -wid / 2],
    [len / 2, wid / 2],
    [-len / 2, wid / 2],
  ] as P[]).map(([u, v]) => [e + u * c - v * s, n + u * s + v * c] as P);
}

/** Axis-aligned box between two pixel corners of the trace. */
function box(x0: number, y0: number, x1: number, y1: number): P[] {
  return Ip([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]);
}

function bldg(pts: P[], tags: Tags = {}) {
  way(pts, { building: "yes", ...tags }, true);
}

/** Pixel-space box building. */
function bpx(x0: number, y0: number, x1: number, y1: number, tags: Tags = {}) {
  bldg(box(x0, y0, x1, y1), tags);
}

/** Polyline in pixel space. */
function road(pts: [number, number][], tags: Tags) {
  way(Ip(pts), tags);
}

/* ------------------------------------------------------------------ *
 * NH66, traced through the window and extended both ways
 * ------------------------------------------------------------------ */

const NH66_PX: [number, number][] = [
  [98, -1000],
  [104, -600],
  [108, -250],
  [110, 0],
  [113, 100],
  [117, 200],
  [122, 280],
  [130, 330],
  [145, 365],
  [165, 392],
  [178, 430],
  [180, 480],
  [172, 560],
  [162, 690],
  [158, 1000],
];
const NH66: P[] = Ip(NH66_PX);

/** East coordinate of the NH66 centreline at a given north coordinate. */
function nh66(n: number): number {
  for (let i = 1; i < NH66.length; i++) {
    const [e0, n0] = NH66[i - 1];
    const [e1, n1] = NH66[i];
    if ((n <= n0 && n >= n1) || (n >= n0 && n <= n1)) {
      const t = (n - n0) / (n1 - n0 || 1);
      return e0 + (e1 - e0) * t;
    }
  }
  return n > NH66[0][1] ? NH66[0][0] : NH66[NH66.length - 1][0];
}

{
  const offset = (d: number) => {
    const out: P[] = [];
    for (let i = 0; i < NH66.length; i++) {
      const a = NH66[Math.max(0, i - 1)];
      const b = NH66[Math.min(NH66.length - 1, i + 1)];
      const dx = b[0] - a[0];
      const dn = b[1] - a[1];
      const l = Math.hypot(dx, dn) || 1;
      // Right of travel (travel is southward, so right is west) for d > 0.
      out.push([NH66[i][0] - (dn / l) * -d, NH66[i][1] + (dx / l) * -d]);
    }
    return out;
  };
  const sb = offset(-5.5);
  const nb = offset(5.5).reverse();
  way(sb, { highway: "trunk", ref: "NH66", name: "National Highway 66", oneway: "yes", lanes: "2" });
  way(nb, { highway: "trunk", ref: "NH66", name: "National Highway 66", oneway: "yes", lanes: "2" });
}
// Service road on the campus side, and the foot overbridge at the gate.
road(
  [
    [131, 100],
    [133, 200],
    [136, 280],
    [142, 310],
  ],
  { highway: "service", name: "Service road NH66 NITK" }
);
road(
  [
    [100, 40],
    [100, 120],
    [103, 205],
  ],
  { highway: "service" }
);
road(
  [
    [98, 106],
    [136, 112],
  ],
  { highway: "footway", bridge: "yes", name: "NITK Foot Overbridge" }
);

/* ------------------------------------------------------------------ *
 * Coast, beach and the sea
 * ------------------------------------------------------------------ */

// Through the NITK Beach pin, trending NNW like the rest of this coast.
const shore = (n: number) => -590 + 0.08 * n;
{
  const pts: P[] = [];
  for (let n = 1250; n >= -1250; n -= 50) pts.push([shore(n) + Math.sin(n / 90) * 6 + Math.sin(n / 37) * 3, n]);
  way(pts, { natural: "coastline" });

  const sand: P[] = [];
  for (let n = 1250; n >= -1250; n -= 50) sand.push([shore(n) + Math.sin(n / 90) * 6 + Math.sin(n / 37) * 3 - 2, n]);
  for (let n = -1250; n <= 1250; n += 50) sand.push([shore(n) + 48 + Math.sin(n / 61) * 8, n]);
  way(sand, { natural: "beach", name: "NITK Beach" }, true);

  const belt: P[] = [];
  for (let n = 1250; n >= -1250; n -= 50) belt.push([shore(n) + 46 + Math.sin(n / 61) * 8, n]);
  for (let n = -1250; n <= 1250; n += 50) belt.push([shore(n) + 105 + Math.sin(n / 45) * 14, n]);
  way(belt, { natural: "wood", leaf_type: "needleleaved" }, true);
}

/* ------------------------------------------------------------------ *
 * Campus outline
 * ------------------------------------------------------------------ */

const EAST_CAMPUS: P[] = Ip([
  [124, -420],
  [520, -420],
  [520, 190],
  [440, 205],
  [382, 250],
  [362, 300],
  [350, 392],
  [190, 430],
  [140, 340],
  [126, 200],
]);
const WEST_CAMPUS: P[] = [
  ...Ip([
    [100, -420],
    [100, 330],
  ]),
  [shore(-270) + 30, -270],
  [shore(480) + 30, 480],
];
way(EAST_CAMPUS, { amenity: "university", name: "National Institute of Technology Karnataka" }, true);
way(WEST_CAMPUS, { amenity: "university", name: "National Institute of Technology Karnataka" }, true);

/* ------------------------------------------------------------------ *
 * East campus, traced
 * ------------------------------------------------------------------ */

node(I(124, 45), { barrier: "gate", name: "NITK Main Gate" });
road(
  [
    [116, 45],
    [175, 45],
    [232, 45],
    [290, 45],
  ],
  { highway: "tertiary", name: "Main Road" }
);
road(
  [
    [175, -120],
    [175, 0],
    [175, 45],
    [175, 110],
  ],
  { highway: "residential" }
);
road(
  [
    [232, 45],
    [233, 120],
    [234, 210],
  ],
  { highway: "residential", name: "Street 1" }
);
road(
  [
    [290, -420],
    [290, 0],
    [290, 45],
    [291, 115],
    [292, 213],
    [296, 250],
    [300, 280],
  ],
  { highway: "residential", name: "NITK Spine" }
);
road(
  [
    [291, 115],
    [360, 118],
    [420, 115],
    [445, 100],
    [520, 90],
  ],
  { highway: "residential", name: "Old medows" }
);
road(
  [
    [120, 213],
    [205, 213],
    [292, 213],
    [380, 216],
    [440, 205],
  ],
  { highway: "residential", name: "Fresher's Street" }
);
road(
  [
    [160, 310],
    [180, 265],
    [205, 213],
  ],
  { highway: "service", name: "Block 4 to SBI ATM" }
);
road(
  [
    [198, 280],
    [250, 262],
    [300, 250],
  ],
  { highway: "service", name: "Mega Mess Road" }
);
road(
  [
    [300, 280],
    [318, 305],
    [342, 345],
  ],
  { highway: "service", name: "Coconut Grove Road" }
);
road(
  [
    [520, 185],
    [440, 205],
    [415, 225],
    [382, 255],
    [365, 290],
    [355, 340],
    [345, 392],
    [320, 470],
    [270, 560],
    [215, 640],
    [168, 690],
  ],
  { highway: "tertiary", name: "Munchur Road" }
);
// North of the trace: the approach to the staff quarters.
road(
  [
    [175, -120],
    [290, -120],
    [520, -120],
  ],
  { highway: "residential" }
);
road(
  [
    [175, -120],
    [175, -300],
    [290, -300],
    [470, -300],
  ],
  { highway: "residential" }
);
road(
  [
    [400, -420],
    [400, -120],
    [400, 45],
  ],
  { highway: "residential" }
);
road(
  [
    [290, 45],
    [400, 45],
    [520, 45],
  ],
  { highway: "residential" }
);

// Footpaths (the red dashes on the trace).
for (const f of [
  [
    [140, 60],
    [140, 125],
  ],
  [
    [130, 90],
    [175, 90],
  ],
  [
    [175, 130],
    [232, 130],
  ],
  [
    [175, 195],
    [232, 195],
  ],
  [
    [210, 230],
    [230, 300],
    [250, 330],
  ],
  [
    [265, 290],
    [285, 330],
    [300, 360],
  ],
  [
    [60, 215],
    [60, 260],
  ],
] as [number, number][][])
  road(f, { highway: "footway" });

// Front lawn between the gate and the Main Building.
way(box(128, 58, 168, 126), { leisure: "garden", name: "Main Building Lawn" }, true);
node(I(148, 92), { amenity: "fountain", name: "Fountain" });
node(I(158, 58), { man_made: "flagpole", name: "Flag post" });

bldg(
  Ip([
    [184, 58],
    [230, 58],
    [230, 72],
    [212, 72],
    [212, 128],
    [230, 128],
    [230, 142],
    [184, 142],
    [184, 128],
    [200, 128],
    [200, 72],
    [184, 72],
  ]),
  { name: "Main Building", building: "university", "building:levels": "3" }
);
bpx(184, 152, 228, 196, { name: "Central Library", building: "university", "building:levels": "3" });
node(I(175, 170), { amenity: "library", name: "Central Library" });
node(I(205, 170), { amenity: "library", name: "Reading Hall" });
bpx(186, 6, 226, 38, { name: "Lecture Hall Complex", building: "university", "building:levels": "3" });
bpx(136, 8, 168, 34, { building: "university", "building:levels": "2" });
bpx(242, 128, 284, 172, { name: "Silver Jubilee Auditorium", building: "yes", amenity: "theatre", height: "15" });
node(I(255, 145), { amenity: "theatre", name: "Silver Jubilee Auditorium" });
bpx(242, 56, 284, 84, { building: "university", "building:levels": "3" });
bpx(246, 92, 280, 118, { building: "university", "building:levels": "3" });
bpx(242, 180, 284, 204, { building: "university", "building:levels": "2" });
bpx(132, 134, 166, 150, { building: "university", "building:levels": "2" });
bpx(140, 160, 168, 180, { building: "commercial", "building:levels": "2", name: "Shopping Complex" });
bpx(134, 186, 160, 204, { building: "yes", "building:levels": "1" });
node(I(205, 220), { amenity: "atm", name: "SBI ATM" });

// Sports: courts, pool, the two big grounds.
way(box(296, 58, 338, 82), { leisure: "pitch", sport: "tennis", name: "Tennis Courts" }, true);
way(box(316, 90, 328, 112), { leisure: "swimming_pool", name: "NITK Swimming Pool" }, true);
way(box(342, 56, 392, 112), { leisure: "pitch", sport: "football", name: "Football Ground" }, true);
for (let x = 296; x < 392; x += 24) way(box(x, 124, x + 20, 136), { leisure: "pitch", sport: "basketball" }, true);
way(box(296, 142, 356, 206), { leisure: "pitch", sport: "cricket", name: "Main Ground 1" }, true);
{
  const c = I(412, 172);
  const oval: P[] = [];
  for (let k = 0; k < 40; k++) {
    const t = (k / 40) * Math.PI * 2;
    oval.push([c[0] + Math.cos(t) * 44, c[1] + Math.sin(t) * 42]);
  }
  way(oval, { leisure: "track", name: "Main Ground 2" }, true);
  way(rect(c[0], c[1], 60, 44, 0), { leisure: "pitch", sport: "soccer", name: "Main Ground 2" }, true);
}
bpx(400, 64, 446, 96, { building: "yes", "building:levels": "2", name: "Indoor Sports Complex" });

// Staff quarters: the grid top-right, continuing north.
{
  const rand = mulberry32(99);
  for (let x = 308; x < 450; x += 18) {
    for (let y = -400; y < 40; y += 24) {
      if (y > -130 && y < -110) continue;
      if (y > -310 && y < -290) continue;
      if (x > 395 && x < 405) continue;
      if (rand() < 0.12) continue;
      bpx(x, y, x + 13, y + 15, { building: "house", "building:levels": rand() < 0.5 ? "2" : "1" });
    }
  }
  node(I(289, -218), { name: "NITK Staff Quarters", place: "neighbourhood" });
}
// North of the trace, east of NH66: departments and labs (unnamed; positions approximate).
{
  const labs: [number, number, number, number][] = [
    [140, -110, 170, -60],
    [185, -110, 230, -70],
    [240, -110, 282, -60],
    [140, -290, 170, -230],
    [185, -280, 230, -240],
    [240, -290, 282, -230],
    [185, -200, 230, -150],
    [240, -200, 282, -140],
    [300, -110, 390, -80],
    [185, -40, 230, -10],
    [240, -40, 282, -8],
  ];
  for (const [x0, y0, x1, y1] of labs) bpx(x0, y0, x1, y1, { building: "university", "building:levels": "3" });
}

// Hostel quarter along Mega Mess Road (south of Fresher's Street).
{
  const hostel = { building: "dormitory", "building:levels": "4" };
  bpx(214, 224, 262, 240, { ...hostel, name: "Satpura (Block 4)" });
  bldg(
    Ip([
      [242, 250],
      [288, 244],
      [290, 256],
      [256, 262],
      [258, 282],
      [244, 284],
    ]),
    { building: "yes", "building:levels": "2", name: "Mega Mess", amenity: "canteen" }
  );
  bldg(
    Ip([
      [170, 222],
      [196, 222],
      [196, 262],
      [184, 262],
      [184, 234],
      [170, 234],
    ]),
    hostel
  );
  bpx(262, 290, 300, 304, hostel);
  bpx(302, 262, 344, 278, { ...hostel, name: "Everest (Mega Tower 1)", "building:levels": "11" });
  bpx(312, 312, 346, 328, { ...hostel, name: "Himalaya (Mega Tower 2)", "building:levels": "11" });
  bpx(200, 300, 244, 316, hostel);
  bpx(206, 324, 240, 342, hostel);
  bpx(160, 330, 200, 346, hostel);
  bldg(
    Ip([
      [236, 350],
      [276, 350],
      [276, 386],
      [262, 386],
      [262, 362],
      [236, 362],
    ]),
    hostel
  );
  bpx(284, 340, 320, 356, hostel);
  bpx(284, 364, 320, 380, { ...hostel, name: "Kailash (Mega Tower 3)", "building:levels": "11" });
  bpx(186, 360, 226, 376, hostel);
  bpx(300, 222, 346, 236, { building: "university", "building:levels": "2" });
  bpx(356, 224, 372, 250, { building: "yes", "building:levels": "1" });
  way(box(150, 238, 170, 290), { landuse: "grass" }, true);
}

// Greens inside the east campus.
way(box(354, 262, 440, 330), { natural: "wood" }, true);
way(box(380, 330, 460, 392), { natural: "wood" }, true);
way(box(440, -420, 520, -130), { natural: "wood" }, true);

/* ------------------------------------------------------------------ *
 * West of NH66: Green Meadows, guest house, beach road, lighthouse
 * ------------------------------------------------------------------ */

road(
  [
    [100, 40],
    [60, 42],
    [20, 70],
    [-60, 88],
    [-200, 92],
    [-340, 93],
    [-408, 93],
  ],
  { highway: "residential", name: "NITK Beach Road" }
);
road(
  [
    [-408, 93],
    [-437, 93],
  ],
  { highway: "footway", name: "NITK Beach Path" }
);
road(
  [
    [0, 60],
    [48, 0],
    [70, -60],
  ],
  { highway: "residential", name: "Green Meadows" }
);
road(
  [
    [103, 205],
    [40, 206],
    [-120, 210],
    [-260, 250],
    [-330, 330],
  ],
  { highway: "residential" }
);
road(
  [
    [-60, 88],
    [-61, -83],
    [-40, -250],
  ],
  { highway: "residential" }
);
road(
  [
    [-200, 92],
    [-210, 400],
    [-300, 520],
  ],
  { highway: "residential", name: "Lighthouse Road" }
);

bldg(rect(...I(-61, -83), 40, 20, 0), { name: "JC Bose Guest House", building: "hotel", tourism: "guest_house", "building:levels": "2" });
bpx(58, 22, 80, 38, { building: "yes", "building:levels": "2" });
bpx(66, 58, 90, 84, { building: "yes", "building:levels": "2" });
bpx(72, 94, 90, 116, { building: "yes", "building:levels": "1" });
bpx(8, 150, 36, 170, { building: "house", "building:levels": "2" });
bpx(10, 180, 34, 198, { building: "house", "building:levels": "1" });
way(box(30, 112, 82, 164), { natural: "wood" }, true);
way(box(0, 222, 70, 262), { natural: "wood" }, true);
node(I(20, 20), { name: "Green Meadows", place: "neighbourhood" });

// West-campus quarters and guest houses (approximate).
{
  const rand = mulberry32(7);
  for (let x = -330; x < 40; x += 34) {
    for (let y = -260; y < 60; y += 30) {
      if (Math.abs(y - 88) < 16 || rand() < 0.45) continue;
      if (Math.abs(x + 61) < 30 && Math.abs(y + 83) < 30) continue;
      bpx(x, y, x + 18, y + 14, { building: "house", "building:levels": rand() < 0.3 ? "2" : "1" });
    }
  }
}
way(box(-400, -300, -120, 60), { natural: "wood" }, true);
way(box(-360, 120, -60, 330), { natural: "wood" }, true);

// The lighthouse on its laterite knoll above the beach (position approximate).
{
  const n = I(0, 470)[1];
  const e = shore(n) + 62;
  way(rect(e, n, 70, 60, 20), { natural: "scrub", name: "Lighthouse Hill" }, true);
  node([e, n], { man_made: "lighthouse", name: "Surathkal Lighthouse", height: "41" });
  way(
    [
      I(-300, 520),
      [e + 20, n + 10],
    ],
    { highway: "footway", name: "Lighthouse Steps" }
  );
}

/* ------------------------------------------------------------------ *
 * Around the campus: Srinivasnagar, Dodda Kopla, Thadambail
 * ------------------------------------------------------------------ */

{
  const rand = mulberry32(2024);
  const lanes: P[][] = [];
  const addLane = (pts: P[], tags: Tags = { highway: "residential" }) => {
    lanes.push(pts);
    way(pts, tags);
  };
  for (const n of [-780, -900, -1040]) addLane([[nh66(n) + 6, n], [300, n + 20], [700, n - 10], [1400, n + 30]]);
  for (const n of [620, 800, 960]) addLane([[nh66(n) + 6, n], [520, n + 20], [900, n - 10], [1400, n + 30]]);
  for (const e of [700, 950, 1200]) addLane([[e, -1250], [e + 20, -400], [e - 10, 200], [e + 15, 1250]]);
  for (const n of [-700, -850, -1000, 720, 880, 1040]) addLane([[nh66(n) - 6, n], [-200, n + 15], [shore(n) + 70, n - 10]]);

  const campus = [EAST_CAMPUS, WEST_CAMPUS].map((r) => r.map(([e, n]) => [e, -n] as Pt));
  const occupied = (e: number, n: number) =>
    campus.some((r) => pointInPoly(e, -n, r)) || Math.abs(e - nh66(n)) < 22 || e < shore(n) + 90;

  for (const lane of lanes) {
    for (let i = 1; i < lane.length; i++) {
      const [a, b] = [lane[i - 1], lane[i]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      for (let d = 12; d < len - 12; d += 14 + rand() * 12) {
        for (const side of [-1, 1]) {
          if (rand() < 0.25) continue;
          const f = d / len;
          const off = 12 + rand() * 6;
          const e = a[0] + (b[0] - a[0]) * f + nx * off * side;
          const n = a[1] + (b[1] - a[1]) * f + ny * off * side;
          if (occupied(e, n)) continue;
          bldg(rect(e, n, 9 + rand() * 7, 7 + rand() * 5, (ang * 180) / Math.PI + (rand() - 0.5) * 6), {
            building: "house",
            "building:levels": rand() < 0.35 ? "2" : "1",
          });
        }
      }
    }
  }

  // Shops lining NH66 outside the campus.
  for (let n = -1200; n < 1200; n += 16 + rand() * 10) {
    for (const side of [-1, 1]) {
      const e = nh66(n) + side * (27 + rand() * 4);
      if (campus.some((r) => pointInPoly(e, -n, r))) continue;
      bldg(rect(e, n, 12 + rand() * 5, 10 + rand() * 4, 90), {
        building: "commercial",
        "building:levels": rand() < 0.5 ? "2" : "3",
      });
    }
  }
  node(project(13.004357, 74.794607).map((v, i) => (i ? -v : v)) as P, { amenity: "restaurant", name: "Hotel Sri Durga Punjabi Dhaba" });
  node([nh66(-800) + 30, -800], { name: "Dodda Kopla", place: "neighbourhood" });
  node([nh66(-1000) + 30, -1000], { name: "Thadambail", place: "neighbourhood" });
  node([800, 700], { name: "Srinivasnagar", place: "neighbourhood" });

  way(rect(950, -700, 300, 200, 10), { landuse: "farmland", crop: "rice" }, true);
  way(rect(1000, 450, 260, 260, -5), { landuse: "orchard", trees: "coconut_palms" }, true);
  way(rect(-250, -900, 400, 180, 0), { landuse: "orchard", trees: "coconut_palms" }, true);
  way(rect(-250, 950, 400, 180, 0), { landuse: "orchard", trees: "coconut_palms" }, true);
}

export const FALLBACK_OSM: OsmJson = {
  generator: "nitk-world hand-approximated fallback",
  note: "Approximate layout traced from an OpenStreetMap render, not OpenStreetMap data. See src/data/fallback.ts.",
  elements: els,
};
