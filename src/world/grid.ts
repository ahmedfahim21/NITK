/**
 * A 1 m raster over the map square. It answers three questions cheaply:
 * can the player stand here (collision), how tall is whatever stands here
 * (camera occlusion), and is this ground free for a tree (scatter).
 */
import type { Pt } from "../geo";

export const SOLID = 1;
export const ROAD = 2;
export const WATER = 4;
/** Open ground that must stay clear: pitches, plazas, parking, sand. */
export const CLEAR = 8;
export const PATH = 16;

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly flags: Uint8Array;
  /** Obstacle top, in 0.5 m units (0..127 m). */
  readonly top: Uint8Array;

  constructor(
    readonly minX: number,
    readonly minZ: number,
    maxX: number,
    maxZ: number,
    readonly cell = 1
  ) {
    this.w = Math.ceil((maxX - minX) / cell);
    this.h = Math.ceil((maxZ - minZ) / cell);
    this.flags = new Uint8Array(this.w * this.h);
    this.top = new Uint8Array(this.w * this.h);
  }

  idx(x: number, z: number): number {
    const i = Math.floor((x - this.minX) / this.cell);
    const j = Math.floor((z - this.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  get(x: number, z: number): number {
    const k = this.idx(x, z);
    return k < 0 ? SOLID : this.flags[k];
  }

  topAt(x: number, z: number): number {
    const k = this.idx(x, z);
    return k < 0 ? 0 : this.top[k] * 0.5;
  }

  blocked(x: number, z: number): boolean {
    return (this.get(x, z) & (SOLID | WATER)) !== 0;
  }

  /** Even-odd scanline fill of a polygon with holes. */
  fillPolygon(rings: Pt[][], flag: number, top = 0) {
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const r of rings) for (const p of r) {
      minZ = Math.min(minZ, p[1]);
      maxZ = Math.max(maxZ, p[1]);
    }
    const j0 = Math.max(0, Math.floor((minZ - this.minZ) / this.cell));
    const j1 = Math.min(this.h - 1, Math.floor((maxZ - this.minZ) / this.cell));
    const t = Math.min(255, Math.round(top * 2));
    const xs: number[] = [];
    for (let j = j0; j <= j1; j++) {
      const z = this.minZ + (j + 0.5) * this.cell;
      xs.length = 0;
      for (const r of rings) {
        for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
          const [xa, za] = r[a];
          const [xb, zb] = r[b];
          if (za > z !== zb > z) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] - this.minX) / this.cell - 0.5));
        const i1 = Math.min(this.w - 1, Math.floor((xs[k + 1] - this.minX) / this.cell - 0.5));
        const row = j * this.w;
        for (let i = i0; i <= i1; i++) {
          this.flags[row + i] |= flag;
          if (t > this.top[row + i]) this.top[row + i] = t;
        }
      }
    }
  }

  /** Stamps a thick polyline. */
  strokeLine(pts: Pt[], width: number, flag: number, top = 0) {
    const r = width / 2;
    const t = Math.min(255, Math.round(top * 2));
    for (let s = 1; s < pts.length; s++) {
      const [ax, az] = pts[s - 1];
      const [bx, bz] = pts[s];
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
      for (let k = 0; k <= steps; k++) {
        const f = k / steps;
        this.stampDisc(ax + (bx - ax) * f, az + (bz - az) * f, r, flag, t);
      }
    }
  }

  stampDisc(x: number, z: number, r: number, flag: number, t = 0) {
    const i0 = Math.max(0, Math.floor((x - r - this.minX) / this.cell));
    const i1 = Math.min(this.w - 1, Math.floor((x + r - this.minX) / this.cell));
    const j0 = Math.max(0, Math.floor((z - r - this.minZ) / this.cell));
    const j1 = Math.min(this.h - 1, Math.floor((z + r - this.minZ) / this.cell));
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      const cz = this.minZ + (j + 0.5) * this.cell - z;
      for (let i = i0; i <= i1; i++) {
        const cx = this.minX + (i + 0.5) * this.cell - x;
        if (cx * cx + cz * cz > r2 + this.cell * 0.25) continue;
        const k = j * this.w + i;
        this.flags[k] |= flag;
        if (t > this.top[k]) this.top[k] = t;
      }
    }
  }

  clear(x: number, z: number, r: number, flag: number) {
    const i0 = Math.max(0, Math.floor((x - r - this.minX) / this.cell));
    const i1 = Math.min(this.w - 1, Math.floor((x + r - this.minX) / this.cell));
    const j0 = Math.max(0, Math.floor((z - r - this.minZ) / this.cell));
    const j1 = Math.min(this.h - 1, Math.floor((z + r - this.minZ) / this.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.flags[j * this.w + i] &= ~flag;
  }

  /** Nearest walkable spot, spiralling out. */
  nearestFree(x: number, z: number, maxR = 200): [number, number] {
    if (!this.blocked(x, z)) return [x, z];
    for (let r = 1; r < maxR; r += 1) {
      const n = Math.max(8, Math.ceil(r * 6));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (!this.blocked(px, pz) && !this.blocked(px + 0.6, pz) && !this.blocked(px - 0.6, pz) && !this.blocked(px, pz + 0.6) && !this.blocked(px, pz - 0.6))
          return [px, pz];
      }
    }
    return [x, z];
  }
}
