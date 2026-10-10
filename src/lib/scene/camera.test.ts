import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CityCameraController, type ControllerOptions } from "./camera";
import { halfPlanes, signedDistance } from "./polygon";

/**
 * El control de cámara es donde vive el comportamiento que el encargo describe
 * con más detalle (giro lento, parada al interactuar, vuelta suave a la vista
 * inicial ANTES de reanudar el giro, zoom anclado, desplazamiento acotado).
 * Estas pruebas trabajan con un reloj inyectado: sin él habría que esperar cinco
 * segundos reales por caso y la suite dejaría de ejecutarse.
 *
 * El elemento DOM se sustituye por un doble que solo guarda y dispara escuchas.
 */

type Listener = (event: never) => void;

class FakeElement {
  readonly listeners = new Map<string, Listener[]>();
  clientHeight = 900;

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((candidate) => candidate !== listener),
    );
  }

  setPointerCapture(): void {
    /* el doble no necesita capturar nada */
  }

  emit(type: string, event: Record<string, unknown>): void {
    for (const listener of this.listeners.get(type) ?? []) {
      (listener as (value: Record<string, unknown>) => void)(event);
    }
  }
}

const LIMITS = {
  minDistance: 30,
  maxDistance: 3600,
  minPitchDeg: 4,
  maxPitchDeg: 80,
  minHeight: 2.5,
  panBelowDistance: 2100,
};
const INITIAL = { azimuthDeg: 195, pitchDeg: 34, distance: 2300 };
const ROTATION_SECONDS = 105;
const BOUNDS = halfPlanes([
  [-800, -500],
  [800, -500],
  [800, 500],
  [-800, 500],
]);

type Harness = {
  element: FakeElement;
  camera: THREE.PerspectiveCamera;
  target: THREE.Vector3;
  controller: CityCameraController;
  advance(seconds: number): void;
  pose(): ReturnType<CityCameraController["getPose"]>;
  pointer(type: string, id: number, x: number, y: number, extra?: Record<string, unknown>): void;
  wheel(deltaY: number): void;
  key(key: string, shiftKey?: boolean): void;
};

function harness(overrides: Partial<ControllerOptions> = {}): Harness {
  const element = new FakeElement();
  const camera = new THREE.PerspectiveCamera(42, 1.6, 1, 26000);
  const target = new THREE.Vector3(0, 0, 0);
  let clock = 0;

  const controller = new CityCameraController({
    camera,
    element: element as unknown as HTMLElement,
    target,
    limits: LIMITS,
    initial: INITIAL,
    panBounds: BOUNDS,
    rotationSeconds: ROTATION_SECONDS,
    idleReturnMs: 5000,
    returnDurationMs: 1500,
    reduceMotion: false,
    onStateChange: undefined,
    now: () => clock,
    ...overrides,
  });

  return {
    element,
    camera,
    target,
    controller,
    advance(seconds: number) {
      const frames = Math.max(1, Math.round(seconds / (1 / 60)));
      for (let index = 0; index < frames; index += 1) {
        clock += 1000 / 60;
        controller.update(1 / 60);
      }
    },
    pose: () => controller.getPose(),
    pointer(type, id, x, y, extra = {}) {
      clock += 16;
      element.emit(type, {
        pointerId: id,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        shiftKey: false,
        ctrlKey: false,
        preventDefault() {},
        ...extra,
      });
    },
    wheel(deltaY: number) {
      element.emit("wheel", { deltaY, deltaMode: 0, clientX: 700, clientY: 400, preventDefault() {} });
    },
    key(key: string, shiftKey = false) {
      element.emit("keydown", { key, shiftKey, preventDefault() {} });
    },
  };
}

const angleFromHome = (azimuth: number) => Math.abs(((azimuth - INITIAL.azimuthDeg + 540) % 360) - 180);

