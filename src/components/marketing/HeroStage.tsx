"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { NetworkMarkers, type MapCity } from "./NetworkMarkers";
import { projectLonLat, WORLD_HEIGHT, WORLD_WIDTH, worldDots } from "./world-dots";

/** Generador determinista (mulberry32): mismo mapa y mismo orden de aparición en cada visita. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeOutBack = (t: number) => {
  const c1 = 2.2;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

const INTRO_SECONDS = 2.8;
const POP_SECONDS = 0.5;
const GLOW_SECONDS = 1.1;
const ALPHA_STEPS = 7;

type Layout = { w: number; h: number; scale: number; ox: number; oy: number; r: number };

/**
 * Portada: el mundo hecho de puntos.
 *
 *  · Al cargar, los puntos aparecen UNO A UNO desde la ciudad activa y se
 *    extienden por el mapa; cada uno nace como un destello cian.
 *  · Al bajar con el scroll, los puntos se sueltan de uno en uno (orden
 *    aleatorio) y se van flotando mientras el titular se desvanece.
 *  · Cerca del puntero los puntos se iluminan y se apartan un poco.
 *
 * El lienzo se dibuja solo mientras el escenario está en pantalla y en lotes
 * (un trazado por tono), así que ~8.000 puntos caben en un fotograma.
 */
