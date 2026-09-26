import area from "../area.json";

/** Overpass QL for everything the world builder reads, with full geometry. */
export function overpassQuery(): string {
  const b = area.bbox;
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:180];
(
  way["highway"](${bbox});
  way["building"](${bbox});
  relation["building"](${bbox});
  way["building:part"](${bbox});
  way["natural"](${bbox});
  relation["natural"](${bbox});
  way["waterway"](${bbox});
  way["water"](${bbox});
  way["leisure"](${bbox});
  relation["leisure"](${bbox});
  way["landuse"](${bbox});
  relation["landuse"](${bbox});
  way["amenity"](${bbox});
  relation["amenity"](${bbox});
  way["man_made"](${bbox});
  way["barrier"](${bbox});
  way["railway"](${bbox});
  way["place"](${bbox});
  way["tourism"](${bbox});
  node["natural"="tree"](${bbox});
  node["man_made"](${bbox});
  node["amenity"](${bbox});
  node["tourism"](${bbox});
  node["historic"](${bbox});
  node["shop"](${bbox});
  node["leisure"](${bbox});
  node["highway"~"bus_stop|street_lamp|traffic_signals"](${bbox});
  node["name"](${bbox});
);
out geom;`;
}
