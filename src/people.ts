/**
 * Everyone who isn't you: the named characters, the cyclists and the crowd,
 * on the same skeleton and animator as the hero (hero.ts) so they walk,
 * idle, glance and ride the same way.
 *
 * Bodies are lighter than the hero's and built in clothing slots (skin,
 * top, bottoms, shoes, hair, long hair, bag, umbrella). A named character
 * bakes its colours in, one mesh per bone; the crowd instances each
 * (bone, slot) part and tints it per student, so hundreds of students cost
 * a couple of dozen draw calls.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toon } from "./fx/toon";
import { HeroAnimator, makeSkeleton, type HeroRig } from "./hero";

export type Look = {
  skin: number;
  shirt: number;
  pants: number;
  shoe: number;
  hair: number;
  /** Backpack colour, or null for none. */
  bag: number | null;
  longHair?: boolean;
};

export type Slot = "skin" | "top" | "bottom" | "shoe" | "hair" | "long" | "bag" | "umbrella";
export type BoneName = Exclude<keyof HeroRig, "root">;
export type Part = { bone: BoneName; slot: Slot; geo: THREE.BufferGeometry };

const THIGH = 0.44;
const SHIN = 0.43;
const SEG = 8;

const limb = (r0: number, len: number, r1 = r0) => new THREE.CylinderGeometry(r0, r1, len, SEG, 1).translate(0, -len / 2, 0);

/** Parts in bone-local space, grouped by bone and slot (merged where they share both). */
export function personParts(): Part[] {
  const raw: Part[] = [];
  const add = (bone: BoneName, slot: Slot, geo: THREE.BufferGeometry) => raw.push({ bone, slot, geo: geo.index ? geo.toNonIndexed() : geo });

  add("pelvis", "bottom", new THREE.CylinderGeometry(0.155, 0.165, 0.2, SEG).translate(0, -0.06, 0));
  add("pelvis", "top", new THREE.CylinderGeometry(0.182, 0.19, 0.1, SEG, 1, true).translate(0, 0.07, 0));
  for (const side of ["L", "R"] as const) {
    add(`hip${side}`, "bottom", limb(0.078, THIGH, 0.062));
    add(`hip${side}`, "bottom", new THREE.SphereGeometry(0.078, SEG, 6));
    add(`knee${side}`, "bottom", limb(0.06, SHIN - 0.02, 0.052));
    add(`ankle${side}`, "shoe", new THREE.BoxGeometry(0.1, 0.08, 0.26).translate(0, -0.04, 0.05));
    add(`shoulder${side}`, "top", new THREE.SphereGeometry(0.066, SEG, 6));
    add(`shoulder${side}`, "top", limb(0.066, 0.13, 0.06));
    add(`shoulder${side}`, "skin", limb(0.05, 0.28, 0.046));
    add(`elbow${side}`, "skin", limb(0.044, 0.23, 0.036));
    add(`wrist${side}`, "skin", new THREE.BoxGeometry(0.06, 0.09, 0.035).translate(0, -0.045, 0.005));
  }
  add("spine", "top", new THREE.CylinderGeometry(0.182, 0.185, 0.2, SEG).translate(0, 0.08, 0));
  add("chest", "top", new THREE.CylinderGeometry(0.212, 0.182, 0.3, SEG).scale(1, 1, 0.78).translate(0, 0.13, 0));
  add("chest", "top", new THREE.SphereGeometry(0.212, SEG, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 0.78).translate(0, 0.28, 0));
  // Backpack straps ride with the bag's colour.
  for (const s of [-1, 1]) add("chest", "bag", new THREE.BoxGeometry(0.032, 0.3, 0.01).rotateX(0.12).translate(s * 0.135, 0.16, 0.162));
  add("bag", "bag", new THREE.BoxGeometry(0.3, 0.38, 0.14).translate(0, -0.22, -0.035));
  add("neck", "skin", new THREE.CylinderGeometry(0.048, 0.056, 0.1, SEG).translate(0, 0.04, 0));
  add("head", "skin", new THREE.SphereGeometry(0.1, 12, 10).scale(0.92, 1.12, 1).translate(0, 0.09, 0));
  add("head", "skin", new THREE.SphereGeometry(0.07, SEG, 6).scale(1, 0.8, 1).translate(0, 0.02, 0.035));
  for (const s of [-1, 1]) {
    add("head", "skin", new THREE.SphereGeometry(0.022, 6, 4).scale(0.5, 1, 0.8).translate(s * 0.093, 0.085, 0));
    // Eyes and brows take the hair colour: dark enough, and one less slot.
    add("head", "hair", new THREE.SphereGeometry(0.013, 6, 4).scale(1, 0.8, 0.5).translate(s * 0.035, 0.11, 0.092));
    add("head", "hair", new THREE.BoxGeometry(0.04, 0.009, 0.01).translate(s * 0.036, 0.137, 0.094));
  }
  add("head", "hair", new THREE.SphereGeometry(0.108, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.38).scale(0.95, 1.12, 1.05).translate(0, 0.1, -0.008));
  add("head", "hair", new THREE.SphereGeometry(0.106, 10, 6, Math.PI, Math.PI, 0, Math.PI * 0.72).scale(0.95, 1.1, 1.02).translate(0, 0.1, -0.01));
  // Long hair: down the back, past the shoulders.
  add("head", "long", new THREE.BoxGeometry(0.2, 0.34, 0.07).translate(0, -0.04, -0.09));
  add("head", "long", new THREE.SphereGeometry(0.11, 10, 6).scale(1, 0.6, 0.6).translate(0, 0.12, -0.05));
  // An umbrella held at the shoulder (the right arm is raised to it while it's out).
  const canopy = new THREE.ConeGeometry(0.72, 0.3, 10, 1, true).translate(0.14, 0.95, 0.12);
  add("chest", "umbrella", canopy);
  add("chest", "umbrella", new THREE.CylinderGeometry(0.012, 0.012, 0.95).translate(0.14, 0.4, 0.12));

  // Merge parts that share a bone and a slot.
  const byKey = new Map<string, Part[]>();
  for (const p of raw) {
    const k = `${p.bone}|${p.slot}`;
    const list = byKey.get(k) ?? [];
    list.push(p);
    byKey.set(k, list);
  }
  const out: Part[] = [];
  for (const list of byKey.values()) {
    const geo = list.length === 1 ? list[0].geo : mergeGeometries(list.map((p) => p.geo), false);
    if (!geo) throw new Error(`[people] could not merge ${list[0].bone}/${list[0].slot}`);
    out.push({ bone: list[0].bone, slot: list[0].slot, geo });
  }
  return out;
}

