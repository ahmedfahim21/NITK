/**
 * Painted sky dome with a faint quantisation, flat two-tone cel clouds, a sun
 * disc and stars. Dome and cloud approach ported from SADAK's fx/sky.ts
 * (itself adapted from sakura-crossing, MIT, Copyright (c) 2026 Kenton Wang).
 */
import * as THREE from "three";
import { mulberry32 } from "../geo";
import type { Preset } from "./presets";

export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private cloudLight: THREE.MeshBasicMaterial;
  private cloudShade: THREE.MeshBasicMaterial;
  private sunDisc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  constructor(private radius = 3200) {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uStops: { value: [0, 1, 2, 3, 4].map(() => new THREE.Color()) }, uBands: { value: 28 } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uStops[5];
          uniform float uBands;
          varying vec3 vDir;
          void main() {
            float e = clamp( normalize( vDir ).y, 0.0, 1.0 );
            float q = floor( e * uBands ) / uBands;
            e = mix( e, q, 0.3 );
            vec3 c = uStops[4];
            c = mix( c, uStops[3], smoothstep( 0.0, 0.07, e ) );
            c = mix( c, uStops[2], smoothstep( 0.05, 0.2, e ) );
            c = mix( c, uStops[1], smoothstep( 0.16, 0.5, e ) );
            c = mix( c, uStops[0], smoothstep( 0.42, 0.95, e ) );
            gl_FragColor = vec4( c, 1.0 );
          }`,
      })
    );
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    this.group.add(this.dome);

    const tex = cloudTexture();
    this.cloudLight = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, depthWrite: false, fog: false });
    this.cloudShade = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    const rand = mulberry32(7781);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const r = radius * (0.7 + rand() * 0.2);
      const w = 260 + rand() * 420;
      const h = w * (0.3 + rand() * 0.1);
      const y = Math.tan(THREE.MathUtils.degToRad(5 + rand() * 22)) * r;
      const g = new THREE.Group();
      const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.cloudShade);
      back.position.set(0, -h * 0.08, -1.5);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.9), this.cloudLight);
      front.position.set(-w * 0.02, h * 0.04, 0);
      g.add(back, front);
      g.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      g.lookAt(0, y * 0.5, 0);
      g.renderOrder = -9;
      this.group.add(g);
    }

    this.sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.035, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false, depthWrite: false, transparent: true })
    );
    this.sunDisc.renderOrder = -9;
    this.group.add(this.sunDisc);

    const starPos: number[] = [];
    const srand = mulberry32(31);
    for (let i = 0; i < 1400; i++) {
      const u = srand() * Math.PI * 2;
      const v = Math.acos(1 - srand() * 0.95);
      const r = radius * 0.95;
      starPos.push(Math.sin(v) * Math.cos(u) * r, Math.cos(v) * r, Math.sin(v) * Math.sin(u) * r);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false })
    );
    this.stars.renderOrder = -9;
    this.group.add(this.stars);
  }

  apply(p: Preset) {
    const stops = this.dome.material.uniforms.uStops.value as THREE.Color[];
    p.sky.forEach((hex, i) => stops[i].set(hex));
    this.cloudLight.color.set(p.sky[4]).lerp(new THREE.Color(0xffffff), p.glow > 0.8 ? 0.1 : 0.7);
    this.cloudShade.color
      .set(p.sky[1])
      .lerp(new THREE.Color(0xffffff), p.glow > 0.8 ? 0.05 : 0.45)
      .lerp(new THREE.Color(0x9a90c8), 0.25);
    this.cloudLight.opacity = p.glow > 0.8 ? 0.35 : 0.92;
    this.cloudShade.opacity = p.glow > 0.8 ? 0.3 : 0.85;

    const el = THREE.MathUtils.degToRad(p.sun.elevation);
    const az = THREE.MathUtils.degToRad(p.sun.azimuth);
    const d = this.radius * 0.9;
    const night = p.glow > 0.8;
    this.sunDisc.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, -Math.cos(az) * Math.cos(el) * d);
    this.sunDisc.lookAt(0, 0, 0);
    this.sunDisc.material.color.set(night ? 0xe8eeff : p.sun.color).lerp(new THREE.Color(0xffffff), 0.5);
    this.sunDisc.scale.setScalar(night ? 0.55 : 1);
    this.stars.material.opacity = night ? 0.9 : 0;
    this.stars.visible = night;
  }

  follow(camera: THREE.Camera) {
    this.group.position.set(camera.position.x, 0, camera.position.z);
  }
}

function cloudTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 192;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(8812);
  const base = H * 0.78;
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const x = W * (0.1 + t * 0.8) + (rand() - 0.5) * 30;
    const hump = Math.sin(t * Math.PI);
    const r = 22 + hump * 52 + rand() * 18;
    const y = base - r * (0.35 + hump * 0.35);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.clearRect(0, base, W, H - base);
  ctx.fillRect(W * 0.12, base - 10, W * 0.76, 10);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
