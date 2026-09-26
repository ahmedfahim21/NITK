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
  // Older NITK blocks: cream plaster, terracotta floor bands, deep sunshade
  // ledges over tall grilled windows.
  academic(ctx, W, H, night, rand) {
    if (!night) {
      ctx.fillStyle = "#efe4cc";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#b85c3e";
      ctx.fillRect(0, H - 12, W, 12);
      ctx.fillStyle = "#e2d3b2";
      ctx.fillRect(0, 0, 6, H);
      ctx.fillRect(W - 6, 0, 6, H);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }
    windowAt(ctx, 26, 30, W - 52, 70, night, rand() < 0.45, "#3d5566", "#f7f2e6", 3);
    if (!night) {
      ctx.fillStyle = "#cbb996";
      ctx.fillRect(18, 22, W - 36, 8);
    }
  },
  hostel(ctx, W, H, night, rand) {
    if (!night) {
      ctx.fillStyle = "#f1dcbf";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#9c3f35";
      ctx.fillRect(0, H - 10, W, 10);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }
    windowAt(ctx, 30, 34, W - 60, 60, night, rand() < 0.65, "#35505a", "#6e8a4e", 2);
    if (!night) {
      ctx.fillStyle = "#d9c3a2";
      ctx.fillRect(24, 26, W - 48, 8);
      // Clothes on the grille, the hostel tell.
      if (rand() < 0.3) {
        ctx.fillStyle = ["#c0392b", "#2e86c1", "#f4d03f", "#ecf0f1"][Math.floor(rand() * 4)];
        ctx.fillRect(40 + rand() * 30, 70, 18, 22);
      }
    }
  },
  // Newer glass-and-panel blocks (library, lecture halls).
  modern(ctx, W, H, night, rand) {
    if (!night) {
      ctx.fillStyle = "#e9ecef";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#c9ced4";
      ctx.fillRect(0, H - 16, W, 16);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }
    windowAt(ctx, 8, 14, W - 16, 92, night, rand() < 0.55, "#4f7fa3", "#aeb8c2", 4);
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
