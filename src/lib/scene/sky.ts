/**
 * Cielo y nubes.
 *
 * EL CIELO ES UN DEGRADADO, NO UNA IMAGEN: una esfera enorme vista por dentro
 * con dos colores mezclados según la altura. El color del horizonte es el de la
 * niebla, así que el terreno lejano se funde con el cielo sin línea de horizonte.
 *
 * LAS NUBES SON DECORACIÓN Y BARATAS POR CONSTRUCCIÓN:
 *  · 4 variantes de geometría con muy pocos triángulos (de ~40 a ~130), una
 *    malla instanciada por variante y UN SOLO material compartido.
 *  · Sin transparencia por nube: cada instancia lleva un valor de desvanecido
 *    (`aFade`) y el shader descarta fragmentos con un patrón de tramado
 *    (dither). Se dibujan opacas y sin ordenar.
 *  · Colocación: bancos bajos en el perímetro de la zona, que cierran la vista
 *    con la niebla, y algunas nubes altas lejanas.
 *  · NUNCA TAPAN LA CIUDAD NI EL EDIFICIO SELECCIONADO: cada fotograma se mide la
 *    distancia de cada nube al rayo cámara→foco y a la propia cámara, y se
 *    atenúa (con suavizado temporal, sin saltos) lo que se acerque.
 *  · Derivan despacio por su cuenta, en un lazo cerrado alrededor de la ciudad,
 *    así que reaparecen sin saltos. Las lejanas usan la variante más simple.
 */

import * as THREE from "three";
import { MeshBuilder } from "./mesh";
import { SKY, hexToNumber } from "./palette";
import { halfPlanes, seededRandom } from "./polygon";
import type { Ring } from "./polygon";
import type { HalfPlane } from "./polygon";

export type Sky = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  geometry: THREE.BufferGeometry;
};

export function buildSky(radius: number): Sky {
  const geometry = new THREE.SphereGeometry(radius, 32, 20);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(SKY.top) },
      horizonColor: { value: new THREE.Color(SKY.horizon) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform float uTime;
      varying vec3 vDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      void main() {
        float h = vDir.y;
        // Banda de horizonte ancha: sin degradado duro. Por debajo del horizonte el
        // color es el del horizonte (el mapa difuminado se funde con él sin costura).
        float t = smoothstep(0.0, 0.62, h);
        vec3 color = mix(horizonColor, topColor, t);

        // Velos de luz muy lentos: dos capas de ruido que derivan en sentidos
        // opuestos. Valen cero en el horizonte (la costura del mapa no cambia) y
        // suben hacia arriba; amplitud baja para no dar contraste con la ciudad.
        vec2 q = vDir.xz / (abs(h) + 0.55);
        float veil = noise(q * 1.7 + vec2(uTime * 0.012, uTime * 0.006))
                   * noise(q * 3.1 - vec2(uTime * 0.009, uTime * 0.013));
        float lift = smoothstep(0.08, 0.5, h);
        color += vec3(0.060, 0.085, 0.125) * veil * lift;
        // Un resplandor cálido y lejano en un lado del cielo, que se desplaza despacio.
        float glowAngle = uTime * 0.01;
        vec2 glowDir = vec2(cos(glowAngle), sin(glowAngle));
        float glow = pow(max(dot(normalize(vDir.xz + 1e-4), glowDir), 0.0), 6.0) * smoothstep(0.0, 0.35, h) * (1.0 - smoothstep(0.35, 0.8, h));
        color += vec3(0.075, 0.05, 0.03) * glow;

        gl_FragColor = vec4(color, 1.0);
        // Conversión al espacio de color de salida: sin ella el cielo salía mucho más oscuro que su color.
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "cielo";
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, material, geometry };
}

export type CloudsOptions = {
  /** Número de nubes en total (bancos + altas). */
  count: number;
  /** Polígono de la zona CON su banda (anillo en metros). Los bancos lo rodean. */
  outer: Ring;
  bandM: number;
  /** Segundos que tarda un banco en dar una vuelta completa. */
  driftSeconds: number;
  seed: number;
};

type CloudInstance = {
  mesh: THREE.InstancedMesh;
  index: number;
  angle: number;
  /** Desplazamiento radial respecto al borde, en metros (positivo = hacia fuera). */
  offsetM: number;
  /** Radio fijo (alta) o `null` si sigue el borde (banco). */
  fixedRadiusM: number | null;
  height: number;
  scale: number;
  spin: number;
  speed: number;
  /** Radio de la nube, para medir cuándo tapa algo. */
  radiusM: number;
  fade: number;
  baseCount: number;
};