export function slotColour(look: Look, slot: Slot): number | null {
  switch (slot) {
    case "skin":
      return look.skin;
    case "top":
      return look.shirt;
    case "bottom":
      return look.pants;
    case "shoe":
      return look.shoe;
    case "hair":
      return look.hair;
    case "long":
      return look.longHair ? look.hair : null;
    case "bag":
      return look.bag;
    case "umbrella":
      return null;
  }
}

let shared: Part[] | null = null;
function sharedParts(): Part[] {
  return (shared ??= personParts());
}

/** A named character (or a cyclist): the skeleton with its look baked in, one mesh per bone. */
export function makePerson(look: Look): { root: THREE.Group; rig: HeroRig; anim: HeroAnimator } {
  const rig = makeSkeleton("person");
  const mat = toon(0xffffff, { vertexColors: true, flat: false });
  const perBone = new Map<BoneName, THREE.BufferGeometry[]>();
  for (const p of sharedParts()) {
    const hex = slotColour(look, p.slot);
    if (hex === null) continue;
    const g = p.geo.clone();
    const c = new THREE.Color(hex);
    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const list = perBone.get(p.bone) ?? [];
    list.push(g);
    perBone.set(p.bone, list);
  }
  for (const [bone, list] of perBone) {
    const geo = mergeGeometries(list, false);
    if (!geo) throw new Error(`[people] could not merge ${bone}`);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    rig[bone].add(m);
  }
  return { root: rig.root, rig, anim: new HeroAnimator(rig) };
}
