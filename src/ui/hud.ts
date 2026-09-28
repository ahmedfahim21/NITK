/**
 * Minimap, the full map, place search, floating labels and the "you are
 * near" banner.
 *
 * The full map (M, or a click on the minimap) is drawn as vectors from the
 * OSM data so it stays sharp at any zoom: north up, every building tinted by
 * what it is, each place with its icon, mission givers and objectives as
 * coloured icon markers, and you. Drag to pan, scroll to zoom, click to
 * teleport.
 */
import * as THREE from "three";
import { pointInPoly } from "../geo";
import type { CampusMap } from "../osm/types";
import type { Place } from "../world";
import type { Player } from "../player";
import { icon, iconImage, iconsReady, type IconId } from "./icons";
import { campusWalls } from "../world/walls";
import { drawMapBase, MAP_STYLE, mapRegion, PLACE_KINDS, placeKind, type PlaceKind, type Region } from "./mapKit";

/** Pixels per metre on the minimap's pre-rendered base. */
const MINI_RES = 1.25;
const MAX_SCALE = 6;
const YOU = "#5ab0ff";

export type Marker = {
  x: number;
  z: number;
  color: string;
  icon?: IconId;
  /** What it is, for the map's list and the tooltip. */
  label?: string;
  /** The current objective gets a white ring and a pulse. */
  objective?: boolean;
};

type MapPlace = Place & { pk: PlaceKind };
type View = { cx: number; cz: number; scale: number };

export class Hud {
  private base: HTMLCanvasElement;
  private mini: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private near = document.getElementById("near")!;
  private labels = document.getElementById("labels")!;
  private labelEls = new Map<string, HTMLDivElement>();
  private mapOverlay = document.getElementById("map-overlay")!;
  private bigMap = document.getElementById("big-map") as HTMLCanvasElement;
  private tip = document.getElementById("map-tip")!;
  private search = document.getElementById("place-search") as HTMLInputElement;
  private list = document.getElementById("place-list")!;
  private openList = document.getElementById("map-open")!;
  private key = document.getElementById("map-key")!;
  private mapOpen = false;
  private tmp = new THREE.Vector3();
  private view: View = { cx: 0, cz: 0, scale: 1 };
  private buildingKinds: (PlaceKind | null)[];
  /** The campus, the beach and the lighthouse hill; nothing else is mapped. */
  private region: Region;
  /** OSM's walls and the generated campus wall, as lines. */
  private walls: [number, number][][];
  private mapPlaces: MapPlace[];
  private hidden = new Set<PlaceKind>();
  /** Each named street once, at the middle of its longest straight run, turned to read along it. */
  private roadLabels: { name: string; x: number; z: number; angle: number; len: number }[];
  private hover: Marker | null = null;
  private lastMarkerKey = "";
  /** Objective and mission-giver blips. */
  markers: Marker[] = [];

  constructor(
    private map: CampusMap,
    private places: Place[],
    private player: Player,
    private camera: THREE.PerspectiveCamera,
    private teleport: (x: number, z: number) => void
  ) {
    const lh = places.find((p) => /lighthouse/i.test(p.name) && p.kind === "landmark") ?? null;
    this.region = mapRegion(map, lh);
    this.walls = [...map.barriers.filter((b) => b.kind === "wall" || b.kind === "fence").map((b) => b.pts), ...campusWalls(map).map((w) => w.pts)];
    this.mapPlaces = places
      .filter((p) => this.region.contains(p.x, p.z))
      .filter((p) => !["neighbourhood", "place", "water_well", "charging_station"].includes(p.kind) || /gym|ground|sports|lhc|lecture|department|health|computer|auditorium/i.test(p.name))
      .map((p) => ({ ...p, pk: placeKind(p.name, p.kind) }));
    const landmarks = places.filter((p) => p.kind === "landmark");
    this.buildingKinds = map.buildings.map((bl) => {
      if (landmarks.some((l) => pointInPoly(l.x, l.z, bl.outer))) return "landmark";
      const name = (bl as { name?: string }).name;
      return name ? placeKind(name, "") : null;
    });
    const byName = new Map<string, { name: string; x: number; z: number; angle: number; len: number }>();
    for (const r of map.roads) {
      if (!r.name || r.kind === "footway" || r.kind === "steps") continue;
      for (let i = 1; i < r.pts.length; i++) {
        const [ax, az] = r.pts[i - 1];
        const [bx, bz] = r.pts[i];
        const x = (ax + bx) / 2;
        const z = (az + bz) / 2;
        const len = Math.hypot(bx - ax, bz - az);
        if (!this.region.contains(x, z) || len <= (byName.get(r.name)?.len ?? 0)) continue;
        let angle = Math.atan2(bz - az, bx - ax);
        // Never upside down.
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        byName.set(r.name, { name: r.name, x, z, angle, len });
      }
    }
    this.roadLabels = [...byName.values()];
    this.base = this.renderBase();
    this.mini = document.getElementById("minimap") as HTMLCanvasElement;
    this.miniCtx = this.mini.getContext("2d")!;
    this.mini.addEventListener("click", () => this.toggleMap());
    document.getElementById("map-close")!.addEventListener("click", () => this.toggleMap(false));
    this.search.addEventListener("input", () => this.fillList());
    this.bindMapInput();
    this.buildTools();
    this.buildKey();
    // Preload every icon the map uses, then redraw once they've decoded.
    for (const k of Object.values(PLACE_KINDS)) iconImage(k.icon);
    void iconsReady().then(() => this.mapOpen && this.drawBig());
    this.fillList();
  }

