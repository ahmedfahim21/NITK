import * as THREE from "three";
import { loadCampus } from "./osm/load";
import { buildWorld } from "./world";
import { PRESETS, TIME_ORDER, type TimeOfDay } from "./fx/presets";
import { shadowTint } from "./fx/toon";
import { RenderPipeline, type Quality } from "./fx/render";
import { Sky } from "./fx/sky";
import { Input, Player } from "./player";
import { Hud } from "./ui/hud";
import { Game } from "./game";
import { GameState } from "./game/state";
import { GameUI } from "./game/ui";
import { Music } from "./game/music";
import { mix, setMix, unlockAudio } from "./game/audio";
import { applyOverrides, loadOverrides } from "./world/overrides";
import { SEASONS, SEASON_SAMPLE_DAY, seasonalPreset, type Season, type SeasonId } from "./game/seasons";
import type { Preset } from "./fx/presets";
import { STORY_MODE } from "./flags";

/** The monsoon version of a preset: grey sky, weak sun, thick haze. */
function rainy(p: Preset): Preset {
  const grey = (hex: string, k: number) => "#" + new THREE.Color(hex).lerp(new THREE.Color(0x7d8794), k).getHexString();
  return {
    ...p,
    sky: p.sky.map((c) => grey(c, p.glow > 0.8 ? 0.3 : 0.7)) as Preset["sky"],
    sun: { ...p.sun, intensity: p.sun.intensity * 0.35 },
    hemi: { ...p.hemi, intensity: p.hemi.intensity * 1.35 },
    sea: { ...p.sea, deep: 0x2f4f63, shallow: 0x55808c },
    grade: { ...p.grade, saturation: p.grade.saturation * 0.82 },
    haze: { ...p.haze, color: [0.62, 0.66, 0.7], density: p.haze.density * 2.2 },
  };
}

