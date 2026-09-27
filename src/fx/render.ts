/**
 * Cel render pipeline, ported from SADAK's render.ts:
 *
 *   scene -> rtScene (linear half-float colour + depth texture)
 *         -> cel pass  : ink lines, haze, tone, grade, linear->sRGB
 *         -> fxaa pass : cleans up the line work, straight to the canvas
 */
import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { CelShader, FxaaShader } from "./celShader";
import type { Preset } from "./presets";

export type Quality = "high" | "medium" | "low";

const TIERS: Record<Quality, { budget: number; maxScale: number; shadow: number }> = {
  high: { budget: 4.6e6, maxScale: 2, shadow: 4096 },
  medium: { budget: 2.8e6, maxScale: 1.5, shadow: 2048 },
  low: { budget: 1.4e6, maxScale: 1, shadow: 1024 },
};

/** Half-extent of the shadow frustum around the player. */
const SHADOW_EXTENT = 90;

function makeQuad(def: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(def.uniforms),
    vertexShader: def.vertexShader,
    fragmentShader: def.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  return { quad: new FullScreenQuad(mat), mat };
}

export class RenderPipeline {
  private rtScene: THREE.WebGLRenderTarget;
  private rtGraded: THREE.WebGLRenderTarget;
  private cel = makeQuad(CelShader);
  private fxaa = makeQuad(FxaaShader);
  private css = new THREE.Vector2(1, 1);
  private tier = TIERS.high;
  private sunOffset = new THREE.Vector3();

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private sun: THREE.DirectionalLight,
    quality: Quality
  ) {
    renderer.toneMapping = THREE.NoToneMapping;
    this.tier = TIERS[quality];

    this.rtScene = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    const depth = new THREE.DepthTexture(2, 2);
    depth.format = THREE.DepthFormat;
    depth.type = THREE.UnsignedIntType;
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;
    this.rtScene.depthTexture = depth;

    this.rtGraded = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });

    this.cel.mat.uniforms.tDiffuse.value = this.rtScene.texture;
    this.cel.mat.uniforms.tDepth.value = this.rtScene.depthTexture;
    this.fxaa.mat.uniforms.tDiffuse.value = this.rtGraded.texture;

    sun.castShadow = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    sun.shadow.mapSize.set(this.tier.shadow, this.tier.shadow);
    sun.shadow.normalBias = 0.06;
    sun.shadow.bias = -0.0004;
    const c = sun.shadow.camera;
    c.left = -SHADOW_EXTENT;
    c.right = SHADOW_EXTENT;
    c.top = SHADOW_EXTENT;
    c.bottom = -SHADOW_EXTENT;
    c.near = 1;
    c.far = 700;
    c.updateProjectionMatrix();
  }

  apply(p: Preset) {
    const u = this.cel.mat.uniforms;
    u.uInkColor.value.fromArray(p.ink.color);
    u.uInkStrength.value = p.ink.strength;
    u.uInkFadeStart.value = p.ink.fadeStart;
    u.uInkFadeEnd.value = p.ink.fadeEnd;
    u.uExposure.value = p.tone.exposure;
    this.baseExposure = p.tone.exposure;
    u.uSplitShadow.value.fromArray(p.tone.splitShadow);
    u.uSplitLight.value.fromArray(p.tone.splitLight);
    u.uShadowLift.value = p.tone.shadowLift;
    u.uLift.value.fromArray(p.grade.lift);
    u.uGamma.value.fromArray(p.grade.gamma);
    u.uGain.value.fromArray(p.grade.gain);
    u.uSaturation.value = p.grade.saturation;
    u.uTemperature.value = p.grade.temperature;
    u.uVignetteStrength.value = p.grade.vignette.strength;
    u.uVignetteRadius.value = p.grade.vignette.radius;
    u.uHazeColor.value.fromArray(p.haze.color);
    u.uHazeDensity.value = p.haze.density;
    u.uHazeHorizonBoost.value = p.haze.horizonBoost;

    const el = THREE.MathUtils.degToRad(p.sun.elevation);
    const az = THREE.MathUtils.degToRad(p.sun.azimuth);
    // Azimuth clockwise from north; north is -z.
    this.sunOffset.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(300);
  }

  setQuality(q: Quality) {
    this.tier = TIERS[q];
    this.sun.shadow.mapSize.set(this.tier.shadow, this.tier.shadow);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.resize(this.css.x, this.css.y);
  }

  resize(w: number, h: number) {
    this.css.set(Math.max(1, w), Math.max(1, h));
    const dpr = window.devicePixelRatio || 1;
    let scale = Math.min(dpr < 1.5 ? 1.5 : dpr, this.tier.maxScale);
    const px = this.css.x * this.css.y;
    if (px * scale * scale > this.tier.budget) scale = Math.max(0.75, Math.sqrt(this.tier.budget / px));
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(this.css.x, this.css.y, false);
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rtScene.setSize(buf.x, buf.y);
    this.rtGraded.setSize(buf.x, buf.y);
    const u = this.cel.mat.uniforms;
    u.uTexel.value.set(1 / buf.x, 1 / buf.y);
    u.cameraNear.value = this.camera.near;
    u.cameraFar.value = this.camera.far;
    u.uInkThickness.value = 1.05 + 0.55 * scale;
    this.fxaa.mat.uniforms.uTexel.value.set(1 / buf.x, 1 / buf.y);
  }

  /** Follows the player so shadows stay sharp wherever they walk. */
  focusShadows(target: THREE.Vector3) {
    const texel = (SHADOW_EXTENT * 2) / this.sun.shadow.mapSize.x;
    const dir = this.sunOffset.clone().normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const up = dir.clone().cross(right).normalize();
    const r = Math.round(target.dot(right) / texel) * texel;
    const u = Math.round(target.dot(up) / texel) * texel;
    const d = target.dot(dir);
    const snapped = right.multiplyScalar(r).addScaledVector(up, u).addScaledVector(dir, d);
    this.sun.position.copy(snapped).add(this.sunOffset);
    this.sun.target.position.copy(snapped);
    this.sun.target.updateMatrixWorld();
  }

  private flashAmt = 0;
  private baseExposure = 1;

  /** A lightning flash: brief overexposure that decays over a few frames. */
  flash(amount = 1.6) {
    this.flashAmt = Math.max(this.flashAmt, amount);
  }

  render() {
    const u = this.cel.mat.uniforms;
    if (this.flashAmt > 0.01) {
      u.uExposure.value = this.baseExposure * (1 + this.flashAmt);
      this.flashAmt *= 0.82;
    } else if (this.flashAmt > 0) {
      this.flashAmt = 0;
      u.uExposure.value = this.baseExposure;
    }
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(this.scene, this.camera);
    r.setRenderTarget(this.rtGraded);
    this.cel.quad.render(r);
    r.setRenderTarget(null);
    this.fxaa.quad.render(r);
  }
}
