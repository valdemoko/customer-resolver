/**
 * «Explorar a pie»: un personaje low poly que se maneja con el teclado y el ratón. Esta capa pone el
 * personaje en la escena, lee las teclas, coloca la cámara y dibuja las rayas de velocidad; la física
 * y las colisiones viven en `walker.ts`.
 *
 * Controles: WASD o flechas arriba/abajo (adelante, atrás), A/D (de lado), flechas izquierda/derecha
 * (girar la cámara), Mayús (correr), Espacio (saltar), V (primera o tercera persona), F (súper
 * velocidad), arrastrar con el ratón (mirar) y rueda (acercar o alejar la cámara en tercera persona).
 * No hay controles táctiles a propósito.
 */

import * as THREE from "three";
import { createWalker, stepWalker, WALKER, type WalkInput, type WalkWorld } from "./walker";

const DEG = Math.PI / 180;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type WalkModeFlags = { firstPerson: boolean; boost: boolean };

export type WalkModeOptions = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  container: HTMLElement;
  world: WalkWorld;
  /** Distancia hasta lo primero que hay en el rayo (edificios), o `null`. Aleja la cámara de las paredes. */
  rayDistance: (from: THREE.Vector3, direction: THREE.Vector3, maxDistance: number) => number | null;
  accentHex: number;
  reduceMotion: boolean;
  /** Se avisa al cambiar de primera/tercera persona o al activar/desactivar la súper velocidad. */
  onFlags?: (flags: WalkModeFlags) => void;
};

export type WalkMode = {
  readonly active: boolean;
  readonly flags: WalkModeFlags;
  /** Entra en el modo en (x, z) mirando hacia `yaw` (radianes; 0 = +x). Devuelve `false` si no hay sitio libre. */
  enter: (x: number, z: number, yaw: number) => boolean;
  /** Sale del modo y devuelve dónde estaba el personaje y hacia dónde miraba la cámara. */
  exit: () => { x: number; z: number; yaw: number } | null;
  /** Avanza un fotograma. Devuelve el punto del suelo bajo el personaje. */
  update: (dt: number) => THREE.Vector3;
  toggleFirstPerson: () => void;
  toggleBoost: () => void;
  /** Estado actual del personaje (para diagnóstico y pruebas). */
  snapshot: () => { x: number; z: number; y: number; speed: number; heading: number; grounded: boolean; firstPerson: boolean; boost: boolean; fov: number };
  dispose: () => void;
};

const EMPTY_INPUT = (): WalkInput => ({ forward: false, back: false, left: false, right: false, run: false, jump: false });

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable;
}

/* ------------------------------------------------------------ rayas de velocidad */

const LINE_COUNT = 90;

