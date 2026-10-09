/**
 * Anuncios en la escena (Fase C): las fotos de los compradores sobre las caras
 * de sus edificios, locales y tramos de muralla, y la marca visual de «vendido».
 *
 * CÓMO SE MANTIENE BARATO:
 *  · Solo las unidades con IMÁGENES tienen mallas de foto; el resto de las
 *    compradas solo se tiñen (textura de 1 × 8192 con un bit por edificio).
 *  · Las texturas se piden solo para unidades a menos de 750 m del foco y se
 *    liberan al pasar de 1.150 m: el número de texturas vivas está acotado
 *    (`MAX_LIVE_UNITS`) aunque se hayan vendido miles de edificios.
 *  · La URL de cada imagen lleva la versión del mercado: el navegador la cachea
 *    para siempre y solo se vuelve a pedir si la unidad cambia de dueño.
 */

import * as THREE from "three";
import type { Face } from "@/lib/market/faces";
import { frameUV, imageKeyFor, roofUVs } from "@/lib/market/faces";
import type { UnitView } from "@/lib/market/types";

export const OWNED_TEXTURE_SIZE = 8192;
const LOAD_RADIUS_M = 750;
const DROP_RADIUS_M = 1150;
const MAX_LIVE_UNITS = 90;
const OFFSET_M = 0.12;

/** Geometría de una unidad con caras: lo que hace falta para pintar y para el estudio. */
export type FaceModel = {
  unitId: string;
  faces: Face[];
  bottomM: number;
  topM: number;
  centre: [number, number];
  /** Solo edificios y tramos: huella para dibujar el prisma en el estudio. */
  footprint?: Array<[number, number]>;
  heightM?: number;
};

type Live = {
  group: THREE.Group;
  version: string;
  meshes: THREE.Mesh[];
};

/**
 * Llama a `fit(anchoImagen / altoImagen)` en cuanto la textura tiene imagen (ya, si
 * la tiene; si no, al subirla a la GPU). Varias superficies pueden compartir una
 * textura: cada una añade su ajuste y todas se ejecutan.
 */
export function whenImageReady(texture: THREE.Texture, fit: (aspect: number) => void): void {
  const run = () => {
    const image = texture.image as { width?: number; height?: number } | undefined;
    if (image?.width && image.height) fit(image.width / image.height);
  };
  const fits = ((texture.userData as { fits?: Array<() => void> }).fits ??= []);
  fits.push(run);
  texture.onUpdate = () => {
    for (const callback of fits) callback();
  };
  run();
}

export function imageUrl(unitId: string, key: string, version: string): string {
  return `/api/market/image?unit=${encodeURIComponent(unitId)}&face=${key}&v=${encodeURIComponent(version)}`;
}

export class AdLayer {
  readonly group = new THREE.Group();
  /** Textura de propiedad de edificios y tramos: R = 255 si el índice `bid` está comprado. */
  readonly ownedTexture: THREE.DataTexture;
  readonly ownedData = new Uint8Array(OWNED_TEXTURE_SIZE);
  /** Lo mismo para los locales (índice de parcela). */
  readonly parcelOwnedTexture: THREE.DataTexture;
  readonly parcelOwnedData = new Uint8Array(OWNED_TEXTURE_SIZE);
  private readonly loader = new THREE.TextureLoader();
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly live = new Map<string, Live>();
  private units = new Map<string, UnitView>();
  private versions = new Map<string, string>();
  private version = "0";
  private lastUpdate = 0;

  constructor(
    private readonly modelFor: (unitId: string) => FaceModel | null,
    private readonly indexFor: (unitId: string) => { table: 0 | 1; index: number } | null,
  ) {
    this.group.name = "anuncios";
    const make = (data: Uint8Array) => {
      const texture = new THREE.DataTexture(data, OWNED_TEXTURE_SIZE, 1, THREE.RedFormat, THREE.UnsignedByteType);
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      return texture;
    };
    this.ownedTexture = make(this.ownedData);
    this.parcelOwnedTexture = make(this.parcelOwnedData);
  }

  /** Nuevo estado del mercado: actualiza el teñido y descarta lo que cambió de dueño. */
  setUnits(views: UnitView[], version: string): void {
    this.version = version;
    this.units = new Map(views.map((view) => [view.id, view]));
    this.ownedData.fill(0);
    this.parcelOwnedData.fill(0);
    for (const view of views) {
      if (!view.owned) continue;
      const slot = this.indexFor(view.id);
      if (!slot || slot.index < 0 || slot.index >= OWNED_TEXTURE_SIZE) continue;
      // 255 = comprado sin fotos; 160 = comprado con fotos (el local solo se enmarca).
      (slot.table === 0 ? this.ownedData : this.parcelOwnedData)[slot.index] = view.owner && view.owner.faces.length > 0 ? 160 : 255;
    }
    this.ownedTexture.needsUpdate = true;
    this.parcelOwnedTexture.needsUpdate = true;
    // Una unidad cuyo contenido cambió pierde sus mallas y texturas.
    for (const [id, live] of this.live) {
      const view = this.units.get(id);
      const stamp = view ? `${view.purchases}` : "";
      if (live.version !== stamp) this.drop(id);
    }
    this.lastUpdate = 0;
  }

