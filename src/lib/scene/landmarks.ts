/**
 * Modelos propios de edificios emblemáticos (catedral).
 *
 * El modelo GLB se crea en un cubo unitario horizontal: x en [-0,5, 0,5] a lo
 * largo del edificio (la fachada principal, con las torres, en el extremo -x), z
 * en [-0,5, 0,5] a lo ancho, e y en METROS REALES. Aquí se estira x y z al
 * rectángulo mínimo que encierra la huella de OpenStreetMap y se orienta con la
 * fachada hacia el lado que declara la configuración. Las alturas no se tocan:
 * son las documentadas.
 *
 * El modelo comparte el material y el índice de edificio (`bid`) de la ciudad,
 * así que el hover, la selección y el difuminado de bordes funcionan igual que
 * con cualquier otro edificio, y sigue siendo UN edificio individual.
 */

import * as THREE from "three";
import type { LandmarkSlot } from "./city";
import type { Ring } from "./polygon";

export type OrientedBox = {
  center: [number, number];
  /** Eje largo unitario, en (x, z). */
  axis: [number, number];
  length: number;
  width: number;
};

/** Rectángulo de área mínima que encierra un anillo (barrido de 1°). */
export function orientedBox(ring: Ring): OrientedBox {
  let best: OrientedBox | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (let degrees = 0; degrees < 180; degrees += 1) {
    const angle = (degrees * Math.PI) / 180;
    const ux = Math.cos(angle);
    const uz = Math.sin(angle);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [x, z] of ring) {
      const u = x * ux + z * uz;
      const v = -x * uz + z * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea) {
      bestArea = area;
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const alongU = maxU - minU >= maxV - minV;
      const axis: [number, number] = alongU ? [ux, uz] : [-uz, ux];
      best = {
        center: [cu * ux - cv * uz, cu * uz + cv * ux],
        axis,
        length: Math.max(maxU - minU, maxV - minV),
        width: Math.min(maxU - minU, maxV - minV),
      };
    }
  }
  if (!best) throw new Error("Huella vacía");
  return best;
}

const FACING: Record<string, [number, number]> = {
  W: [-1, 0],
  E: [1, 0],
  N: [0, -1],
  S: [0, 1],
};

export type PlacedModel = {
  object: THREE.Group;
  geometries: THREE.BufferGeometry[];
};

export async function placeLandmarkModel(options: {
  slot: LandmarkSlot;
  material: THREE.Material;
  /** Exageración vertical uniforme (B.4); 1 = alturas reales. */
  heightScale?: number;
}): Promise<PlacedModel | null> {
  const { slot, material } = options;
  const heightScale = options.heightScale ?? 1;
  const url = slot.config.modelUrl;
  if (!url) return null;
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync(url);

  const box = orientedBox(slot.record.footprint);
  let [ux, uz] = box.axis;
  const facing = slot.config.facing ? FACING[slot.config.facing] : undefined;
  // La fachada está en el extremo -x del modelo: ese extremo debe mirar al lado
  // declarado, es decir, el eje debe apuntar en sentido contrario.
  if (facing && ux * facing[0] + uz * facing[1] > 0) {
    ux = -ux;
    uz = -uz;
  }
  const matrix = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(ux * box.length, 0, uz * box.length),
    new THREE.Vector3(0, heightScale, 0),
    new THREE.Vector3(-uz * box.width, 0, ux * box.width),
  );
  matrix.setPosition(box.center[0], 0, box.center[1]);

  const group = new THREE.Group();
  group.name = `modelo-${slot.config.id}`;
  const geometries: THREE.BufferGeometry[] = [];

  gltf.scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.geometry as THREE.BufferGeometry;
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    mesh.updateWorldMatrix(true, false);
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.applyMatrix4(matrix);
    if (!geometry.getAttribute("color")) {
      const count = geometry.getAttribute("position").count;
      geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3).fill(0.9), 3));
    }
    const bid = new Float32Array(geometry.getAttribute("position").count).fill(slot.record.index);
    geometry.setAttribute("bid", new THREE.BufferAttribute(bid, 1));
    geometry.deleteAttribute("uv");
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const model = new THREE.Mesh(geometry, material);
    model.castShadow = true;
    model.receiveShadow = true;
    model.name = `${slot.config.id}-${mesh.name}`;
    group.add(model);
    geometries.push(geometry);
  });

  // Las geometrías cargadas ya no hacen falta: se liberan las del archivo.
  gltf.scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of materials) m.dispose();
    }
  });
  return { object: group, geometries };
}
