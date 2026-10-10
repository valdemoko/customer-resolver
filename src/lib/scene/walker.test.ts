import { describe, expect, it } from "vitest";
import { halfPlanes, regularPolygon } from "./polygon";
import { angleDelta, createWalker, stepWalker, WALKER, WalkWorld, type WalkInput } from "./walker";

const square = (cx: number, cz: number, half: number): Array<[number, number]> => [
  [cx - half, cz - half],
  [cx + half, cz - half],
  [cx + half, cz + half],
  [cx - half, cz + half],
];

const NONE: WalkInput = { forward: false, back: false, left: false, right: false, run: false, jump: false };
const open = () => new WalkWorld({ buildings: [], water: [], bounds: [] });

function run(world: WalkWorld, input: Partial<WalkInput>, seconds: number, yaw = 0, start = createWalker(0, 0)) {
  const state = start;
  for (let t = 0; t < seconds; t += 1 / 60) stepWalker(state, { ...NONE, ...input }, yaw, 1 / 60, world);
  return state;
}

describe("colisiones del modo a pie", () => {
  const world = new WalkWorld({ buildings: [square(20, 0, 5)], water: [], bounds: [] });

  it("un edificio bloquea, con holgura para el cuerpo, y la calle no", () => {
    expect(world.blocked(20, 0, 0.45)).toBe(true); // dentro
    expect(world.blocked(14.8, 0, 0.45)).toBe(true); // pegado a la pared
    expect(world.blocked(13, 0, 0.45)).toBe(false);
    expect(world.blocked(0, 0, 0.45)).toBe(false);
  });

  it("andar contra una fachada no la atraviesa y desliza a lo largo", () => {
    const state = run(world, { forward: true }, 3.5, Math.atan2(0.5, 1)); // hacia +x y algo de +z; aún sin rodear la esquina
    expect(world.blocked(state.x, state.z, WALKER.radius - 0.01)).toBe(false);
    expect(state.x).toBeLessThan(15);
    expect(state.z).toBeGreaterThan(1.5); // siguió avanzando por la pared
  });

  it("de un empujón que lo mete en el edificio sale por el lado más cercano", () => {
    const [x, z] = world.pushOut(24, 0, 0.45);
    expect(x).toBeGreaterThan(25);
    expect(z).toBeCloseTo(0, 1);
  });

  it("no entra en el agua ni sale de la zona", () => {
    const sea = new WalkWorld({
      buildings: [],
      water: [{ outer: [[10, -50], [60, -50], [60, 50], [10, 50]], holes: [[[30, -5], [40, -5], [40, 5], [30, 5]]] }],
      bounds: halfPlanes(regularPolygon(100, 32, "inscribed")),
    });
    expect(sea.inWater(20, 0)).toBe(true);
    expect(sea.inWater(35, 0)).toBe(false); // hueco: isla
    const state = run(sea, { forward: true }, 5);
    expect(state.x).toBeGreaterThan(5); // anduvo por tierra...
    expect(state.x).toBeLessThan(10); // ...y se paró en la orilla
    const far = run(open(), { forward: true, run: true }, 3);
    expect(far.x).toBeGreaterThan(10);
    const bounded = new WalkWorld({ buildings: [], water: [], bounds: halfPlanes(regularPolygon(30, 32, "inscribed")) });
    const edge = run(bounded, { forward: true, run: true }, 10);
    expect(edge.x).toBeGreaterThan(20); // llegó hasta el borde...
    expect(Math.hypot(edge.x, edge.z)).toBeLessThan(30.01); // ...y no lo cruzó
  });

  it("se puede cruzar el agua por un puente o un muelle", () => {
    const river = new WalkWorld({
      buildings: [],
      water: [{ outer: [[10, -50], [30, -50], [30, 50], [10, 50]], holes: [] }],
      bounds: [],
      overWater: [[[8, -2], [32, -2], [32, 2], [8, 2]]], // puente de 4 m de ancho
    });
    expect(river.inWater(20, 20)).toBe(true);
    expect(river.inWater(20, 0)).toBe(false);
    const across = run(river, { forward: true, run: true }, 5, 0, createWalker(0, 0));
    expect(across.x).toBeGreaterThan(30); // cruzó por el puente
    const beside = run(river, { forward: true, run: true }, 3, 0, createWalker(0, 10));
    expect(beside.x).toBeLessThan(10); // fuera del puente, la orilla lo para
  });

  it("encuentra el sitio libre más cercano si se empieza dentro de un edificio", () => {
    const free = world.findFree(20, 0, 0.75);
    expect(free).not.toBeNull();
    expect(world.blocked(free![0], free![1], 0.75)).toBe(false);
  });
});