  get isMapOpen() {
    return this.mapOpen;
  }

  toggleMap(open = !this.mapOpen) {
    this.mapOpen = open;
    this.mapOverlay.classList.toggle("open", open);
    if (open) {
      // Opens on you, a few hundred metres across.
      this.sizeBig();
      this.view = this.clamp({ cx: this.player.pos.x, cz: this.player.pos.z, scale: Math.min(this.bigMap.clientWidth, this.bigMap.clientHeight) / 700 });
      this.search.value = "";
      this.fillList();
      this.fillOpen();
      this.drawBig();
    }
  }

  /* ---------------------------------------------------------------- *
   * Side panel
   * ---------------------------------------------------------------- */

  private buildTools() {
    const tools = document.getElementById("map-tools")!;
    const btn = (ic: IconId, label: string, fn: () => void) => {
      const b = document.createElement("button");
      b.className = "map-tool";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.innerHTML = icon(ic, 18);
      b.addEventListener("click", fn);
      tools.appendChild(b);
    };
    const mid = () => [this.bigMap.clientWidth / 2, this.bigMap.clientHeight / 2] as const;
    btn("search", "Zoom in", () => this.zoomAt(1.4, ...mid()));
    btn("eye", "Zoom out", () => this.zoomAt(1 / 1.4, ...mid()));
    btn("crosshair", "Centre on me", () => this.centre(this.player.pos.x, this.player.pos.z));
    btn("pin", "Whole campus", () => {
      this.view = this.clamp(this.fit());
      this.drawBig();
    });
    // The first two want a plus and a minus, which the set draws as text.
    const [zin, zout] = tools.querySelectorAll<HTMLButtonElement>(".map-tool");
    zin.innerHTML = `<span class="pm">+</span>`;
    zout.innerHTML = `<span class="pm">−</span>`;
  }

  private buildKey() {
    this.key.innerHTML = "";
    const counts = new Map<PlaceKind, number>();
    for (const p of this.mapPlaces) counts.set(p.pk, (counts.get(p.pk) ?? 0) + 1);
    for (const [k, v] of Object.entries(PLACE_KINDS) as [PlaceKind, (typeof PLACE_KINDS)[PlaceKind]][]) {
      const n = counts.get(k);
      if (!n) continue;
      const b = document.createElement("button");
      b.className = "key-item";
      b.title = `Show or hide ${v.label.toLowerCase()}`;
      b.innerHTML = `<span class="dot" style="background:${v.colour}">${icon(v.icon, 12, { color: "#11151d", stroke: 2.4 })}</span>${v.label}<span class="n">${n}</span>`;
      b.addEventListener("click", () => {
        if (this.hidden.has(k)) this.hidden.delete(k);
        else this.hidden.add(k);
        b.classList.toggle("off", this.hidden.has(k));
        this.fillList();
        this.drawBig();
      });
      this.key.appendChild(b);
    }
  }