describe("giro automático", () => {
  it("gira desde el primer fotograma, sin esperar el tiempo de inactividad", () => {
    const h = harness();
    const before = h.pose().azimuthDeg;
    h.advance(2);
    const delta = (h.pose().azimuthDeg - before + 360) % 360;
    // Dos segundos a una vuelta cada 105 s son unos 6,9°.
    expect(delta).toBeGreaterThan(5);
    expect(delta).toBeLessThan(9);
  });

  it("una vuelta dura lo que dice la configuración, independientemente de los FPS", () => {
    const lento = harness();
    const rapido = harness();
    lento.advance(10);
    for (let index = 0; index < 300; index += 1) rapido.controller.update(1 / 30);
    const esperado = (360 / ROTATION_SECONDS) * 10;
    expect((lento.pose().azimuthDeg - INITIAL.azimuthDeg + 360) % 360).toBeCloseTo(esperado, 0);
    expect((rapido.pose().azimuthDeg - INITIAL.azimuthDeg + 360) % 360).toBeCloseTo(esperado, 0);
  });

  it("se detiene al interactuar y sigue parado hasta que pasa la inactividad", () => {
    const h = harness();
    h.advance(2);
    h.pointer("pointerdown", 1, 300, 300);
    h.pointer("pointermove", 1, 380, 300);
    h.advance(1); // el puntero sigue pulsado
    h.pointer("pointerup", 1, 380, 300);
    const afterDrag = h.pose().azimuthDeg;
    h.advance(3); // todavía no han pasado los 5 s
    expect(h.pose().azimuthDeg).toBeCloseTo(afterDrag, 1);
  });

  it("con un edificio bajo el puntero o seleccionado no gira ni vuelve, por mucho que pase", () => {
    const h = harness();
    h.wheel(-300);
    h.advance(1);
    h.controller.setHold(true);
    const held = h.pose();
    h.advance(30);
    const after = h.pose();
    expect(after.azimuthDeg).toBeCloseTo(held.azimuthDeg, 5);
    expect(after.distance).toBeCloseTo(held.distance, 3);
    expect(h.controller.isReturning()).toBe(false);

    // Al soltar, el retorno es el de siempre: primero vuelve, luego gira.
    h.controller.setHold(false);
    h.advance(5.3);
    expect(h.controller.isReturning()).toBe(true);
  });
});

describe("regla de reanudación: volver a la vista inicial ANTES de girar", () => {
  it("desde una posición muy ampliada vuelve a la vista completa y solo entonces gira", () => {
    const h = harness({ pickPoint: () => new THREE.Vector3(300, 0, 120) });
    // Zoom profundo hacia un punto y órbita.
    for (let index = 0; index < 20; index += 1) h.wheel(-240);
    h.advance(1.5);
    h.pointer("pointerdown", 1, 300, 300);
    h.pointer("pointermove", 1, 420, 240);
    h.pointer("pointerup", 1, 420, 240);
    expect(h.pose().distance).toBeLessThan(INITIAL.distance * 0.2);

    // Durante la inactividad (5 s) no gira desde la posición ampliada. La
    // inercia del arrastre se agota en el primer segundo y se descuenta.
    h.advance(1.5);
    const zoomed = h.pose();
    h.advance(3.3);
    expect(h.pose().azimuthDeg).toBeCloseTo(zoomed.azimuthDeg, 1);
    expect(h.controller.isReturning()).toBe(false);

    // Arranca el retorno y la cámara solo se acerca a la vista inicial.
    let sawReturn = false;
    let spinningFromZoomed = false;
    let previousDistance = h.pose().distance;
    for (let frame = 0; frame < 60 * 4; frame += 1) {
      h.advance(1 / 60);
      const pose = h.pose();
      if (h.controller.isReturning()) {
        sawReturn = true;
        // La distancia crece monótonamente hacia la inicial durante el retorno.
        expect(pose.distance).toBeGreaterThanOrEqual(previousDistance - 1e-6);
      } else if (sawReturn) {
        break;
      } else if (Math.abs(pose.distance - INITIAL.distance) > INITIAL.distance * 0.02) {
        // Si no está retornando y no está en la vista inicial, tampoco debe girar.
        const before = pose.azimuthDeg;
        h.advance(1 / 60);
        if (!h.controller.isReturning() && Math.abs(h.pose().azimuthDeg - before) > 0.04) {
          spinningFromZoomed = true;
        }
      }
      previousDistance = pose.distance;
    }
    expect(sawReturn).toBe(true);
    expect(spinningFromZoomed).toBe(false);

    const home = h.pose();
    expect(home.distance).toBeCloseTo(INITIAL.distance, -1);
    expect(home.pitchDeg).toBeCloseTo(INITIAL.pitchDeg, 0);
    expect(Math.hypot(...home.target)).toBeLessThan(2);

    // Y ahora sí: el giro continúa desde la vista inicial, sin volver a saltar.
    const before = h.pose().azimuthDeg;
    h.advance(6);
    const advanced = (h.pose().azimuthDeg - before + 360) % 360;
    expect(advanced).toBeGreaterThan(15);
    expect(advanced).toBeLessThan(25);
    let minimum = 360;
    for (let index = 0; index < 120; index += 1) {
      h.advance(1 / 12);
      minimum = Math.min(minimum, angleFromHome(h.pose().azimuthDeg));
    }
    expect(minimum).toBeGreaterThan(3);
  });

  it("el retorno dura entre 1,2 y 1,8 segundos", () => {
    const h = harness();
    h.pointer("pointerdown", 1, 300, 300);
    h.pointer("pointermove", 1, 420, 300);
    h.pointer("pointerup", 1, 420, 300);
    h.advance(5.1);
    expect(h.controller.isReturning()).toBe(true);
    let frames = 0;
    while (h.controller.isReturning() && frames < 600) {
      h.advance(1 / 60);
      frames += 1;
    }
    const seconds = frames / 60;
    expect(seconds).toBeGreaterThanOrEqual(1.2);
    expect(seconds).toBeLessThanOrEqual(1.8);
  });

  it("si el usuario toca durante el retorno, se cancela al instante y sin salto", () => {
    const h = harness();
    h.pointer("pointerdown", 1, 300, 300);
    h.pointer("pointermove", 1, 460, 300);
    h.pointer("pointerup", 1, 460, 300);
    h.advance(5.2);
    h.advance(0.6); // el retorno va por la mitad
    const mid = h.pose();
    expect(h.controller.isReturning()).toBe(true);

    h.pointer("pointerdown", 2, 500, 400);
    expect(h.controller.isReturning()).toBe(false);
    expect(h.pose().azimuthDeg).toBeCloseTo(mid.azimuthDeg, 3);
    expect(h.pose().distance).toBeCloseTo(mid.distance, 3);

    h.pointer("pointerup", 2, 500, 400);
    const afterCancel = h.pose().azimuthDeg;
    h.advance(2);
    // Manda el usuario: ni rotación automática ni retorno en curso.
    expect(h.pose().azimuthDeg).toBeCloseTo(afterCancel, 1);
  });
});

