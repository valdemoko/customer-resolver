import { describe, expect, it } from "vitest";
import type { Ring } from "@/lib/scene/polygon";
import { buildingFaces, faceFlipsU, faceStrip, panelFace, roofUVs, wallFaces } from "./faces";

const rect = (w: number, d: number): Ring => [
  [0, 0],
  [w, 0],
  [w, d],
  [0, d],
];

/** Arco de `n` paredes de `step` grados cada una, de radio `r`, cerrado con una pared recta por detrás. */
function curvedFront(n: number, step: number, r: number): Ring {
  const points: Ring = [];
  for (let i = 0; i <= n; i += 1) {
    const angle = (-n * step) / 2 + i * step;
    points.push([r * Math.sin((angle * Math.PI) / 180), -r * Math.cos((angle * Math.PI) / 180)]);
  }
  return [...points, [points[n]![0], 40], [points[0]![0], 40]];
}

describe("fachadas de un edificio", () => {
  it("un rectángulo tiene cuatro caras rectas", () => {
    const faces = buildingFaces(rect(20, 10));
    expect(faces).toHaveLength(4);
    expect(faces.map((f) => Math.round(f.widthM)).sort()).toEqual([10, 10, 20, 20]);
    expect(faces.every((f) => f.path === undefined)).toBe(true);
    expect(faces.map((f) => f.id)).toEqual(["f0", "f1", "f2", "f3"]);
  });

  it("una fachada curva es UNA cara con recorrido, no un trozo por pared", () => {
    const faces = buildingFaces(curvedFront(6, 12, 30));
    const curved = faces.find((f) => f.path);
    expect(curved).toBeDefined();
    expect(curved!.path!.length).toBe(7); // 6 paredes seguidas
    expect(faces.length).toBeLessThanOrEqual(4);
    // Su ancho es el del lado entero medido a lo largo de él, no el de una pared.
    const chord = Math.hypot(curved!.b[0] - curved!.a[0], curved!.b[1] - curved!.a[1]);
    expect(curved!.widthM).toBeCloseTo(chord, 3);
    expect(curved!.widthM).toBeGreaterThan(20);
  });

  it("una esquina de 90° separa dos fachadas, y una torre redonda se reparte en varias", () => {
    const circle: Ring = Array.from({ length: 24 }, (_, i) => [10 * Math.cos((i / 24) * Math.PI * 2), 10 * Math.sin((i / 24) * Math.PI * 2)]);
    const round = buildingFaces(circle);
    expect(round.length).toBeGreaterThanOrEqual(4);
    expect(round.length).toBeLessThanOrEqual(8);
    expect(round.every((f) => f.widthM > 2.5)).toBe(true);
  });

  it("descarta las fachadas de menos de 2,5 m", () => {
    const withChamfer: Ring = [
      [0, 0],
      [20, 0],
      [21, 1],
      [21, 10],
      [0, 10],
    ];
    const faces = buildingFaces(withChamfer);
    expect(faces.every((f) => f.widthM >= 2.5)).toBe(true);
  });
});

