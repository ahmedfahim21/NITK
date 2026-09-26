import * as THREE from "three";
import { loadCampus } from "./osm/load";
import { buildWorld } from "./world";
import { PRESETS, TIME_ORDER, type TimeOfDay } from "./fx/presets";
import { shadowTint } from "./fx/toon";
import { RenderPipeline, type Quality } from "./fx/render";
import { Sky } from "./fx/sky";
import { Input, Player } from "./player";
import { Hud } from "./ui/hud";

const msg = document.getElementById("loading-msg")!;
const progress = (m: string) => {
  msg.textContent = m;
};
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

async function main() {
  const canvas = document.getElementById("view") as HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch {
    progress("This browser could not start WebGL, which the campus needs.");
    return;
  }

  const map = await loadCampus(progress);
  progress(`Building ${map.buildings.length} buildings and ${map.roads.length} roads…`);
  await nextFrame();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 4800);
  const world = buildWorld(map);
  scene.add(world.group);

  const sky = new Sky();
  scene.add(sky.group);

  const hemi = new THREE.HemisphereLight(0xcfe4f6, 0x6f7f4a, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  scene.add(sun, sun.target);
  // Cool fill from the opposite quarter carries the shadow side (SADAK's rig).
  const fill = new THREE.DirectionalLight(0xb8c4ec, 0.8);
  scene.add(fill, fill.target);
  scene.add(new THREE.AmbientLight(0xffffff, 0.08));

  const params = new URLSearchParams(location.search);
  const quality = (params.get("quality") as Quality) || (matchMedia("(max-width: 700px)").matches ? "low" : "high");
  const pipeline = new RenderPipeline(renderer, scene, camera, sun, quality);

  const input = new Input(canvas);
  const player = new Player(camera, world.grid, input);
  scene.add(player.body);
  player.place(world.spawn.x, world.spawn.z, world.spawn.facing);

  const teleport = (x: number, z: number) => {
    const [fx, fz] = world.grid.nearestFree(x, z);
    player.place(fx, fz, player.facing);
    if (player.drone) player.toggleDrone();
  };
  const hud = new Hud(map, world.places, player, camera, teleport);

  /* ---- time of day ---- */
  let time: TimeOfDay = (params.get("time") as TimeOfDay) || "morning";
  const timesEl = document.getElementById("times")!;
  const labels: Record<TimeOfDay, string> = { morning: "☀ AM", noon: "Noon", sunset: "Sunset", night: "Night" };
  const buttons = new Map<TimeOfDay, HTMLButtonElement>();
  for (const t of TIME_ORDER) {
    const b = document.createElement("button");
    b.textContent = labels[t];
    b.addEventListener("click", () => setTime(t));
    timesEl.appendChild(b);
    buttons.set(t, b);
  }
  function setTime(t: TimeOfDay) {
    time = t;
    const p = PRESETS[t];
    pipeline.apply(p);
    sky.apply(p);
    world.apply(p);
    shadowTint.value.set(p.shadowTint);
    sun.color.set(p.sun.color);
    sun.intensity = p.sun.intensity;
    hemi.color.set(p.hemi.sky);
    hemi.groundColor.set(p.hemi.ground);
    hemi.intensity = p.hemi.intensity;
    fill.intensity = p.sun.intensity * 0.4;
    fill.color.set(p.hemi.sky).lerp(new THREE.Color(0xa99ce0), 0.4);
    const az = THREE.MathUtils.degToRad(p.sun.azimuth + 180);
    fill.position.set(Math.sin(az) * 100, 60, -Math.cos(az) * 100);
    for (const [k, b] of buttons) b.classList.toggle("on", k === t);
  }
  setTime(time);

  /* ---- data source badge ---- */
  const src = document.getElementById("source")!;
  const attribution = `Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors`;
  src.innerHTML =
    map.source === "fallback"
      ? `<span class="warn">Offline: approximate layout.</span> Connect to the internet (or run <code>npm run osm:fetch</code>) for the real OpenStreetMap campus.`
      : `${attribution} · ${map.source === "snapshot" ? "snapshot" : "live"} · ${world.stats.buildings} buildings`;

  const droneBtn = document.getElementById("btn-drone")!;
  droneBtn.addEventListener("click", () => {
    player.toggleDrone();
    droneBtn.classList.toggle("on", player.drone);
  });
  document.getElementById("btn-map")!.addEventListener("click", () => hud.toggleMap());
  const help = document.getElementById("help")!;

  const resize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    pipeline.resize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", resize);
  resize();

  // Expose for debugging and automated screenshots.
  Object.assign(window, { nitk: { map, world, player, camera, setTime, teleport, hud } });

  const clock = new THREE.Clock();
  const fpsEl = document.getElementById("fps")!;
  let frames = 0;
  let fpsT = 0;
  document.getElementById("loading")!.classList.add("done");

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (input.hit("KeyM")) hud.toggleMap();
    if (input.hit("Escape") && hud.isMapOpen) hud.toggleMap(false);
    if (input.hit("KeyF")) {
      player.toggleDrone();
      droneBtn.classList.toggle("on", player.drone);
    }
    if (input.hit("KeyT")) setTime(TIME_ORDER[(TIME_ORDER.indexOf(time) + 1) % TIME_ORDER.length]);
    if (input.hit("KeyH")) help.classList.toggle("hidden");

    if (!hud.isMapOpen) player.update(dt);
    input.endFrame();

    world.update(t);
    sky.follow(camera);
    pipeline.focusShadows(player.pos);
    pipeline.render();
    hud.update();

    frames++;
    fpsT += dt;
    if (fpsT > 1) {
      fpsEl.textContent = `${Math.round(frames / fpsT)} fps`;
      frames = 0;
      fpsT = 0;
    }
  });
}

main().catch((err) => {
  console.error(err);
  progress(`Something went wrong: ${String(err?.message ?? err)}`);
});