describe("zoom profundo anclado al cursor", () => {
  it("la rueda respeta el zoom mínimo (a pie de calle) y el máximo", () => {
    const h = harness();
    for (let index = 0; index < 60; index += 1) h.wheel(-600);
    h.advance(3);
    expect(h.pose().distance).toBeCloseTo(LIMITS.minDistance, 1);
    for (let index = 0; index < 80; index += 1) h.wheel(600);
    h.advance(3);
    expect(h.pose().distance).toBeCloseTo(LIMITS.maxDistance, 0);
  });

  it("acercar con el cursor desplaza el foco hacia el punto señalado", () => {
    const h = harness({ pickPoint: () => new THREE.Vector3(400, 0, -200) });
    for (let index = 0; index < 12; index += 1) h.wheel(-240);
    h.advance(2);
    const pose = h.pose();
    expect(pose.distance).toBeLessThan(INITIAL.distance * 0.5);
    // El foco se ha movido hacia el punto, sin pasarse de él.
    expect(pose.target[0]).toBeGreaterThan(80);
    expect(pose.target[0]).toBeLessThanOrEqual(400);
    expect(pose.target[1]).toBeLessThan(-30);
  });

  it("con un edificio seleccionado el zoom se ancla al edificio, no al cursor", () => {
    const h = harness({ pickPoint: () => new THREE.Vector3(-500, 0, 300) });
    h.controller.setZoomFocus({ x: 120, y: 10, z: 90 });
    for (let index = 0; index < 14; index += 1) h.wheel(-240);
    h.advance(2);
    const pose = h.pose();
    expect(pose.target[0]).toBeGreaterThan(20);
    expect(pose.target[1]).toBeGreaterThan(10);
  });

  it("el zoom es suave: no salta a la distancia final en un fotograma", () => {
    const h = harness();
    h.wheel(-600);
    const first = h.pose().distance;
    h.advance(1 / 60);
    const afterOne = h.pose().distance;
    h.advance(2);
    const settled = h.pose().distance;
    expect(afterOne).toBeLessThan(first);
    expect(afterOne).toBeGreaterThan(settled);
  });

  it("cerca del suelo la inclinación mínima impide bajar de la altura mínima", () => {
    const h = harness();
    for (let index = 0; index < 60; index += 1) h.wheel(-600);
    h.advance(3);
    for (let index = 0; index < 20; index += 1) h.key("ArrowUp");
    expect(h.camera.position.y).toBeGreaterThanOrEqual(LIMITS.minHeight - 1e-6);
  });

  it("el plano cercano se adapta a la distancia", () => {
    const h = harness();
    h.advance(0.1);
    const far = h.camera.near;
    for (let index = 0; index < 60; index += 1) h.wheel(-600);
    h.advance(3);
    expect(h.camera.near).toBeLessThan(far / 10);
    expect(h.camera.near).toBeGreaterThanOrEqual(0.4);
  });
});

