/**
 * Procedural facade and roof textures. One tile = one window bay of one
 * floor (FLOOR_H x BAY_W metres), so wall UVs are simply metres / tile size.
 * Every facade has a matching night mask: lit windows on black, read as the
 * emissive map and scaled by the time of day.
 */
import * as THREE from "three";
import { mulberry32 } from "../geo";

export const FLOOR_H = 3.4;
export const BAY_W = 3.6;

export type FacadeStyle =
  | "academic"
  | "hostel"
  | "megahostel"
  | "laterite"
  | "modern"
  | "house"
  | "shop"
  | "plain"
  | "industrial";

type Painter = (ctx: CanvasRenderingContext2D, W: number, H: number, night: boolean, rand: () => number) => void;

const S = 128;

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Window with frame, glass and optional grille; in night mode, only lit glass. */
function windowAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  night: boolean,
  lit: boolean,
  glass: string,
  frame: string,
  grille = 0
) {
  if (night) {
    ctx.fillStyle = lit ? "#ffd58a" : "#000";
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    if (lit && grille) {
      ctx.fillStyle = "#000";
      for (let i = 1; i < grille; i++) ctx.fillRect(x + (w * i) / grille - 1, y + 3, 2, h - 6);
    }
    return;
  }
  ctx.fillStyle = frame;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = glass;
  ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  // A pale reflection band so glass is not a flat hole under cel light.
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(x + 3, y + 3, (w - 6) * 0.45, h - 6);
  if (grille) {
    ctx.fillStyle = frame;
    for (let i = 1; i < grille; i++) ctx.fillRect(x + (w * i) / grille - 1, y + 3, 2, h - 6);
    ctx.fillRect(x + 3, y + h * 0.45, w - 6, 2);
  }
}