export type Clouds = {
  group: THREE.Group;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  /** Nubes realmente dibujadas (con desvanecido mayor que cero). */
  activeCount: number;
  placedCount: number;
  update: (
    elapsedSeconds: number,
    deltaSeconds: number,
    cameraPosition: THREE.Vector3,
    focus: THREE.Vector3,
  ) => void;
  setCount: (count: number) => void;
  /** Triángulos de cada variante, para la documentación. */
  trianglesPerVariant: number[];
};

/**
 * Variantes de nube: número de «bocanadas» (cúmulos) y complejidad. Las dos primeras
 * son los bancos del perímetro (cerca, se ven bien); las dos últimas, las nubes altas
 * y lejanas, más sencillas. Todas son de caras planas (low poly), pero con forma de
 * cúmulo de verdad: base plana, cúpula más alta en el centro, bocanadas pequeñas
 * encima y a los lados, y un degradado de blanco a azul claro con la altura.
 */
const VARIANTS = [
  { puffs: 9, detail: 1, length: 4.6 },
  { puffs: 7, detail: 1, length: 3.8 },
  { puffs: 5, detail: 1, length: 3.0 },
  { puffs: 4, detail: 0, length: 2.6 },
] as const;

/** Radio en metros de una bocanada base; la escala de cada instancia lo multiplica. */
const BLOB_RADIUS = 60;

function buildCloudGeometry(random: () => number, puffs: number, detail: number, length: number): THREE.BufferGeometry {
  const builder = new MeshBuilder();
  const top = new THREE.Color(SKY.cloudTop);
  const bottom = new THREE.Color(SKY.cloudBottom);
  const span = BLOB_RADIUS * length;

  // Centros de las bocanadas: a lo largo de un eje, más grandes y altas hacia el
  // centro (perfil de cúpula), con un poco de desorden en profundidad.
  type Puff = { x: number; y: number; z: number; r: number };
  const list: Puff[] = [];
  const base = Math.max(3, puffs - 3);
  for (let i = 0; i < base; i += 1) {
    const u = base === 1 ? 0 : (i / (base - 1)) * 2 - 1; // -1 .. 1
    const dome = 1 - u * u;
    const r = BLOB_RADIUS * (0.5 + dome * 0.62 + random() * 0.12);
    list.push({ x: (u * span) / 2 + (random() - 0.5) * r * 0.3, y: r * (0.28 + dome * 0.22), z: (random() - 0.5) * r * 0.7, r });
  }
  // Coronas: bocanadas más pequeñas sobre la cúpula y delante.
  for (let i = base; i < puffs; i += 1) {
    const host = list[Math.floor(random() * Math.min(list.length, base))] ?? list[0]!;
    const r = host.r * (0.45 + random() * 0.25);
    list.push({
      x: host.x + (random() - 0.5) * host.r * 0.9,
      y: host.y + host.r * (0.55 + random() * 0.35),
      z: host.z + (random() - 0.5) * host.r * 0.9,
      r,
    });
  }

  const maxTop = Math.max(...list.map((p) => p.y + p.r * 0.8));
  for (const puff of list) {
    const source = new THREE.IcosahedronGeometry(puff.r, detail);
    const position = source.getAttribute("position");
    // Una sola deformación por vértice (no por triángulo): las caras comparten
    // vértices y la malla no se abre; así se conservan las facetas pero no hay grietas.
    const jitter = new Map<string, number>();
    const factor = (x: number, y: number, z: number) => {
      const key = `${x.toFixed(2)}|${y.toFixed(2)}|${z.toFixed(2)}`;
      let value = jitter.get(key);
      if (value === undefined) {
        value = 0.9 + random() * 0.2;
        jitter.set(key, value);
      }
      return value;
    };
    for (let index = 0; index + 2 < position.count; index += 3) {
      const vertex = (i: number): [number, number, number] => {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const f = factor(x, y, z);
        // Base plana: lo que queda bajo y = 0 se aplasta contra el suelo de la nube.
        return [puff.x + x * f, Math.max(0, puff.y + y * f * 0.8), puff.z + z * f * 0.9];
      };
      const a = vertex(index);
      const b = vertex(index + 1);
      const c = vertex(index + 2);
      const height = (a[1] + b[1] + c[1]) / 3 / maxTop;
      // Blanco arriba, azul claro abajo; cada bocanada con su pequeña variación de brillo.
      const shade = Math.min(1, Math.max(0, height * 1.15));
      builder.addTriangle(a, b, c, bottom.clone().lerp(top, shade).getHex());
    }
    source.dispose();
  }
  return builder.build();
}

