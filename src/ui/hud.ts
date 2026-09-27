/**
 * Minimap, full map with teleport, place search, floating labels and the
 * "you are near" banner.
 */
import * as THREE from "three";
import { pointInPoly } from "../geo";
import type { AreaKind, CampusMap, RoadKind } from "../osm/types";
import type { Place } from "../world";
import type { Player } from "../player";

const AREA_FILL: Partial<Record<AreaKind, string>> = {
  campus: "#e8e4c8",
  residential: "#e6e0d0",
  commercial: "#eadbd0",
  grass: "#c5e3a2",
  park: "#bfe0a0",
  garden: "#b9dc99",
  forest: "#9fcb86",
  scrub: "#c3d7a0",
  farmland: "#e3edb8",
  wetland: "#bcd9c9",
  water: "#9fd0ea",
  pool: "#9fd6f0",
  sand: "#f3e5bf",
  rock: "#d4b3a1",
  pitch: "#93cf8b",
  track: "#e0a08a",
  parking: "#dcdcdc",
  plaza: "#ece6da",
  dirt: "#e3cdb2",
};

const ROAD_FILL: Record<RoadKind, string> = {
  trunk: "#e8927c",
  primary: "#f4c27a",
  secondary: "#f6d78f",
  tertiary: "#fffbe6",
  residential: "#ffffff",
  service: "#ffffff",
  track: "#c9a27e",
  pedestrian: "#eeeeee",
  footway: "#f08a72",
  cycleway: "#7a9cf0",
  steps: "#f08a72",
};

const SCALE = 0.75; // px per metre on the base map

export class Hud {
  private base: HTMLCanvasElement;
  private mini: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private near = document.getElementById("near")!;
  private labels = document.getElementById("labels")!;
  private labelEls = new Map<string, HTMLDivElement>();
  private mapOverlay = document.getElementById("map-overlay")!;
  private bigMap = document.getElementById("big-map") as HTMLCanvasElement;
  private search = document.getElementById("place-search") as HTMLInputElement;
  private list = document.getElementById("place-list")!;
  private mapOpen = false;
  private tmp = new THREE.Vector3();
  private bigView = { scale: 1, ox: 0, oz: 0 };
  /** Objective and mission-giver blips. */
  markers: { x: number; z: number; color: string }[] = [];

  constructor(
    private map: CampusMap,
    private places: Place[],
    private player: Player,
    private camera: THREE.PerspectiveCamera,
    private teleport: (x: number, z: number) => void
  ) {
    this.base = this.renderBase();
    this.mini = document.getElementById("minimap") as HTMLCanvasElement;
    this.miniCtx = this.mini.getContext("2d")!;
    this.mini.addEventListener("click", () => this.toggleMap());
    document.getElementById("map-close")!.addEventListener("click", () => this.toggleMap(false));
    this.bigMap.addEventListener("click", (e) => {
      const r = this.bigMap.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * this.bigMap.width;
      const py = ((e.clientY - r.top) / r.height) * this.bigMap.height;
      const x = px / this.bigView.scale + this.bigView.ox;
      const z = py / this.bigView.scale + this.bigView.oz;
      this.teleport(x, z);
      this.toggleMap(false);
    });
    this.search.addEventListener("input", () => this.fillList());
    this.fillList();
  }

  get isMapOpen() {
    return this.mapOpen;
  }

  toggleMap(open = !this.mapOpen) {
    this.mapOpen = open;
    this.mapOverlay.classList.toggle("open", open);
    if (open) {
      this.drawBig();
      this.search.value = "";
      this.fillList();
    }
  }