  /** Textura de una imagen de una unidad (compartida y con caché por versión). */
  texture(unitId: string, key: string): THREE.Texture | null {
    const view = this.units.get(unitId);
    if (!view?.owned) return null;
    const url = imageUrl(unitId, key, `${view.purchases}`);
    let texture = this.textures.get(url);
    if (!texture) {
      texture = this.loader.load(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      this.textures.set(url, texture);
    }
    return texture;
  }

  private drop(unitId: string): void {
    const live = this.live.get(unitId);
    if (!live) return;
    for (const mesh of live.meshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.group.remove(live.group);
    this.live.delete(unitId);
  }

  private build(unitId: string, view: UnitView): void {
    const model = this.modelFor(unitId);
    if (!model || !view.owner) return;
    const meshes: THREE.Mesh[] = [];
    const group = new THREE.Group();
    group.name = `anuncio-${unitId}`;
    const height = model.topM - model.bottomM;
    for (const face of model.faces) {
      const key = imageKeyFor(face.id, view.owner.faces, view.owner.sameForAll);
      if (!key) continue;
      const texture = this.texture(unitId, key);
      if (!texture) continue;
      const ox = face.normal[0] * OFFSET_M;
      const oz = face.normal[1] * OFFSET_M;
      const positions = new Float32Array([
        face.a[0] + ox, model.bottomM, face.a[1] + oz,
        face.b[0] + ox, model.bottomM, face.b[1] + oz,
        face.b[0] + ox, model.topM, face.b[1] + oz,
        face.a[0] + ox, model.topM, face.a[1] + oz,
      ]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const uv = new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2);
      geometry.setAttribute("uv", uv);
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeBoundingSphere();
      // La foto cubre la cara sin deformarse: se recorta lo que sobra.
      const surface = face.widthM / Math.max(0.1, height);
      whenImageReady(texture, (aspect) => {
        const [u0, v0, u1, v1] = frameUV(surface, aspect, view.owner?.framing);
        uv.array.set([u0, v0, u1, v0, u1, v1, u0, v1]);
        uv.needsUpdate = true;
      });
      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 18;
      mesh.name = `${unitId}:${face.id}`;
      group.add(mesh);
      meshes.push(mesh);
    }

    // Techo: la foto sobre la huella (edificios y tramos de muralla).
    const roofKey = view.owner.faces.includes("roof") ? "roof" : view.owner.faces.includes("all") ? "all" : null;
    if (model.footprint && roofKey) {
      const texture = this.texture(unitId, roofKey);
      if (texture) {
        const points = model.footprint;
        const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
        const indices = THREE.ShapeUtils.triangulateShape(contour, []);
        const y = (model.heightM ?? model.topM + 0.4) + 0.14;
        const positions = new Float32Array(points.length * 3);
        points.forEach(([x, z], i) => positions.set([x, y, z], i * 3));
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const uv = new THREE.BufferAttribute(new Float32Array(points.length * 2), 2);
        geometry.setAttribute("uv", uv);
        geometry.setIndex(indices.flat());
        geometry.computeBoundingSphere();
        whenImageReady(texture, (aspect) => {
          roofUVs(points, aspect, view.owner?.framing).forEach(([u, v], i) => uv.setXY(i, u, v));
          uv.needsUpdate = true;
        });
        const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 19;
        mesh.name = `${unitId}:roof`;
        group.add(mesh);
        meshes.push(mesh);
      }
    }
    if (meshes.length === 0) return;
    this.group.add(group);
    this.live.set(unitId, { group, version: `${view.purchases}`, meshes });
  }

  /** Se llama varias veces por segundo con el foco de la cámara. */
  update(focus: THREE.Vector3, now: number): void {
    if (now - this.lastUpdate < 450) return;
    this.lastUpdate = now;
    // Aparecen las unidades con fotos cercanas; desaparecen las lejanas.
    const candidates: Array<{ id: string; view: UnitView; distance: number }> = [];
    for (const [id, view] of this.units) {
      if (!view.owned || !view.owner || view.owner.faces.length === 0) continue;
      // Paneles de crucero, velas y carteles son móviles: los pinta `traffic`.
      if (id[0] !== "b" && id[0] !== "p" && id[0] !== "w") continue;
      const model = this.modelFor(id);
      if (!model) continue;
      const distance = Math.hypot(model.centre[0] - focus.x, model.centre[1] - focus.z);
      candidates.push({ id, view, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const wanted = new Set<string>();
    for (const candidate of candidates.slice(0, MAX_LIVE_UNITS)) {
      if (candidate.distance <= LOAD_RADIUS_M) wanted.add(candidate.id);
    }
    for (const candidate of candidates) {
      if (candidate.distance > DROP_RADIUS_M && this.live.has(candidate.id)) this.drop(candidate.id);
    }
    for (const id of wanted) {
      const view = this.units.get(id);
      if (view && !this.live.has(id)) this.build(id, view);
    }
    // Texturas sin ninguna malla viva: se liberan para acotar la memoria.
    if (this.textures.size > MAX_LIVE_UNITS * 4) {
      const inUse = new Set<THREE.Texture>();
      for (const live of this.live.values()) for (const mesh of live.meshes) inUse.add((mesh.material as THREE.MeshBasicMaterial).map as THREE.Texture);
      for (const [url, texture] of this.textures) {
        if (!inUse.has(texture)) {
          texture.dispose();
          this.textures.delete(url);
        }
      }
    }
  }

  stats() {
    return { live: this.live.size, textures: this.textures.size, owned: [...this.units.values()].filter((u) => u.owned).length, version: this.version };
  }

  dispose(): void {
    for (const id of [...this.live.keys()]) this.drop(id);
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.ownedTexture.dispose();
    this.parcelOwnedTexture.dispose();
  }
}