describe("movimiento del personaje", () => {
  it("andar y correr alcanzan su velocidad, y correr es más rápido", () => {
    const walk = run(open(), { forward: true }, 2);
    expect(walk.speed).toBeCloseTo(WALKER.walkSpeed, 1);
    const sprint = run(open(), { forward: true, run: true }, 2);
    expect(sprint.speed).toBeCloseTo(WALKER.runSpeed, 1);
    expect(sprint.x).toBeGreaterThan(walk.x);
  });

  it("adelante sigue a la cámara y los lados van a su derecha e izquierda", () => {
    const yaw = Math.PI / 2; // mira hacia +z
    const forward = run(open(), { forward: true }, 1, yaw);
    expect(forward.z).toBeGreaterThan(2);
    expect(Math.abs(forward.x)).toBeLessThan(0.01);
    const right = run(open(), { right: true }, 1, yaw);
    expect(right.x).toBeLessThan(-2); // la derecha de quien mira a +z es -x
    const left = run(open(), { left: true }, 1, yaw);
    expect(left.x).toBeGreaterThan(2);
  });

  it("en diagonal no va más rápido y hacia atrás va más despacio", () => {
    const diagonal = run(open(), { forward: true, right: true }, 2);
    expect(diagonal.speed).toBeCloseTo(WALKER.walkSpeed, 1);
    const back = run(open(), { back: true, run: true }, 2);
    expect(back.speed).toBeLessThan(WALKER.walkSpeed);
  });

  it("para al soltar las teclas, sin deslizar eternamente", () => {
    const state = run(open(), { forward: true, run: true }, 2);
    run(open(), {}, 1, 0, state);
    expect(state.speed).toBe(0);
  });

  it("salta lo que dice la altura configurada, vuelve al suelo y no salta dos veces en el aire", () => {
    const world = open();
    const state = createWalker(0, 0);
    let peak = 0;
    let landedAt = -1;
    for (let frame = 0; frame < 120; frame += 1) {
      stepWalker(state, { ...NONE, jump: frame < 40 }, 0, 1 / 60, world);
      peak = Math.max(peak, state.y);
      if (frame > 5 && state.grounded && landedAt < 0) landedAt = frame;
    }
    expect(peak).toBeGreaterThan(WALKER.jumpHeight * 0.9);
    expect(peak).toBeLessThan(WALKER.jumpHeight * 1.1);
    expect(landedAt).toBeGreaterThan(10);
    expect(state.y).toBe(0);
  });

  it("soltar el salto pronto lo acorta", () => {
    const world = open();
    const tap = createWalker(0, 0);
    let tapPeak = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      stepWalker(tap, { ...NONE, jump: frame < 3 }, 0, 1 / 60, world);
      tapPeak = Math.max(tapPeak, tap.y);
    }
    expect(tapPeak).toBeGreaterThan(0.1);
    expect(tapPeak).toBeLessThan(WALKER.jumpHeight * 0.75);
  });

  it("un salto pulsado un poco antes de aterrizar se encadena", () => {
    const world = open();
    const state = createWalker(0, 0);
    stepWalker(state, { ...NONE, jump: true }, 0, 1 / 60, world);
    // Todo el salto, con la tecla soltada y vuelta a pulsar justo antes de caer.
    let pressedAgain = false;
    let secondPeak = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      const nearLanding = state.vy < 0 && state.y < 0.25;
      if (nearLanding) pressedAgain = true;
      stepWalker(state, { ...NONE, jump: pressedAgain }, 0, 1 / 60, world);
      if (pressedAgain) secondPeak = Math.max(secondPeak, state.y);
    }
    expect(secondPeak).toBeGreaterThan(0.5);
  });

  it("el cuerpo se orienta hacia donde camina, por el camino más corto", () => {
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2, 5);
    const state = run(open(), { forward: true }, 1, Math.PI / 2);
    expect(Math.cos(state.heading)).toBeLessThan(0.3);
    expect(Math.sin(state.heading)).toBeGreaterThan(0.9);
  });
});

describe("súper velocidad", () => {
  it("llega a su velocidad, mucho mayor que correr, y salta más alto", () => {
    const sprint = run(open(), { forward: true, boost: true }, 2);
    expect(sprint.speed).toBeCloseTo(WALKER.boostSpeed, 0);
    expect(WALKER.boostSpeed).toBeGreaterThan(WALKER.runSpeed * 3);
    const world = open();
    const state = createWalker(0, 0);
    let peak = 0;
    for (let frame = 0; frame < 150; frame += 1) {
      stepWalker(state, { ...NONE, boost: true, jump: frame < 60 }, 0, 1 / 60, world);
      peak = Math.max(peak, state.y);
    }
    expect(peak).toBeGreaterThan(WALKER.jumpHeight * 1.5);
  });

  it("no atraviesa un muro fino aunque se vaya a toda velocidad con pocos fotogramas por segundo", () => {
    const wall = new WalkWorld({ buildings: [square(20, 0, 0.5)], water: [], bounds: [] }); // 1 m de grosor
    const state = createWalker(0, 0);
    for (let frame = 0; frame < 60; frame += 1) stepWalker(state, { ...NONE, forward: true, boost: true }, 0, 1 / 20, wall); // 20 fps
    expect(state.x).toBeLessThan(20);
  });
});
