/**
 * Mapa del mar para los barcos que se mueven (Fase C): una rejilla gruesa con la
 * distancia a tierra de cada celda, y una búsqueda A* para sacar un crucero de su
 * atraque hasta mar abierto.
 *
 * Se calcula UNA vez con la función `inSea` de los datos (unos pocos miles de
 * consultas) y a partir de ahí todo son lecturas de un array: colocar trayectorias
 * no recorre los polígonos del mar otra vez.
 */

export type SeaMap = {
  cell: number;
  minX: number;
  minZ: number;
  nx: number;
  nz: number;
  /** 1 = mar. El anillo exterior de la rejilla cuenta como tierra. */
  sea: Uint8Array;
  /** Distancia en metros hasta la tierra más cercana (0 en tierra). */
  clear: Float32Array;
  /** Distancia a tierra en (x, z); 0 fuera de la rejilla. */
  clearanceAt: (x: number, z: number) => number;
  cellOf: (x: number, z: number) => number;
  centreOf: (index: number) => [number, number];
};

export function buildSeaMap(inSea: (x: number, z: number) => boolean, radiusM: number, cell = 50): SeaMap {
  const half = radiusM + 100;
  const inner = Math.ceil((half * 2) / cell);
  const nx = inner + 2;
  const nz = inner + 2;
  const minX = -half - cell;
  const minZ = -half - cell;
  const sea = new Uint8Array(nx * nz);
  for (let iz = 1; iz < nz - 1; iz += 1) {
    for (let ix = 1; ix < nx - 1; ix += 1) {
      const x = minX + (ix + 0.5) * cell;
      const z = minZ + (iz + 0.5) * cell;
      if (inSea(x, z)) sea[iz * nx + ix] = 1;
    }
  }

  // Transformada de distancia (chamfer 1 / √2) en dos pasadas.
  const D = Math.SQRT2;
  const dist = new Float32Array(nx * nz);
  for (let i = 0; i < dist.length; i += 1) dist[i] = sea[i] ? 1e6 : 0;
  for (let iz = 1; iz < nz; iz += 1) {
    for (let ix = 1; ix < nx - 1; ix += 1) {
      const i = iz * nx + ix;
      if (!sea[i]) continue;
      dist[i] = Math.min(dist[i]!, dist[i - 1]! + 1, dist[i - nx]! + 1, dist[i - nx - 1]! + D, dist[i - nx + 1]! + D);
    }
  }
  for (let iz = nz - 2; iz >= 0; iz -= 1) {
    for (let ix = nx - 2; ix >= 1; ix -= 1) {
      const i = iz * nx + ix;
      if (!sea[i]) continue;
      dist[i] = Math.min(dist[i]!, dist[i + 1]! + 1, dist[i + nx]! + 1, dist[i + nx - 1]! + D, dist[i + nx + 1]! + D);
    }
  }
  const clear = new Float32Array(nx * nz);
  for (let i = 0; i < clear.length; i += 1) clear[i] = sea[i] ? Math.max(0, dist[i]! * cell - cell * 0.5) : 0;

  const cellOf = (x: number, z: number) => {
    const ix = Math.floor((x - minX) / cell);
    const iz = Math.floor((z - minZ) / cell);
    if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return -1;
    return iz * nx + ix;
  };
  return {
    cell,
    minX,
    minZ,
    nx,
    nz,
    sea,
    clear,
    cellOf,
    centreOf: (index) => [minX + ((index % nx) + 0.5) * cell, minZ + (Math.floor(index / nx) + 0.5) * cell],
    clearanceAt: (x, z) => {
      const index = cellOf(x, z);
      return index < 0 ? 0 : clear[index]!;
    },
  };
}

/**
 * A* de 8 vecinos sobre las celdas con al menos `minClear` metros de agua libre.
 * Con `softAbove`, las celdas con menos agua libre que ese valor cuestan más: el
 * camino se aleja de la orilla cuando puede, pero sigue pudiendo salir de una dársena.
 */
export function findSeaPath(map: SeaMap, from: [number, number], to: [number, number], minClear: number, softAbove = 0): Array<[number, number]> | null {
  const start = map.cellOf(from[0], from[1]);
  const goal = map.cellOf(to[0], to[1]);
  if (start < 0 || goal < 0) return null;
  const ok = (i: number) => (map.clear[i] ?? 0) >= minClear || i === start || i === goal;
  if (!ok(goal)) return null;
  const { nx } = map;
  const gScore = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  // Montículo binario mínimo de [f, índice].
  const heap: Array<[number, number]> = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent]![0] <= heap[i]![0]) break;
      [heap[parent], heap[i]] = [heap[i]!, heap[parent]!];
      i = parent;
    }
  };
  const pop = (): [number, number] | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0 && last) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  const h = (i: number) => {
    const dx = (i % nx) - (goal % nx);
    const dz = Math.floor(i / nx) - Math.floor(goal / nx);
    return Math.hypot(dx, dz);
  };
  push([h(start), start]);
  while (heap.length > 0) {
    const [, current] = pop()!;
    if (current === goal) {
      const cells = [current];
      let node = current;
      while (came.has(node)) {
        node = came.get(node)!;
        cells.push(node);
      }
      return cells.reverse().map((c) => map.centreOf(c));
    }
    if (closed.has(current)) continue;
    closed.add(current);
    const cx = current % nx;
    const cz = Math.floor(current / nx);
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dz === 0) continue;
        const ix = cx + dx;
        const iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= map.nx || iz >= map.nz) continue;
        const next = iz * nx + ix;
        if (closed.has(next) || !ok(next)) continue;
        // En diagonal, las dos celdas contiguas tampoco pueden ser tierra.
        if (dx !== 0 && dz !== 0 && (!ok(cz * nx + ix) || !ok(iz * nx + cx))) continue;
        const clearance = map.clear[next] ?? 0;
        const penalty = softAbove > 0 && clearance < softAbove ? ((softAbove - clearance) / softAbove) * 3 : 0;
        const g = (gScore.get(current) ?? 0) + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1) * (1 + penalty);
        if (g < (gScore.get(next) ?? Infinity)) {
          gScore.set(next, g);
          came.set(next, current);
          push([g + h(next), next]);
        }
      }
    }
  }
  return null;
}

/** Suaviza una poligonal con Chaikin conservando los extremos. */
export function smoothPath(points: Array<[number, number]>, iterations = 3): Array<[number, number]> {
  let current = points;
  for (let n = 0; n < iterations; n += 1) {
    if (current.length < 3) return current;
    const next: Array<[number, number]> = [current[0]!];
    for (let i = 0; i < current.length - 1; i += 1) {
      const p = current[i]!;
      const q = current[i + 1]!;
      next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
      next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    next.push(current[current.length - 1]!);
    current = next;
  }
  return current;
}

/** Celdas alcanzables por agua desde `from` (misma regla de paso que `findSeaPath`). */
export function reachableCells(map: SeaMap, from: [number, number], minClear: number): Set<number> {
  const start = map.cellOf(from[0], from[1]);
  const seen = new Set<number>();
  if (start < 0) return seen;
  const queue = [start];
  seen.add(start);
  const ok = (i: number) => (map.clear[i] ?? 0) >= minClear;
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    const cx = current % map.nx;
    const cz = Math.floor(current / map.nx);
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dz === 0) continue;
        const ix = cx + dx;
        const iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= map.nx || iz >= map.nz) continue;
        const next = iz * map.nx + ix;
        if (seen.has(next) || !ok(next)) continue;
        if (dx !== 0 && dz !== 0 && (!ok(cz * map.nx + ix) || !ok(iz * map.nx + cx))) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}
