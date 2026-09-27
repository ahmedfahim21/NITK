/**
 * The asset workbench (Explore mode): click any building to see what OSM
 * knows about it, edit how it's built, drop a .glb on it, and export the
 * result as public/data/overrides.json. The Coverage tab lists what's still
 * missing on the map so there's always a next thing to fix.
 */
import * as THREE from "three";
import { centroid, orientedBox, pointInPoly, distToSeg } from "../geo";
import type { Building, CampusMap } from "../osm/types";
import type { World } from "../world";
import type { Player } from "../player";
import { styleFor, STYLES } from "../world/buildings";
import {
  applyOverride,
  clearLocal,
  exportJson,
  localEdits,
  merged,
  original,
  osmKey,
  setLocal,
  applyOverrides,
  type BuildingOverride,
} from "../world/overrides";
import { modelLength } from "../world/models";

const CSS = `
#wb { position: fixed; top: 92px; left: 14px; width: 330px; max-height: calc(100vh - 110px); overflow: auto; padding: 10px 12px; font-size: 12px; z-index: 5; }
#wb h2 { margin: 0; font-size: 15px; }
#wb .tabs { display: flex; gap: 4px; margin: 6px 0; }
#wb .tabs button, #wb .row button { font: inherit; font-weight: 700; padding: 3px 8px; border: 2px solid #1b1f2a; border-radius: 6px; background: #fff; cursor: pointer; }
#wb .tabs button.on { background: #1d3557; color: #fff; }
#wb label { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 6px; margin: 3px 0; }
#wb input[type=text], #wb input[type=number], #wb select { font: inherit; padding: 2px 4px; border: 1.5px solid #1b1f2a; border-radius: 4px; width: 100%; box-sizing: border-box; }
#wb .row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
#wb .tags { max-height: 120px; overflow: auto; background: #fff; border: 1.5px solid #1b1f2a; border-radius: 4px; padding: 4px; font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
#wb .drop { border: 2px dashed #1b1f2a; border-radius: 6px; padding: 6px; text-align: center; margin: 6px 0; opacity: 0.8; }
#wb .drop.hover { background: #ffd23f; }
#wb .list { max-height: 300px; overflow: auto; }
#wb .item { display: block; width: 100%; text-align: left; font: inherit; padding: 3px 4px; border: 0; background: transparent; cursor: pointer; border-radius: 4px; }
#wb .item:hover { background: #eadfca; }
#wb .muted { opacity: 0.65; }
#wb a { color: #1d3557; }
@media (max-width: 700px) { #wb { width: calc(100vw - 28px); top: auto; bottom: 14px; max-height: 45vh; } }
`;

type Tab = "edit" | "coverage";

export class Workbench {
  private el: HTMLDivElement;
  private selected: Building | null = null;
  private highlight: THREE.Group = new THREE.Group();
  private tab: Tab = "edit";
  private filter: "unnamed" | "noheight" | "noroof" | "edited" | "named" = "noheight";
  private ray = new THREE.Raycaster();
  private down: { x: number; y: number; t: number } | null = null;
  open = true;

  constructor(
    private map: CampusMap,
    private world: World,
    private camera: THREE.PerspectiveCamera,
    private canvas: HTMLCanvasElement,
    private player: Player,
    scene: THREE.Scene,
    private toast: (msg: string) => void
  ) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement("div");
    this.el.id = "wb";
    this.el.className = "panel";
    document.body.appendChild(this.el);
    scene.add(this.highlight);

