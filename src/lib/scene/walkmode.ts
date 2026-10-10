/**
 * «Explorar a pie»: se camina por la ciudad en primera persona con el teclado y el ratón. Esta capa
 * lee las teclas, coloca la cámara a la altura de los ojos y dibuja las rayas de velocidad; la física
 * y las colisiones viven en `walker.ts`.
 *
 * Controles: WASD o flechas arriba/abajo (adelante, atrás), A/D (de lado), flechas izquierda/derecha
 * (girar), Mayús (correr), Espacio (saltar), F (súper velocidad) y arrastrar con el ratón (mirar).
 * No hay controles táctiles a propósito.
 */

import * as THREE from "three";
import { createWalker, stepWalker, WALKER, type WalkInput, type WalkWorld } from "./walker";

const DEG = Math.PI / 180;
/** Campo de visión vertical a pie, en grados (más abierto que el de la vista orbital). */
const BASE_FOV = 90;
const EYE_HEIGHT = 1.65;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type WalkModeFlags = { boost: boolean };

export type WalkModeOptions = {
  camera: THREE.PerspectiveCamera;
  container: HTMLElement;
  world: WalkWorld;
  accentHex: number;
  reduceMotion: boolean;
  /** Se avisa al activar o desactivar la súper velocidad. */
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
  toggleBoost: () => void;
  /** Estado actual del personaje (para diagnóstico y pruebas). */
  snapshot: () => { x: number; z: number; y: number; speed: number; heading: number; grounded: boolean; boost: boolean; fov: number };
  dispose: () => void;
};

const EMPTY_INPUT = (): WalkInput => ({ forward: false, back: false, left: false, right: false, run: false, jump: false });

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable;
}

/* ------------------------------------------------------------ rayas de velocidad */

const LINE_COUNT = 56;

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
    speed[i] = 0.6 + Math.random() * 0.9;
    length[i] = 0.1 + Math.random() * 0.22;
    width[i] = 0.7 + Math.random() * 1.5;
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
      vignette.addColorStop(1, `rgba(${accent},${(0.16 * intensity).toFixed(3)})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
      ctx.lineCap = "round";
      for (let i = 0; i < LINE_COUNT; i += 1) {
        progress[i]! += speed[i]! * dt * (0.5 + intensity * 1.1);
        if (progress[i]! > 1) reset(i, false);
        const near = 0.2 + progress[i]! * 0.95; // desde cerca del centro hasta pasar el borde
        const tail = Math.max(0.2, near - length[i]! * intensity * (0.4 + progress[i]!));
        const cos = Math.cos(angle[i]!);
        const sin = Math.sin(angle[i]!);
        const alpha = Math.min(1, progress[i]! * 3) * (0.1 + 0.34 * intensity) * (1 - progress[i]! * 0.3);
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
  const { camera, container, world } = options;

  /* ------------------------------------------------------------------- estado */
  let active = false;
  let state = createWalker(0, 0);
  let yaw = 0;
  let pitch = 0; // hacia abajo: positivo
  let fov = BASE_FOV;
  let intensity = 0;
  const flags: WalkModeFlags = { boost: false };
  const input = EMPTY_INPUT();
  const keys = new Set<string>();
  const saved = { near: camera.near, far: camera.far, fov: camera.fov };
  let lines: ReturnType<typeof createSpeedLines> | null = null;

  const head3 = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const ground = new THREE.Vector3();

  const emitFlags = () => options.onFlags?.({ ...flags });

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

  const toggleBoost = () => {
    if (!active) return;
    flags.boost = !flags.boost;
    syncInput();
    emitFlags();
  };

  const CONTROL_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space"]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!active || isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === "KeyF") {
      event.preventDefault();
      if (!event.repeat) toggleBoost();
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
    yaw += (event.clientX - lastX) * 0.0042;
    pitch = clamp(pitch + (event.clientY - lastY) * 0.0042, -84 * DEG, 84 * DEG);
    lastX = event.clientX;
    lastY = event.clientY;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (dragId === event.pointerId) dragId = null;
  };
  // La rueda no hace nada a pie: que no desplace la página.
  const onWheel = (event: WheelEvent) => {
    if (active) event.preventDefault();
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
    // Campo de visión amplio de base; con la súper velocidad se abre un poco más, con suavidad.
    const targetFov = BASE_FOV + (options.reduceMotion ? 3 : 11) * intensity;
    fov += (targetFov - fov) * Math.min(1, dt * 4);
    if (Math.abs(camera.fov - fov) > 0.04) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    head3.set(state.x, state.y + EYE_HEIGHT, state.z);
    const cosPitch = Math.cos(pitch);
    direction.set(Math.cos(yaw) * cosPitch, -Math.sin(pitch), Math.sin(yaw) * cosPitch);
    camera.position.copy(head3);
    camera.lookAt(head3.x + direction.x, head3.y + direction.y, head3.z + direction.z);
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
      flags.boost = false;
      fov = BASE_FOV;
      camera.fov = fov;
      camera.updateProjectionMatrix();
      state = createWalker(free[0], free[1], startYaw);
      yaw = startYaw;
      pitch = 0;
      intensity = 0;
      releaseAll();
      lines ??= createSpeedLines(container, options.accentHex);
      active = true;
      emitFlags();
      placeCamera(0);
      return true;
    },
    exit() {
      if (!active) return null;
      active = false;
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
        intensity += (goal - intensity) * Math.min(1, dt * (goal > intensity ? 2.5 : 3));
        placeCamera(dt);
        if (!options.reduceMotion) lines?.draw(intensity, Math.min(dt, 0.05));
      }
      return ground.set(state.x, 0, state.z);
    },
    toggleBoost,
    snapshot: () => ({
      x: state.x,
      z: state.z,
      y: state.y,
      speed: state.speed,
      heading: state.heading,
      grounded: state.grounded,
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
    },
  };
  return mode;
}