describe("desplazamiento: solo dentro del polígono y solo con zoom", () => {
  it("lejos (vista general) arrastrar con la derecha no desplaza nada", () => {
    const h = harness();
    h.pointer("pointerdown", 1, 300, 300, { button: 2 });
    h.pointer("pointermove", 1, 600, 500, { button: 2 });
    h.pointer("pointerup", 1, 600, 500, { button: 2 });
    h.advance(1);
    expect(Math.hypot(...h.pose().target)).toBeLessThan(1);
  });

  it("con zoom aplicado se desplaza, y el foco nunca sale del polígono", () => {
    const h = harness();
    for (let index = 0; index < 14; index += 1) h.wheel(-240);
    h.advance(2);
    expect(h.pose().distance).toBeLessThan(LIMITS.panBelowDistance);
    // Arrastres enormes en todas las direcciones.
    for (const [dx, dy] of [
      [900, 0],
      [-1800, 0],
      [0, 900],
      [0, -1800],
      [1400, 1400],
    ] as const) {
      h.pointer("pointerdown", 1, 700, 450, { button: 2 });
      h.pointer("pointermove", 1, 700 + dx, 450 + dy, { button: 2 });
      h.pointer("pointerup", 1, 700 + dx, 450 + dy, { button: 2 });
      h.advance(2);
      const [x, z] = h.pose().target;
      expect(signedDistance(BOUNDS, x, z)).toBeLessThanOrEqual(1e-6);
    }
  });

  it("al alejar el zoom, el foco vuelve solo al centro", () => {
    const h = harness({ pickPoint: () => new THREE.Vector3(500, 0, 300) });
    for (let index = 0; index < 14; index += 1) h.wheel(-240);
    h.advance(2);
    expect(Math.hypot(...h.pose().target)).toBeGreaterThan(50);
    for (let index = 0; index < 60; index += 1) h.wheel(600);
    h.advance(8);
    expect(Math.hypot(...h.pose().target)).toBeLessThan(15);
  });

  it("dos dedos: el pellizco acerca el zoom", () => {
    const h = harness();
    const before = h.pose().distance;
    h.pointer("pointerdown", 1, 200, 300);
    h.pointer("pointerdown", 2, 400, 300);
    h.pointer("pointermove", 1, 150, 300);
    h.pointer("pointermove", 2, 500, 300);
    h.advance(1);
    expect(h.pose().distance).toBeLessThan(before);
  });

  it("el orbitar tiene inercia suave y se detiene", () => {
    const h = harness();
    h.pointer("pointerdown", 1, 300, 300);
    h.pointer("pointermove", 1, 330, 300);
    h.pointer("pointermove", 1, 360, 300);
    h.pointer("pointermove", 1, 390, 300);
    h.pointer("pointerup", 1, 390, 300);
    const released = h.pose().azimuthDeg;
    h.advance(0.3);
    const during = h.pose().azimuthDeg;
    h.advance(3);
    const later = h.pose().azimuthDeg;
    h.advance(1);
    const end = h.pose().azimuthDeg;
    expect(Math.abs(during - released)).toBeGreaterThan(0.2);
    expect(Math.abs(end - later)).toBeLessThan(0.05);
  });
});

describe("la cámara no atraviesa edificios", () => {
  it("sube por encima de un tejado en lugar de meterse dentro", () => {
    // Un bloque de 60 m de altura en todo el plano: la cámara no puede quedar por debajo.
    const h = harness({ clearance: () => 60 });
    for (let index = 0; index < 60; index += 1) h.wheel(-600);
    h.advance(4);
    expect(h.camera.position.y).toBeGreaterThanOrEqual(60 + LIMITS.minHeight);
  });

  it("sin edificios debajo, la cámara no sube", () => {
    const h = harness({ clearance: () => 0 });
    for (let index = 0; index < 60; index += 1) h.wheel(-600);
    h.advance(4);
    // A 30 m de distancia y 34° de inclinación la cámara está a ~17 m.
    expect(h.camera.position.y).toBeLessThan(20);
  });
});

