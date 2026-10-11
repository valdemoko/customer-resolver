import * as THREE from "three";
import type { Face } from "./faces";
import { faceStrip, frameUV, roofUVs } from "./faces";
import type { Framing } from "./types";

/**
 * Escenario 3D del estudio de compra: el edificio (o el cartel) de la unidad que
 * se va a comprar, con la foto de fachada repetida en TODAS sus caras y, si se
 * elige, la foto del techo. Es un renderizador propio y pequeño, independiente
 * del visor de la ciudad: se monta al abrir el estudio y se libera al cerrarlo.
 */

export type StageModel = {
  faces: Face[];
  bottomM: number;
  topM: number;
  footprint?: Array<[number, number]> | undefined;
  /** Si no hay huella (cartel): se dibuja una sola cara plana. */
  flat?: boolean;
};

const BODY = 0x3a4a68;
const ROOF = 0x4a5c80;

/** Trama de «aquí va tu foto» para una superficie vacía. */
function placeholder(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#2a3a58";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "rgba(242,237,227,.16)";
  ctx.lineWidth = 3;
  for (let i = -128; i < 256; i += 18) {
    ctx.beginPath();
    ctx.moveTo(i, 128);
    ctx.lineTo(i + 128, 0);
    ctx.stroke();
  }
  return canvas;
}

