import type { Pt } from "../geo";

/** Raw Overpass `out geom` JSON. */
export type Tags = Record<string, string>;
export type LatLon = { lat: number; lon: number };
export type OsmNode = { type: "node"; id: number; lat: number; lon: number; tags?: Tags };
export type OsmWay = { type: "way"; id: number; nodes?: number[]; geometry?: LatLon[]; tags?: Tags };
export type OsmRelation = {
  type: "relation";
  id: number;
  tags?: Tags;
  members: { type: string; ref: number; role: string; geometry?: LatLon[] }[];
};
export type OsmElement = OsmNode | OsmWay | OsmRelation;
export type OsmJson = { elements: OsmElement[]; generator?: string; osm3s?: unknown; note?: string };

export type RoadKind =
  | "trunk"
  | "primary"
  | "secondary"
  | "tertiary"
  | "residential"
  | "service"
  | "track"
  | "pedestrian"
  | "footway"
  | "cycleway"
  | "steps";

export type Road = {
  id: number;
  pts: Pt[];
  kind: RoadKind;
  width: number;
  name?: string;
  oneway: boolean;
  /** Higher draws on top where roads overlap. */
  rank: number;
  bridge: boolean;
};

export type AreaKind =
  | "campus"
  | "residential"
  | "commercial"
  | "grass"
  | "park"
  | "garden"
  | "forest"
  | "scrub"
  | "farmland"
  | "wetland"
  | "water"
  | "pool"
  | "sand"
  | "rock"
  | "pitch"
  | "track"
  | "parking"
  | "plaza"
  | "dirt";

export type Area = {
  id: number;
  outer: Pt[];
  holes: Pt[][];
  kind: AreaKind;
  name?: string;
  sport?: string;
  /** Selected raw tags (amenity, theatre:type) for landmark matching. */
  tags?: Tags;
  /** What grows there, for wooded areas. */
  leaf?: "palm" | "needle" | "broad";
};

export type Building = {
  id: number;
  /** OSM element type, for links and override keys. */
  osmType: "way" | "relation";
  outer: Pt[];
  holes: Pt[][];
  /** Wall top, metres above ground. */
  height: number;
  /** Bottom of the walls (for roofs on pillars, overhangs). */
  minHeight: number;
  levels: number;
  name?: string;
  type: string;
  roofShape?: string;
  colour?: string;
  roofColour?: string;
  /** Inside the NITK campus boundary. */
  campus: boolean;
  /** Façade style forced by an override (see world/overrides.ts). */
  style?: string;
  /** Hidden by an override (e.g. replaced by a custom model). */
  hidden?: boolean;
  area: number;
  tags: Tags;
};

export type Tree = { x: number; z: number; kind: "palm" | "broad" | "casuarina" };

export type Poi = { x: number; z: number; name: string; kind: string; tags: Tags };

export type Barrier = { pts: Pt[]; kind: "wall" | "fence" | "hedge" | "gate" };

export type Waterway = { pts: Pt[]; width: number };

export type MapSource = "snapshot" | "live" | "fallback";

export type CampusMap = {
  source: MapSource;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  roads: Road[];
  areas: Area[];
  buildings: Building[];
  trees: Tree[];
  pois: Poi[];
  barriers: Barrier[];
  waterways: Waterway[];
  /** Sea polygon(s) over an enlarged box that runs to the horizon. */
  sea: Pt[][];
  /** Land polygon(s) over the same enlarged box (complement of sea). */
  land: Pt[][];
  /** Coastline polylines inside the enlarged box. */
  coast: Pt[][];
  /** The NITK campus outline(s), from amenity=university. */
  campus: Pt[][];
  lighthouse?: Pt;
};
