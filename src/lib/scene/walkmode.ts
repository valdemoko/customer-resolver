/**
 * «Explorar a pie»: un personaje low poly que se maneja con el teclado y el ratón, con cámara en
 * tercera persona. Esta capa pone el personaje en la escena, lee las teclas y coloca la cámara; la
 * física y las colisiones viven en `walker.ts`.
 *
 * Controles: WASD o flechas arriba/abajo (adelante, atrás), A/D (de lado), flechas izquierda/derecha
 * (girar la cámara), Mayús (correr), Espacio (saltar), arrastrar con el ratón (mirar) y rueda
 * (acercar o alejar la cámara). No hay controles táctiles a propósito.
 */

import * as THREE from "three";
import { createWalker, stepWalker, WALKER, type WalkInput, type WalkWorld } from "./walker";

const DEG = Math.PI / 180;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type WalkModeOptions = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  container: HTMLElement;
  world: WalkWorld;
  /** Distancia hasta lo primero que hay en el rayo (edificios), o `null`. Aleja la cámara de las paredes. */
  rayDistance: (from: THREE.Vector3, direction: THREE.Vector3, maxDistance: number) => number | null;
  accentHex: number;
  reduceMotion: boolean;
};

export type WalkMode = {
  readonly active: boolean;
  /** Entra en el modo en (x, z) mirando hacia `yaw` (radianes; 0 = +x). Devuelve `false` si no hay sitio libre. */
  enter: (x: number, z: number, yaw: number) => boolean;
  /** Sale del modo y devuelve dónde estaba el personaje y hacia dónde miraba la cámara. */
  exit: () => { x: number; z: number; yaw: number } | null;
  /** Avanza un fotograma. Devuelve el punto del suelo bajo el personaje. */
  update: (dt: number) => THREE.Vector3;
  /** Estado actual del personaje (para diagnóstico y pruebas). */
  snapshot: () => { x: number; z: number; y: number; speed: number; heading: number; grounded: boolean };
  dispose: () => void;
};

const EMPTY_INPUT = (): WalkInput => ({ forward: false, back: false, left: false, right: false, run: false, jump: false });

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable;
}

