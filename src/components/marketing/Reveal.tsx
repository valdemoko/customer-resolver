"use client";

import { Fragment, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "rise" | "scale" | "left" | "right" | "clip";

/** Marca `data-in` en el elemento la primera vez que entra en pantalla. */
function useInView<T extends HTMLElement>(rootMargin = "0px 0px -9% 0px") {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      node.setAttribute("data-in", "");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            node.setAttribute("data-in", "");
            observer.disconnect();
          }
        }
      },
      { rootMargin, threshold: 0.06 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);
  return ref;
}

/**
 * Revelado al entrar en pantalla, con cinco coreografías (`rise`, `scale`,
 * `left`, `right`, `clip`). Sin JavaScript, o con «reducir movimiento», el
 * contenido es visible desde el principio (el CSS solo lo oculta cuando hay
 * scripting y se admite movimiento). Se anima solo `opacity`, `transform`,
 * `filter` y `clip-path`.
 */
export function Reveal({
  children,
  delay = 0,
  variant = "rise",
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  variant?: Variant;
  className?: string;
  as?: "div" | "section" | "li" | "header" | "p";
}) {
  const ref = useInView<HTMLElement>();
  const Component = Tag as React.ElementType;
  return (
    <Component
      ref={ref}
      data-v={variant}
      className={cn("reveal", className)}
      style={{ ["--d" as string]: `${delay}ms` }}
    >
      {children}
    </Component>
  );
}

/**
 * Titular que entra palabra a palabra (cada palabra sube desde una máscara).
 * El texto accesible es la frase completa; las palabras sueltas van `aria-hidden`.
 */
export function SplitText({
  text,
  className,
  delay = 0,
  as: Tag = "span",
  lines,
}: {
  text: string;
  className?: string;
  delay?: number;
  as?: "span" | "h1" | "h2" | "h3";
  /** Saltos de línea explícitos (cada elemento es una línea). */
  lines?: string[];
}) {
  const ref = useInView<HTMLElement>("0px 0px -4% 0px");
  const Component = Tag as React.ElementType;
  const rows = lines ?? [text];
  let index = 0;
  return (
    <Component ref={ref} className={cn("split", className)} style={{ ["--d" as string]: `${delay}ms` }} aria-label={rows.join(" ")}>
      {rows.map((row, r) => (
        <span key={r} aria-hidden="true" className="block">
          {row.split(" ").map((word) => {
            const i = index++;
            return (
              <Fragment key={`${r}-${i}`}>
                <span className="w">
                  <span className="wi" style={{ ["--i" as string]: i }}>
                    {word}
                  </span>
                </span>{" "}
              </Fragment>
            );
          })}
        </span>
      ))}
    </Component>
  );
}

/**
 * Tarjeta con un foco de luz cálido que sigue al ratón y, con `tilt`, una ligera
 * inclinación 3D hacia el puntero (máx. 4°) que vuelve a su sitio al salir.
 */
export function SpotCard({
  children,
  className,
  as: Tag = "div",
  labelledBy,
  tilt = false,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li" | "section" | "article";
  labelledBy?: string;
  tilt?: boolean;
}) {
  const Component = Tag as React.ElementType;
  return (
    <Component
      aria-labelledby={labelledBy}
      className={cn("spot", tilt && "tilt", className)}
      onPointerMove={(event: React.PointerEvent<HTMLElement>) => {
        const node = event.currentTarget;
        const box = node.getBoundingClientRect();
        const x = event.clientX - box.left;
        const y = event.clientY - box.top;
        node.style.setProperty("--mx", `${x}px`);
        node.style.setProperty("--my", `${y}px`);
        if (tilt && event.pointerType === "mouse") {
          node.dataset.hover = "true";
          node.style.setProperty("--ry", `${((x / box.width - 0.5) * 8).toFixed(2)}deg`);
          node.style.setProperty("--rx", `${(-(y / box.height - 0.5) * 6).toFixed(2)}deg`);
        }
      }}
      onPointerLeave={(event: React.PointerEvent<HTMLElement>) => {
        const node = event.currentTarget;
        node.dataset.hover = "false";
        node.style.setProperty("--rx", "0deg");
        node.style.setProperty("--ry", "0deg");
      }}
    >
      {children}
    </Component>
  );
}

/** Imán: el elemento se acerca unos píxeles al puntero mientras está cerca. Sin efecto con táctil o movimiento reducido. */
export function Magnetic({ children, className, strength = 0.28 }: { children: React.ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (event: PointerEvent) => {
      const box = node.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const reach = Math.max(box.width, box.height) * 0.9;
      const near = Math.hypot(dx, dy) < reach;
      node.style.transition = near ? "transform 120ms linear" : "transform 600ms cubic-bezier(0.16, 1, 0.3, 1)";
      node.style.transform = near ? `translate3d(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px, 0)` : "translate3d(0,0,0)";
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [strength]);
  return (
    <div ref={ref} className={cn("inline-block will-change-transform", className)}>
      {children}
    </div>
  );
}