const PAINTERS: Record<FacadeStyle, Painter> = {
  // NITK's 1960s-80s blocks (the Main Building wings, the departments):
  // continuous concrete sunshade ribbons over a recessed strip of windows,
  // a plain spandrel below. The wall colour comes from the vertex tint, so
  // everything here is painted in near-whites and greys.
  academic(ctx, W, H, night, rand) {
    const ledge = 16;
    const stripTop = ledge;
    const stripBot = Math.round(H * 0.66);
    if (!night) {
      ctx.fillStyle = "#fbf8f0";
      ctx.fillRect(0, 0, W, H);
      // Recess behind the windows, in shadow under the ledge.
      ctx.fillStyle = "#6d6a60";
      ctx.fillRect(0, stripTop, W, stripBot - stripTop);
      ctx.fillStyle = "#4b4942";
      ctx.fillRect(0, stripTop, W, 8);
      // Sunshade slab face and the line of shadow it throws.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, ledge - 3);
      ctx.fillStyle = "#b9b3a2";
      ctx.fillRect(0, ledge - 3, W, 3);
      // Spandrel: a faint horizontal joint.
      ctx.fillStyle = "#e6e0d0";
      ctx.fillRect(0, H - 6, W, 2);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }
    // Two tall casements per bay, painted steel frames.
    const wy = stripTop + 10;
    const wh = stripBot - wy - 4;
    for (let k = 0; k < 2; k++) {
      windowAt(ctx, 8 + k * (W / 2), wy, W / 2 - 16, wh, night, rand() < 0.4, "#50626a", "#d8d2c0", 2);
    }
    if (!night) {
      // Column face between bays.
      ctx.fillStyle = "#f3efe4";
      ctx.fillRect(0, stripTop, 5, stripBot - stripTop);
      ctx.fillRect(W - 5, stripTop, 5, stripBot - stripTop);
    }
  },
  // The older boys' blocks (Karavali, Aravali, Vindhya...): cream plaster
  // between brick-red pilasters and floor bands, green-framed grilled windows.
  hostel(ctx, W, H, night, rand) {
    if (!night) {
      ctx.fillStyle = "#f7eedc";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#a4493a";
      ctx.fillRect(0, H - 12, W, 12);
      ctx.fillRect(0, 0, 12, H);
      ctx.fillRect(W - 12, 0, 12, H);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(12, 0, 3, H - 12);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }
    windowAt(ctx, 32, 36, W - 64, 58, night, rand() < 0.65, "#35505a", "#4f7a45", 2);
    if (!night) {
      ctx.fillStyle = "#d8cbb0";
      ctx.fillRect(26, 28, W - 52, 8);
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(26, 36, W - 52, 3);
      // Clothes on the grille, the hostel tell.
      if (rand() < 0.3) {
        ctx.fillStyle = ["#c0392b", "#2e86c1", "#f4d03f", "#ecf0f1"][Math.floor(rand() * 4)];
        ctx.fillRect(44 + rand() * 30, 66, 18, 24);
      }
    }
  },
  // The Mega Hostel towers: a tan concrete frame round cream infill panels,
  // one small grilled window per bay, set to one side.
  megahostel(ctx, W, H, night, rand) {
    const left = rand() < 0.5;
    if (!night) {
      ctx.fillStyle = "#f2ebdf";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#c8976f";
      ctx.fillRect(0, 0, 14, H);
      ctx.fillRect(W - 14, 0, 14, H);
      ctx.fillRect(0, H - 14, W, 14);
      ctx.fillStyle = "rgba(0,0,0,0.1)";
      ctx.fillRect(14, 0, 3, H - 14);
      ctx.fillRect(14, H - 17, W - 28, 3);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }
    const wx = left ? 24 : W - 24 - 40;
    windowAt(ctx, wx, 30, 40, 50, night, rand() < 0.7, "#34464f", "#fbfbfb", 2);
    if (!night) {
      ctx.fillStyle = "#c8976f";
      ctx.fillRect(wx - 4, 24, 48, 6);
    }
  },
  // Exposed laterite, the red stone of this coast (Lecture Hall Complex A):
  // coursed blocks, white-framed windows, a concrete floor band.
  laterite(ctx, W, H, night, rand) {
    if (!night) {
      ctx.fillStyle = "#b35a3c";
      ctx.fillRect(0, 0, W, H);
      for (let row = 0; row < H; row += 10) {
        ctx.fillStyle = "rgba(240,200,170,0.45)";
        ctx.fillRect(0, row, W, 1.5);
        const off = (row / 10) % 2 ? 0 : 14;
        for (let x = off; x < W; x += 28) ctx.fillRect(x, row, 1.5, 10);
        ctx.fillStyle = `rgba(90,30,10,${0.05 + rand() * 0.12})`;
        ctx.fillRect(rand() * W, row + 2, 20, 7);
      }
      ctx.fillStyle = "#e9e1d0";
      ctx.fillRect(0, H - 12, W, 12);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }
    windowAt(ctx, 28, 30, W - 56, 62, night, rand() < 0.5, "#3c4c55", "#f4f1ea", 3);
  },
  // The newer white blocks (Central Library, LHC-D, CRF, SJA): smooth white
  // render with lavender-grey bands at every floor, punched windows.
  modern(ctx, W, H, night, rand) {
    if (!night) {
      ctx.fillStyle = "#fbfbfc";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#b8b3c9";
      ctx.fillRect(0, H - 14, W, 14);
      ctx.fillStyle = "#d9d6e3";
      ctx.fillRect(0, 20, W, 5);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }
    windowAt(ctx, 22, 32, 36, 64, night, rand() < 0.55, "#445a70", "#e4e4ea", 2);
    windowAt(ctx, 70, 32, 36, 64, night, rand() < 0.55, "#445a70", "#e4e4ea", 2);
  },
  house(ctx, W, H, night, rand) {
    if (!night) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, H - 8, W, 8);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }
    windowAt(ctx, 38, 38, W - 76, 52, night, rand() < 0.5, "#3a4a50", "#2f6b4f", 2);
  },
  shop(ctx, W, H, night, rand) {
    // Three floors per tile: shutter on the ground floor, windows above.
    const fh = H / 3;
    if (!night) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#9aa3a8";
      ctx.fillRect(10, H - fh + 22, W - 20, fh - 22);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let y = H - fh + 26; y < H; y += 6) ctx.fillRect(10, y, W - 20, 2);
      const signs = ["#d63031", "#0984e3", "#00b894", "#fdcb6e", "#6c5ce7", "#e17055"];
      ctx.fillStyle = signs[Math.floor(rand() * signs.length)];
      ctx.fillRect(4, H - fh + 4, W - 8, 16);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff0b0";
      ctx.fillRect(4, H - fh + 4, W - 8, 16);
      ctx.fillStyle = "#ffcf7a";
      ctx.fillRect(10, H - fh + 22, W - 20, fh - 22);
    }
    for (let f = 0; f < 2; f++) windowAt(ctx, 34, f * fh + 26, W - 68, 50, night, rand() < 0.5, "#3a4a50", "#dfe6e9", 2);
  },
  plain(ctx, W, H, night, rand) {
    if (!night) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.1)";
      ctx.fillRect(0, H - 8, W, 8);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }
    windowAt(ctx, 32, 34, W - 64, 58, night, rand() < 0.4, "#3f5360", "#d9d9d9", 2);
  },
  industrial(ctx, W, H, night) {
    ctx.fillStyle = night ? "#000" : "#dfe2e4";
    ctx.fillRect(0, 0, W, H);
    if (!night) {
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      for (let x = 0; x < W; x += 16) ctx.fillRect(x, 0, 3, H);
    }
  },
};