export function HeroStage({ cities, children }: { cities: MapCity[]; children: React.ReactNode }) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [reduce, setReduce] = useState(false);
  const progress = useRef(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduce(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const primary = cities.find((city) => city.openable) ?? cities[0];
  const focus = primary ? projectLonLat(primary.lon, primary.lat) : ([WORLD_WIDTH / 2, WORLD_HEIGHT / 2] as [number, number]);

  /* ------------------------------------------------------------ geometría */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      let scale: number;
      let ox: number;
      if (w >= 900) {
        scale = Math.min(w / WORLD_WIDTH, (h * 0.8) / WORLD_HEIGHT);
        ox = (w - WORLD_WIDTH * scale) / 2;
      } else {
        // Móvil: se recorta el mapa y se centra en la ciudad activa.
        scale = Math.max(w / WORLD_WIDTH, (h * 0.46) / WORLD_HEIGHT);
        ox = w / 2 - focus[0] * scale;
        ox = Math.min(0, Math.max(w - WORLD_WIDTH * scale, ox));
      }
      const oy = h - WORLD_HEIGHT * scale - h * (w >= 900 ? 0.06 : 0.14);
      setLayout({ w, h, scale, ox, oy, r: clamp(scale * 0.95, 0.85, 2.1) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `focus` es constante por ciudad
  }, [focus[0]]);

  /* -------------------------------------------------------------- scroll */
  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = section.getBoundingClientRect();
      const total = Math.max(1, box.height - stage.clientHeight);
      const p = reduce ? 0 : clamp(-box.top / total);
      if (Math.abs(p - progress.current) > 0.0005) {
        progress.current = p;
        dirty.current = true;
        section.style.setProperty("--hero-p", p.toFixed(4));
        if (overlayRef.current) overlayRef.current.style.opacity = String(clamp(1 - p * 2.6));
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduce]);

  /* ---------------------------------------------------------------- lienzo */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context;

    const raw = worldDots();
    const count = raw.length / 2;
    const rand = seeded(20261009);
    const appear = new Float32Array(count);
    const leave = new Float32Array(count);
    const rise = new Float32Array(count);
    const drift = new Float32Array(count);
    const twinkle = new Float32Array(count);
    let maxDistance = 1;
    const distance = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      distance[i] = Math.hypot(raw[i * 2]! - focus[0], raw[i * 2 + 1]! - focus[1]);
      maxDistance = Math.max(maxDistance, distance[i]!);
    }
    for (let i = 0; i < count; i += 1) {
      // Orden de aparición: ondas desde la ciudad activa, con ruido para que sea punto a punto.
      appear[i] = (distance[i]! / maxDistance) * (INTRO_SECONDS - 0.9) + rand() * 0.9;
      leave[i] = rand();
      rise[i] = 50 + rand() * 250;
      drift[i] = rand() - 0.5;
      twinkle[i] = rand() * Math.PI * 2;
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(layout.w * dpr);
    canvas.height = Math.round(layout.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Lotes por tono: [0, ALPHA_STEPS) azul-grisáceo, [ALPHA_STEPS, 2·ALPHA_STEPS) cian.
    const buckets = Array.from({ length: ALPHA_STEPS * 2 }, () => new Float32Array(count * 3));
    const sizes = new Int32Array(ALPHA_STEPS * 2);
    const base = [150, 168, 200];
    const cyan = [255, 150, 110];

    const startedAt = performance.now();
    let frame = 0;
    let visible = true;
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible && !frame) frame = requestAnimationFrame(draw);
    });
    observer.observe(canvas);

    function draw(now: number) {
      frame = 0;
      if (!visible) return;
      const t = reduce ? INTRO_SECONDS + 5 : (now - startedAt) / 1000;
      const p = progress.current;
      const { scale, ox, oy, r } = layout!;
      const sweep = ((t * 110) % (WORLD_WIDTH * scale + 400)) - 200; // barrido de luz
      sizes.fill(0);
      const px = pointer.current?.x ?? -9999;
      const py = pointer.current?.y ?? -9999;
      let animating = t < INTRO_SECONDS + GLOW_SECONDS + POP_SECONDS;

      for (let i = 0; i < count; i += 1) {
        const u = clamp((t - appear[i]!) / POP_SECONDS);
        if (u <= 0) continue;
        let size = u < 1 ? easeOutBack(u) : 1;
        let alpha = 0.5 + Math.sin(t * 1.3 + twinkle[i]!) * 0.06;
        let glow = u < 1 ? 1 : clamp(1 - (t - appear[i]! - POP_SECONDS) / GLOW_SECONDS);
        let x = raw[i * 2]! * scale + ox;
        let y = raw[i * 2 + 1]! * scale + oy;

        // Barrido de luz que recorre el mapa.
        const d = x - sweep;
        const lit = Math.exp(-(d * d) / 5200);
        alpha += lit * 0.38;
        if (lit > 0.35) glow = Math.max(glow, lit * 0.6);

        // Disolución con el scroll: cada punto se suelta cuando le toca.
        const q = clamp((p - 0.05 - leave[i]! * 0.62) / 0.2);
        if (q > 0) {
          y -= q * q * rise[i]!;
          x += drift[i]! * q * 240;
          alpha *= 1 - q;
          glow = Math.max(glow, Math.sin(q * Math.PI) * 0.9);
          size *= 1 - q * 0.4;
          if (q >= 1) continue;
        }

        // Puntero: cerca de él, el punto se ilumina y se aparta.
        const dx = x - px;
        const dy = y - py;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < 9600) {
          const near = 1 - Math.sqrt(dist2) / 98;
          alpha += near * 0.55;
          glow = Math.max(glow, near);
          const push = near * 9;
          const len = Math.sqrt(dist2) || 1;
          x += (dx / len) * push;
          y += (dy / len) * push;
          animating = true;
        }

        const level = Math.min(ALPHA_STEPS - 1, Math.max(0, Math.round(clamp(alpha) * (ALPHA_STEPS - 1))));
        const bucket = glow > 0.28 ? ALPHA_STEPS + level : level;
        const slot = sizes[bucket]!;
        const target = buckets[bucket]!;
        target[slot] = x;
        target[slot + 1] = y;
        target[slot + 2] = r * size * (glow > 0.28 ? 1.0 + glow * 0.55 : 1);
        sizes[bucket] = slot + 3;
      }

      ctx.clearRect(0, 0, layout!.w, layout!.h);
      for (let b = 0; b < ALPHA_STEPS * 2; b += 1) {
        const n = sizes[b]!;
        if (n === 0) continue;
        const level = b % ALPHA_STEPS;
        const colour = b >= ALPHA_STEPS ? cyan : base;
        ctx.fillStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${(0.14 + (level / (ALPHA_STEPS - 1)) * 0.82).toFixed(3)})`;
        ctx.beginPath();
        const data = buckets[b]!;
        for (let k = 0; k < n; k += 3) {
          const rr = Math.max(0.2, data[k + 2]!);
          ctx.moveTo(data[k]! + rr, data[k + 1]!);
          ctx.arc(data[k]!, data[k + 1]!, rr, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      dirty.current = false;
      // El barrido de luz y el parpadeo animan siempre salvo con movimiento reducido.
      if (!reduce || animating || dirty.current) frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `focus` es constante por ciudad
  }, [layout, reduce, focus[0], focus[1]]);

  const points: Record<string, [number, number]> = {};
  if (layout) {
    for (const city of cities) {
      const [x, y] = projectLonLat(city.lon, city.lat);
      points[city.slug] = [x * layout.scale + layout.ox, y * layout.scale + layout.oy];
    }
  }

  return (
    <section
      ref={sectionRef}
      aria-labelledby="titulo"
      className="relative"
      style={{ height: reduce ? "100svh" : "230svh" }}
    >
      <div
        ref={stageRef}
        className="sticky top-0 h-[100svh] overflow-hidden"
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          pointer.current = { x: event.clientX - box.left, y: event.clientY - box.top };
          dirty.current = true;
        }}
        onPointerLeave={() => {
          pointer.current = null;
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" style={{ width: "100%", height: "100%" }} />
        <div ref={overlayRef} className="pointer-events-none absolute inset-0">
          <div className="pointer-events-auto">
            <NetworkMarkers cities={cities} points={points} />
          </div>
        </div>

        <div className="hero-copy relative z-10 mx-auto max-w-[88rem] px-4 pt-8 sm:px-8 sm:pt-14">{children}</div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center text-subtle"
          style={{ opacity: "calc(1 - var(--hero-p, 0) * 6)" }}
        >
          <span className="flex flex-col items-center gap-1 text-xs">
            Desplázate
            <ChevronDown size={18} strokeWidth={1.8} className="scroll-cue" />
          </span>
        </div>
      </div>
    </section>
  );
}