describe("lados con escalones", () => {
  // Fachada de 30 m con tres escalones de 2 m: es UN lado, no seis paredes.
  const stepped: Ring = [
    [0, 0],
    [8, 0],
    [8, -2],
    [18, -2],
    [18, 0],
    [30, 0],
    [30, 25],
    [0, 25],
  ];

  it("un escalón corto no parte la fachada: una sola cara con la foto continua", () => {
    const faces = buildingFaces(stepped);
    const front = faces.find((f) => f.path)!;
    expect(front).toBeDefined();
    expect(faces).toHaveLength(4);
    // Su ancho es lo que avanza a lo largo del lado (30 m), sin contar los escalones.
    expect(front.widthM).toBeCloseTo(30, 0);
  });

  it("las paredes de los escalones no llevan foto y las demás reparten la u sin huecos ni espejo", () => {
    const front = buildingFaces(stepped).find((f) => f.path)!;
    const segments = faceStrip(front, 0);
    expect(segments).toHaveLength(3); // los dos escalones se omiten
    const sorted = [...segments].sort((a, b) => Math.min(a.ua, a.ub) - Math.min(b.ua, b.ub));
    expect(Math.min(sorted[0]!.ua, sorted[0]!.ub)).toBeCloseTo(0, 5);
    expect(Math.max(sorted[2]!.ua, sorted[2]!.ub)).toBeCloseTo(1, 5);
    // Cada trozo empieza donde acaba el anterior (la foto es continua).
    expect(Math.max(sorted[0]!.ua, sorted[0]!.ub)).toBeCloseTo(Math.min(sorted[1]!.ua, sorted[1]!.ub), 5);
    expect(Math.max(sorted[1]!.ua, sorted[1]!.ub)).toBeCloseTo(Math.min(sorted[2]!.ua, sorted[2]!.ub), 5);
  });

  it("una esquina de verdad (un chaflán a 45° entre dos lados largos) sigue separando lados", () => {
    const chamfer: Ring = [
      [0, 0],
      [20, 0],
      [26, 6],
      [26, 20],
      [0, 20],
    ];
    expect(buildingFaces(chamfer).length).toBeGreaterThanOrEqual(4);
  });
});

describe("la foto no sale en espejo", () => {
  /** Visto desde fuera, la derecha de quien mira es (normal.z, −normal.x): u debe crecer hacia ella. */
  const growsToTheRight = (face: ReturnType<typeof buildingFaces>[number]) => {
    const segments = faceStrip(face, 0);
    const right: [number, number] = [face.normal[1], -face.normal[0]];
    return segments.every((segment) => {
      const dx = (segment.b[0] - segment.a[0]) * right[0] + (segment.b[1] - segment.a[1]) * right[1];
      const du = segment.ub - segment.ua;
      return du * dx > 0;
    });
  };

  it("en todas las caras de un edificio, curvas o rectas", () => {
    for (const ring of [rect(20, 10), curvedFront(6, 12, 30)]) {
      for (const face of buildingFaces(ring)) expect(growsToTheRight(face)).toBe(true);
    }
  });

  it("también en muralla y en carteles planos", () => {
    for (const face of [...wallFaces([[[0, 0], [30, 5]]]), ...panelFace(8)]) expect(growsToTheRight(face)).toBe(true);
  });

  it("la cara delantera de un rectángulo antihorario se invierte y la foto empieza en su derecha", () => {
    const front = buildingFaces(rect(20, 10)).find((f) => f.a[1] === 0 && f.b[1] === 0)!;
    expect(faceFlipsU(front)).toBe(true);
    const [segment] = faceStrip(front, 0);
    expect(segment!.ua).toBe(1);
    expect(segment!.ub).toBe(0);
  });

  it("el desplazamiento aleja la banda de la pared por fuera", () => {
    const front = buildingFaces(rect(20, 10)).find((f) => f.a[1] === 0 && f.b[1] === 0)!;
    const [segment] = faceStrip(front, 0.5);
    expect(segment!.a[1]).toBeLessThan(0); // el exterior de la pared z = 0 está en z < 0
    expect(segment!.b[1]).toBeLessThan(0);
  });
});

describe("el techo no sale en espejo", () => {
  it("la foto se lee bien vista desde arriba con el norte arriba: u crece hacia el este y v hacia el norte (−z)", () => {
    // Rectángulo largo en x (lado más largo alineado con x): sin giro.
    const points: Array<[number, number]> = [
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ];
    const uvs = roofUVs(points, 2); // foto 2:1 sobre un techo 2:1: sin recorte
    const at = (x: number, z: number) => uvs[points.findIndex(([px, pz]) => px === x && pz === z)]!;
    expect(at(20, 0)[0]).toBeGreaterThan(at(0, 0)[0]); // al este, u mayor
    expect(at(0, 0)[1]).toBeGreaterThan(at(0, 10)[1]); // al norte (z menor), v mayor: la parte de arriba de la foto
  });
});
