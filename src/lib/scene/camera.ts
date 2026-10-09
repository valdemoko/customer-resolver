/**
 * Control de cámara de la ciudad.
 *
 * Se escribe a mano en lugar de usar `OrbitControls` por razones concretas, no
 * por gusto: hacen falta cinco comportamientos que `OrbitControls` no da y que
 * habría que forzar desde fuera igualmente — zoom profundo con anclaje al cursor
 * (o al edificio seleccionado), desplazamiento SOLO dentro del polígono cubierto
 * y SOLO con zoom aplicado, rotación automática medida en SEGUNDOS POR VUELTA,
 * retorno suave a la vista inicial tras la inactividad (cancelable sin saltos) y
 * una cámara que sube por encima de los tejados en lugar de atravesarlos.
 *
 * LA ROTACIÓN VA POR TIEMPO, NO POR FOTOGRAMAS: se avanza con el delta real entre
 * fotogramas, así que una vuelta dura lo mismo a 30 que a 144 fps.
 *
 * REGLA DE REANUDACIÓN: tras el periodo de inactividad la cámara vuelve PRIMERO,
 * con easing, a la vista inicial completa (posición, inclinación, zoom y foco) y
 * SOLO ENTONCES reanuda el giro lento. Nunca gira desde una posición ampliada.
 * Si el usuario interactúa durante el retorno, se cancela al instante y sin
 * saltos (parte de donde está). Con un edificio seleccionado no hay retorno ni
 * giro hasta que se deselecciona.
 */

import * as THREE from "three";
import type { HalfPlane } from "./polygon";

export type CameraLimits = {
  minDistance: number;
  maxDistance: number;
  minPitchDeg: number;
  maxPitchDeg: number;
  /** Altura mínima de la cámara sobre el suelo, en metros. */
  minHeight: number;
  /** El desplazamiento solo se permite por debajo de esta distancia. */
  panBelowDistance: number;
};

export type CameraPose = {
  azimuthDeg: number;
  pitchDeg: number;
  distance: number;
};

export type ControllerOptions = {
  camera: THREE.PerspectiveCamera;
  /** Elemento que recibe los eventos. Debe poder tener el foco (tabindex). */
  element: HTMLElement;
  /** Vector que el control actualiza con el foco (punto al que se mira). */
  target: THREE.Vector3;
  limits: CameraLimits;
  initial: CameraPose;
  /** Zona por la que se puede desplazar el foco (semiplanos del polígono). */
  panBounds: HalfPlane[];
  rotationSeconds: number;
  idleReturnMs: number;
  returnDurationMs: number;
  reduceMotion: boolean;
  onStateChange: ((state: { rotating: boolean; atHome: boolean }) => void) | undefined;
  /**
   * Punto del mundo bajo el cursor (suelo o tejado), o `null` si el rayo no da
   * en nada. Es lo que ancla el zoom al cursor.
   */
  pickPoint?: (clientX: number, clientY: number) => THREE.Vector3 | null;
  /** Altura de lo más alto que hay en (x, z): tejado o 0. Evita atravesar edificios. */
  clearance?: (x: number, z: number) => number;
  /** Reloj, inyectable para probar los temporizadores sin esperar. */
  now?: () => number;
};

const DEG = Math.PI / 180;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Curva de retorno: arranca suave, llega suave, sin rebote. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

type Frame = { azimuthDeg: number; pitchDeg: number; distance: number; x: number; y: number; z: number };
type Anchor = { x: number; y: number; z: number };

export class CityCameraController {
  private azimuth: number;
  private pitch: number;
  private distance: number;
  private goalDistance: number;
  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;

  private azimuthVelocity = 0;
  private pitchVelocity = 0;
  private panVelocityX = 0;
  private panVelocityZ = 0;
  private lastMoveAt = 0;
  private lift = 0;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly element: HTMLElement;
  private readonly target: THREE.Vector3;
  private readonly limits: CameraLimits;
  private readonly initial: CameraPose;
  private readonly panBounds: HalfPlane[];
  private readonly rotationSeconds: number;
  private readonly idleReturnMs: number;
  private readonly returnDurationMs: number;
  private readonly onStateChange: ControllerOptions["onStateChange"];
  private readonly pickPoint: ControllerOptions["pickPoint"];
  private readonly clearance: ControllerOptions["clearance"];
  private readonly now: () => number;