  /** The markers on the map right now, as a list you can click to find. */
  private fillOpen() {
    const ms = this.markers.filter((m) => m.label);
    this.openList.style.display = ms.length ? "" : "none";
    this.openList.innerHTML = ms.length ? `<div class="cap">${ms.some((m) => m.objective) ? "Objective" : "Open now"}</div>` : "";
    for (const m of ms) {
      const b = document.createElement("button");
      b.className = "place";
      b.innerHTML = `<span class="dot" style="background:${m.color}">${icon(m.icon ?? "star", 12, { color: "#11151d", stroke: 2.4 })}</span><span class="nm">${m.label}</span>`;
      b.addEventListener("click", () => this.centre(m.x, m.z, 2.2));
      this.openList.appendChild(b);
    }
  }

  private fillList() {
    const q = this.search.value.trim().toLowerCase();
    const items = this.mapPlaces
      .filter((p) => !this.hidden.has(p.pk) && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 200);
    this.list.innerHTML = "";
    for (const p of items) {
      const k = PLACE_KINDS[p.pk];
      const li = document.createElement("button");
      li.className = "place";
      li.innerHTML = `<span class="ico" style="color:${k.colour}">${icon(k.icon, 15)}</span><span class="nm">${p.name}</span>`;
      li.title = "Teleport here";
      li.addEventListener("click", () => {
        this.teleport(p.x, p.z);
        this.toggleMap(false);
      });
      this.list.appendChild(li);
    }
    if (!items.length) this.list.innerHTML = `<div class="empty">No places match</div>`;
  }

  /* ---------------------------------------------------------------- *
   * The full map: view, input, drawing
   * ---------------------------------------------------------------- */

  private sizeBig() {
    const dpr = Math.min(devicePixelRatio, 2);
    this.bigMap.width = Math.round(this.bigMap.clientWidth * dpr);
    this.bigMap.height = Math.round(this.bigMap.clientHeight * dpr);
  }

