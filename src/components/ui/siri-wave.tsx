"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

type Props = {
  /** Por ahora solo existe `fluid-dots`: un disco de puntos que ondula como un fluido. */
  readonly variant?: "fluid-dots";
  /** Lado del lienzo en píxeles (se reduce solo si no cabe). */
  readonly size?: number;
  /** 0–1: cuánto está hecha la carga. Llena el disco desde el centro y sube la energía de la onda. */
  readonly progress?: number;
  readonly className?: string;
};

const DOTS = 760;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const CREAM = [242, 237, 227] as const;
const CORAL = [255, 122, 77] as const;
const SKY = [168, 196, 232] as const;

const mix = (a: readonly number[], b: readonly number[], t: number) => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];

/**
 * Cargador «Siri» de puntos fluidos: ~760 puntos en espiral áurea (reparto uniforme
 * en un disco) que ondulan con ondas que viajan hacia fuera y un giro lento, del
 * coral del centro al crema y azul de los bordes. Con `progress` el disco se llena
 * desde el centro y la onda gana energía; con «reducir movimiento» se dibuja un solo
 * fotograma. Es decorativo (`aria-hidden`): el estado lo cuentan las fases escritas.
 */
export function SiriWave({ variant = "fluid-dots", size = 360, progress = 1, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const side = Math.min(size, Math.floor(canvas.parentElement?.clientWidth ?? size) || size);
    canvas.width = Math.round(side * dpr);
    canvas.height = Math.round(side * dpr);
    canvas.style.width = `${side}px`;
    canvas.style.height = `${side}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const radius = side * 0.43;
    const centre = side / 2;
    let smooth = 0.35 + progressRef.current * 0.65;
    let frame = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = reduce ? 3.1 : now / 1000;
      // Siempre hay un núcleo visible (35 %): el cargador no puede verse vacío al empezar.
      const target = 0.35 + progressRef.current * 0.65;
      smooth += (target - smooth) * (1 - Math.exp(-dt * 3));
      const energy = 0.35 + smooth * 0.65;
      ctx.clearRect(0, 0, side, side);
      for (let i = 0; i < DOTS; i += 1) {
        const u = Math.sqrt((i + 0.5) / DOTS); // 0 en el centro, 1 en el borde
        // El disco se llena de dentro afuera: lo exterior aparece cuando el progreso lo alcanza.
        const reveal = Math.min(1, Math.max(0, (smooth * 1.18 - u) / 0.18));
        if (reveal <= 0.01) continue;
        const angle = i * GOLDEN + t * (0.16 + 0.1 * (1 - u)); // giro más rápido en el centro
        const wave =
          Math.sin(u * 9 - t * 2.4 + Math.sin(angle * 2 + t * 0.8) * 1.3) * 0.5 +
          Math.sin(u * 5.5 + t * 1.5 + angle * 3) * 0.35 +
          Math.sin(angle * 5 - t * 1.1) * 0.15;
        const push = wave * 0.075 * energy * (0.4 + u); // desplazamiento radial
        const r = (u + push) * radius;
        const x = centre + Math.cos(angle) * r;
        const y = centre + Math.sin(angle) * r;
        const lift = (wave + 1) / 2; // 0..1
        const dot = (0.9 + lift * 2.3 * (0.55 + u * 0.6)) * (side / 360) * reveal;
        // Color: coral al centro, crema en medio y azul claro en el borde; la cresta de la onda lo aclara.
        const base = u < 0.5 ? mix(CORAL, CREAM, u / 0.5) : mix(CREAM, SKY, (u - 0.5) / 0.5);
        const crest = mix(base, CREAM, lift * 0.35);
        ctx.fillStyle = `rgba(${crest[0]!.toFixed(0)},${crest[1]!.toFixed(0)},${crest[2]!.toFixed(0)},${(0.35 + lift * 0.6) * reveal})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.3, dot), 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [size, variant]);

  return (
    <div className={cn("inline-block max-w-full rounded-full", className)} aria-hidden="true">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