  private reduceMotion: boolean;
  private manuallyPaused = false;
  private hold = false;
  private dragging = false;
  private dragMode: "orbit" | "pan" = "orbit";
  private lastInteraction = 0;
  /**
   * ¿Ha habido alguna interacción desde la última vuelta a la vista inicial?
   * Sin esta marca el retorno se dispararía en bucle: volvería al inicio,
   * giraría cinco segundos y volvería a saltar atrás.
   */
  private hasInteracted = false;
  private returnProgress: number | null = null;
  private returnFrom: Frame | null = null;
  private lastState: { rotating: boolean; atHome: boolean } = { rotating: false, atHome: true };

  /** Punto de anclaje del zoom: el edificio seleccionado, si lo hay. */
  private zoomFocus: Anchor | null = null;
  private anchor: Anchor | null = null;

  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private midpoint = { x: 0, y: 0 };
  private lastNear = 0;

  constructor(options: ControllerOptions) {
    this.camera = options.camera;
    this.element = options.element;
    this.target = options.target;
    this.limits = options.limits;
    this.initial = options.initial;
    this.panBounds = options.panBounds;
    this.rotationSeconds = options.rotationSeconds;
    this.idleReturnMs = options.idleReturnMs;
    this.returnDurationMs = options.returnDurationMs;
    this.reduceMotion = options.reduceMotion;
    this.onStateChange = options.onStateChange;
    this.pickPoint = options.pickPoint;
    this.clearance = options.clearance;
    this.now = options.now ?? (() => performance.now());

    this.azimuth = options.initial.azimuthDeg;
    this.pitch = options.initial.pitchDeg;
    this.distance = options.initial.distance;
    this.goalDistance = options.initial.distance;

    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerUp);
    this.element.addEventListener("pointercancel", this.onPointerUp);
    this.element.addEventListener("wheel", this.onWheel, { passive: false });
    this.element.addEventListener("keydown", this.onKeyDown);
    this.element.addEventListener("contextmenu", this.onContextMenu);
    this.element.addEventListener("dblclick", this.onDoubleClick);