  private fillList() {
    const q = this.search.value.trim().toLowerCase();
    const items = this.places
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 200);
    this.list.innerHTML = "";
    for (const p of items) {
      const li = document.createElement("button");
      li.className = "place";
      li.textContent = p.name;
      li.addEventListener("click", () => {
        this.teleport(p.x, p.z);
        this.toggleMap(false);
      });
      this.list.appendChild(li);
    }
  }

  private renderBase(): HTMLCanvasElement {
    const b = this.map.bounds;
    const c = document.createElement("canvas");
    c.width = Math.ceil((b.maxX - b.minX) * SCALE);
    c.height = Math.ceil((b.maxZ - b.minZ) * SCALE);
    const ctx = c.getContext("2d")!;
    const tx = (x: number) => (x - b.minX) * SCALE;
    const tz = (z: number) => (z - b.minZ) * SCALE;
    const poly = (rings: [number, number][][]) => {
      ctx.beginPath();
      for (const r of rings) {
        r.forEach(([x, z], i) => (i ? ctx.lineTo(tx(x), tz(z)) : ctx.moveTo(tx(x), tz(z))));
        ctx.closePath();
      }
    };
    ctx.fillStyle = "#f2efe6";
    ctx.fillRect(0, 0, c.width, c.height);
    const order: AreaKind[] = ["campus", "residential", "commercial", "farmland", "dirt", "grass", "park", "scrub", "garden", "forest", "wetland", "sand", "rock", "track", "pitch", "parking", "plaza", "water", "pool"];
    for (const k of order) {
      ctx.fillStyle = AREA_FILL[k] ?? "#eee";
      for (const a of this.map.areas) {
        if (a.kind !== k) continue;
        poly([a.outer, ...a.holes]);
        ctx.fill("evenodd");
      }
    }
    ctx.fillStyle = "#aad3df";
    for (const s of this.map.sea) {
      poly([s]);
      ctx.fill();
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const roads = [...this.map.roads].sort((p, q) => p.rank - q.rank);
    for (const pass of [0, 1]) {
      for (const r of roads) {
        const path = r.kind === "footway" || r.kind === "steps" || r.kind === "cycleway";
        if (path && pass === 0) continue;
        ctx.strokeStyle = pass === 0 ? "#b7ada0" : ROAD_FILL[r.kind];
        ctx.lineWidth = Math.max(path ? 1 : 2, r.width * SCALE) + (pass === 0 ? 2 : 0);
        if (path) ctx.setLineDash([3, 2]);
        ctx.beginPath();
        r.pts.forEach(([x, z], i) => (i ? ctx.lineTo(tx(x), tz(z)) : ctx.moveTo(tx(x), tz(z))));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    for (const bl of this.map.buildings) {
      ctx.fillStyle = bl.campus ? "#c9a38b" : "#d9d0c9";
      poly([bl.outer, ...bl.holes]);
      ctx.fill("evenodd");
      ctx.strokeStyle = bl.campus ? "#a7806a" : "#c4b9b0";
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    return c;
  }

  private drawBig() {
    const W = (this.bigMap.width = this.bigMap.clientWidth * devicePixelRatio);
    const H = (this.bigMap.height = this.bigMap.clientHeight * devicePixelRatio);
    const ctx = this.bigMap.getContext("2d")!;
    const b = this.map.bounds;
    // Fit the campus (not the whole square) comfortably.
    const scale = Math.min(W / (b.maxX - b.minX), H / (b.maxZ - b.minZ));
    this.bigView = { scale, ox: b.minX - (W / scale - (b.maxX - b.minX)) / 2, oz: b.minZ - (H / scale - (b.maxZ - b.minZ)) / 2 };
    ctx.fillStyle = "#aad3df";
    ctx.fillRect(0, 0, W, H);
    const v = this.bigView;
    ctx.drawImage(this.base, (b.minX - v.ox) * scale, (b.minZ - v.oz) * scale, (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
    ctx.font = `${Math.round(11 * devicePixelRatio)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    for (const p of this.places) {
      if (p.kind !== "landmark" && p.kind !== "building" && p.kind !== "pitch" && p.kind !== "track") continue;
      const x = (p.x - v.ox) * scale;
      const y = (p.z - v.oz) * scale;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.strokeText(p.name, x, y);
      ctx.fillStyle = p.kind === "landmark" ? "#7a2e1d" : "#333";
      ctx.fillText(p.name, x, y);
    }
    for (const m of this.markers) {
      ctx.fillStyle = m.color;
      ctx.strokeStyle = "#1b1f2a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc((m.x - v.ox) * scale, (m.z - v.oz) * scale, 9 * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const px = (this.player.pos.x - v.ox) * scale;
    const py = (this.player.pos.z - v.oz) * scale;
    ctx.fillStyle = "#e74c3c";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, py, 7 * devicePixelRatio, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  update() {
    this.drawMini();
    this.updateNear();
    this.updateLabels();
  }

  private drawMini() {
    const ctx = this.miniCtx;
    const S = this.mini.width;
    const b = this.map.bounds;
    const zoom = this.player.drone ? 0.9 : 2.2;
    ctx.save();
    ctx.fillStyle = "#aad3df";
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(this.player.yaw);
    ctx.scale(zoom / SCALE, zoom / SCALE);
    ctx.drawImage(this.base, -(this.player.pos.x - b.minX) * SCALE, -(this.player.pos.z - b.minZ) * SCALE);
    ctx.restore();
    // Player arrow (camera-up frame).
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(this.player.yaw + Math.PI - this.player.facing);
    ctx.fillStyle = "#e74c3c";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // Objective blips, pinned to the rim when out of range.
    for (const m of this.markers) {
      const dx = (m.x - this.player.pos.x) * zoom;
      const dz = (m.z - this.player.pos.z) * zoom;
      const c = Math.cos(this.player.yaw);
      const s = Math.sin(this.player.yaw);
      let sx = dx * c - dz * s;
      let sy = dx * s + dz * c;
      const lim = S / 2 - 16;
      const l = Math.hypot(sx, sy);
      if (l > lim) {
        sx *= lim / l;
        sy *= lim / l;
      }
      ctx.fillStyle = m.color;
      ctx.strokeStyle = "#1b1f2a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(S / 2 + sx, S / 2 + sy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1b1f2a";
      ctx.font = "900 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", S / 2 + sx, S / 2 + sy + 1);
    }
    // North marker on the rim.
    const r = S / 2 - 12;
    const nx = S / 2 + Math.sin(this.player.yaw) * r;
    const ny = S / 2 - Math.cos(this.player.yaw) * r;
    ctx.fillStyle = "#1d3557";
    ctx.beginPath();
    ctx.arc(nx, ny, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", nx, ny + 1);
  }

  private lastNear = "";
  private updateNear() {
    const p = this.player.pos;
    let best: Place | null = null;
    let bestD = 60;
    for (const pl of this.places) {
      if (pl.kind === "neighbourhood") continue;
      const d = Math.hypot(pl.x - p.x, pl.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = pl;
      }
    }
    let text = best ? best.name : "";
    if (!text) {
      const area = this.map.areas.find((a) => a.name && pointInPoly(p.x, p.z, a.outer));
      if (area) text = area.name!;
    }
    if (!text) {
      const inCampus = this.map.campus.some((c) => pointInPoly(p.x, p.z, c));
      text = inCampus ? "NITK Campus" : this.nearestNeighbourhood();
    }
    if (text !== this.lastNear) {
      this.lastNear = text;
      this.near.textContent = text;
      this.near.classList.remove("pulse");
      void this.near.offsetWidth;
      this.near.classList.add("pulse");
    }
  }

  private nearestNeighbourhood(): string {
    const p = this.player.pos;
    let best = "Surathkal";
    let bestD = Infinity;
    for (const pl of this.places) {
      if (pl.kind !== "neighbourhood" && pl.kind !== "place") continue;
      const d = Math.hypot(pl.x - p.x, pl.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = pl.name;
      }
    }
    return best;
  }

  private updateLabels() {
    const p = this.player.pos;
    const range = this.player.drone ? 700 : 160;
    const cand = this.places
      .filter((pl) => pl.kind === "building" || pl.kind === "landmark" || pl.kind === "pitch" || pl.kind === "track")
      .map((pl) => ({ pl, d: Math.hypot(pl.x - p.x, pl.z - p.z) }))
      .filter((c) => c.d < range)
      .sort((a, b) => a.d - b.d)
      .slice(0, 16);
    const keep = new Set<string>();
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const { pl, d } of cand) {
      this.tmp.set(pl.x, pl.y, pl.z).project(this.camera);
      if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.1 || Math.abs(this.tmp.y) > 1.1) continue;
      keep.add(pl.name);
      let el = this.labelEls.get(pl.name);
      if (!el) {
        el = document.createElement("div");
        el.className = "label";
        el.textContent = pl.name;
        this.labels.appendChild(el);
        this.labelEls.set(pl.name, el);
      }
      el.style.transform = `translate(${((this.tmp.x + 1) / 2) * W}px, ${((1 - this.tmp.y) / 2) * H}px) translate(-50%, -100%)`;
      el.style.opacity = String(Math.max(0, Math.min(1, (range - d) / (range * 0.3))));
    }
    for (const [name, el] of this.labelEls) {
      if (!keep.has(name)) {
        el.remove();
        this.labelEls.delete(name);
      }
    }
  }
}
