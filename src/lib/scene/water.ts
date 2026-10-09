/**
 * Agua real (B.4): una superficie por masa, un solo material, con profundidad.
 *
 * LO QUE HACE QUE NO PAREZCA «UN POLÍGONO PINTADO SOBRE EL SUELO»:
 *  · La lámina está POR DEBAJO del nivel de muelles y orillas (`levelsM` en la
 *    configuración) y el suelo tiene el hueco del agua, no la cubre.
 *  · Los bordes llevan PAREDES de muelle visibles, del suelo hasta por debajo de
 *    la lámina (de arena donde la orilla es una playa).
 *  · El color depende de la distancia a la orilla (aguas poco profundas más
 *    claras) y hay espuma leve junto a ella, ambas leídas de un campo de
 *    distancia a la costa que se calcula UNA vez al cargar.
 *
 * COSTE: nada de transparencia ni de reflexión en tiempo real. El oleaje es de
 * fragmento (no mueve vértices, así que no hay grietas entre teselas), de baja
 * amplitud y con sombreado PLANO por facetas triangulares; el reflejo del cielo
 * es un Fresnel barato.
 *
 * MAR Y PUERTO SON LA MISMA MASA: el pipeline construye una sola superficie de
 * mar (costa menos muelles y espigones), así que no hay costura entre dársenas y
 * mar abierto, y el material es el mismo para todas las masas.
 */

import * as THREE from "three";
import { isTileCut } from "./tiles";
import type { CityFeature } from "./tiles";
import { MeshBuilder } from "./mesh";
import { patchMaterial } from "./materials";
import type { SceneUniforms } from "./materials";
import { SHORE, SKY, WATER, hexToNumber } from "./palette";
import type { Ring } from "./polygon";

/** Altura a la que llega la pared por arriba: la del muelle más alto. */
const WALL_TOP = 0.14;
const SHORE_MAX_M = 80;

export type WaterMeshes = {
  group: THREE.Group;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  textures: THREE.Texture[];
  /** Actualiza los uniformes que dependen de la cámara. */
  update: (camera: THREE.Vector3) => void;
  stats: {
    masses: number;
    byKind: Record<string, number>;
    triangles: number;
    wallSegments: number;
    shoreFieldPx: number;
    shoreFieldMs: number;
  };
};

export type WaterOptions = {
  features: CityFeature[];
  uniforms: SceneUniforms;
  /** Nivel de la lámina por tipo (m, negativo). */
  levelsM: Record<string, number>;
  /** Radio fuera del cual el borde del recorte no lleva pared. */
  clipRadiusM: number;
  /** Anillos de playa, para pintar de arena su orilla. */
  beachRings: Ring[];
  sunDirection: THREE.Vector3;
  /** Resolución del campo de costa (px por lado). */
  shoreFieldPx: number;
};

/** Distancia de cada texel de agua a la tierra más cercana (chamfer 3-4), en metros. */
export function chamferDistance(isWater: Uint8Array, size: number, texelM: number): Float32Array {
  const INF = 1e9;
  const dist = new Float32Array(size * size);
  for (let i = 0; i < dist.length; i += 1) dist[i] = isWater[i] ? INF : 0;
  const a = 1;
  const b = 1.4142;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      let d = dist[i] ?? INF;
      if (d === 0) continue;
      if (x > 0) d = Math.min(d, (dist[i - 1] ?? INF) + a);
      if (y > 0) {
        d = Math.min(d, (dist[i - size] ?? INF) + a);
        if (x > 0) d = Math.min(d, (dist[i - size - 1] ?? INF) + b);
        if (x < size - 1) d = Math.min(d, (dist[i - size + 1] ?? INF) + b);
      }
      dist[i] = d;
    }
  }
  for (let y = size - 1; y >= 0; y -= 1) {
    for (let x = size - 1; x >= 0; x -= 1) {
      const i = y * size + x;
      let d = dist[i] ?? INF;
      if (d === 0) continue;
      if (x < size - 1) d = Math.min(d, (dist[i + 1] ?? INF) + a);
      if (y < size - 1) {
        d = Math.min(d, (dist[i + size] ?? INF) + a);
        if (x < size - 1) d = Math.min(d, (dist[i + size + 1] ?? INF) + b);
        if (x > 0) d = Math.min(d, (dist[i + size - 1] ?? INF) + b);
      }
      dist[i] = d;
    }
  }
  for (let i = 0; i < dist.length; i += 1) dist[i] = (dist[i] ?? 0) * texelM;
  return dist;
}

