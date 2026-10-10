"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronUp } from "lucide-react";
import type { MapCity } from "@/components/marketing/NetworkMarkers";
import { projectLonLat, WORLD_HEIGHT, WORLD_WIDTH, worldDots } from "@/components/marketing/world-dots";

/**
 * Salto de la ciudad al mapa del mundo y vuelta.
 *
 * Si con la cámara ya en el máximo se sigue alejando el zoom, la ciudad entera (vista y controles) se
 * va encogiendo hacia el punto de Málaga del mapa. Con un empujón más se hunde en el punto y queda el
 * mapa de puntos a pantalla completa. Desde el mapa, acercar el zoom (o pulsar el punto de Málaga)
 * hace el camino inverso: el punto se abre hasta ser otra vez la ciudad.
 *
 * Todo cuelga de un único número `p` (0 = ciudad a pantalla completa, 1 = mapa del mundo) y las dos
 * capas se pintan en función de él, así que ir y volver es la misma animación en sentido contrario y
 * soltar a medio camino la deshace con suavidad.
 */

export type WorldControl = { pull: (amount: number) => void };

type Phase = "city" | "to-world" | "world" | "to-city";

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t: number) => {
  const c1 = 1.9;
  return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** Cuánto hay que seguir alejando la rueda (en unidades de rueda) para soltar la ciudad. */
const PULL_TO_LEAVE = 760;
const PULL_TO_ENTER = 520;
/** Hasta dónde se encoge la ciudad solo con el empujón, antes de decidirse (p). */
const PULL_LIMIT = 0.5;
const SHRINK_AT_LIMIT = 0.55;
const SHRINK_AT_END = 0.012;
const TO_WORLD_MS = 1350;
const TO_CITY_MS = 1150;

type Layout = { w: number; h: number; scale: number; ox: number; oy: number; dot: [number, number] };

function layoutFor(w: number, h: number, lon: number, lat: number): Layout {
  const focus = projectLonLat(lon, lat);
  let scale: number;
  let ox: number;
  if (w >= 900) {
    scale = Math.min(w / WORLD_WIDTH, (h * 0.82) / WORLD_HEIGHT);
    ox = (w - WORLD_WIDTH * scale) / 2;
  } else {
    // Móvil: se recorta el mapa y se centra en la ciudad.
    scale = Math.max(w / WORLD_WIDTH, (h * 0.5) / WORLD_HEIGHT);
    ox = Math.min(0, Math.max(w - WORLD_WIDTH * scale, w / 2 - focus[0] * scale));
  }
  const oy = (h - WORLD_HEIGHT * scale) / 2 + h * 0.02;
  return { w, h, scale, ox, oy, dot: [focus[0] * scale + ox, focus[1] * scale + oy] };
}

export function WorldTransition({
  city,
  cities,
  reduceMotion,
  onPause,
  onReturned,
  controlRef,
  children,
}: {
  city: { slug: string; name: string; lon: number; lat: number };
  cities: MapCity[];
  reduceMotion: boolean;
  /** `true` cuando la ciudad queda oculta del todo: el motor puede dejar de dibujar. */
  onPause: (paused: boolean) => void;
  onReturned?: () => void;
  controlRef: MutableRefObject<WorldControl | null>;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cityLayerRef = useRef<HTMLDivElement | null>(null);
  const mapLayerRef = useRef<HTMLDivElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [phase, setPhase] = useState<Phase>("city");
  const [hover, setHover] = useState<string | null>(null);

  const layoutRef = useRef<Layout | null>(null);
  const live = useRef({
    p: 0,
    pull: 0,
    pullAt: 0,
    wheelIn: 0,
    wheelInAt: 0,
    phase: "city" as Phase,
    anim: null as { from: number; to: number; start: number; duration: number } | null,
    cooldownUntil: 0,
    paused: false,
    pointer: null as { x: number; y: number } | null,
    last: 0,
    loop: 0,
  });
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;
  const pauseRef = useRef(onPause);
  pauseRef.current = onPause;
  const returnedRef = useRef(onReturned);
  returnedRef.current = onReturned;

  /* ---------------------------------------------------------------- geometría */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const next = layoutFor(root.clientWidth, root.clientHeight, city.lon, city.lat);
      layoutRef.current = next;
      setLayout(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [city.lon, city.lat]);

  /* ----------------------------------------------------------- puntos del mapa */
  const dots = useRef<{ raw: Float32Array; norm: Float32Array; twinkle: Float32Array } | null>(null);
  if (!dots.current) {
    const raw = worldDots();
    const count = raw.length / 2;
    const focus = projectLonLat(city.lon, city.lat);
    const norm = new Float32Array(count);
    const twinkle = new Float32Array(count);
    let max = 1;
    for (let i = 0; i < count; i += 1) {
      norm[i] = Math.hypot(raw[i * 2]! - focus[0], raw[i * 2 + 1]! - focus[1]);
      max = Math.max(max, norm[i]!);
      // Pseudoaleatorio determinista por punto (mismo parpadeo en cada visita).
      twinkle[i] = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * Math.PI * 2;
    }
    for (let i = 0; i < count; i += 1) norm[i] = norm[i]! / max;
    dots.current = { raw, norm, twinkle };
  }

  /* ------------------------------------------------------------ pintar según p */
  const paint = useCallback((now: number) => {
    const s = live.current;
    const geo = layoutRef.current;
    const cityLayer = cityLayerRef.current;
    const mapLayer = mapLayerRef.current;
    const hud = hudRef.current;
    if (!geo || !cityLayer || !mapLayer) return;
    const p = s.p;

    // Capa de la ciudad: se encoge hacia el punto del mapa. Primero despacio (el empujón), luego se hunde en él.
    let scale: number;
    if (p <= PULL_LIMIT) scale = Math.exp(Math.log(SHRINK_AT_LIMIT) * (p / PULL_LIMIT));
    else scale = Math.exp(Math.log(SHRINK_AT_LIMIT) + (Math.log(SHRINK_AT_END) - Math.log(SHRINK_AT_LIMIT)) * easeInOutCubic((p - PULL_LIMIT) / (1 - PULL_LIMIT)));
    // Un leve estirón vertical mientras se encoge da la sensación de que la pantalla se estira.
    const stretch = 1 - 0.09 * clamp(p / PULL_LIMIT) * (1 - clamp((p - PULL_LIMIT) / 0.3));
    const fade = p < 0.8 ? 1 : 1 - clamp((p - 0.8) / 0.2);
    cityLayer.style.transformOrigin = `${geo.dot[0]}px ${geo.dot[1]}px`;
    cityLayer.style.transform = p <= 0.0005 ? "none" : `scale(${(scale * stretch).toFixed(5)}, ${scale.toFixed(5)})`;
    cityLayer.style.borderRadius = p <= 0.0005 ? "0" : `${Math.min(900, 30 / Math.max(scale, 0.001)).toFixed(1)}px`;
    cityLayer.style.opacity = fade.toFixed(3);
    cityLayer.style.pointerEvents = s.phase === "city" ? "auto" : "none";
    const cityHidden = p >= 0.999;
    cityLayer.style.visibility = cityHidden ? "hidden" : "visible";
    if (cityHidden !== s.paused) {
      s.paused = cityHidden;
      pauseRef.current(cityHidden);
    }

    // Capa del mapa: aparece mientras la ciudad se encoge y se aleja desde el punto de Málaga.
    const mapIn = clamp(p * 2.4);
    mapLayer.style.opacity = mapIn.toFixed(3);
    mapLayer.style.visibility = p <= 0.002 ? "hidden" : "visible";
    mapLayer.style.pointerEvents = s.phase === "world" || s.phase === "to-city" ? "auto" : "none";
    const zoomOut = 1 + 0.95 * (1 - easeInOutCubic(clamp(p)));
    mapLayer.style.transformOrigin = `${geo.dot[0]}px ${geo.dot[1]}px`;
    mapLayer.style.transform = `scale(${zoomOut.toFixed(4)})`;
    if (hud) {
      hud.style.opacity = clamp((p - 0.82) / 0.18).toFixed(3);
      hud.style.visibility = p > 0.82 ? "visible" : "hidden";
    }

    // Puntos del mundo: nacen en ondas desde Málaga, más lejos cuanto más avance p.
    const canvas = canvasRef.current;
    const data = dots.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !data || p <= 0.002) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(geo.w * dpr) || canvas.height !== Math.round(geo.h * dpr)) {
      canvas.width = Math.round(geo.w * dpr);
      canvas.height = Math.round(geo.h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, geo.w, geo.h);
    const reveal = clamp(p * 1.55 - 0.08);
    const radius = clamp(geo.scale * 0.95, 0.85, 2.2);
    const t = now / 1000;
    const px = s.pointer?.x ?? -9999;
    const py = s.pointer?.y ?? -9999;
    const quiet: number[] = [];
    const lit: number[] = [];
    const count = data.raw.length / 2;
    for (let i = 0; i < count; i += 1) {
      const u = clamp((reveal * 1.3 - data.norm[i]! * 0.95) * 4.5);
      if (u <= 0) continue;
      let size = u < 1 ? easeOutBack(u) : 1;
      let x = data.raw[i * 2]! * geo.scale + geo.ox;
      let y = data.raw[i * 2 + 1]! * geo.scale + geo.oy;
      // Proximidad del puntero: el punto se ilumina y se aparta un poco.
      let glow = u < 1 ? 1 - u * 0.4 : 0;
      const dx = x - px;
      const dy = y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < 9000 && s.phase === "world") {
        const near = 1 - Math.sqrt(d2) / 95;
        glow = Math.max(glow, near);
        const len = Math.sqrt(d2) || 1;
        x += (dx / len) * near * 8;
        y += (dy / len) * near * 8;
      }
      size *= glow > 0.3 ? 1 + glow * 0.5 : 1;
      const target = glow > 0.3 ? lit : quiet;
      target.push(x, y, radius * Math.max(0.2, size), 0.5 + Math.sin(t * 1.3 + data.twinkle[i]!) * 0.08);
    }
    for (const [list, fill] of [
      [quiet, "rgba(150,168,200,0.55)"],
      [lit, "rgba(255,150,110,0.92)"],
    ] as const) {
      if (list.length === 0) continue;
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (let k = 0; k < list.length; k += 4) {
        ctx.moveTo(list[k]! + list[k + 2]!, list[k + 1]!);
        ctx.arc(list[k]!, list[k + 1]!, list[k + 2]!, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }, []);

  /* ---------------------------------------------------------------- el bucle */
  const run = useCallback(() => {
    const s = live.current;
    if (s.loop) return;
    s.last = performance.now();
    const tick = (now: number) => {
      s.loop = 0;
      const dt = Math.min(0.05, (now - s.last) / 1000);
      s.last = now;

      if (s.anim) {
        const t = clamp((now - s.anim.start) / s.anim.duration);
        s.p = s.anim.from + (s.anim.to - s.anim.from) * easeInOutCubic(t);
        if (t >= 1) {
          s.p = s.anim.to;
          s.anim = null;
          s.phase = s.p >= 1 ? "world" : "city";
          setPhase(s.phase);
          if (s.phase === "city") {
            s.cooldownUntil = now + 700;
            s.pull = 0;
            returnedRef.current?.();
          } else {
            s.wheelIn = 0;
          }
        }
      } else if (s.phase === "city") {
        // Empujón sin decidir: si se deja de empujar, la ciudad vuelve a su sitio.
        if (s.pull > 0 && now - s.pullAt > 320) s.pull = Math.max(0, s.pull - dt * 1.7);
        const goal = s.pull * PULL_LIMIT;
        s.p += (goal - s.p) * Math.min(1, dt * 11);
        if (Math.abs(goal - s.p) < 0.0004 && goal === 0) s.p = 0;
      } else if (s.phase === "world") {
        if (s.wheelIn > 0 && now - s.wheelInAt > 320) s.wheelIn = Math.max(0, s.wheelIn - dt * 1.7);
        const goal = 1 - s.wheelIn * PULL_LIMIT * 0.9;
        s.p += (goal - s.p) * Math.min(1, dt * 11);
      }

      paint(now);
      // En la ciudad y sin empujón no hay nada que animar: el bucle se apaga y no cuesta nada.
      const idle = s.phase === "city" && !s.anim && s.pull === 0 && s.p === 0;
      if (!idle) s.loop = requestAnimationFrame(tick);
    };
    s.loop = requestAnimationFrame(tick);
  }, [paint]);

  const animateTo = useCallback(
    (to: 0 | 1) => {
      const s = live.current;
      if (s.anim && s.anim.to === to) return;
      const instant = reduceRef.current;
      s.phase = to === 1 ? "to-world" : "to-city";
      setPhase(s.phase);
      s.pull = 0;
      s.wheelIn = 0;
      s.anim = { from: s.p, to, start: performance.now(), duration: instant ? 1 : (to === 1 ? TO_WORLD_MS : TO_CITY_MS) * Math.max(0.35, Math.abs(to - s.p)) };
      // La ciudad vuelve a dibujarse desde el primer fotograma de la vuelta.
      if (to === 0 && s.paused) {
        s.paused = false;
        pauseRef.current(false);
      }
      run();
    },
    [run],
  );

  /** El motor avisa de cada muesca de rueda (o pellizco) que sobra al alejar el zoom. */
  useEffect(() => {
    controlRef.current = {
      pull: (amount: number) => {
        const s = live.current;
        const now = performance.now();
        if (s.phase !== "city" || now < s.cooldownUntil) return;
        s.pull = clamp(s.pull + amount / PULL_TO_LEAVE);
        s.pullAt = now;
        if (s.pull >= 1) animateTo(1);
        else run();
      },
    };
    return () => {
      controlRef.current = null;
    };
  }, [animateTo, controlRef, run]);

  /** Desde el mapa: acercar el zoom (rueda, + o clic en el punto) vuelve a la ciudad. */
  const zoomIntoCity = useCallback(() => {
    if (live.current.phase === "world") animateTo(0);
  }, [animateTo]);

  useEffect(() => {
    const layer = mapLayerRef.current;
    if (!layer) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const s = live.current;
      if (s.phase !== "world" || event.deltaY >= 0) return;
      s.wheelIn = clamp(s.wheelIn + (-event.deltaY * (event.deltaMode === 1 ? 33 : 1)) / PULL_TO_ENTER);
      s.wheelInAt = performance.now();
      if (s.wheelIn >= 1) zoomIntoCity();
      else run();
    };
    const onKey = (event: KeyboardEvent) => {
      if (live.current.phase !== "world") return;
      if (event.key === "+" || event.key === "=" || event.key === "Enter") {
        event.preventDefault();
        zoomIntoCity();
      }
    };
    layer.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      layer.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [run, zoomIntoCity]);

  // Pellizco al acercar en la vista del mundo (táctil).
  useEffect(() => {
    const layer = mapLayerRef.current;
    if (!layer) return;
    const touches = new Map<number, { x: number; y: number }>();
    let start = 0;
    const gap = () => {
      const [a, b] = [...touches.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2) start = gap();
    };
    const move = (event: PointerEvent) => {
      if (!touches.has(event.pointerId)) return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2 && start > 0 && gap() > start * 1.25) {
        touches.clear();
        zoomIntoCity();
      }
    };
    const up = (event: PointerEvent) => touches.delete(event.pointerId);
    layer.addEventListener("pointerdown", down);
    layer.addEventListener("pointermove", move);
    layer.addEventListener("pointerup", up);
    layer.addEventListener("pointercancel", up);
    return () => {
      layer.removeEventListener("pointerdown", down);
      layer.removeEventListener("pointermove", move);
      layer.removeEventListener("pointerup", up);
      layer.removeEventListener("pointercancel", up);
    };
  }, [zoomIntoCity]);

  useEffect(() => {
    const s = live.current;
    return () => {
      if (s.loop) cancelAnimationFrame(s.loop);
      s.loop = 0;
    };
  }, []);

  // Un cambio de tamaño en el mapa del mundo repinta con la nueva geometría.
  useEffect(() => {
    if (layout && live.current.p > 0) run();
  }, [layout, run]);

  const others = cities.filter((other) => other.slug !== city.slug);
  const inWorld = phase === "world";

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-[#0d1522]" data-world-phase={phase}>
      {/* --------------------------------------------------------- mapa del mundo */}
      <div
        ref={mapLayerRef}
        className="absolute inset-0 z-0"
        style={{ visibility: "hidden", opacity: 0 }}
        role="region"
        aria-label="Mapa del mundo"
        aria-hidden={!inWorld}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          live.current.pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
          if (live.current.phase === "world") run();
        }}
        onPointerLeave={() => {
          live.current.pointer = null;
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
        {layout ? (
          <ul className="absolute inset-0 m-0 list-none p-0">
            {others.map((other) => {
              const [x, y] = projectLonLat(other.lon, other.lat);
              const left = x * layout.scale + layout.ox;
              const top = y * layout.scale + layout.oy;
              return (
                <li key={other.slug} className="absolute" style={{ left, top }}>
                  <span
                    className="absolute -left-4 -top-4 flex h-8 w-8 items-center justify-center rounded-full"
                    onMouseEnter={() => setHover(other.slug)}
                    onMouseLeave={() => setHover((current) => (current === other.slug ? null : current))}
                  >
                    <span className="block h-2 w-2 rounded-full bg-subtle" />
                  </span>
                  <span
                    className={`pointer-events-none absolute left-3 top-2 whitespace-nowrap rounded-full border border-line-strong bg-surface/90 px-2.5 py-1 text-xs text-ink transition-opacity duration-200 ${hover === other.slug ? "opacity-100" : "opacity-0"}`}
                  >
                    {other.name} · {other.statusLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {/* ------------------------------------------- punto de Málaga y mensajes */}
      <div ref={hudRef} className="pointer-events-none absolute inset-0 z-10" style={{ opacity: 0, visibility: "hidden" }}>
        {layout ? (
          <div className="absolute" style={{ left: layout.dot[0], top: layout.dot[1] }}>
            <button
              type="button"
              onClick={zoomIntoCity}
              disabled={!inWorld}
              aria-label={`Entrar en ${city.name}`}
              className="pointer-events-auto group absolute -left-8 -top-8 flex h-16 w-16 items-center justify-center rounded-full outline-offset-2 disabled:pointer-events-none"
            >
              <span aria-hidden="true" className="pointer-events-none absolute inset-0">
                <span className="beacon-ring absolute inset-0 rounded-full border border-accent/70" />
                <span className="beacon-ring absolute inset-0 rounded-full border border-accent/70" />
              </span>
              <span aria-hidden="true" className="relative block h-3.5 w-3.5 rounded-full bg-accent ring-4 ring-accent/30 transition-transform duration-200 group-hover:scale-125" />
            </button>
            <span className="display-face pointer-events-none absolute left-5 top-3 whitespace-nowrap text-xl font-medium tracking-[-0.02em] text-ink">{city.name}</span>
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2 text-sm text-muted">
          <ChevronUp size={20} strokeWidth={1.8} className="scroll-cue text-accent-ink" aria-hidden="true" />
          <p>Acerca el zoom a {city.name} para volver</p>
        </div>

        <Link
          href="/"
          tabIndex={inWorld ? 0 : -1}
          className="pointer-events-auto absolute left-3 top-3 inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface/85 px-4 text-sm text-ink shadow-[var(--shadow-float)] backdrop-blur-md transition-colors hover:bg-sunken"
        >
          <ArrowLeft size={15} strokeWidth={1.9} aria-hidden="true" />
          Portada
        </Link>
      </div>

      {/* ------------------------------------------------------------- la ciudad */}
      <div ref={cityLayerRef} className="absolute inset-0 z-20 overflow-hidden will-change-transform" inert={inWorld || undefined}>
        {children}
      </div>
    </div>
  );
}