const PERIOD_START: Record<TimeOfDay, number> = { morning: 7 * 60, noon: 12 * 60, sunset: 17 * 60 + 45, night: 21 * 60 };

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
  applyOverrides(map, await loadOverrides());
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

  /* ---- time of day: driven by the game clock ---- */
  let time: TimeOfDay = "morning";
  let raining = false;
  let season: Season = SEASONS.monsoon;
  world.setSeason(season);
  let game: Game | null = null;
  const timesEl = document.getElementById("times")!;
  const labels: Record<TimeOfDay, string> = { morning: "☀ AM", noon: "Noon", sunset: "Sunset", night: "Night" };
  const buttons = new Map<TimeOfDay, HTMLButtonElement>();
  for (const t of TIME_ORDER) {
    const b = document.createElement("button");
    b.textContent = labels[t];
    b.title = "Skip the clock ahead to this time";
    b.addEventListener("click", () => skipTo(t));
    timesEl.appendChild(b);
    buttons.set(t, b);
  }
  function skipTo(t: TimeOfDay) {
    if (game) game.state.advanceTo(PERIOD_START[t]);
    else setTime(t, raining);
  }
  function setTime(t: TimeOfDay, rain = raining, s: Season = season) {
    time = t;
    raining = rain;
    season = s;
    const seasonal = seasonalPreset(PRESETS[t], s);
    const p = rain ? rainy(seasonal) : seasonal;
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
  setTime((params.get("time") as TimeOfDay) || "morning");

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

  /* ---- sound ---- */
  const music = new Music();
  window.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("keydown", unlockAudio);
  const soundRow = document.getElementById("sound")!;
  const musicBtn = document.createElement("button");
  const renderMusicBtn = () => {
    musicBtn.textContent = mix.musicOn ? "♪ Music on" : "♪ Music off";
    musicBtn.classList.toggle("on", mix.musicOn);
  };
  musicBtn.addEventListener("click", () => {
    setMix({ musicOn: !mix.musicOn });
    renderMusicBtn();
  });
  renderMusicBtn();
  const nextBtn = document.createElement("button");
  nextBtn.textContent = "⏭";
  nextBtn.title = "Next track (N)";
  nextBtn.addEventListener("click", () => music.next());
  const mixBtn = document.createElement("button");
  mixBtn.textContent = "🔊";
  mixBtn.title = "Volume";
  const mixPanel = document.getElementById("mix")!;
  mixBtn.addEventListener("click", () => mixPanel.classList.toggle("open"));
  soundRow.append(musicBtn, nextBtn, mixBtn);
  for (const key of ["master", "music", "sfx", "ambience"] as const) {
    const row = document.createElement("label");
    row.textContent = key === "sfx" ? "Effects" : key[0].toUpperCase() + key.slice(1);
    const r = document.createElement("input");
    r.type = "range";
    r.min = "0";
    r.max = "1";
    r.step = "0.05";
    r.value = String(mix[key]);
    r.addEventListener("input", () => setMix({ [key]: Number(r.value) }));
    row.appendChild(r);
    mixPanel.appendChild(row);
  }

  /* ---- the game ---- */
  const saved = STORY_MODE ? GameState.load() : null;
  const gameUi = new GameUI();
  const startGame = (mode: "new" | "continue" | "explore") => {
    const fresh = mode !== "continue";
    if (mode === "new") GameState.clear();
    const state = mode === "continue" && saved ? saved.state : new GameState();
    game = new Game(
      map,
      world,
      player,
      input,
      hud,
      camera,
      {
        applyTime: (period, rain, s) => setTime(period, rain, s),
        flash: (k) => pipeline.flash(k),
        music,
        mode: mode === "explore" ? "explore" : "story",
      },
      state,
      gameUi
    );
    scene.add(game.group);
    void game.begin(fresh || !saved, saved?.pos);
    if (mode === "explore") {
      document.body.classList.add("exploring");
      // Season and weather pickers, for checking assets across the year.
      const row = document.getElementById("season-row")!;
      row.style.display = "flex";
      const sel = document.createElement("select");
      for (const [id, label] of [
        ["monsoon", "Monsoon · 15 Aug"],
        ["postmonsoon", "Post-monsoon · 8 Nov (Deepavali)"],
        ["winter", "Winter · 25 Dec (Christmas)"],
        ["summer", "Summer · 29 Mar (gulmohar)"],
      ] as const) {
        const o = document.createElement("option");
        o.value = id;
        o.textContent = label;
        sel.appendChild(o);
      }
      sel.addEventListener("change", () => {
        const st = game!.state;
        st.day = SEASON_SAMPLE_DAY[sel.value as SeasonId];
        st.raining = false;
      });
      const rainBtn = document.createElement("button");
      rainBtn.textContent = "Rain";
      rainBtn.addEventListener("click", () => {
        game!.state.raining = !game!.state.raining;
        rainBtn.classList.toggle("on", game!.state.raining);
      });
      row.append(sel, rainBtn);
    }
    Object.assign(window, { nitk: { map, world, player, camera, setTime, teleport, hud, game, renderer, scene, music } });
  };

  // Expose for debugging and automated screenshots.
  Object.assign(window, { nitk: { map, world, player, camera, setTime, teleport, hud, game, renderer, scene, music } });

  const clock = new THREE.Clock();
  const fpsEl = document.getElementById("fps")!;
  let frames = 0;
  let fpsT = 0;
  document.getElementById("loading")!.classList.add("done");
  if (params.has("explore")) {
    startGame("explore");
  } else if (params.has("autostart") && STORY_MODE) {
    startGame("new");
  } else {
    const choice = await gameUi.titleCard({
      story: STORY_MODE,
      title: "NITK: FRESHER YEAR",
      blurb: STORY_MODE
        ? "Monsoon, 2026. You've just got off the bus on NH66 with one suitcase and no idea where anything is. Four years at Surathkal start now: messes, classes, clubs, cycles, and the sunset from the lighthouse hill."
        : "The NITK Surathkal campus, rebuilt from OpenStreetMap: the Main Building, the hostels, the beach and the lighthouse on its hill. Story Mode is coming soon.",
      hasSave: !!saved,
    });
    startGame(choice);
  }

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (input.hit("KeyM")) hud.toggleMap();
    if (input.hit("Escape") && hud.isMapOpen) hud.toggleMap(false);
    if (input.hit("KeyF")) {
      player.toggleDrone();
      droneBtn.classList.toggle("on", player.drone);
    }
    if (input.hit("KeyT")) skipTo(TIME_ORDER[(TIME_ORDER.indexOf(time) + 1) % TIME_ORDER.length]);
    if (input.hit("KeyH")) help.classList.toggle("hidden");

    if (!hud.isMapOpen) player.update(dt);
    if (game && !hud.isMapOpen) game.update(dt);
    input.endFrame();

    world.update(t, camera.position);
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