export class FaceStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 5000);
  private readonly faceMeshes: Array<{ mesh: THREE.Mesh; width: number; height: number }> = [];
  /** Coordenada u de la foto de cada punto de la banda de una cara. */
  private readonly faceU = new Map<THREE.BufferGeometry, Array<[number, number]>>();
  private roofMesh: { mesh: THREE.Mesh; points: Array<[number, number]> } | null = null;
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly placeholderTexture: THREE.CanvasTexture;
  private facadeTexture: THREE.Texture | null = null;
  private roofTexture: THREE.Texture | null = null;
  private framing: Framing = { x: 0.5, y: 0.5, zoom: 1 };
  private azimuth = 0.7;
  private elevation = 0.5;
  private radius = 60;
  /** Distancia inicial: el zoom con la rueda queda entre 0,45× y 1,8× de ella. */
  private baseRadius = 60;
  private readonly target = new THREE.Vector3();
  private raf = 0;
  private dragging: { x: number; y: number } | null = null;
  private autoRotate: boolean;
  private readonly observer: ResizeObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly model: StageModel,
    options: { reduceMotion: boolean },
  ) {
    this.autoRotate = !options.reduceMotion && !model.flat;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.placeholderTexture = new THREE.CanvasTexture(placeholder());
    this.placeholderTexture.colorSpace = THREE.SRGBColorSpace;
    this.placeholderTexture.wrapS = THREE.RepeatWrapping;
    this.placeholderTexture.wrapT = THREE.RepeatWrapping;
    this.track(this.placeholderTexture);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a96b0, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.2);
    sun.position.set(-30, 60, 40);
    this.scene.add(sun);
    this.build();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.resize();
    this.loop();
  }

  private track<T extends { dispose: () => void }>(value: T): T {
    this.disposables.push(value);
    return value;
  }

  private build(): void {
    const { faces, bottomM, topM, footprint, flat } = this.model;
    const height = topM - bottomM;
    const points = footprint ?? faces.flatMap((face) => [face.a, face.b]);
    const xs = points.map((p) => p[0]);
    const zs = points.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), flat ? Math.max(height, 4) : height);
    this.radius = Math.max(8, span * 1.9);
    this.baseRadius = this.radius;
    this.target.set(0, flat ? height / 2 : height * 0.45, 0);

    // Suelo: una rejilla fina, como un plano de obra.
    const grid = this.track(new THREE.GridHelper(span * 3, 30, 0x4a5c80, 0x2c3b58));
    this.scene.add(grid);

    if (footprint && !flat) {
      const local = footprint.map(([x, z]) => [x - cx, z - cz] as [number, number]);
      const shape = new THREE.Shape(local.map(([x, z]) => new THREE.Vector2(x, z)));
      const geometry = this.track(new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }));
      geometry.rotateX(Math.PI / 2);
      // `rotateX` deja el prisma entre y = −altura y 0: se sube hasta apoyarlo en el suelo.
      geometry.translate(0, height + bottomM, 0);
      this.scene.add(new THREE.Mesh(geometry, this.track(new THREE.MeshLambertMaterial({ color: BODY, side: THREE.DoubleSide }))));
      this.roofMesh = { mesh: this.makeRoof(local, topM + 0.12), points: local };
      this.scene.add(this.roofMesh.mesh);
    }

    for (const face of faces) {
      const mesh = this.makeFaceMesh(face, cx, cz, bottomM, topM, flat === true);
      this.faceMeshes.push({ mesh, width: face.widthM, height });
      this.scene.add(mesh);
    }
    this.refresh();
  }

  private makeFaceMesh(face: Face, cx: number, cz: number, bottom: number, top: number, flat: boolean): THREE.Mesh {
    // Misma banda que en el mapa: una sola foto a lo largo de toda la fachada y sin espejo.
    const local: Face = flat
      ? { ...face, a: [-face.widthM / 2, 0], b: [face.widthM / 2, 0] }
      : { ...face, a: [face.a[0] - cx, face.a[1] - cz], b: [face.b[0] - cx, face.b[1] - cz] };
    if (!flat && face.path) local.path = face.path.map(([x, z]) => [x - cx, z - cz] as [number, number]);
    else delete local.path;
    const segments = faceStrip(local, 0.08);
    const positions = new Float32Array(Math.max(1, segments.length) * 12);
    const indices: number[] = [];
    segments.forEach((segment, i) => {
      positions.set(
        [segment.a[0], bottom, segment.a[1], segment.b[0], bottom, segment.b[1], segment.b[0], top, segment.b[1], segment.a[0], top, segment.a[1]],
        i * 12,
      );
      indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const geometry = this.track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(Math.max(1, segments.length) * 8), 2));
    geometry.setIndex(indices);
    this.faceU.set(geometry, segments.map((segment) => [segment.ua, segment.ub] as [number, number]));
    const material = this.track(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }));
    return new THREE.Mesh(geometry, material);
  }

  private makeRoof(points: Array<[number, number]>, y: number): THREE.Mesh {
    const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
    const indices = THREE.ShapeUtils.triangulateShape(contour, []);
    const positions = new Float32Array(points.length * 3);
    points.forEach(([x, z], i) => positions.set([x, y, z], i * 3));
    const geometry = this.track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(points.length * 2), 2));
    geometry.setIndex(indices.flat());
    const material = this.track(new THREE.MeshBasicMaterial({ color: ROOF, side: THREE.DoubleSide, toneMapped: false }));
    return new THREE.Mesh(geometry, material);
  }

  private load(dataUrl: string | null, apply: (texture: THREE.Texture | null) => void): void {
    if (!dataUrl) {
      apply(null);
      return;
    }
    const texture = new THREE.TextureLoader().load(dataUrl, () => apply(texture));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.track(texture);
  }

  /** Foto de fachada (se repite en todas las caras) y foto del techo, o `null` para vaciarlas. */
  setImages(facade: string | null, roof: string | null): void {
    this.load(facade, (texture) => {
      this.facadeTexture = texture;
      this.refresh();
    });
    this.load(roof, (texture) => {
      this.roofTexture = texture;
      this.refresh();
    });
  }

  /** Encuadre de la foto (se aplica a fachada y techo al instante). */
  setFraming(framing: Framing): void {
    this.framing = framing;
    this.refresh();
  }

  private refresh(): void {
    const facade = this.facadeTexture;
    const image = facade?.image as { width: number; height: number } | undefined;
    for (const { mesh, width, height } of this.faceMeshes) {
      const material = mesh.material as THREE.MeshBasicMaterial;
      const uv = mesh.geometry.getAttribute("uv") as THREE.BufferAttribute;
      const us = this.faceU.get(mesh.geometry) ?? [];
      if (facade && image) {
        const [u0, v0, u1, v1] = frameUV(width / height, image.width / image.height, this.framing);
        us.forEach(([ua, ub], i) => uv.array.set([u0 + ua * (u1 - u0), v0, u0 + ub * (u1 - u0), v0, u0 + ub * (u1 - u0), v1, u0 + ua * (u1 - u0), v1], i * 8));
        material.map = facade;
      } else {
        const repeat = Math.max(1, Math.round(width / 8));
        us.forEach(([ua, ub], i) => uv.array.set([ua * repeat, 0, ub * repeat, 0, ub * repeat, 1, ua * repeat, 1], i * 8));
        material.map = this.placeholderTexture;
      }
      uv.needsUpdate = true;
      material.needsUpdate = true;
    }
    if (this.roofMesh) {
      const material = this.roofMesh.mesh.material as THREE.MeshBasicMaterial;
      const roofImage = this.roofTexture?.image as { width: number; height: number } | undefined;
      if (this.roofTexture && roofImage) {
        const uvs = roofUVs(this.roofMesh.points, roofImage.width / roofImage.height, this.framing);
        const attribute = this.roofMesh.mesh.geometry.getAttribute("uv") as THREE.BufferAttribute;
        uvs.forEach(([u, v], i) => attribute.setXY(i, u, v));
        attribute.needsUpdate = true;
        material.map = this.roofTexture;
        material.color.set(0xffffff);
      } else {
        material.map = null;
        material.color.set(ROOF);
      }
      material.needsUpdate = true;
    }
  }

  /** Sube la cámara para ver el techo, o la baja para ver la fachada. */
  lookAt(part: "facade" | "roof"): void {
    this.elevation = part === "roof" ? 1.18 : 0.42;
  }

  private resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (this.autoRotate && !this.dragging) this.azimuth += 0.004;
    const az = this.model.flat ? 0 : this.azimuth;
    this.camera.position.set(
      this.target.x + Math.sin(az) * Math.cos(this.elevation) * this.radius,
      this.target.y + Math.sin(this.elevation) * this.radius,
      this.target.z + Math.cos(az) * Math.cos(this.elevation) * this.radius,
    );
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  };

  private onDown = (event: PointerEvent) => {
    this.canvas.setPointerCapture(event.pointerId);
    this.dragging = { x: event.clientX, y: event.clientY };
    this.autoRotate = false;
  };

  private onMove = (event: PointerEvent) => {
    if (!this.dragging) return;
    const dx = event.clientX - this.dragging.x;
    const dy = event.clientY - this.dragging.y;
    this.dragging.x = event.clientX;
    this.dragging.y = event.clientY;
    if (!this.model.flat) this.azimuth -= dx * 0.01;
    this.elevation = Math.min(1.35, Math.max(0.08, this.elevation + dy * 0.008));
  };

  private onUp = () => {
    this.dragging = null;
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    // Límites ABSOLUTOS respecto a la distancia inicial: sin ellos, rodando mucho el edificio se aleja hasta desaparecer.
    const next = this.radius * (1 + event.deltaY * 0.0012);
    this.radius = Math.min(this.baseRadius * 1.8, Math.max(this.baseRadius * 0.45, next));
    this.canvas.dataset.zoom = (this.radius / this.baseRadius).toFixed(2); // para las comprobaciones
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    for (const item of this.disposables) item.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