    canvas.addEventListener("pointerdown", (e) => (this.down = { x: e.clientX, y: e.clientY, t: performance.now() }));
    canvas.addEventListener("pointerup", (e) => {
      const d = this.down;
      this.down = null;
      if (!this.open || !d) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 400) return;
      this.pick(e.clientX, e.clientY);
    });
    // Drop a .glb anywhere to put it on the selected building.
    window.addEventListener("dragover", (e) => {
      if (!this.open) return;
      e.preventDefault();
      this.el.querySelector(".drop")?.classList.add("hover");
    });
    window.addEventListener("dragleave", () => this.el.querySelector(".drop")?.classList.remove("hover"));
    window.addEventListener("drop", (e) => {
      if (!this.open) return;
      e.preventDefault();
      this.el.querySelector(".drop")?.classList.remove("hover");
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      if (!/\.(glb|gltf)$/i.test(f.name)) return this.toast("Drop a .glb or .gltf file");
      if (!this.selected) return this.toast("Select a building first, then drop the model on it");
      const o = this.current();
      o.model = { ...(o.model ?? {}), url: URL.createObjectURL(f), file: f.name };
      void this.commit(o, true);
      this.toast(`${f.name} placed. Copy it to public/models/ and export overrides to keep it.`);
    });
    this.render();
    this.wirePickers();
  }

  toggle(open = !this.open) {
    this.open = open;
    this.el.style.display = open ? "block" : "none";
    this.highlight.visible = open;
  }

  /* ---------------- selection ---------------- */

  private pick(cx: number, cy: number) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.world.pickables(), true);
    let b: Building | null = null;
    if (hits.length) {
      // Nudge into the wall so a hit on a façade lands inside its footprint.
      const p = hits[0].point.clone().addScaledVector(this.ray.ray.direction, 0.4);
      b = this.buildingAt(p.x, p.z);
    }
    if (!b) {
      // Ground click: whatever footprint contains the point.
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const g = new THREE.Vector3();
      if (this.ray.ray.intersectPlane(plane, g)) b = this.buildingAt(g.x, g.z);
    }
    this.select(b);
  }

  private buildingAt(x: number, z: number): Building | null {
    let best: Building | null = null;
    let bd = 1.5;
    for (const b of this.map.buildings) {
      const o = b.outer;
      if (pointInPoly(x, z, o)) return b;
      for (let i = 0; i < o.length; i++) {
        const d = distToSeg(x, z, o[i], o[(i + 1) % o.length]);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
    }
    return best;
  }

  select(b: Building | null, fly = false) {
    this.selected = b;
    this.tab = b ? "edit" : this.tab;
    this.drawHighlight();
    this.render();
    if (b && fly) {
      // Orbit the building from the air: drone view centred on it.
      const [cx, cz] = centroid(b.outer);
      const box = orientedBox(b.outer);
      if (!this.player.drone) this.player.toggleDrone();
      this.player.pos.set(cx, 0, cz);
      this.player.droneView(Math.max(35, Math.max(box.len, box.wid) * 1.6 + b.height), 0.55);
    }
  }

  private drawHighlight() {
    this.highlight.clear();
    const b = this.selected;
    if (!b) return;
    const mat = new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true });
    const ring = (y: number) => {
      const pts = b.outer.map(([x, z]) => new THREE.Vector3(x, y, z));
      pts.push(pts[0].clone());
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
      l.renderOrder = 10;
      return l;
    };
    this.highlight.add(ring(0.3), ring(b.height + 0.9));
    const verts: THREE.Vector3[] = [];
    for (const [x, z] of b.outer) verts.push(new THREE.Vector3(x, 0.3, z), new THREE.Vector3(x, b.height + 0.9, z));
    const posts = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(verts), mat);
    posts.renderOrder = 10;
    this.highlight.add(posts);
  }

  /* ---------------- editing ---------------- */

  private current(): BuildingOverride {
    const b = this.selected!;
    return JSON.parse(JSON.stringify(merged().buildings[osmKey(b)] ?? {}));
  }

  private async commit(o: BuildingOverride, rebuild = true) {
    const b = this.selected!;
    const key = osmKey(b);
    // Drop empty fields so the file stays readable.
    for (const k of Object.keys(o) as (keyof BuildingOverride)[]) {
      const v = o[k];
      if (v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v))) delete o[k];
    }
    setLocal(key, o);
    applyOverride(b, merged().buildings[key]);
    if (rebuild) await this.world.rebuildBuildings();
    this.drawHighlight();
    this.render();
  }

  /* ---------------- rendering ---------------- */

  private render() {
    const edits = Object.keys(localEdits().buildings).length;
    const head = `<div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Asset workbench</h2><span class="muted">I to hide</span></div>
      <div class="tabs"><button data-tab="edit" class="${this.tab === "edit" ? "on" : ""}">Building</button><button data-tab="coverage" class="${this.tab === "coverage" ? "on" : ""}">Coverage</button></div>`;
    const foot = `<div class="row" style="margin-top:10px;border-top:1.5px solid #1b1f2a;padding-top:8px">
        <button data-act="export">Export overrides.json</button>
        <button data-act="copy">Copy JSON</button>
        <button data-act="clear" title="Forget this browser's edits">Clear local (${edits})</button>
      </div>`;
    this.el.innerHTML = head + (this.tab === "edit" ? this.renderEdit() : this.renderCoverage()) + foot;
    this.el.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        this.tab = b.dataset.tab as Tab;
        this.render();
      })
    );
    this.el.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) => b.addEventListener("click", () => void this.act(b.dataset.act!)));
    this.el.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((b) =>
      b.addEventListener("click", () => {
        this.filter = b.dataset.filter as typeof this.filter;
        this.render();
      })
    );
    this.el.querySelectorAll<HTMLButtonElement>("[data-go]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const b = this.map.buildings.find((q) => osmKey(q) === btn.dataset.go);
        if (b) this.select(b, true);
      })
    );
    const form = this.el.querySelector("form");
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.save(new FormData(form));
    });
    form?.addEventListener("keydown", (e) => e.stopPropagation());
  }

  private renderEdit(): string {
    const b = this.selected;
    if (!b) return `<p>Click any building to inspect and edit it. Drag a <b>.glb</b> onto the page to give the selected building a custom model.</p>${this.stats()}`;
    const o = merged().buildings[osmKey(b)] ?? {};
    const orig = original(b);
    const key = osmKey(b);
    const tags = Object.entries(b.tags)
      .map(([k, v]) => `${esc(k)}=${esc(v)}`)
      .join("<br>");
    const num = (v: number | undefined) => (v === undefined ? "" : String(Math.round(v * 10) / 10));
    const m = o.model;
    return `
      <div style="margin:4px 0"><b>${esc(b.name ?? "(unnamed)")}</b><br>
        <span class="muted">${key} · ${Math.round(b.area)} m² · style ${styleFor(b)}</span> ·
        <a href="https://www.openstreetmap.org/${key}" target="_blank" rel="noopener">OSM ↗</a> ·
        <a href="https://www.openstreetmap.org/edit?${b.osmType}=${b.id}" target="_blank" rel="noopener">edit in iD ↗</a></div>
      <div class="tags">${tags || "<i>no tags</i>"}</div>
      <form>
        <label>Name <input type="text" name="name" value="${esc(o.name ?? "")}" placeholder="${esc(orig.name ?? "")}"></label>
        <label>Levels <input type="number" name="levels" min="1" max="40" step="1" value="${num(o.levels)}" placeholder="${orig.levels}"></label>
        <label>Height (m) <input type="number" name="height" min="1" max="150" step="0.1" value="${num(o.height)}" placeholder="${num(orig.height)}"></label>
        <label>Min height <input type="number" name="minHeight" min="0" step="0.1" value="${num(o.minHeight)}" placeholder="${num(orig.minHeight)}"></label>
        <label>Façade <select name="style"><option value="">auto (${styleFor({ ...b, style: undefined })})</option>${STYLES.map((s) => `<option ${o.style === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
        <label>Wall colour <span style="display:flex;gap:4px"><input type="text" name="colour" value="${esc(o.colour ?? "")}" placeholder="${esc(orig.colour ?? "e.g. #efe3c8")}"><input type="color" data-for="colour" value="${toHex(o.colour ?? orig.colour ?? "#efe3c8")}"></span></label>
        <label>Roof <select name="roofShape">${["", "flat", "hipped", "gabled", "pyramidal"].map((r) => `<option value="${r}" ${o.roofShape === r ? "selected" : ""}>${r || `auto${orig.roofShape ? ` (${orig.roofShape})` : ""}`}</option>`).join("")}</select></label>
        <label>Roof colour <span style="display:flex;gap:4px"><input type="text" name="roofColour" value="${esc(o.roofColour ?? "")}" placeholder="${esc(orig.roofColour ?? "e.g. #b9562f")}"><input type="color" data-for="roofColour" value="${toHex(o.roofColour ?? orig.roofColour ?? "#bdb6aa")}"></span></label>
        <label>Hide <input type="checkbox" name="hidden" ${o.hidden ? "checked" : ""} style="width:auto"></label>
        <div class="drop">Drop a <b>.glb</b> here for a custom model${m?.file ? `<br><b>${esc(m.file)}</b>` : ""}</div>
        <label>Model URL <input type="text" name="modelUrl" value="${esc(m && !m.url.startsWith("blob:") ? m.url : "")}" placeholder="${m?.url.startsWith("blob:") ? "(dropped file)" : "models/my-building.glb"}"></label>
        <label>Scale <input type="number" name="modelScale" step="0.01" value="${num(m?.scale)}" placeholder="1"></label>
        <label>Rotation° <input type="number" name="modelRot" step="1" value="${num(m?.rotation)}" placeholder="0"></label>
        <label>Offset x,y,z <input type="text" name="modelOffset" value="${m?.offset ? m.offset.join(", ") : ""}" placeholder="0, 0, 0"></label>
        <label>Keep footprint <input type="checkbox" name="keepFootprint" ${m?.keepFootprint ? "checked" : ""} style="width:auto"></label>
        <label>Note <input type="text" name="note" value="${esc(o.note ?? "")}" placeholder="e.g. photo checked 2026-09"></label>
        <div class="row"><button type="submit">Apply</button><button type="button" data-act="fit">Fit model to footprint</button><button type="button" data-act="revert">Revert</button></div>
      </form>`;
  }

  private stats(): string {
    const bs = this.map.buildings;
    const named = bs.filter((b) => b.tags.name).length;
    const height = bs.filter((b) => b.tags.height || b.tags["building:levels"]).length;
    const roof = bs.filter((b) => b.tags["roof:shape"]).length;
    const pct = (n: number) => `${Math.round((100 * n) / Math.max(1, bs.length))}%`;
    return `<div class="muted" style="margin-top:6px">${bs.length} buildings in OSM here · ${pct(named)} named · ${pct(height)} with height/levels · ${pct(roof)} with roof shape</div>`;
  }

  private renderCoverage(): string {
    const bs = this.map.buildings;
    const ov = merged().buildings;
    const lists: Record<typeof this.filter, Building[]> = {
      noheight: bs.filter((b) => !b.tags.height && !b.tags["building:levels"] && !ov[osmKey(b)]?.levels && !ov[osmKey(b)]?.height),
      unnamed: bs.filter((b) => !b.tags.name && b.campus),
      noroof: bs.filter((b) => !b.tags["roof:shape"]),
      edited: bs.filter((b) => ov[osmKey(b)]),
      named: bs.filter((b) => b.name),
    };
    const labels: Record<typeof this.filter, string> = {
      noheight: "No height",
      unnamed: "Unnamed (campus)",
      noroof: "No roof shape",
      edited: "Overridden",
      named: "All named",
    };
    const list = lists[this.filter].sort((a, b) => b.area - a.area);
    return `${this.stats()}
      <div class="row">${(Object.keys(labels) as (typeof this.filter)[]).map((f) => `<button data-filter="${f}" style="${f === this.filter ? "background:#1d3557;color:#fff" : ""}">${labels[f]} (${lists[f].length})</button>`).join("")}</div>
      <div class="list">${list
        .slice(0, 250)
        .map((b) => `<button class="item" data-go="${osmKey(b)}">${esc(b.name ?? `${b.type} · ${Math.round(b.area)} m²`)} <span class="muted">${osmKey(b)}</span></button>`)
        .join("")}</div>
      <p class="muted">Biggest first. Fix it in OSM (link on the Building tab) when you can; the snapshot workflow brings it back here.</p>`;
  }

  private async save(fd: FormData) {
    const n = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      return v === "" ? undefined : Number(v);
    };
    const s = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      return v === "" ? undefined : v;
    };
    const prev = this.current();
    const o: BuildingOverride = {
      name: s("name"),
      levels: n("levels"),
      height: n("height"),
      minHeight: n("minHeight"),
      style: s("style"),
      colour: s("colour"),
      roofShape: s("roofShape"),
      roofColour: s("roofColour"),
      hidden: fd.get("hidden") ? true : undefined,
      note: s("note"),
    };
    const url = s("modelUrl") ?? (prev.model?.url.startsWith("blob:") ? prev.model.url : undefined);
    if (url) {
      const off = s("modelOffset")
        ?.split(/[ ,]+/)
        .map(Number)
        .filter((v) => !Number.isNaN(v));
      o.model = {
        url,
        file: prev.model?.file,
        scale: n("modelScale"),
        rotation: n("modelRot"),
        offset: off && off.length === 3 ? (off as [number, number, number]) : undefined,
        keepFootprint: fd.get("keepFootprint") ? true : undefined,
      };
    }
    await this.commit(o);
    this.toast("Saved in this browser. Export overrides.json to commit it.");
  }

  private async act(a: string) {
    if (a === "export") {
      const blob = new Blob([exportJson()], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "overrides.json";
      link.click();
      this.toast("Put it in public/data/overrides.json and commit (models in public/models/).");
    } else if (a === "copy") {
      await navigator.clipboard?.writeText(exportJson());
      this.toast("overrides.json copied");
    } else if (a === "clear") {
      if (!confirm("Forget every edit made in this browser?")) return;
      clearLocal();
      applyOverrides(this.map, merged());
      await this.world.rebuildBuildings();
      this.drawHighlight();
      this.render();
    } else if (a === "revert" && this.selected) {
      setLocal(osmKey(this.selected), null);
      applyOverride(this.selected, merged().buildings[osmKey(this.selected)]);
      await this.world.rebuildBuildings();
      this.drawHighlight();
      this.render();
    } else if (a === "fit" && this.selected) {
      const o = this.current();
      if (!o.model?.url) return this.toast("Give the building a model first");
      const len = await modelLength(o.model.url);
      o.model.scale = Math.round((orientedBox(this.selected.outer).len / len) * 1000) / 1000;
      await this.commit(o);
    }
  }

  /** Keep the colour pickers and text fields in step. */
  wirePickers() {
    this.el.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.type === "color" && t.dataset.for) {
        const text = this.el.querySelector<HTMLInputElement>(`input[name=${t.dataset.for}]`);
        if (text) text.value = t.value;
      }
    });
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function toHex(c: string): string {
  try {
    return "#" + new THREE.Color(c).getHexString();
  } catch {
    return "#efe3c8";
  }
}