/** Rayas que salen del centro hacia los bordes cuando se va a súper velocidad. */
function createSpeedLines(container: HTMLElement, accentHex: number) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;";
  if (getComputedStyle(container).position === "static") container.style.position = "relative";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const accent = `${(accentHex >> 16) & 255},${(accentHex >> 8) & 255},${accentHex & 255}`;
  const angle = new Float32Array(LINE_COUNT);
  const progress = new Float32Array(LINE_COUNT);
  const speed = new Float32Array(LINE_COUNT);
  const length = new Float32Array(LINE_COUNT);
  const width = new Float32Array(LINE_COUNT);
  const tinted = new Uint8Array(LINE_COUNT);
  const reset = (i: number, spread: boolean) => {
    angle[i] = Math.random() * Math.PI * 2;
    progress[i] = spread ? Math.random() : 0;
    speed[i] = 0.9 + Math.random() * 1.6;
    length[i] = 0.12 + Math.random() * 0.34;
    width[i] = 0.8 + Math.random() * 2.2;
    tinted[i] = Math.random() < 0.18 ? 1 : 0;
  };
  for (let i = 0; i < LINE_COUNT; i += 1) reset(i, true);
  let drawn = false;
  let w = 0;
  let h = 0;

  const resize = () => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    w = container.clientWidth;
    h = container.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  return {
    /** `intensity` de 0 a 1. Con 0 no se dibuja (y se limpia una sola vez). */
    draw(intensity: number, dt: number) {
      if (!ctx) return;
      if (canvas.width !== Math.round(container.clientWidth * Math.min(1.5, window.devicePixelRatio || 1))) resize();
      if (intensity < 0.02) {
        if (drawn) ctx.clearRect(0, 0, w, h);
        drawn = false;
        return;
      }
      drawn = true;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const reach = Math.hypot(cx, cy);
      // Borde oscurecido y teñido: da sensación de túnel sin tapar el centro.
      const vignette = ctx.createRadialGradient(cx, cy, reach * 0.45, cx, cy, reach * 1.05);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, `rgba(${accent},${(0.22 * intensity).toFixed(3)})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
      ctx.lineCap = "round";
      for (let i = 0; i < LINE_COUNT; i += 1) {
        progress[i]! += speed[i]! * dt * (0.7 + intensity * 2.4);
        if (progress[i]! > 1) reset(i, false);
        const near = 0.2 + progress[i]! * 0.95; // desde cerca del centro hasta pasar el borde
        const tail = Math.max(0.2, near - length[i]! * intensity * (0.4 + progress[i]!));
        const cos = Math.cos(angle[i]!);
        const sin = Math.sin(angle[i]!);
        const alpha = Math.min(1, progress[i]! * 3) * (0.16 + 0.5 * intensity) * (1 - progress[i]! * 0.25);
        ctx.strokeStyle = tinted[i] ? `rgba(${accent},${alpha.toFixed(3)})` : `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.lineWidth = width[i]! * (0.6 + progress[i]!);
        ctx.beginPath();
        ctx.moveTo(cx + cos * reach * tail, cy + sin * reach * tail);
        ctx.lineTo(cx + cos * reach * near, cy + sin * reach * near);
        ctx.stroke();
      }
    },
    dispose() {
      canvas.remove();
    },
  };
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
  let fov = 62;
  let intensity = 0;
  const flags: WalkModeFlags = { firstPerson: false, boost: false };
  const input = EMPTY_INPUT();
  const keys = new Set<string>();
  const saved = { near: camera.near, far: camera.far, fov: camera.fov };
  let lines: ReturnType<typeof createSpeedLines> | null = null;

  const head3 = new THREE.Vector3();
  const wanted = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const ground = new THREE.Vector3();

  const emitFlags = () => options.onFlags?.({ ...flags });
  const baseFov = () => (flags.firstPerson ? 76 : 62);

  const syncInput = () => {
    const has = (...codes: string[]) => codes.some((code) => keys.has(code));
    input.forward = has("KeyW", "ArrowUp");
    input.back = has("KeyS", "ArrowDown");
    input.left = has("KeyA");
    input.right = has("KeyD");
    input.run = has("ShiftLeft", "ShiftRight");
    input.jump = has("Space");
    input.boost = flags.boost;
  };

  const toggleFirstPerson = () => {
    if (!active) return;
    flags.firstPerson = !flags.firstPerson;
    pitch = flags.firstPerson ? 0 : 18 * DEG;
    emitFlags();
  };
  const toggleBoost = () => {
    if (!active) return;
    flags.boost = !flags.boost;
    syncInput();
    emitFlags();
  };

  const CONTROL_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space"]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!active || isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === "KeyV" || event.code === "KeyF") {
      event.preventDefault();
      if (!event.repeat) (event.code === "KeyV" ? toggleFirstPerson : toggleBoost)();
      return;
    }
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
    const sensitivity = flags.firstPerson ? 0.0042 : 0.0052;
    yaw += (event.clientX - lastX) * sensitivity;
    const limit = flags.firstPerson ? 84 * DEG : 72 * DEG;
    const floor = flags.firstPerson ? -84 * DEG : -8 * DEG;
    pitch = clamp(pitch + (event.clientY - lastY) * 0.0042, floor, limit);
    lastX = event.clientX;
    lastY = event.clientY;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (dragId === event.pointerId) dragId = null;
  };
  const onWheel = (event: WheelEvent) => {
    if (!active) return;
    event.preventDefault();
    if (flags.firstPerson) return;
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
  function placeCamera(dt: number): void {
    // Campo de visión: se abre al ir rápido (efecto túnel) y cambia con la vista.
    const targetFov = baseFov() + (options.reduceMotion ? 6 : 26) * intensity;
    fov += (targetFov - fov) * Math.min(1, dt * 7);
    if (Math.abs(camera.fov - fov) > 0.04) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    if (flags.firstPerson) {
      head3.set(state.x, state.y + 1.62, state.z);
      const cosPitch = Math.cos(pitch);
      direction.set(Math.cos(yaw) * cosPitch, -Math.sin(pitch), Math.sin(yaw) * cosPitch);
      camera.position.copy(head3);
      if (!options.reduceMotion && intensity > 0.05) {
        const shake = 0.035 * intensity;
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
      }
      camera.lookAt(head3.x + direction.x, head3.y + direction.y, head3.z + direction.z);
      body.visible = false;
      return;
    }

    head3.set(state.x, state.y + 1.45, state.z);
    // Posición deseada: detrás del personaje según hacia dónde mira la cámara, y más alta si se mira desde arriba.
    // A toda velocidad la cámara se retira un poco para dar sensación de empuje.
    const back = distance * (1 + 0.28 * intensity);
    const horizontal = Math.cos(pitch) * back;
    direction.set(-Math.cos(yaw) * horizontal, Math.sin(pitch) * back, -Math.sin(yaw) * horizontal);
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
    if (!options.reduceMotion) bob += dt * (6 + Math.min(state.speed, WALKER.runSpeed) * 1.5);
    const stride = state.grounded && !options.reduceMotion ? Math.abs(Math.sin(bob)) * 0.07 * moving : 0;
    // Estirón al despegar y aplastamiento al caer, suaves.
    const target = state.grounded ? 0 : clamp(state.vy / 8, -0.5, 0.5) * 0.18;
    squash += (target - squash) * Math.min(1, dt * 14);
    body.position.set(state.x, state.y + stride, state.z);
    body.rotation.set(0, -state.heading, 0);
    // Se inclina hacia delante al correr (eje z local: +x es el frente); a súper velocidad, más.
    body.rotation.z = -(moving * 0.16 + intensity * 0.32);
    body.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
  }

  /* ---------------------------------------------------------------------- API */
  const mode: WalkMode = {
    get active() {
      return active;
    },
    get flags() {
      return flags;
    },
    enter(x, z, startYaw) {
      const free = world.findFree(x, z, WALKER.radius + 0.3);
      if (!free) return false;
      saved.near = camera.near;
      saved.far = camera.far;
      saved.fov = camera.fov;
      camera.near = 0.3;
      camera.far = 21000;
      flags.firstPerson = false;
      flags.boost = false;
      fov = baseFov();
      camera.fov = fov;
      camera.updateProjectionMatrix();
      state = createWalker(free[0], free[1], startYaw);
      yaw = startYaw;
      pitch = 18 * DEG;
      distance = 5.2;
      bob = 0;
      squash = 0;
      intensity = 0;
      releaseAll();
      lines ??= createSpeedLines(container, options.accentHex);
      active = true;
      emitFlags();
      placeBody(0);
      placeCamera(0);
      return true;
    },
    exit() {
      if (!active) return null;
      active = false;
      body.visible = false;
      flags.firstPerson = false;
      flags.boost = false;
      releaseAll();
      lines?.draw(0, 0);
      lines?.dispose();
      lines = null;
      camera.near = saved.near;
      camera.far = saved.far;
      camera.fov = saved.fov;
      camera.updateProjectionMatrix();
      emitFlags();
      return { x: state.x, z: state.z, yaw };
    },
    update(dt) {
      if (active) {
        // Las flechas izquierda/derecha giran la cámara de forma continua.
        const turn = (keys.has("ArrowLeft") ? -1 : 0) + (keys.has("ArrowRight") ? 1 : 0);
        if (turn !== 0) yaw += turn * 1.9 * Math.min(dt, 0.05);
        stepWalker(state, input, yaw, dt, world);
        // Intensidad del efecto: 0 hasta correr, 1 a toda velocidad. Sube rápido y baja un poco más despacio.
        const goal = flags.boost ? clamp((state.speed - WALKER.runSpeed * 0.8) / (WALKER.boostSpeed - WALKER.runSpeed * 0.8), 0, 1) : 0;
        intensity += (goal - intensity) * Math.min(1, dt * (goal > intensity ? 6 : 4));
        placeBody(dt);
        placeCamera(dt);
        if (!options.reduceMotion) lines?.draw(intensity, Math.min(dt, 0.05));
      }
      return ground.set(state.x, 0, state.z);
    },
    toggleFirstPerson,
    toggleBoost,
    snapshot: () => ({
      x: state.x,
      z: state.z,
      y: state.y,
      speed: state.speed,
      heading: state.heading,
      grounded: state.grounded,
      firstPerson: flags.firstPerson,
      boost: flags.boost,
      fov: camera.fov,
    }),
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseAll);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("wheel", onWheel);
      lines?.dispose();
      scene.remove(body);
      for (const mesh of [capsule, head, visor, legs]) mesh.geometry.dispose();
      shirt.dispose();
      dark.dispose();
      skin.dispose();
    },
  };
  return mode;
}