export function createWalkMode(options: WalkModeOptions): WalkMode {
  const { scene, camera, container, world } = options;

  /* ---------------------------------------------------------------- personaje */
  const body = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: options.accentHex });
  const dark = new THREE.MeshLambertMaterial({ color: 0x23282e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xf0d2b0 });
  const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.62, 2, 7), shirt);
  capsule.position.y = 0.3 + 0.31 + 0.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), skin);
  head.position.y = 1.5;
  // Visera: marca hacia dónde mira el personaje (el frente es +x).
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.3), dark);
  visor.position.set(0.17, 1.55, 0);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.4), dark);
  legs.position.y = 0.13;
  for (const mesh of [capsule, head, visor, legs]) {
    mesh.castShadow = true;
    body.add(mesh);
  }
  body.visible = false;
  scene.add(body);

  /* ------------------------------------------------------------------- estado */
  let active = false;
  let state = createWalker(0, 0);
  let yaw = 0;
  let pitch = 18 * DEG; // hacia abajo: positivo
  let distance = 5.2;
  let bob = 0;
  let squash = 0;
  const input = EMPTY_INPUT();
  const keys = new Set<string>();
  const saved = { near: camera.near, far: camera.far, fov: camera.fov };

  const head3 = new THREE.Vector3();
  const wanted = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const ground = new THREE.Vector3();

  const syncInput = () => {
    const has = (...codes: string[]) => codes.some((code) => keys.has(code));
    input.forward = has("KeyW", "ArrowUp");
    input.back = has("KeyS", "ArrowDown");
    input.left = has("KeyA");
    input.right = has("KeyD");
    input.run = has("ShiftLeft", "ShiftRight");
    input.jump = has("Space");
  };

  const CONTROL_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space"]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!active || isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!CONTROL_KEYS.has(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
    syncInput();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (!keys.delete(event.code)) return;
    syncInput();
  };
  const releaseAll = () => {
    keys.clear();
    syncInput();
  };

  // Mirar arrastrando. Un clic corto sigue seleccionando (lo gestiona el motor): aquí solo se mueve la cámara.
  let dragId: number | null = null;
  let lastX = 0;
  let lastY = 0;
  const onPointerDown = (event: PointerEvent) => {
    if (!active) return;
    dragId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    try {
      container.setPointerCapture(event.pointerId);
    } catch {
      /* sin captura el arrastre sigue mientras el puntero esté encima */
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!active || dragId !== event.pointerId) return;
    yaw += (event.clientX - lastX) * 0.0052;
    pitch = clamp(pitch + (event.clientY - lastY) * 0.0042, -8 * DEG, 72 * DEG);
    lastX = event.clientX;
    lastY = event.clientY;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (dragId === event.pointerId) dragId = null;
  };
  const onWheel = (event: WheelEvent) => {
    if (!active) return;
    event.preventDefault();
    distance = clamp(distance * Math.exp(event.deltaY * 0.0011), 2.2, 11);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", releaseAll);
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("pointercancel", onPointerUp);
  container.addEventListener("wheel", onWheel, { passive: false });

  /* ------------------------------------------------------------------- cámara */
  function placeCamera(): void {
    head3.set(state.x, state.y + 1.45, state.z);
    // Posición deseada: detrás del personaje según hacia dónde mira la cámara, y más alta si se mira desde arriba.
    const horizontal = Math.cos(pitch) * distance;
    direction.set(-Math.cos(yaw) * horizontal, Math.sin(pitch) * distance, -Math.sin(yaw) * horizontal);
    const length = direction.length();
    let reach = length;
    // Una pared entre el personaje y la cámara la acerca, para no ver el interior de los edificios.
    const hit = options.rayDistance(head3, direction.clone().normalize(), length + 0.5);
    if (hit !== null) reach = clamp(hit - 0.45, 0.9, length);
    wanted.copy(head3).addScaledVector(direction, reach / length);
    wanted.y = Math.max(wanted.y, 0.5);
    camera.position.copy(wanted);
    camera.lookAt(head3.x, head3.y + 0.1, head3.z);
    body.visible = reach > 1.5;
  }

  function placeBody(dt: number): void {
    const moving = clamp(state.speed / WALKER.runSpeed, 0, 1);
    if (!options.reduceMotion) bob += dt * (6 + state.speed * 1.5);
    const stride = state.grounded && !options.reduceMotion ? Math.abs(Math.sin(bob)) * 0.07 * moving : 0;
    // Estirón al despegar y aplastamiento al caer, suaves.
    const target = state.grounded ? 0 : clamp(state.vy / 8, -0.5, 0.5) * 0.18;
    squash += (target - squash) * Math.min(1, dt * 14);
    body.position.set(state.x, state.y + stride, state.z);
    body.rotation.set(0, -state.heading, 0);
    // Se inclina hacia delante al correr (eje z local: +x es el frente).
    body.rotation.z = -moving * 0.16;
    body.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
  }

  /* ---------------------------------------------------------------------- API */
  const mode: WalkMode = {
    get active() {
      return active;
    },
    enter(x, z, startYaw) {
      const free = world.findFree(x, z, WALKER.radius + 0.3);
      if (!free) return false;
      saved.near = camera.near;
      saved.far = camera.far;
      saved.fov = camera.fov;
      camera.near = 0.4;
      camera.far = 21000;
      camera.fov = 62;
      camera.updateProjectionMatrix();
      state = createWalker(free[0], free[1], startYaw);
      yaw = startYaw;
      pitch = 18 * DEG;
      distance = 5.2;
      bob = 0;
      squash = 0;
      releaseAll();
      active = true;
      placeBody(0);
      placeCamera();
      return true;
    },
    exit() {
      if (!active) return null;
      active = false;
      body.visible = false;
      releaseAll();
      camera.near = saved.near;
      camera.far = saved.far;
      camera.fov = saved.fov;
      camera.updateProjectionMatrix();
      return { x: state.x, z: state.z, yaw };
    },
    update(dt) {
      if (active) {
        // Las flechas izquierda/derecha giran la cámara de forma continua.
        const turn = (keys.has("ArrowLeft") ? -1 : 0) + (keys.has("ArrowRight") ? 1 : 0);
        if (turn !== 0) yaw += turn * 1.9 * Math.min(dt, 0.05);
        stepWalker(state, input, yaw, dt, world);
        placeBody(dt);
        placeCamera();
      }
      return ground.set(state.x, 0, state.z);
    },
    snapshot: () => ({ x: state.x, z: state.z, y: state.y, speed: state.speed, heading: state.heading, grounded: state.grounded }),
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseAll);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("wheel", onWheel);
      scene.remove(body);
      for (const mesh of [capsule, head, visor, legs]) mesh.geometry.dispose();
      shirt.dispose();
      dark.dispose();
      skin.dispose();
    },
  };
  return mode;
}