/**
 * Campo de distancia a la orilla como textura R8. Se rasteriza la TIERRA (capa
 * `land` del paquete: círculo menos agua) sobre un lienzo blanco y se mide, para
 * cada texel de agua, la distancia a la tierra más cercana.
 */
function buildShoreField(
  features: CityFeature[],
  half: number,
  pixels: number,
): { texture: THREE.DataTexture; ms: number } | null {
  if (typeof document === "undefined") return null;
  const started = performance.now();
  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, pixels, pixels);
  ctx.fillStyle = "#000";
  const scale = pixels / (half * 2);
  const px = (v: number) => (v + half) * scale;
  for (const feature of features) {
    if (feature.layer !== "land") continue;
    for (const polygon of feature.polygons) {
      ctx.beginPath();
      for (const ring of [polygon.outer, ...polygon.holes]) {
        ring.forEach(([x, z], index) => {
          if (index === 0) ctx.moveTo(px(x), px(z));
          else ctx.lineTo(px(x), px(z));
        });
        ctx.closePath();
      }
      ctx.fill("evenodd");
    }
  }
  const data = ctx.getImageData(0, 0, pixels, pixels).data;
  const water = new Uint8Array(pixels * pixels);
  for (let i = 0; i < water.length; i += 1) water[i] = (data[i * 4] ?? 0) > 127 ? 1 : 0;
  const distances = chamferDistance(water, pixels, (half * 2) / pixels);
  const bytes = new Uint8Array(pixels * pixels);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.min(255, Math.round(((distances[i] ?? 0) / SHORE_MAX_M) * 255));
  }
  const texture = new THREE.DataTexture(bytes, pixels, pixels, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, ms: Math.round(performance.now() - started) };
}