/** Distancia desde el centro (0,0) al borde del polígono en la dirección `angle`. */
function boundaryRadius(planes: HalfPlane[], angle: number): number {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  let t = Number.POSITIVE_INFINITY;
  for (const plane of planes) {
    const denominator = plane.nx * dx + plane.nz * dz;
    if (denominator > 1e-6) t = Math.min(t, plane.c / denominator);
  }
  return Number.isFinite(t) ? t : 1000;
}

export function buildClouds(options: CloudsOptions): Clouds {
  const { driftSeconds, seed } = options;
  const random = seededRandom(seed ^ 0x2f1c9a53);
  const group = new THREE.Group();
  group.name = "nubes";
  const planes = halfPlanes(options.outer);
  const geometries: THREE.BufferGeometry[] = [];
  const trianglesPerVariant: number[] = [];

  // Un único material para todas las nubes: una sola compilación de shader.
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    emissive: new THREE.Color("#7f93b3"),
    emissiveIntensity: 1,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFade;\nvarying float vCloudFade;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCloudFade = aFade;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vCloudFade;")
      .replace(
        "void main() {",
        `void main() {
          // Tramado de ruido de gradiente entrelazado: descarta una fracción de
          // fragmentos según el desvanecido. Opaco, sin ordenar y sin mezcla.
          float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (vCloudFade <= dither) discard;`,
      );
  };
  material.customProgramCacheKey = () => "scene:cloud";

  // Reparto: ~70 % bancos bajos del perímetro, ~30 % nubes altas lejanas.
  const total = Math.max(0, options.count);
  const bankCount = Math.round(total * 0.7);
  const highCount = total - bankCount;

  const instances: CloudInstance[] = [];
  const meshes: THREE.InstancedMesh[] = [];

  const perVariant = VARIANTS.map((_, variant) => {
    // Las lejanas (altas) usan solo las dos variantes más simples.
    const banks = Math.ceil(bankCount / 2);
    const highs = Math.ceil(highCount / 2);
    return variant < 2 ? banks : highs;
  });

  VARIANTS.forEach((variantConfig, variant) => {
    const geometry = buildCloudGeometry(random, variantConfig.puffs, variantConfig.detail, variantConfig.length);
    const fadeAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(Math.max(1, perVariant[variant] ?? 1)).fill(1),
      1,
    );
    fadeAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aFade", fadeAttribute);
    geometries.push(geometry);
    const positionCount = geometry.getAttribute("position").count;
    trianglesPerVariant.push(positionCount / 3);

    const capacity = Math.max(1, perVariant[variant] ?? 1);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = `nubes-${variant}`;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    meshes.push(mesh);
  });

  // Reparto ANGULAR estratificado: los bancos bajos se reparten por todo el
  // perímetro (B.4: la banda es radial y uniforme), con un pequeño desorden, en
  // lugar de agruparse al azar en un sector.
  let bankSlot = 0;
  let highSlot = 0;
  const fill = (variant: number, count: number, high: boolean) => {
    const mesh = meshes[variant];
    if (!mesh) return;
    for (let index = 0; index < count; index += 1) {
      const bank = !high;
      const slot = bank ? bankSlot++ : highSlot++;
      const slots = Math.max(1, bank ? bankCount : highCount);
      const scale = bank ? 0.55 + random() * 0.55 : 2.4 + random() * 1.6;
      instances.push({
        mesh,
        index: mesh.count + index,
        angle: ((slot + random() * 0.8) / slots) * Math.PI * 2,
        offsetM: bank ? -options.bandM * 0.25 + random() * options.bandM * 1.6 : 0,
        fixedRadiusM: bank ? null : 3400 + random() * 3600,
        height: bank ? 30 + random() * 90 : 650 + random() * 700,
        scale,
        spin: random() * Math.PI * 2,
        speed: (bank ? 1 : 0.55) * (0.7 + random() * 0.6),
        radiusM: BLOB_RADIUS * scale * 1.9,
        fade: 1,
        baseCount: 0,
      });
    }
    mesh.count += count;
  };
  // Bancos en las dos primeras variantes, altas en las dos últimas.
  fill(0, Math.min(perVariant[0] ?? 0, Math.ceil(bankCount / 2)), false);
  fill(1, Math.min(perVariant[1] ?? 0, bankCount - Math.ceil(bankCount / 2)), false);
  fill(2, Math.min(perVariant[2] ?? 0, Math.ceil(highCount / 2)), true);
  fill(3, Math.min(perVariant[3] ?? 0, highCount - Math.ceil(highCount / 2)), true);
  const placed = instances.length;
  // `mesh.count` pasa a ser el número ACTIVO: se restablece abajo con setCount.
  const capacities = meshes.map((mesh) => mesh.count);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scaleVector = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const segment = new THREE.Vector3();
  const toCloud = new THREE.Vector3();
  const closest = new THREE.Vector3();

  // Las nubes se actualizan a 20 Hz y no a cada fotograma. Subir los búferes de
  // instancias a la GPU en cada fotograma, mientras la GPU aún lee los del
  // anterior, obliga al controlador a esperar: medido, 4 llamadas de dibujo de
  // nubes costaban más CPU que las otras 54 del fotograma juntas. A 20 Hz el
  // salto es de menos de un metro (la deriva es de ~18 m/s), invisible.
  const STEP_SECONDS = 0.05;
  let sinceUpdate = STEP_SECONDS;

  const update: Clouds["update"] = (elapsedSeconds, deltaSeconds, cameraPosition, focus) => {
    sinceUpdate += deltaSeconds;
    if (sinceUpdate < STEP_SECONDS) return;
    deltaSeconds = sinceUpdate;
    sinceUpdate = 0;
    segment.copy(focus).sub(cameraPosition);
    const segmentLengthSq = Math.max(1, segment.lengthSq());
    const blend = 1 - Math.exp(-deltaSeconds * 3.5);
    let active = 0;

    for (const instance of instances) {
      const lap = (elapsedSeconds / driftSeconds) * Math.PI * 2 * instance.speed;
      const angle = instance.angle + lap;
      const radius =
        instance.fixedRadiusM ?? Math.max(200, boundaryRadius(planes, angle) + instance.offsetM);
      position.set(Math.cos(angle) * radius, instance.height, Math.sin(angle) * radius);

      // ¿Tapa algo? Distancia al segmento cámara→foco (lo seleccionado o el
      // centro de la vista) y a la propia cámara.
      toCloud.copy(position).sub(cameraPosition);
      const t = Math.min(1, Math.max(0, toCloud.dot(segment) / segmentLengthSq));
      closest.copy(cameraPosition).addScaledVector(segment, t);
      const rayDistance = closest.distanceTo(position);
      const cameraDistance = cameraPosition.distanceTo(position);
      const r = instance.radiusM;
      const blocksRay = smooth(r * 0.55, r * 1.15 + 80, rayDistance);
      const nearCamera = smooth(r * 0.4 + 40, r * 1.2 + 260, cameraDistance);
      const target = Math.min(blocksRay, nearCamera);

      instance.fade += (target - instance.fade) * blend;
      const index = instance.index;
      const visible = index < (instance.mesh.count || 0) && instance.fade > 0.02;
      const fadeAttribute = instance.mesh.geometry.getAttribute("aFade") as THREE.InstancedBufferAttribute;
      fadeAttribute.setX(index, instance.fade);

      quaternion.setFromAxisAngle(upAxis, instance.spin + elapsedSeconds * 0.004);
      // Una nube invisible no se rasteriza: escala cero.
      scaleVector.setScalar(visible ? instance.scale : 0);
      matrix.compose(position, quaternion, scaleVector);
      instance.mesh.setMatrixAt(index, matrix);
      if (visible) active += 1;
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      const attribute = mesh.geometry.getAttribute("aFade") as THREE.InstancedBufferAttribute;
      attribute.needsUpdate = true;
    }
    activeValue = active;
  };

  let activeValue = 0;

  const setCount = (count: number) => {
    const activeFraction = total === 0 ? 0 : Math.min(1, Math.max(0, count / total));
    meshes.forEach((mesh, index) => {
      mesh.count = Math.round((capacities[index] ?? 0) * activeFraction);
    });
  };
  setCount(options.count);

  return {
    group,
    materials: [material],
    geometries,
    get activeCount() {
      return activeValue;
    },
    placedCount: placed,
    update,
    setCount,
    trianglesPerVariant,
  };
}

function smooth(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Color de fondo del lienzo: el del horizonte. */
export const CLEAR_COLOR = hexToNumber(SKY.horizon);
