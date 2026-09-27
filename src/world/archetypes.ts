/**
 * What the real buildings look like, from photographs of the campus
 * (Wikimedia Commons "Category:National Institute of Technology Karnataka"
 * and the institute's own photos), keyed by OSM name. These set the façade
 * style, wall colour and roof where OSM is silent or wrong (OSM calls SJA
 * blue; it's white render). public/data/overrides.json still wins.
 *
 * - Main Building and the old departments: pale-yellow render with
 *   continuous concrete sunshade ribbons over recessed windows.
 * - Mega Hostel towers: tan frame, cream panels, small grilled windows,
 *   a blue-glass stair core.
 * - Old boys' blocks and girls' hostels: cream plaster, brick-red pilasters,
 *   Mangalore-tile roofs.
 * - LHC-A: exposed laterite with white window frames.
 * - Library, LHC-D, CRF, CIDS, SJA: white render with lavender-grey bands.
 * - Chemical Engineering: cream and mauve, curved entrance canopy.
 */
import type { Building, CampusMap } from "../osm/types";
import type { FacadeStyle } from "./textures";

type Look = { style: FacadeStyle; colour?: string; roofShape?: string; roofColour?: string };

const LOOKS: [RegExp, Look][] = [
  [/^NITK Main Building$/i, { style: "academic", colour: "#ecdfae" }],
  [/^Mega Hostel/i, { style: "megahostel", colour: "#ffffff" }],
  [/^Lecture Hall Complex A$/i, { style: "laterite", colour: "#ffffff" }],
  [/^Department of Chemical Engineering$/i, { style: "modern", colour: "#f4e7d2" }],
  [/Central Library|E-Library|Central Research Facility|Lecture Hall Complex D|Inter-Disciplinary/i, { style: "modern", colour: "#ffffff" }],
  [/^Silver Jubilee Auditorium$/i, { style: "modern", colour: "#f4f2ee" }],
];

function isOldHostel(b: Building): boolean {
  if (!b.name || /mega hostel|international/i.test(b.name)) return false;
  return b.type === "dormitory" || /\bblock\b|^GH-\d|hostel/i.test(b.name);
}

export function applyArchetypes(map: CampusMap) {
  for (const b of map.buildings) {
    if (!b.name) continue;
    const hit = LOOKS.find(([re]) => re.test(b.name!));
    let look = hit?.[1];
    if (!look && isOldHostel(b)) look = { style: "hostel", colour: "#ffffff", roofShape: b.roofShape ?? "hipped", roofColour: "#a9502f" };
    if (!look) continue;
    b.style = look.style;
    if (look.colour) b.colour = look.colour;
    if (look.roofShape) b.roofShape = look.roofShape;
    if (look.roofColour) b.roofColour = look.roofColour;
  }
}