  private fit(): View {
    const b = this.region.bounds;
    const w = this.bigMap.clientWidth;
    const h = this.bigMap.clientHeight;
    return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, scale: Math.min(w / (b.maxX - b.minX), h / (b.maxZ - b.minZ)) };
  }

  private clamp(v: View): View {
    const b = this.region.bounds;
    const w = this.bigMap.clientWidth;
    const h = this.bigMap.clientHeight;
    const scale = Math.min(MAX_SCALE, Math.max(this.fit().scale, v.scale));
    const mx = Math.max(0, (b.maxX - b.minX) / 2 - w / 2 / scale);
    const mz = Math.max(0, (b.maxZ - b.minZ) / 2 - h / 2 / scale);
    const ox = (b.minX + b.maxX) / 2;
    const oz = (b.minZ + b.maxZ) / 2;
    return { scale, cx: Math.max(ox - mx, Math.min(ox + mx, v.cx)), cz: Math.max(oz - mz, Math.min(oz + mz, v.cz)) };
  }

  private centre(x: number, z: number, minScale = 0) {
    this.view = this.clamp({ cx: x, cz: z, scale: Math.max(this.view.scale, minScale) });
    this.drawBig();
  }

  private toWorld(sx: number, sy: number): [number, number] {
    const v = this.view;
    return [v.cx + (sx - this.bigMap.clientWidth / 2) / v.scale, v.cz + (sy - this.bigMap.clientHeight / 2) / v.scale];
  }

  private zoomAt(f: number, sx: number, sy: number) {
    const [wx, wz] = this.toWorld(sx, sy);
    const scale = this.clamp({ ...this.view, scale: this.view.scale * f }).scale;
    const w = this.bigMap.clientWidth;
    const h = this.bigMap.clientHeight;
    this.view = this.clamp({ scale, cx: wx - (sx - w / 2) / scale, cz: wz - (sy - h / 2) / scale });
    this.drawBig();
  }

  private bindMapInput() {
    const c = this.bigMap;
    const drag = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch: number | null = null;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoomAt(Math.exp(-e.deltaY * 0.0015), ...local(e));
    }, { passive: false });
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      drag.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (drag.size === 2) {
        const [a, b] = [...drag.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    c.addEventListener("pointermove", (e) => {
      const p = drag.get(e.pointerId);
      if (!p) {
        // Hover: which marker is under the pointer.
        const [wx, wz] = this.toWorld(...local(e));
        const hit = this.markers.find((m) => Math.hypot(m.x - wx, m.z - wz) * this.view.scale < 16) ?? null;
        if (hit !== this.hover) {
          this.hover = hit;
          this.tip.style.display = hit?.label ? "flex" : "none";
          if (hit?.label) this.tip.innerHTML = `<span class="dot" style="background:${hit.color}">${icon(hit.icon ?? "star", 12, { color: "#11151d", stroke: 2.4 })}</span>${hit.label}`;
          this.drawBig();
        }
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      moved += Math.abs(dx) + Math.abs(dy);
      p.x = e.clientX;
      p.y = e.clientY;
      if (drag.size === 2 && pinch) {
        const [a, b] = [...drag.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = c.getBoundingClientRect();
        this.zoomAt(d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        pinch = d;
        return;
      }
      this.view = this.clamp({ ...this.view, cx: this.view.cx - dx / this.view.scale, cz: this.view.cz - dy / this.view.scale });
      this.drawBig();
    });
    const up = (e: PointerEvent) => {
      const wasOne = drag.size === 1;
      drag.delete(e.pointerId);
      if (drag.size < 2) pinch = null;
      // A click, not a drag: teleport there.
      if (e.type === "pointerup" && wasOne && moved < 6) {
        const [wx, wz] = this.toWorld(...local(e));
        this.teleport(wx, wz);
        this.toggleMap(false);
      }
    };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("dblclick", (e) => this.zoomAt(1.8, ...local(e)));
    window.addEventListener("resize", () => {
      if (!this.mapOpen) return;
      this.sizeBig();
      this.view = this.clamp(this.view);
      this.drawBig();
    });
  }

  private drawBig() {
    const c = this.bigMap;
    const g = c.getContext("2d")!;
    const w = c.clientWidth;
    const h = c.clientHeight;
    const dpr = c.width / Math.max(1, w);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { cx, cz, scale } = this.view;
    const X = (x: number) => w / 2 + (x - cx) * scale;
    const Z = (z: number) => h / 2 + (z - cz) * scale;

    g.fillStyle = MAP_STYLE.outside;
    g.fillRect(0, 0, w, h);
    g.save();
    g.beginPath();
    this.region.trace(g, X, Z);
    g.clip("nonzero");
    drawMapBase(g, this.map, X, Z, scale, (i) => {
      const k = this.buildingKinds[i];
      return k && !this.hidden.has(k) ? k : null;
    }, this.walls);
    g.restore();
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.hypot(w, h) / 2);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, MAP_STYLE.vignette);
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    // Markers and you claim their space first, so no name sits under one.
    const taken: { x: number; y: number; w: number; h: number }[] = [
      ...this.markers.map((m) => ({ x: X(m.x), y: Z(m.z), w: 30, h: 30 })),
      { x: X(this.player.pos.x), y: Z(this.player.pos.z), w: 32, h: 32 },
    ];
    const free = (x: number, y: number, bw: number, bh: number) => !taken.some((t) => Math.abs(t.x - x) < (t.w + bw) / 2 && Math.abs(t.y - y) < (t.h + bh) / 2);

    // Places: a small icon disc each, landmarks first; names as there's room.
    g.textBaseline = "middle";
    g.lineJoin = "round";
    const order = [...this.mapPlaces].sort((a, b) => (a.pk === "landmark" ? 0 : 1) - (b.pk === "landmark" ? 0 : 1));
    const r = scale > 1.4 ? 9 : 7;
    for (const p of order) {
      if (this.hidden.has(p.pk)) continue;
      const px = X(p.x);
      const py = Z(p.z);
      if (px < -60 || py < -20 || px > w + 60 || py > h + 20) continue;
      if (!free(px, py, r * 2 + 2, r * 2 + 2)) continue;
      taken.push({ x: px, y: py, w: r * 2 + 2, h: r * 2 + 2 });
      const k = PLACE_KINDS[p.pk];
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.beginPath();
      g.arc(px + 1, py + 1.5, r + 1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = k.colour;
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
      const img = iconImage(k.icon, "#11151d");
      if (img) g.drawImage(img, px - r * 0.62, py - r * 0.62, r * 1.24, r * 1.24);
      // Names: landmarks always, the rest once you've zoomed in.
      if (p.pk !== "landmark" && scale < 1.6) continue;
      const fs = p.pk === "landmark" ? 14 : 12;
      g.font = `400 ${fs}px 'Barlow Condensed', system-ui, sans-serif`;
      const tw = g.measureText(p.name).width;
      const tx = px + r + 4;
      if (!free(tx + tw / 2, py, tw, fs + 2)) continue;
      taken.push({ x: tx + tw / 2, y: py, w: tw, h: fs + 2 });
      g.textAlign = "left";
      g.lineWidth = 3.5;
      g.strokeStyle = "rgba(12,14,18,0.92)";
      g.strokeText(p.name, tx, py);
      g.fillStyle = p.pk === "landmark" ? "#f3d27a" : "#dfe5ec";
      g.fillText(p.name, tx, py);
    }

    // Street names along their streets, once zoomed in, where there's room.
    if (scale >= 1.5) {
      g.textAlign = "center";
      g.font = "400 12px 'Noto Sans', system-ui, sans-serif";
      for (const lb of this.roadLabels) {
        const px = X(lb.x);
        const py = Z(lb.z);
        if (px < -60 || py < -60 || px > w + 60 || py > h + 60) continue;
        const tw = g.measureText(lb.name).width;
        if (tw > lb.len * scale) continue;
        const bw = Math.abs(Math.cos(lb.angle)) * tw + Math.abs(Math.sin(lb.angle)) * 12;
        const bh = Math.abs(Math.sin(lb.angle)) * tw + Math.abs(Math.cos(lb.angle)) * 12;
        if (!free(px, py, bw, bh)) continue;
        taken.push({ x: px, y: py, w: bw, h: bh });
        g.save();
        g.translate(px, py);
        g.rotate(lb.angle);
        g.lineWidth = 3.5;
        g.strokeStyle = "rgba(12,14,18,0.9)";
        g.strokeText(lb.name, 0, 0);
        g.fillStyle = "#cfd6de";
        g.fillText(lb.name, 0, 0);
        g.restore();
      }
    }

    // Markers: a coloured disc with its icon, a white ring for the objective.
    for (const m of this.markers) {
      const px = X(m.x);
      const py = Z(m.z);
      const on = m === this.hover || m.objective;
      if (m.objective) {
        g.fillStyle = "rgba(255,255,255,0.14)";
        g.beginPath();
        g.arc(px, py, 22, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.beginPath();
      g.arc(px + 1.5, py + 2, 14, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = m.color;
      g.beginPath();
      g.arc(px, py, 13, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = on ? "#ffffff" : "rgba(255,255,255,0.6)";
      g.lineWidth = on ? 2.5 : 1.5;
      g.stroke();
      const img = iconImage(m.icon ?? "star", "#11151d");
      if (img) g.drawImage(img, px - 8, py - 8, 16, 16);
    }

    // You: an arrow the way you face, in a soft halo.
    this.drawYou(g, X(this.player.pos.x), Z(this.player.pos.z), -this.player.facing + Math.PI, 1);
  }

  private drawYou(g: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number) {
    g.save();
    g.translate(x, y);
    g.fillStyle = "rgba(90,176,255,0.22)";
    g.beginPath();
    g.arc(0, 0, 20 * s, 0, Math.PI * 2);
    g.fill();
    g.rotate(rot);
    g.fillStyle = YOU;
    g.strokeStyle = "#ffffff";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -12 * s);
    g.lineTo(-8 * s, 9 * s);
    g.lineTo(0, 5 * s);
    g.lineTo(8 * s, 9 * s);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  private renderBase(): HTMLCanvasElement {
    const b = this.map.bounds;
    const c = document.createElement("canvas");
    c.width = Math.ceil((b.maxX - b.minX) * MINI_RES);
    c.height = Math.ceil((b.maxZ - b.minZ) * MINI_RES);
    const g = c.getContext("2d")!;
    const X = (x: number) => (x - b.minX) * MINI_RES;
    const Z = (z: number) => (z - b.minZ) * MINI_RES;
    g.fillStyle = MAP_STYLE.outside;
    g.fillRect(0, 0, c.width, c.height);
    g.save();
    g.beginPath();
    this.region.trace(g, X, Z);
    g.clip("nonzero");
    drawMapBase(g, this.map, X, Z, MINI_RES, (i) => this.buildingKinds[i], this.walls);
    g.restore();
    return c;
  }

  update() {
    this.drawMini();
    this.updateNear();
    this.updateLabels();
    if (this.mapOpen) {
      // The side list follows the markers; the map redraws for you and them.
      const key = this.markers.map((m) => `${m.label}|${Math.round(m.x)}|${Math.round(m.z)}`).join(";");
      if (key !== this.lastMarkerKey) {
        this.lastMarkerKey = key;
        this.fillOpen();
      }
      this.drawBig();
    }
  }

  /* ---------------------------------------------------------------- *
   * Minimap
   * ---------------------------------------------------------------- */

  private drawMini() {
    const ctx = this.miniCtx;
    const S = this.mini.width;
    const b = this.map.bounds;
    const zoom = this.player.drone ? 0.9 : 2.2;
    ctx.save();
    ctx.fillStyle = MAP_STYLE.outside;
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(this.player.yaw);
    ctx.scale(zoom / MINI_RES, zoom / MINI_RES);
    ctx.drawImage(this.base, -(this.player.pos.x - b.minX) * MINI_RES, -(this.player.pos.z - b.minZ) * MINI_RES);
    ctx.restore();
    // You, with a soft view cone (camera-up frame).
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(this.player.yaw + Math.PI - this.player.facing);
    const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, 46);
    cone.addColorStop(0, "rgba(90,176,255,0.35)");
    cone.addColorStop(1, "rgba(90,176,255,0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 46, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    this.drawYou(ctx, S / 2, S / 2, this.player.yaw + Math.PI - this.player.facing, 0.9);
    // Blips with their icons, pinned to the rim when out of range.
    const c = Math.cos(this.player.yaw);
    const s = Math.sin(this.player.yaw);
    for (const m of this.markers) {
      const dx = (m.x - this.player.pos.x) * zoom;
      const dz = (m.z - this.player.pos.z) * zoom;
      let sx = dx * c - dz * s;
      let sy = dx * s + dz * c;
      const lim = S / 2 - 16;
      const l = Math.hypot(sx, sy);
      const pinned = l > lim;
      if (pinned) {
        sx *= lim / l;
        sy *= lim / l;
      }
      const x = S / 2 + sx;
      const y = S / 2 + sy;
      if (pinned || m.objective) {
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = m.color;
      ctx.strokeStyle = "#11151d";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const img = iconImage(m.icon ?? "star", "#11151d");
      if (img) ctx.drawImage(img, x - 6.5, y - 6.5, 13, 13);
    }
    // North on the rim.
    const r = S / 2 - 12;
    const nx = S / 2 + Math.sin(this.player.yaw) * r;
    const ny = S / 2 - Math.cos(this.player.yaw) * r;
    ctx.fillStyle = "rgba(15,19,28,0.85)";
    ctx.beginPath();
    ctx.arc(nx, ny, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2b84b";
    ctx.font = "500 14px 'Barlow Condensed', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", nx, ny + 1);
  }

  /* ---------------------------------------------------------------- *
   * In the world
   * ---------------------------------------------------------------- */

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
      const k = best && best.name === text ? PLACE_KINDS[placeKind(best.name, best.kind)] : null;
      this.near.innerHTML = k ? `<span class="ico" style="color:${k.colour}">${icon(k.icon, 15)}</span>${text}` : text;
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
    // Only what you're next to gets a label: the nearest couple on foot, a few more from the drone.
    const range = this.player.drone ? 160 : 34;
    const cand = this.places
      .filter((pl) => pl.kind === "building" || pl.kind === "landmark" || pl.kind === "pitch" || pl.kind === "track")
      .map((pl) => ({ pl, d: Math.hypot(pl.x - p.x, pl.z - p.z) }))
      .filter((c) => c.d < range)
      .sort((a, b) => a.d - b.d)
      .slice(0, this.player.drone ? 5 : 2);
    const keep = new Set<string>();
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const { pl, d } of cand) {
      this.tmp.set(pl.x, pl.y, pl.z).project(this.camera);
      if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.1 || Math.abs(this.tmp.y) > 1.1) continue;
      keep.add(pl.name);
      let el = this.labelEls.get(pl.name);
      if (!el) {
        const k = PLACE_KINDS[placeKind(pl.name, pl.kind)];
        el = document.createElement("div");
        el.className = "label";
        el.innerHTML = `<span class="ico" style="color:${k.colour}">${icon(k.icon, 13)}</span>${pl.name}`;
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