const VERTEX = /* glsl */ `
  varying vec3 vWorld;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCircle;
  uniform float uBand;
  uniform vec3 uFadeColor;
  uniform sampler2D uShore;
  uniform vec4 uShoreRect;   // minX, minZ, lado, distancia máxima (m)
  uniform vec3 uCamera;
  uniform vec3 uSunDir;
  uniform vec3 uSky;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  varying vec3 vWorld;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  #include <fog_pars_fragment>

  // Altura analítica del oleaje (suma de tres ondas) y su gradiente.
  vec2 waveGradient(vec2 p, float t) {
    vec2 g = vec2(0.0);
    vec2 k1 = vec2(0.071, 0.043);
    vec2 k2 = vec2(-0.052, 0.088);
    vec2 k3 = vec2(0.119, -0.031);
    g += k1 * cos(dot(k1, p) + t * 0.95) * 1.0;
    g += k2 * cos(dot(k2, p) + t * 1.20) * 0.8;
    g += k3 * cos(dot(k3, p) + t * 1.55) * 0.5;
    return g;
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = vWorld.xz;
    float shore = texture2D(uShore, (p - uShoreRect.xy) / uShoreRect.z).r * uShoreRect.w;

    // Color por profundidad aparente: claro y verdoso junto a la orilla.
    vec3 base = mix(uShallow, uMid, smoothstep(1.5, 24.0, shore));
    base = mix(base, uDeep, smoothstep(22.0, 90.0, shore));

    // Sombreado PLANO por facetas triangulares: el gradiente se evalúa en el
    // baricentro del triángulo de la rejilla en el que cae el fragmento.
    const float CELL = 7.0;
    vec2 q = p / CELL;
    vec2 cell = floor(q);
    vec2 f = q - cell;
    vec2 triCenter = (cell + (f.x + f.y > 1.0 ? vec2(2.0 / 3.0) : vec2(1.0 / 3.0))) * CELL;
    // La amplitud del oleaje se atenúa con la distancia: de lejos es agua lisa y
    // no hay moiré; de cerca se ven las facetas.
    float calm = 1.0 - smoothstep(500.0, 2600.0, distance(uCamera, vWorld));
    vec2 g = waveGradient(triCenter, uTime) * 2.4 * calm;
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));

    vec3 V = normalize(uCamera - vWorld);
    float diffuse = 0.64 + 0.36 * max(dot(n, uSunDir), 0.0);
    vec3 color = base * diffuse;

    // Fresnel barato hacia el color del cielo + destello solar.
    float fresnel = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0) * 0.45;
    color = mix(color, uSky, fresnel);
    vec3 R = reflect(-uSunDir, n);
    color += vec3(1.0, 0.96, 0.88) * pow(max(dot(R, V), 0.0), 140.0) * 0.16 * calm;

    // Espuma leve en la orilla: banda estrecha que respira con el oleaje.
    float breathe = 0.5 + 0.5 * sin(uTime * 1.3 + dot(p, vec2(0.21, 0.17)));
    float foam = smoothstep(2.6, 0.3, shore - breathe * 0.9) * 0.55;
    color = mix(color, uFoam, foam);

    // Difuminado radial hacia la niebla, igual que el resto de la escena.
    float edge = length(p - uCircle.xy) - uCircle.z;
    float keep = 1.0 - smoothstep(0.0, uBand, edge);
    color = mix(uFadeColor, color, keep);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function buildWater(options: WaterOptions): WaterMeshes {
  const { features, uniforms, levelsM } = options;
  const group = new THREE.Group();
  group.name = "agua";
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const half = options.clipRadiusM + 60;
  const field = buildShoreField(features, half, options.shoreFieldPx);
  const fallback = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
  fallback.needsUpdate = true;
  const texture = field?.texture ?? fallback;
  textures.push(texture, fallback);

  // OJO: `UniformsUtils.merge` CLONA cada valor, y la copia de una textura no se
  // sube a la GPU (su versión es 0): el campo de costa saldría vacío. Los
  // uniformes propios se asignan DESPUÉS del `merge`, sin clonar.
  const waterUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  Object.assign(waterUniforms, {
    uTime: uniforms.uTime,
    uCircle: uniforms.uCircle,
    uBand: uniforms.uBand,
    uFadeColor: uniforms.uFadeColor,
    uShore: { value: texture },
    uShoreRect: { value: new THREE.Vector4(-half, -half, half * 2, SHORE_MAX_M) },
    uCamera: { value: new THREE.Vector3() },
    uSunDir: { value: options.sunDirection.clone().normalize() },
    uSky: { value: new THREE.Color(SKY.light) },
    uDeep: { value: new THREE.Color(WATER.deep) },
    uMid: { value: new THREE.Color(WATER.mid) },
    uShallow: { value: new THREE.Color(WATER.shallow) },
    uFoam: { value: new THREE.Color(WATER.foam) },
  });
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    fog: true,
  });
  materials.push(waterMaterial);

  /* ----------------------------------------------------------- láminas */
  const sea = new MeshBuilder();
  const minor = new MeshBuilder();
  const byKind: Record<string, number> = {};
  let masses = 0;
  const levelOf = (kind: string) => levelsM[kind] ?? levelsM.water ?? -0.5;

  const walls: number[] = [];
  const wallColors: number[] = [];
  const topColor = new THREE.Color(SHORE.top);
  const bottomColor = new THREE.Color(SHORE.bottom);
  const sandColor = new THREE.Color(SHORE.sand);
  const sandBottom = new THREE.Color(SHORE.sand).multiplyScalar(0.7);
  const clipLimit = options.clipRadiusM - 4;

  const inBeach = (x: number, z: number): boolean =>
    options.beachRings.some((ring) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const a = ring[i];
        const b = ring[j];
        if (!a || !b) continue;
        if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
      return inside;
    });

  let wallSegments = 0;
  const addWalls = (ring: Ring, flags: number[] | undefined, level: number) => {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (!a || !b) continue;
      // Un corte de teselado no es una orilla: no lleva pared.
      if (isTileCut(flags, i)) continue;
      if (Math.hypot(a[0], a[1]) > clipLimit && Math.hypot(b[0], b[1]) > clipLimit) continue;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.05) continue;
      const nx = -(b[1] - a[1]) / length;
      const nz = (b[0] - a[0]) / length;
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const sandy = inBeach(mx + nx * 1.4, mz + nz * 1.4) || inBeach(mx - nx * 1.4, mz - nz * 1.4);
      const top = sandy ? sandColor : topColor;
      const bottom = sandy ? sandBottom : bottomColor;
      const low = level - 0.35;
      // Dos triángulos: arriba (a, b) y abajo (a, b), con el color degradado.
      const quad: Array<[number, number, number, THREE.Color]> = [
        [a[0], WALL_TOP, a[1], top],
        [a[0], low, a[1], bottom],
        [b[0], low, b[1], bottom],
        [a[0], WALL_TOP, a[1], top],
        [b[0], low, b[1], bottom],
        [b[0], WALL_TOP, b[1], top],
      ];
      for (const [x, y, z, color] of quad) {
        walls.push(x, y, z);
        wallColors.push(color.r, color.g, color.b);
      }
      wallSegments += 1;
    }
  };

  for (const feature of features) {
    if (feature.layer !== "water") continue;
    const kind = feature.kind || "water";
    const level = levelOf(kind);
    const builder = kind === "sea" ? sea : minor;
    for (const polygon of feature.polygons) {
      builder.addPolygon(polygon, level, 0xffffff);
      addWalls(polygon.outer, polygon.outerBorder, level);
      polygon.holes.forEach((hole, index) => addWalls(hole, polygon.holesBorder?.[index], level));
    }
    masses += 1;
    byKind[kind] = (byKind[kind] ?? 0) + 1;
  }

  let triangles = 0;
  const addWater = (builder: MeshBuilder, name: string) => {
    if (builder.isEmpty) return;
    const geometry = builder.build({ withColor: false, withNormals: false });
    const mesh = new THREE.Mesh(geometry, waterMaterial);
    mesh.name = name;
    mesh.renderOrder = 0;
    group.add(mesh);
    geometries.push(geometry);
    triangles += builder.triangleCount;
  };
  addWater(sea, "mar");
  addWater(minor, "aguas-menores");

  if (walls.length > 0) {
    const wallGeometry = new THREE.BufferGeometry();
    wallGeometry.setAttribute("position", new THREE.Float32BufferAttribute(walls, 3));
    wallGeometry.setAttribute("color", new THREE.Float32BufferAttribute(wallColors, 3));
    wallGeometry.computeVertexNormals();
    wallGeometry.computeBoundingSphere();
    const wallMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    patchMaterial(wallMaterial, uniforms, { key: "shore-wall" });
    const mesh = new THREE.Mesh(wallGeometry, wallMaterial);
    mesh.name = "paredes-de-muelle";
    mesh.receiveShadow = true;
    mesh.renderOrder = 16;
    group.add(mesh);
    geometries.push(wallGeometry);
    materials.push(wallMaterial);
    triangles += walls.length / 9;
  }

  const camera = waterMaterial.uniforms.uCamera?.value as THREE.Vector3;
  return {
    group,
    materials,
    geometries,
    textures,
    update: (position) => camera.copy(position),
    stats: {
      masses,
      byKind,
      triangles: Math.round(triangles),
      wallSegments,
      shoreFieldPx: field ? options.shoreFieldPx : 0,
      shoreFieldMs: field?.ms ?? 0,
    },
  };
}

export { hexToNumber };
