/**
 * Yearbook portraits: each character's own rigged model, standing at idle,
 * framed head and shoulders and rendered once with the toon shader into an
 * image. Someone you haven't met is the same pose as a flat silhouette.
 *
 * One small offscreen renderer does them all, then lets its context go.
 */
import * as THREE from "three";
import { makePerson, type Look } from "../people";

const W = 240;
const H = 280;
const cache = new Map<string, string>();

export function renderPortraits(items: { key: string; look: Look; silhouette: boolean }[]): Map<string, string> {
  const todo = items.filter((it) => !cache.has(`${it.key}|${it.silhouette}`));
  if (todo.length) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a7a8a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.2, 2.4, 2.2);
    scene.add(key);
    const camera = new THREE.PerspectiveCamera(24, W / H, 0.1, 20);
    const black = new THREE.MeshBasicMaterial({ color: 0x1b1f2a });
    const head = new THREE.Vector3();
    try {
      for (const it of todo) {
        const p = makePerson(it.look);
        // A few frames of idle, so arms hang and the head settles.
        for (let i = 0; i < 8; i++) p.anim.update({ dt: 0.05, t: i * 0.05, speed: 0, accel: 0, turn: 0, air: 0, vy: 0, crouch: 0, look: 0 });
        p.root.rotation.y = -0.35;
        if (it.silhouette) p.root.traverse((o) => o instanceof THREE.Mesh && (o.material = black));
        scene.add(p.root);
        p.root.updateMatrixWorld(true);
        p.rig.head.getWorldPosition(head);
        // The head bone sits at the neck; the face is ~0.1 m above it.
        camera.position.set(head.x + 0.1, head.y + 0.14, head.z + 2.25);
        camera.lookAt(head.x, head.y - 0.1, head.z);
        renderer.render(scene, camera);
        cache.set(`${it.key}|${it.silhouette}`, canvas.toDataURL("image/png"));
        scene.remove(p.root);
        p.root.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            if (o.material !== black) (o.material as THREE.Material).dispose();
          }
        });
      }
    } finally {
      black.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }
  return new Map(items.map((it) => [it.key, cache.get(`${it.key}|${it.silhouette}`)!]));
}
