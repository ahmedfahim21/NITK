/**
 * Street lamps (with fake light pools that come up after dusk) and the
 * compound walls and fences from OSM barriers. Masonry walls are NITK's:
 * a solid lower half on a laterite plinth, a pierced concrete jali screen
 * above, pillars every three metres (from the virtual tour).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CampusMap } from "../osm/types";
import type { Lamp } from "./roads";
import { nightGlow, toon } from "../fx/toon";
import { SOLID, type Grid } from "./grid";
import { groundHeight } from "./terrain";
import { campusWalls } from "./walls";
import type { Region } from "./region";

export type PropRig = {
  group: THREE.Group;
  /** The walls, built at ground level 0 for the terrain to lift (the lamps are already placed on it). */
  walls: THREE.Group;
  setGlow(g: number): void;
};

export function buildProps(map: CampusMap, lamps: Lamp[], grid: Grid, region: Region): PropRig {
  const group = new THREE.Group();
  group.name = "props";

  /* ---- lamps ---- */
  // Highway arm lamps, and on campus the white globe on a short black pole
  // (as in the virtual tour, round the hostels and departments).
  const kept = lamps.filter((l) => !grid.blocked(l.x, l.z));
  const arms = kept.filter((l) => !l.globe);
  const globes = kept.filter((l) => l.globe);
  const pole = new THREE.CylinderGeometry(0.07, 0.11, 8, 6).translate(0, 4, 0);
  const arm = new THREE.BoxGeometry(1.6, 0.08, 0.08).translate(0.75, 7.9, 0);
  const armPoleGeo = mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed()])!;
  const armHeadGeo = new THREE.BoxGeometry(0.7, 0.18, 0.32).translate(1.45, 7.8, 0);
  const globePoleGeo = new THREE.CylinderGeometry(0.06, 0.1, 4.2, 6).translate(0, 2.1, 0);
  const globeHeadGeo = new THREE.SphereGeometry(0.34, 10, 8).translate(0, 4.5, 0);
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: poolTexture(),
  });
  const poolGeo = new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2);
  const poolMesh = new THREE.InstancedMesh(poolGeo, poolMat, kept.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  let pools = 0;
  for (const [list, poleGeo, headGeo, poleColour, reach] of [
    [arms, armPoleGeo, armHeadGeo, 0x8a9399, 1.45],
    [globes, globePoleGeo, globeHeadGeo, 0x1f2226, 0],
  ] as const) {
    if (!list.length) continue;
    const poleMesh = new THREE.InstancedMesh(poleGeo, toon(poleColour), list.length);
    const headMesh = new THREE.InstancedMesh(headGeo, toon(0xf4f4ee, { glow: 0xfff0c0 }), list.length);
    list.forEach(({ x, z, ang: k }, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), k);
      const y = groundHeight(x, z);
      m.compose(new THREE.Vector3(x, y, z), q, one);
      poleMesh.setMatrixAt(i, m);
      headMesh.setMatrixAt(i, m);
      const hx = x + Math.cos(-k) * reach;
      const hz = z + Math.sin(-k) * reach;
      m.compose(new THREE.Vector3(hx, y + 0.3, hz), new THREE.Quaternion(), reach ? one : new THREE.Vector3(0.7, 1, 0.7));
      poolMesh.setMatrixAt(pools++, m);
      grid.stampDisc(x, z, 0.25, SOLID, reach ? 8 : 4.8);
    });
    poleMesh.castShadow = true;
    poleMesh.computeBoundingSphere();
    headMesh.computeBoundingSphere();
    group.add(poleMesh, headMesh);
  }
  poolMesh.computeBoundingSphere();
  poolMesh.renderOrder = 2;
  group.add(poolMesh);

  /* ---- walls and fences ---- */
  const wallParts: THREE.BufferGeometry[] = [];
  const jaliParts: THREE.BufferGeometry[] = [];
  const PANEL = 3;
  const colourise = (g: THREE.BufferGeometry, c: THREE.Color) => {
    const nn = g.toNonIndexed();
    const arr = new Float32Array(nn.attributes.position.count * 3);
    for (let k = 0; k < arr.length; k += 3) arr.set([c.r, c.g, c.b], k);
    nn.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    nn.deleteAttribute("uv");
    return nn;
  };
  const pillarColour = new THREE.Color(0xe3dab8);
  // OSM's walls, then the campus compound wall where OSM has none.
  const generated = campusWalls(map, region);
  const barriers = [...map.barriers, ...generated.map((w) => ({ pts: w.pts, kind: "wall" as const }))];
  for (const w of generated) {
    // Gate pillars either side of every opening a road or path goes through.
    for (const [on, p, q] of [[w.gateAtStart, w.pts[0], w.pts[1]], [w.gateAtEnd, w.pts[w.pts.length - 1], w.pts[w.pts.length - 2]]] as const) {
      if (!on) continue;
      const ang = -Math.atan2(q[1] - p[1], q[0] - p[0]);
      wallParts.push(
        colourise(new THREE.BoxGeometry(0.7, 2.9, 0.7).rotateY(ang).translate(p[0], 1.45, p[1]), pillarColour),
        colourise(new THREE.BoxGeometry(0.86, 0.16, 0.86).rotateY(ang).translate(p[0], 2.98, p[1]), new THREE.Color(0xa65a3f))
      );
    }
  }
  for (const b of barriers) {
    const h = b.kind === "fence" ? 1.6 : b.kind === "hedge" ? 1.2 : 2.1;
    const t = b.kind === "fence" ? 0.08 : b.kind === "hedge" ? 0.8 : 0.25;
    let run = 0;
    for (let i = 1; i < b.pts.length; i++) {
      const [a, c] = [b.pts[i - 1], b.pts[i]];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 0.1) continue;
      const ang = -Math.atan2(c[1] - a[1], c[0] - a[0]);
      const g = new THREE.BoxGeometry(len + t, h, t);
      if (b.kind === "wall") {
        // Long faces (+z, -z: vertices 16-23) repeat the panel texture along the wall.
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let k = 16; k < 24; k++) uv.setX(k, (run + uv.getX(k) * len) / PANEL);
      }
      g.rotateY(ang);
      g.translate((a[0] + c[0]) / 2, h / 2, (a[1] + c[1]) / 2);
      if (b.kind === "wall") {
        const nn = g.toNonIndexed();
        const arr = new Float32Array(nn.attributes.position.count * 3).fill(1);
        nn.setAttribute("color", new THREE.BufferAttribute(arr, 3));
        jaliParts.push(nn);
        // Pillars with caps at every panel joint.
        const ux = (c[0] - a[0]) / len;
        const uz = (c[1] - a[1]) / len;
        for (let d = (PANEL - (run % PANEL)) % PANEL; d <= len; d += PANEL) {
          const px = a[0] + ux * d;
          const pz = a[1] + uz * d;
          const pillar = new THREE.BoxGeometry(0.42, h + 0.35, 0.42).rotateY(ang).translate(px, (h + 0.35) / 2, pz);
          const cap = new THREE.BoxGeometry(0.56, 0.12, 0.56).rotateY(ang).translate(px, h + 0.41, pz);
          wallParts.push(colourise(pillar, pillarColour), colourise(cap, new THREE.Color(0xf1ecdc)));
        }
      } else {
        wallParts.push(colourise(g, new THREE.Color(b.kind === "hedge" ? 0x4f8a3a : 0x6f7a80)));
      }
      run += len;
    }
    grid.strokeLine(b.pts, Math.max(0.5, t), SOLID, h);
  }
  const wallGroup = new THREE.Group();
  wallGroup.name = "walls";
  group.add(wallGroup);
  if (wallParts.length) {
    const walls = new THREE.Mesh(mergeGeometries(wallParts)!, toon(0xffffff, { vertexColors: true }));
    walls.castShadow = true;
    walls.receiveShadow = true;
    wallGroup.add(walls);
  }
  if (jaliParts.length) {
    const jali = new THREE.Mesh(mergeGeometries(jaliParts)!, toon(0xffffff, { vertexColors: true, map: jaliTexture() }));
    jali.castShadow = true;
    jali.receiveShadow = true;
    wallGroup.add(jali);
  }

  return {
    group,
    walls: wallGroup,
    setGlow(g) {
      poolMat.opacity = g * 0.55;
      poolMesh.visible = g > 0.05;
      nightGlow.value = g;
    },
  };
}

/** One 3 m wall panel: laterite plinth, plain lower half, a band of pierced jali above. */
function jaliTexture(): THREE.Texture {
  const W = 192;
  const H = 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e6dfcb";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#a65a3f";
  ctx.fillRect(0, H - 14, W, 14);
  ctx.fillStyle = "#d4ccb4";
  ctx.fillRect(0, 52, W, 5);
  // Jali: a grid of quatrefoil piercings, dark where you'd see through.
  ctx.fillStyle = "#4e4c45";
  for (let y = 12; y < 50; y += 13) {
    for (let x = 8; x < W - 4; x += 13) {
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.arc(x + 6.5, y, 3.2, 0, Math.PI * 2);
      ctx.arc(x + 3.2, y - 3.5, 2.4, 0, Math.PI * 2);
      ctx.arc(x + 3.2, y + 3.5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#f1ecdc";
  ctx.fillRect(0, 0, W, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function poolTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.5, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
