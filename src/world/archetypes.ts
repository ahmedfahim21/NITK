/**
 * What the real buildings look like, from photographs of the campus
 * (Wikimedia Commons "Category:National Institute of Technology Karnataka",
 * the institute's own photos and its virtual tour, vtour.nitk.ac.in),
 * keyed by OSM name. These set the façade style, wall colour and roof where
 * OSM is silent or wrong (OSM calls SJA blue; it's white render).
 * public/data/overrides.json still wins.
 *
 * - Main Building and the old departments: khaki-yellow render with
 *   continuous concrete sunshade ribbons over recessed windows; the Main
 *   Building's wings add vertical fins, an egg-crate front.
 * - Mega Hostel towers: tan frame, cream panels, small grilled windows,
 *   a blue-glass stair core.
 * - Old boys' blocks and girls' hostels: khaki render, sunshade ledges,
 *   louvred windows; flat roofs unless OSM says pitched (blocks 1-5).
 * - LHC-A: exposed laterite with white window frames.
 * - Library, LHC-D, CRF, CIDS, SJA: white render with lavender-grey bands.
 * - Chemical Engineering: cream and mauve, curved entrance canopy.
 * - EEE/IT and the International Hostel: saturated yellow, blue-glass stair
 *   strips, green portal porch.
 */
import type { Building, CampusMap } from "../osm/types";
import type { FacadeStyle } from "./textures";

type Look = { style: FacadeStyle; colour?: string; roofShape?: string; roofColour?: string; fins?: boolean };

const LOOKS: [RegExp, Look][] = [
  [/^NITK Main Building$/i, { style: "academic", colour: "#d9cd8a", fins: true }],
  [/^Mega Hostel/i, { style: "megahostel", colour: "#ffffff" }],
  [/^Lecture Hall Complex A$/i, { style: "laterite", colour: "#ffffff" }],
  [/^Department of Chemical Engineering$/i, { style: "modern", colour: "#f4e7d2" }],
  [/Central Library|E-Library|Central Research Facility|Lecture Hall Complex D|Inter-Disciplinary/i, { style: "modern", colour: "#ffffff" }],
  [/^Silver Jubilee Auditorium$/i, { style: "modern", colour: "#f4f2ee" }],
  // The tour's EEE/IT blocks and the International Hostel: saturated yellow.
  [/Electrical and Electronics|Information Technology/i, { style: "academic", colour: "#e4cf55" }],
  [/^International Students Hostel$/i, { style: "hostel", colour: "#e8d35e" }],
];

/** Hostel khakis, from the tour's 7th Block and girls' blocks. */
const HOSTEL_PAINT = ["#e2d39a", "#e6d9a8", "#dccb8c"];

function isOldHostel(b: Building): boolean {
  if (!b.name || /mega hostel|international/i.test(b.name)) return false;
  return b.type === "dormitory" || /\bblock\b|^GH-\d|hostel/i.test(b.name);
}

export function applyArchetypes(map: CampusMap) {
  for (const b of map.buildings) {
    if (!b.name) continue;
    const hit = LOOKS.find(([re]) => re.test(b.name!));
    let look = hit?.[1];
    if (!look && isOldHostel(b)) look = { style: "hostel", colour: HOSTEL_PAINT[b.id % HOSTEL_PAINT.length], roofColour: "#a9502f" };
    if (!look) continue;
    b.style = look.style;
    if (look.colour) b.colour = look.colour;
    if (look.roofShape) b.roofShape = look.roofShape;
    if (look.roofColour) b.roofColour = look.roofColour;
    if (look.fins) b.fins = true;
  }
}
