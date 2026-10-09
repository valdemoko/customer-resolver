"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Capa global de la web de marketing (no se monta en el visor 3D):
 *  · fondo de pizarra con curvas de nivel que se desplazan a distinta velocidad al hacer scroll;
 *  · un resplandor cálido que sigue al ratón (solo con puntero fino y sin «reducir movimiento»);
 *  · una línea de progreso de lectura.
 * El scroll se publica UNA vez por fotograma en dos variables CSS (`--sy`, `--sp`).
 */
export function SiteChrome() {
  const pathname = usePathname();
  const disabled = pathname.endsWith("/viewer");
  const aura = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (disabled) return;
    const root = document.documentElement;
    let frame = 0;
    const publish = () => {
      frame = 0;
      const max = Math.max(1, root.scrollHeight - window.innerHeight);
      root.style.setProperty("--sy", String(Math.round(window.scrollY)));
      root.style.setProperty("--sp", String(Math.min(1, window.scrollY / max)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(publish);
    };
    publish();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--sy");
      root.style.removeProperty("--sp");
    };
  }, [disabled]);

  useEffect(() => {
    if (disabled) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;
    const root = document.documentElement;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 3;
    let ax = tx;
    let ay = ty;
    let frame = 0;
    let running = true;
    const loop = () => {
      if (!running) return;
      ax += (tx - ax) * 0.09; // el resplandor va con un retraso suave
      ay += (ty - ay) * 0.09;
      if (aura.current) aura.current.style.transform = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0)`;
      frame = requestAnimationFrame(loop);
    };
    const onMove = (event: PointerEvent) => {
      tx = event.clientX;
      ty = event.clientY;
      root.classList.add("cursor-on");
    };
    const onLeave = () => root.classList.remove("cursor-on");
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      root.classList.remove("cursor-on");
    };
  }, [disabled]);

  if (disabled) return null;
  return (
    <>
      <div className="ambient" aria-hidden="true">
        <div className="contours a" style={{ ["--k" as string]: -0.1 }} />
        <div className="contours b" style={{ ["--k" as string]: -0.24 }} />
      </div>
      <div className="scroll-progress" aria-hidden="true" />
      <div ref={aura} className="cursor-aura" aria-hidden="true" />
    </>
  );
}
