/**
 * Street lamps (with fake light pools that come up after dusk) and the
 * compound walls and fences from OSM barriers.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CampusMap } from "../osm/types";
import type { Lamp } from "./roads";
import { nightGlow, toon } from "../fx/toon";
import { SOLID, type Grid } from "./grid";
import { groundHeight } from "./terrain";

export type PropRig = { group: THREE.Group; setGlow(g: number): void };

export function buildProps(map: CampusMap, lamps: Lamp[], grid: Grid): PropRig {
  const group = new THREE.Group();
  group.name = "props";

  /* ---- lamps ---- */
  const kept = lamps.filter((l) => !grid.blocked(l.x, l.z));
  const pole = new THREE.CylinderGeometry(0.07, 0.11, 8, 6).translate(0, 4, 0);
  const arm = new THREE.BoxGeometry(1.6, 0.08, 0.08).translate(0.75, 7.9, 0);
  const poleGeo = mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed()])!;
  const headGeo = new THREE.BoxGeometry(0.7, 0.18, 0.32).translate(1.45, 7.8, 0);
  const poleMesh = new THREE.InstancedMesh(poleGeo, toon(0x8a9399), kept.length);
  const headMesh = new THREE.InstancedMesh(headGeo, toon(0xdde3e6, { glow: 0xfff0c0 }), kept.length);
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
  kept.forEach(({ x, z, ang: k }, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), k);
    const y = groundHeight(x, z);
    m.compose(new THREE.Vector3(x, y, z), q, one);
    poleMesh.setMatrixAt(i, m);
    headMesh.setMatrixAt(i, m);
    const hx = x + Math.cos(-k) * 1.45;
    const hz = z + Math.sin(-k) * 1.45;
    m.compose(new THREE.Vector3(hx, y + 0.3, hz), new THREE.Quaternion(), one);
    poolMesh.setMatrixAt(i, m);
    grid.stampDisc(x, z, 0.25, SOLID, 8);
  });
  poleMesh.castShadow = true;
  poleMesh.computeBoundingSphere();
  headMesh.computeBoundingSphere();
  poolMesh.computeBoundingSphere();
  poolMesh.renderOrder = 2;
  group.add(poleMesh, headMesh, poolMesh);

  /* ---- walls and fences ---- */
  const wallParts: THREE.BufferGeometry[] = [];
  for (const b of map.barriers) {
    const h = b.kind === "fence" ? 1.6 : b.kind === "hedge" ? 1.2 : 2.1;
    const t = b.kind === "fence" ? 0.08 : b.kind === "hedge" ? 0.8 : 0.25;
    for (let i = 1; i < b.pts.length; i++) {
      const [a, c] = [b.pts[i - 1], b.pts[i]];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 0.1) continue;
      const g = new THREE.BoxGeometry(len + t, h, t);
      g.rotateY(-Math.atan2(c[1] - a[1], c[0] - a[0]));
      g.translate((a[0] + c[0]) / 2, h / 2, (a[1] + c[1]) / 2);
      const col = new THREE.Color(b.kind === "hedge" ? 0x4f8a3a : b.kind === "fence" ? 0x6f7a80 : 0xd9cdb4);
      const nn = g.toNonIndexed();
      const arr = new Float32Array(nn.attributes.position.count * 3);
      for (let k = 0; k < arr.length; k += 3) {
        // Laterite-red plinth course on masonry walls.
        const y = nn.attributes.position.array[k + 1];
        const cc = b.kind === "wall" && y < 0.5 ? new THREE.Color(0xa65a3f) : col;
        arr.set([cc.r, cc.g, cc.b], k);
      }
      nn.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      nn.deleteAttribute("uv");
      wallParts.push(nn);
    }
    grid.strokeLine(b.pts, Math.max(0.5, t), SOLID, h);
  }
  if (wallParts.length) {
    const walls = new THREE.Mesh(mergeGeometries(wallParts)!, toon(0xffffff, { vertexColors: true }));
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);
  }

  return {
    group,
    setGlow(g) {
      poolMat.opacity = g * 0.55;
      poolMesh.visible = g > 0.05;
      nightGlow.value = g;
    },
  };
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
