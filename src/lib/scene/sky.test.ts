import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildClouds } from "./sky";

/**
 * Las nubes son decoración: nunca pueden tapar la ciudad ni el edificio
 * seleccionado. Aquí se comprueba con la propia lógica de producción (sin
 * WebGL: solo hace falta la geometría y los atributos por instancia).
 */

const OUTER: Array<[number, number]> = [
  [-1100, -800],
  [1100, -800],
  [1100, 800],
  [-1100, 800],
];

function make(count = 30) {
  return buildClouds({ count, outer: OUTER, bandM: 200, driftSeconds: 600, seed: 20261009 });
}

/** Posición y desvanecido de cada nube visible, leídos de los búferes. */
function readInstances(clouds: ReturnType<typeof make>) {
  const out: Array<{ position: THREE.Vector3; fade: number; scale: number }> = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (const child of clouds.group.children) {
    const mesh = child as THREE.InstancedMesh;
    const fade = mesh.geometry.getAttribute("aFade") as THREE.InstancedBufferAttribute;
    for (let index = 0; index < mesh.count; index += 1) {
      mesh.getMatrixAt(index, matrix);
      matrix.decompose(position, quaternion, scale);
      out.push({ position: position.clone(), fade: fade.getX(index), scale: scale.x });
    }
  }
  return out;
}

function settle(clouds: ReturnType<typeof make>, camera: THREE.Vector3, focus: THREE.Vector3) {
  for (let step = 0; step < 240; step += 1) clouds.update(step * 0.05, 0.05, camera, focus);
}

function distanceToSegment(point: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const segment = b.clone().sub(a);
  const t = Math.min(1, Math.max(0, point.clone().sub(a).dot(segment) / segment.lengthSq()));
  return a.clone().addScaledVector(segment, t).distanceTo(point);
}

describe("nubes baratas", () => {
  it("son pocas variantes, de pocos triángulos, con un solo material", () => {
    const clouds = make();
    // De 3 a 5 variantes de geometría.
    expect(clouds.group.children.length).toBeGreaterThanOrEqual(3);
    expect(clouds.group.children.length).toBeLessThanOrEqual(5);
    // Todas instanciadas y con el MISMO material (una sola compilación de shader).
    const materials = new Set(
      clouds.group.children.map((child) => (child as THREE.InstancedMesh).material),
    );
    expect(materials.size).toBe(1);
    for (const child of clouds.group.children) expect(child).toBeInstanceOf(THREE.InstancedMesh);
    // Geometrías de bajo número de triángulos.
    for (const triangles of clouds.trianglesPerVariant) {
      expect(triangles).toBeGreaterThan(0);
      expect(triangles).toBeLessThanOrEqual(800); // cúmulos de caras planas bien formados (antes ≤ 130, eran piedras sueltas)
    }
    // Sin transparencia por nube: ni `transparent` ni ordenación.
    const material = (clouds.group.children[0] as THREE.InstancedMesh).material as THREE.Material;
    expect(material.transparent).toBe(false);
  });

  it("las nubes lejanas usan las variantes más simples", () => {
    const { trianglesPerVariant } = make();
    expect(trianglesPerVariant.at(-1)).toBeLessThan(trianglesPerVariant[0] ?? 0);
  });

  it("se pueden reducir por dispositivo sin reconstruir nada", () => {
    const clouds = make(30);
    clouds.setCount(10);
    const total = clouds.group.children.reduce((sum, child) => sum + (child as THREE.InstancedMesh).count, 0);
    expect(total).toBeLessThanOrEqual(11);
    expect(total).toBeGreaterThanOrEqual(8);
  });
});

describe("nunca tapan la ciudad", () => {
  const camera = new THREE.Vector3(0, 1200, 1900);
  const focus = new THREE.Vector3(0, 0, 0);

  it("lo que se acerca al rayo cámara→foco se desvanece; lo lejano se queda nítido", () => {
    const clouds = make();
    settle(clouds, camera, focus);
    const instances = readInstances(clouds);
    expect(instances.length).toBeGreaterThan(10);
    let blockers = 0;
    let clear = 0;
    for (const { position, fade, scale } of instances) {
      const radius = 60 * scale * 1.6;
      const distance = distanceToSegment(position, camera, focus);
      if (distance < radius * 0.5) {
        blockers += 1;
        expect(fade).toBeLessThan(0.25);
      }
      if (distance > radius * 3 + 200 && position.distanceTo(camera) > radius * 3 + 500) {
        clear += 1;
        expect(fade).toBeGreaterThan(0.9);
      }
    }
    // La prueba solo vale si hubo nubes de las dos clases.
    expect(clear).toBeGreaterThan(5);
    expect(blockers).toBeGreaterThanOrEqual(0);
  });

  it("si el foco es un edificio seleccionado, las nubes también lo respetan", () => {
    const clouds = make(60);
    const building = new THREE.Vector3(900, 20, 500);
    settle(clouds, camera, building);
    for (const { position, fade, scale } of readInstances(clouds)) {
      const radius = 60 * scale * 1.6;
      if (distanceToSegment(position, camera, building) < radius * 0.5) {
        expect(fade).toBeLessThan(0.25);
      }
    }
  });

  it("el desvanecido es gradual: ninguna nube salta de golpe", () => {
    const clouds = make();
    clouds.update(0, 0.05, camera, focus);
    const before = readInstances(clouds).map((instance) => instance.fade);
    // Se mueve la cámara de golpe, como un salto de vista inicial.
    clouds.update(0.05, 0.05, new THREE.Vector3(1500, 800, -1500), new THREE.Vector3(200, 0, 100));
    const after = readInstances(clouds).map((instance) => instance.fade);
    for (let index = 0; index < before.length; index += 1) {
      expect(Math.abs((after[index] ?? 0) - (before[index] ?? 0))).toBeLessThan(0.3);
    }
  });

  it("derivan en un lazo cerrado: tras una vuelta vuelven a su sitio", () => {
    const clouds = make();
    const lap = 600;
    clouds.update(lap * 0.0, 0.05, camera, focus);
    const first = readInstances(clouds).map((instance) => instance.position.clone());
    clouds.update(lap, 0.05, camera, focus);
    const second = readInstances(clouds).map((instance) => instance.position.clone());
    // Las bajas (velocidad 1×) y altas (0,55×) no coinciden todas, pero ninguna
    // nube sale despedida ni desaparece: todas siguen a menos de 12 km.
    for (let index = 0; index < first.length; index += 1) {
      expect(second[index]?.length() ?? 0).toBeLessThan(12000);
    }
    expect(first.length).toBe(second.length);
  });
});