describe("accesibilidad y mando", () => {
  it("con «menos movimiento» no gira ni anima el retorno, y la vista inicial salta", () => {
    const h = harness({ reduceMotion: true });
    const before = h.pose().azimuthDeg;
    h.advance(10);
    expect(h.pose().azimuthDeg).toBeCloseTo(before, 5);

    h.pointer("pointerdown", 1, 300, 300);
    h.pointer("pointermove", 1, 460, 300);
    h.pointer("pointerup", 1, 460, 300);
    expect(h.pose().azimuthDeg).not.toBeCloseTo(before, 1);
    h.advance(8);
    expect(h.controller.isReturning()).toBe(false);

    h.element.emit("dblclick", { preventDefault() {} });
    expect(h.pose().azimuthDeg).toBeCloseTo(INITIAL.azimuthDeg, 3);
    expect(h.pose().pitchDeg).toBeCloseTo(INITIAL.pitchDeg, 3);
    expect(h.pose().distance).toBeCloseTo(INITIAL.distance, 3);
  });

  it("el teclado orbita, hace zoom y vuelve a la vista inicial", () => {
    const h = harness();
    const before = h.pose();
    h.key("ArrowLeft");
    expect(h.pose().azimuthDeg).not.toBeCloseTo(before.azimuthDeg, 1);
    h.key("+");
    h.advance(1);
    expect(h.pose().distance).toBeLessThan(before.distance);
    h.key("-");
    h.key("-");
    h.advance(1);
    expect(h.pose().distance).toBeGreaterThan(before.distance * 0.95);
    h.key("0");
    expect(h.controller.isReturning()).toBe(true);
    let guard = 0;
    while (h.controller.isReturning() && guard < 600) {
      h.advance(1 / 60);
      guard += 1;
    }
    // En el fotograma en que termina el retorno está exactamente en la inicial.
    expect(h.controller.isAtHome()).toBe(true);
  });

  it("el botón de pausa manual detiene el giro y lo reanuda", () => {
    const h = harness();
    h.controller.setManuallyPaused(true);
    const paused = h.pose().azimuthDeg;
    h.advance(8);
    expect(h.pose().azimuthDeg).toBeCloseTo(paused, 5);
    h.controller.setManuallyPaused(false);
    h.advance(6.8);
    const before = h.pose().azimuthDeg;
    h.advance(3);
    expect((h.pose().azimuthDeg - before + 360) % 360).toBeGreaterThan(8);
  });

  it("el estado que se avisa a la interfaz refleja giro, pausa y vista inicial", () => {
    const estados: Array<{ rotating: boolean; atHome: boolean }> = [];
    const h = harness({ onStateChange: (state) => estados.push(state) });
    expect(estados.at(-1)).toEqual({ rotating: true, atHome: true });

    h.controller.setManuallyPaused(true);
    h.advance(0.1);
    expect(estados.at(-1)).toEqual({ rotating: false, atHome: true });

    h.controller.setManuallyPaused(false);
    h.advance(6.8);
    h.advance(2);
    expect(estados.at(-1)?.rotating).toBe(true);
    expect(estados.at(-1)?.atHome).toBe(false);
  });
});

/** ¿Ha llegado a la vista inicial (distancia y foco)? Tras llegar, el giro lento se reanuda, así que no se mira el azimut. */
const backHome = (h: Harness) => {
  const pose = h.pose();
  return Math.abs(pose.distance - INITIAL.distance) < INITIAL.distance * 0.01 && Math.hypot(pose.target[0], pose.target[1]) < 2;
};

describe("«Vista inicial» funciona a la primera", () => {
  it("soltar la selección justo después de pedir la vista inicial no cancela el retorno", () => {
    const h = harness();
    for (let index = 0; index < 12; index += 1) h.wheel(-240);
    h.advance(1);
    h.controller.setHold(true); // edificio seleccionado
    h.advance(0.5);
    h.controller.requestHome(true); // el botón «Vista inicial»
    h.controller.setHold(false); // y el motor suelta la selección
    expect(h.controller.isReturning()).toBe(true);
    h.advance(2);
    expect(backHome(h)).toBe(true);
  });

  it("pasar el ratón por edificios mientras vuelve (cambios de retención) no la interrumpe", () => {
    const h = harness();
    for (let index = 0; index < 12; index += 1) h.wheel(-240);
    h.advance(1);
    h.controller.requestHome(true);
    h.advance(0.4);
    h.controller.setHold(true);
    h.advance(0.2);
    h.controller.setHold(false);
    expect(h.controller.isReturning()).toBe(true);
    h.advance(1.5);
    expect(backHome(h)).toBe(true);
  });

  it("tocar el mapa mientras vuelve sí la cancela (quien arrastra manda)", () => {
    const h = harness();
    for (let index = 0; index < 12; index += 1) h.wheel(-240);
    h.advance(1);
    h.controller.requestHome(true);
    h.advance(0.3);
    h.pointer("pointerdown", 1, 300, 300);
    expect(h.controller.isReturning()).toBe(false);
  });
});