const facadeCache = new Map<FacadeStyle, { map: THREE.Texture; night: THREE.Texture; floors: number }>();

/**
 * Facade texture pair. The tile holds four bays side by side so lit windows
 * do not form an obvious one-bay pattern; UVs divide by 4 * BAY_W.
 */
export function facade(style: FacadeStyle) {
  const hit = facadeCache.get(style);
  if (hit) return hit;
  const floors = style === "shop" ? 3 : 1;
  const BAYS = 4;
  const day = canvas(S * BAYS, S * floors);
  const night = canvas(S * BAYS, S * floors);
  for (let b = 0; b < BAYS; b++) {
    for (const [c, isNight] of [
      [day, false],
      [night, true],
    ] as const) {
      const ctx = c.getContext("2d")!;
      ctx.save();
      ctx.translate(b * S, 0);
      ctx.beginPath();
      ctx.rect(0, 0, S, S * floors);
      ctx.clip();
      // Same seed for day and night so lit windows line up with glass.
      PAINTERS[style](ctx, S, S * floors, isNight, mulberry32(1000 + b * 17 + style.length * 131));
      ctx.restore();
    }
  }
  const out = { map: tex(day), night: tex(night), floors };
  facadeCache.set(style, out);
  return out;
}

const curtainCache = new Map<string, THREE.Texture>();

/** Blue-glass curtain wall: panes on a light aluminium grid, cols x rows per face. */
export function curtainWall(cols: number, rows: number): THREE.Texture {
  const key = `${cols}x${rows}`;
  const hit = curtainCache.get(key);
  if (hit) return hit;
  const c = canvas(32, 32);
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 32, 32);
  g.addColorStop(0, "#6fb0ec");
  g.addColorStop(1, "#3c7fcf");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(3, 3, 10, 26);
  ctx.fillStyle = "#d9e3ea";
  ctx.fillRect(0, 0, 32, 2);
  ctx.fillRect(0, 0, 2, 32);
  const t = tex(c);
  t.repeat.set(cols, rows);
  curtainCache.set(key, t);
  return t;
}

let tileRoof: THREE.Texture | null = null;

/** Mangalore tiles: the terracotta roof this coast gave its name to. */
export function mangaloreTiles(): THREE.Texture {
  if (tileRoof) return tileRoof;
  const c = canvas(128, 128);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    const y = row * 16;
    ctx.fillStyle = "rgba(90,30,10,0.35)";
    ctx.fillRect(0, y + 13, 128, 3);
    for (let col = 0; col < 8; col++) {
      const x = col * 16 + (row % 2) * 8;
      ctx.fillStyle = "rgba(90,30,10,0.18)";
      ctx.fillRect(x, y, 2, 14);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x + 4, y + 2, 6, 9);
    }
  }
  tileRoof = tex(c);
  return tileRoof;
}

let textTexCache = new Map<string, THREE.CanvasTexture>();

/** A painted signboard: text on a colour, for gates and building fronts. */
export function signTexture(
  lines: string[],
  opts: { bg?: string; fg?: string; w?: number; h?: number; font?: string } = {}
): THREE.CanvasTexture {
  const key = JSON.stringify([lines, opts]);
  const hit = textTexCache.get(key);
  if (hit) return hit;
  const W = opts.w ?? 1024;
  const H = opts.h ?? 128;
  const c = canvas(W, H);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = opts.bg ?? "#1d3557";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = opts.fg ?? "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lh = H / lines.length;
  lines.forEach((line, i) => {
    let size = Math.floor(lh * 0.62);
    ctx.font = `700 ${size}px ${opts.font ?? "'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Kannada', 'Noto Sans Devanagari', sans-serif"}`;
    while (ctx.measureText(line).width > W * 0.94 && size > 8) {
      size -= 2;
      ctx.font = `700 ${size}px ${opts.font ?? "'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Kannada', 'Noto Sans Devanagari', sans-serif"}`;
    }
    ctx.fillText(line, W / 2, lh * i + lh / 2);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  textTexCache.set(key, t);
  return t;
}

export function resetTextCache() {
  textTexCache = new Map();
}
