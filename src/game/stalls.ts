/**
 * Recruitment-week stalls: a table, a canopy and a painted banner per club,
 * set out in an arc in front of the Students' Activity Centre.
 */
import * as THREE from "three";
import { toon } from "../fx/toon";
import { signTexture } from "../world/textures";
import type { Grid } from "../world/grid";
import { SOLID } from "../world/grid";
import { groundHeight } from "../world/terrain";

export type Club = {
  id: string;
  name: string;
  colour: string;
  exclusive: boolean;
  /** What the senior at the stall says. */
  pitch: string;
};

export const CLUBS: Club[] = [
  { id: "webclub", name: "WebClub", colour: "#1d3557", exclusive: false, pitch: "Web Enthusiasts' Club — basically the CS club. Do you know what a closure is? Don't answer. Just join." },
  { id: "stargazing", name: "Star Gazing Club", colour: "#2c2c6c", exclusive: false, pitch: "Clear skies are rare in the monsoon. Which is why we're very, very patient people." },
  { id: "lsd", name: "LSD — Literary, Stage & Debating", colour: "#7a2e1d", exclusive: false, pitch: "Literary, Stage and Debating. Yes, the acronym is intentional. No, we won't explain." },
  { id: "lug", name: "Linux Users Group", colour: "#2d3436", exclusive: false, pitch: "Do you use Linux? …You will. Everyone does, eventually. Usually at 2 AM." },
  { id: "music", name: "Music Club", colour: "#8e44ad", exclusive: false, pitch: "Can you play anything? Triangle counts. Enthusiastic triangle counts double." },
  { id: "photo", name: "Photography Club", colour: "#d35400", exclusive: false, pitch: "Golden hour at the lighthouse, every single day. Bring a phone, leave with a portfolio." },
  { id: "eforea", name: "E-FOREA · E-Pitch", colour: "#1e6f5c", exclusive: false, pitch: "Pitch me your startup in one line. …Maggi delivery to hostel rooms? Bold. Sign here." },
  { id: "spicmacay", name: "SPICMACAY", colour: "#b8860b", exclusive: false, pitch: "Carnatic concert at SJA this Friday. Front row's yours if you sign up now." },
  { id: "ieee", name: "IEEE NITK", colour: "#00629b", exclusive: true, pitch: "First year? Aww. Exclusive clubs recruit from second year. Come back next year — we'll remember your face." },
  { id: "acm", name: "ACM NITK", colour: "#0082ca", exclusive: true, pitch: "We'd love to have you. Next year. Solve a few hundred problems before then, yeah?" },
  { id: "ie", name: "IE — Institution of Engineers", colour: "#b33939", exclusive: true, pitch: "Code, Gadget, Garage, Robotics, Script — five SIGs, zero first-years. Rules are rules. See you in year two." },
  { id: "iet", name: "IET NITK", colour: "#6c5ce7", exclusive: true, pitch: "Next year! Bring that energy back in August and we'll talk." },
];

export type StallRig = { group: THREE.Group; spots: Map<string, { x: number; z: number; face: number }> };

/** Lays the stalls out on an arc of radius `r` round (cx, cz), opening toward `face`. */
export function buildStalls(cx: number, cz: number, face: number, grid: Grid, r = 22): StallRig {
  const group = new THREE.Group();
  const spots = new Map<string, { x: number; z: number; face: number }>();
  const n = CLUBS.length;
  const legMat = toon(0x9aa3a8);
  const tableMat = toon(0xe9dfca);
  CLUBS.forEach((club, i) => {
    const a = face + Math.PI + (i - (n - 1) / 2) * (Math.PI * 1.1) / (n - 1);
    let x = cx + Math.sin(a) * r;
    let z = cz + Math.cos(a) * r;
    [x, z] = grid.nearestFree(x, z, 25);
    const towards = Math.atan2(cx - x, cz - z);
    const stall = new THREE.Group();
    stall.position.set(x, groundHeight(x, z), z);
    stall.rotation.y = towards;
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.9), tableMat);
    table.position.y = 0.8;
    stall.add(table);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.7, 0.02), toon(new THREE.Color(club.colour)));
    cloth.position.set(0, 0.45, 0.46);
    stall.add(cloth);
    for (const [px, pz] of [
      [-1.3, -0.8],
      [1.3, -0.8],
      [-1.3, 0.6],
      [1.3, 0.6],
    ]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.5), legMat);
      pole.position.set(px, 1.25, pz);
      stall.add(pole);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 1.7), toon(new THREE.Color(club.colour).lerp(new THREE.Color(0xffffff), 0.35)));
    canopy.position.set(0, 2.52, -0.1);
    stall.add(canopy);
    const tex = signTexture([club.name.toUpperCase()], { bg: club.colour, fg: "#ffffff", w: 1024, h: 180 });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.48), toon(0xffffff, { map: tex, ramp: "soft" }));
    banner.position.set(0, 2.2, 0.66);
    stall.add(banner);
    if (club.exclusive) {
      const lock = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), toon(0xffffff, { map: signTexture(["2ND YEAR+"], { bg: "#1b1f2a", fg: "#ffd23f", w: 512, h: 170 }), ramp: "soft" }));
      lock.position.set(0.8, 1.2, 0.47);
      stall.add(lock);
    }
    stall.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    group.add(stall);
    grid.stampDisc(x, z, 1.1, SOLID, 2.6);
    // Stand in front of the table to talk; the senior stands behind it.
    const fx = x + Math.sin(towards) * 1.6;
    const fz = z + Math.cos(towards) * 1.6;
    spots.set(club.id, { x: fx, z: fz, face: towards });
    spots.set(`${club.id}:senior`, { x: x - Math.sin(towards) * 0.9, z: z - Math.cos(towards) * 0.9, face: towards });
  });
  return { group, spots };
}