    this.applyToCamera(0);
    this.emitState();
  }

  /* ----------------------------------------------------------------- entrada */

  private markInteraction(): void {
    this.lastInteraction = this.now();
    this.returnProgress = null;
    this.returnFrom = null;
    this.hasInteracted = true;
  }

  private onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private onDoubleClick = (): void => {
    this.requestHome(!this.reduceMotion);
  };

  private canPan(): boolean {
    return this.distance < this.limits.panBelowDistance * 1.02;
  }

  private onPointerDown = (event: PointerEvent): void => {
    // Capturar el puntero puede lanzar si ya no está activo; sin el try la
    // excepción se lleva por delante el resto del manejador.
    try {
      this.element.setPointerCapture(event.pointerId);
    } catch {
      /* sin captura: el arrastre sigue funcionando mientras el puntero esté encima */
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.dragging = true;
    this.dragMode = event.button === 2 || event.shiftKey || event.ctrlKey ? "pan" : "orbit";
    this.azimuthVelocity = 0;
    this.pitchVelocity = 0;
    this.panVelocityX = 0;
    this.panVelocityZ = 0;
    this.pinchDistance = this.currentPinchDistance();
    this.midpoint = this.currentMidpoint();
    this.markInteraction();
  };

  private onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    this.pointers.set(event.pointerId, next);
    const dt = Math.max(0.001, (this.now() - this.lastMoveAt) / 1000);
    this.lastMoveAt = this.now();

    if (this.pointers.size >= 2) {
      // Dos dedos: pellizco = zoom anclado al punto medio; arrastre = desplazamiento.
      const pinch = this.currentPinchDistance();
      const mid = this.currentMidpoint();
      if (this.pinchDistance > 0 && pinch > 0) {
        this.anchor = this.pickAt(mid.x, mid.y);
        this.goalDistance = clamp(
          this.goalDistance * (this.pinchDistance / pinch),
          this.limits.minDistance,
          this.limits.maxDistance,
        );
        if (this.reduceMotion) this.distance = this.goalDistance;
      }
      if (this.canPan()) this.panByPixels(mid.x - this.midpoint.x, mid.y - this.midpoint.y);
      this.pinchDistance = pinch;
      this.midpoint = mid;
      this.markInteraction();
      this.applyToCamera(0);
      return;
    }

    if (!this.dragging) return;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    if (this.dragMode === "pan") {
      if (this.canPan()) this.panByPixels(dx, dy);
    } else {
      const azimuthStep = -dx * 0.28;
      const pitchStep = dy * 0.22;
      this.azimuth = (this.azimuth + azimuthStep) % 360;
      this.pitch = this.clampPitch(this.pitch + pitchStep);
      this.azimuthVelocity = azimuthStep / dt;
      this.pitchVelocity = pitchStep / dt;
    }
    this.markInteraction();
    this.applyToCamera(0);
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size === 0) {
      this.dragging = false;
      // Inercia solo si el último movimiento fue reciente: soltar un puntero
      // que lleva parado no debe lanzar la vista.
      if (this.now() - this.lastMoveAt > 90 || this.reduceMotion) {
        this.azimuthVelocity = 0;
        this.pitchVelocity = 0;
        this.panVelocityX = 0;
        this.panVelocityZ = 0;
      }
      this.markInteraction();
    } else {
      this.pinchDistance = this.currentPinchDistance();
      this.midpoint = this.currentMidpoint();
    }
  };

  private currentPinchDistance(): number {
    const values = [...this.pointers.values()];
    const a = values[0];
    const b = values[1];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private currentMidpoint(): { x: number; y: number } {
    const values = [...this.pointers.values()];
    const a = values[0];
    const b = values[1];
    if (!a || !b) return { x: a?.x ?? 0, y: a?.y ?? 0 };
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private pickAt(clientX: number, clientY: number): Anchor | null {
    if (this.zoomFocus) return this.zoomFocus;
    const point = this.pickPoint?.(clientX, clientY);
    return point ? { x: point.x, y: point.y, z: point.z } : null;
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (event.deltaMode === 0 && Math.abs(event.deltaY) < 1) return;
    const lines = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 600 : 1;
    this.anchor = this.pickAt(event.clientX, event.clientY);
    this.goalDistance = clamp(
      this.goalDistance * Math.exp(event.deltaY * lines * 0.0016),
      this.limits.minDistance,
      this.limits.maxDistance,
    );
    if (this.reduceMotion) this.distance = this.goalDistance;
    this.markInteraction();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const step = event.shiftKey ? 12 : 5;
    let handled = true;
    switch (event.key) {
      case "ArrowLeft":
        this.azimuth = (this.azimuth + step) % 360;
        break;
      case "ArrowRight":
        this.azimuth = (this.azimuth - step) % 360;
        break;
      case "ArrowUp":
        this.pitch = this.clampPitch(this.pitch - step * 0.6);
        break;
      case "ArrowDown":
        this.pitch = this.clampPitch(this.pitch + step * 0.6);
        break;
      case "+":
      case "=":
        this.anchor = this.zoomFocus;
        this.goalDistance = clamp(this.goalDistance * 0.86, this.limits.minDistance, this.limits.maxDistance);
        if (this.reduceMotion) this.distance = this.goalDistance;
        break;
      case "-":
      case "_":
        this.anchor = this.zoomFocus;
        this.goalDistance = clamp(this.goalDistance * 1.16, this.limits.minDistance, this.limits.maxDistance);
        if (this.reduceMotion) this.distance = this.goalDistance;
        break;
      case "Home":
      case "0":
        // `requestHome` ya arma el retorno: marcar la interacción después lo
        // cancelaría en el acto.
        event.preventDefault();
        this.requestHome(!this.reduceMotion);
        return;
      default:
        handled = false;
    }
    if (!handled) return;
    event.preventDefault();
    this.markInteraction();
    this.applyToCamera(0);
  };

  /* --------------------------------------------------------------- utilidades */

  private clampPitch(value: number): number {
    // La inclinación mínima depende de la distancia: con la cámara cerca del
    // suelo, bajar más la metería bajo la altura mínima.
    const byHeight =
      Math.asin(clamp(this.limits.minHeight / Math.max(this.distance, 1), 0, 0.99)) / DEG;
    // Lejos, la cámara no puede ponerse rasante: se vería el horizonte con la
    // ciudad flotando en la bruma, y lo que se pide es una ciudad sobre terreno.
    const farFloor = 20 * smoothstep(1200, 2600, this.distance);
    return clamp(
      value,
      Math.max(this.limits.minPitchDeg, byHeight, farFloor),
      this.limits.maxPitchDeg,
    );
  }

  private panByPixels(dx: number, dy: number): void {
    const height = Math.max(1, this.element.clientHeight);
    const worldPerPixel = (2 * this.distance * Math.tan((this.camera.fov * DEG) / 2)) / height;
    const azimuth = this.azimuth * DEG;
    // Derecha de la cámara y «adelante» proyectado sobre el suelo.
    const rightX = Math.cos(azimuth);
    const rightZ = -Math.sin(azimuth);
    const forwardX = -Math.sin(azimuth);
    const forwardZ = -Math.cos(azimuth);
    const grabX = (-dx * rightX + dy * forwardX) * worldPerPixel;
    const grabZ = (-dx * rightZ + dy * forwardZ) * worldPerPixel * 1;
    this.targetX += grabX;
    this.targetZ += grabZ;
    const dt = Math.max(0.001, (this.now() - this.lastMoveAt) / 1000);
    this.panVelocityX = grabX / Math.max(dt, 0.016);
    this.panVelocityZ = grabZ / Math.max(dt, 0.016);
    this.clampTarget();
  }

  /** Mantiene el foco dentro del polígono: proyecta hacia dentro lo que sobresalga. */
  private clampTarget(): void {
    for (let pass = 0; pass < 3; pass += 1) {
      for (const plane of this.panBounds) {
        const d = plane.nx * this.targetX + plane.nz * this.targetZ - plane.c;
        if (d > 0) {
          this.targetX -= plane.nx * d;
          this.targetZ -= plane.nz * d;
        }
      }
    }
  }

  /* ------------------------------------------------------------------ estado */

  /** Pausa el giro (edificio bajo el puntero o seleccionado). */
  setHold(hold: boolean): void {
    if (this.hold !== hold) this.markInteraction();
    this.hold = hold;
  }

  /** Edificio seleccionado: el zoom se ancla a él en lugar de al cursor. */
  setZoomFocus(point: Anchor | null): void {
    this.zoomFocus = point;
  }

  setManuallyPaused(paused: boolean): void {
    this.manuallyPaused = paused;
    this.markInteraction();
  }

  isManuallyPaused(): boolean {
    return this.manuallyPaused;
  }

  setReduceMotion(reduceMotion: boolean): void {
    this.reduceMotion = reduceMotion;
    if (reduceMotion) {
      this.returnProgress = null;
      this.returnFrom = null;
      this.azimuthVelocity = 0;
      this.pitchVelocity = 0;
    }
  }

  isReturning(): boolean {
    return this.returnProgress !== null;
  }

  isAtHome(): boolean {
    return (
      Math.abs(shortestAngleDelta(this.azimuth, this.initial.azimuthDeg)) < 0.5 &&
      Math.abs(this.pitch - this.initial.pitchDeg) < 0.4 &&
      Math.abs(this.distance - this.initial.distance) < this.initial.distance * 0.01 &&
      Math.hypot(this.targetX, this.targetZ) < 2 &&
      Math.abs(this.targetY) < 1
    );
  }

  getPose(): {
    azimuthDeg: number;
    pitchDeg: number;
    distance: number;
    target: [number, number];
    targetY: number;
  } {
    return {
      azimuthDeg: this.azimuth,
      pitchDeg: this.pitch,
      distance: this.distance,
      target: [this.targetX, this.targetZ],
      targetY: this.targetY,
    };
  }

  /** Coloca la cámara directamente (pruebas y herramientas de medición). */
  setPose(pose: Partial<CameraPose> & { target?: [number, number] }): void {
    if (pose.distance !== undefined) {
      this.distance = clamp(pose.distance, this.limits.minDistance, this.limits.maxDistance);
      this.goalDistance = this.distance;
    }
    if (pose.azimuthDeg !== undefined) this.azimuth = pose.azimuthDeg % 360;
    if (pose.pitchDeg !== undefined) this.pitch = this.clampPitch(pose.pitchDeg);
    if (pose.target) {
      this.targetX = pose.target[0];
      this.targetY = 0;
      this.targetZ = pose.target[1];
      this.clampTarget();
    }
    this.markInteraction();
    this.applyToCamera(0);
  }

  /** Vuelve a la vista inicial. `animated` la suaviza; si no, salta. */
  requestHome(animated: boolean): void {
    this.markInteraction();
    this.azimuthVelocity = 0;
    this.pitchVelocity = 0;
    this.panVelocityX = 0;
    this.panVelocityZ = 0;
    if (!animated) {
      this.azimuth = this.initial.azimuthDeg;
      this.pitch = this.initial.pitchDeg;
      this.distance = this.initial.distance;
      this.goalDistance = this.initial.distance;
      this.targetX = 0;
      this.targetY = 0;
      this.targetZ = 0;
      this.hasInteracted = false;
      this.applyToCamera(0);
      this.emitState();
      return;
    }
    this.startReturn();
  }

  /**
   * Arranca la vuelta animada SIN tocar el contador de inactividad: es la que el
   * propio temporizador dispara, no una orden del usuario.
   */
  private startReturn(): void {
    this.returnFrom = {
      azimuthDeg: this.azimuth,
      pitchDeg: this.pitch,
      distance: this.distance,
      x: this.targetX,
      y: this.targetY,
      z: this.targetZ,
    };
    this.goalDistance = this.distance;
    this.azimuthVelocity = 0;
    this.pitchVelocity = 0;
    this.panVelocityX = 0;
    this.panVelocityZ = 0;
    this.returnProgress = 0;
  }

  private emitState(): void {
    const state = { rotating: this.isRotating(), atHome: this.isAtHome() };
    if (state.rotating === this.lastState.rotating && state.atHome === this.lastState.atHome) return;
    this.lastState = state;
    this.onStateChange?.(state);
  }

  private isRotating(): boolean {
    return !this.reduceMotion && !this.manuallyPaused && !this.hold && !this.dragging;
  }

  /* -------------------------------------------------------------- por fotograma */

  update(deltaSeconds: number): void {
    const dt = Math.min(deltaSeconds, 0.1); // un parón del navegador no gira media vuelta
    const now = this.now();

    // Retorno a la vista inicial. Manda sobre todo lo demás hasta que el usuario
    // vuelve a tocar (`markInteraction` lo cancela al instante, sin salto).
    if (this.returnProgress !== null && this.returnFrom) {
      this.returnProgress += (dt * 1000) / this.returnDurationMs;
      const t = Math.min(1, this.returnProgress);
      const eased = easeInOutCubic(t);
      const from = this.returnFrom;
      this.azimuth = from.azimuthDeg + shortestAngleDelta(from.azimuthDeg, this.initial.azimuthDeg) * eased;
      this.pitch = from.pitchDeg + (this.initial.pitchDeg - from.pitchDeg) * eased;
      // Distancia en escala logarítmica: acercarse y alejarse se sienten igual.
      this.distance = Math.exp(
        Math.log(from.distance) + (Math.log(this.initial.distance) - Math.log(from.distance)) * eased,
      );
      this.goalDistance = this.distance;
      this.targetX = from.x * (1 - eased);
      this.targetY = from.y * (1 - eased);
      this.targetZ = from.z * (1 - eased);
      if (t >= 1) {
        this.returnProgress = null;
        this.returnFrom = null;
        // Vuelta terminada: el episodio de interacción se cierra y el giro lento
        // se reanuda desde la vista inicial.
        this.hasInteracted = false;
      }
      this.applyToCamera(dt);
      this.emitState();
      return;
    }

    // Inercia de la órbita y del desplazamiento.
    if (!this.dragging && !this.reduceMotion) {
      const decay = Math.exp(-dt * 4.5);
      if (Math.abs(this.azimuthVelocity) > 0.05 || Math.abs(this.pitchVelocity) > 0.05) {
        this.azimuth = (this.azimuth + this.azimuthVelocity * dt) % 360;
        this.pitch = this.clampPitch(this.pitch + this.pitchVelocity * dt);
        this.azimuthVelocity *= decay;
        this.pitchVelocity *= decay;
      }
      if (Math.hypot(this.panVelocityX, this.panVelocityZ) > 0.2) {
        this.targetX += this.panVelocityX * dt;
        this.targetZ += this.panVelocityZ * dt;
        this.panVelocityX *= decay;
        this.panVelocityZ *= decay;
        this.clampTarget();
      }
    }

    // Zoom suavizado con anclaje: el punto bajo el cursor (o el edificio
    // seleccionado) se queda donde está mientras cambia la distancia.
    if (Math.abs(this.goalDistance - this.distance) > this.distance * 0.0005) {
      const previous = this.distance;
      const blend = this.reduceMotion ? 1 : 1 - Math.exp(-dt * 9);
      this.distance = previous + (this.goalDistance - previous) * blend;
      this.distance = clamp(this.distance, this.limits.minDistance, this.limits.maxDistance);
      if (this.anchor && this.canPan()) {
        const pull = smoothstep(
          this.limits.panBelowDistance * 0.85,
          this.limits.panBelowDistance * 1.15,
          this.distance,
        );
        const factor = (1 - this.distance / previous) * (1 - pull);
        // Homotecia alrededor del punto anclado: la cámara y el foco se acercan
        // a él en la misma proporción, así que su posición en pantalla no cambia.
        this.targetX += (this.anchor.x - this.targetX) * factor;
        this.targetY += (this.anchor.y - this.targetY) * factor;
        this.targetZ += (this.anchor.z - this.targetZ) * factor;
        this.targetY = clamp(this.targetY, 0, 120);
        this.clampTarget();
      }
      this.pitch = this.clampPitch(this.pitch);
    } else {
      this.distance = this.goalDistance;
      this.anchor = null;
    }

    // Lejos del suelo no hay desplazamiento posible: el foco vuelve al centro.
    const pull = smoothstep(
      this.limits.panBelowDistance * 0.85,
      this.limits.panBelowDistance * 1.15,
      this.distance,
    );
    if (pull > 0 && !this.dragging) {
      const k = 1 - Math.exp(-dt * 2.4 * pull);
      this.targetX -= this.targetX * k;
      this.targetY -= this.targetY * k;
      this.targetZ -= this.targetZ * k;
    }

    // El giro se queda quieto hasta que pase el periodo de inactividad. Con un
    // edificio bajo el puntero o seleccionado (`hold`) no se mueve nada.
    const idle = !this.hasInteracted || now - this.lastInteraction > this.idleReturnMs;
    if (this.isRotating() && idle) {
      if (this.hasInteracted && !this.isAtHome()) {
        if (this.reduceMotion) {
          this.hasInteracted = false;
        } else {
          this.startReturn();
        }
      } else {
        this.hasInteracted = false;
        this.azimuth = (this.azimuth + (360 / this.rotationSeconds) * dt) % 360;
      }
    }

    this.applyToCamera(dt);
    this.emitState();
  }

  private applyToCamera(dt: number): void {
    const pitch = this.pitch * DEG;
    const azimuth = this.azimuth * DEG;
    const horizontal = Math.cos(pitch) * this.distance;
    let x = this.targetX + Math.sin(azimuth) * horizontal;
    let y = this.targetY + Math.sin(pitch) * this.distance;
    let z = this.targetZ + Math.cos(azimuth) * horizontal;

    // Por encima de los tejados: si hay un edificio bajo la cámara (o a pocos
    // metros), la cámara sube hasta librarlo. Sube rápido y baja despacio, así
    // al pasar sobre un bloque no hay saltos.
    let wanted = 0;
    if (this.clearance && this.distance < 1600) {
      const margin = 6;
      let roof = this.clearance(x, z);
      roof = Math.max(roof, this.clearance(x + margin, z), this.clearance(x - margin, z));
      roof = Math.max(roof, this.clearance(x, z + margin), this.clearance(x, z - margin));
      wanted = Math.max(0, roof + this.limits.minHeight + 1.5 - y);
    }
    const rate = wanted > this.lift ? 14 : 3.2;
    this.lift += (wanted - this.lift) * (dt > 0 ? 1 - Math.exp(-dt * rate) : wanted > this.lift ? 1 : 0);
    y += this.lift;
    y = Math.max(y, this.limits.minHeight);

    this.camera.position.set(x, y, z);
    this.target.set(this.targetX, this.targetY, this.targetZ);
    this.camera.lookAt(this.target);

    // `near` y `far` dinámicos con el zoom (B.4). La resolución del búfer de
    // profundidad a una distancia d es ≈ d² / (near · 2²⁴): con el `near` pegado
    // al suelo a 3 km valdría ~2 cm y las capas del suelo (separadas 2–6 cm) se
    // pelearían. A vista de pájaro el `near` sube (hasta 90 m: la cámara está a
    // cientos de metros de cualquier cosa) y la resolución baja a ~7 mm; pegado
    // al suelo baja a 0,4 m. `far` se mantiene por encima del radio del cielo
    // (20 km) y crece con la distancia para no recortar el horizonte.
    const near = clamp(this.distance * 0.03, 0.4, 90);
    const far = clamp(this.distance * 5 + 21000, 21000, 36000);
    if (Math.abs(near - this.lastNear) > near * 0.05 || far !== this.camera.far) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
      this.lastNear = near;
    }
  }

  dispose(): void {
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerUp);
    this.element.removeEventListener("wheel", this.onWheel);
    this.element.removeEventListener("keydown", this.onKeyDown);
    this.element.removeEventListener("contextmenu", this.onContextMenu);
    this.element.removeEventListener("dblclick", this.onDoubleClick);
    this.pointers.clear();
  }
}
