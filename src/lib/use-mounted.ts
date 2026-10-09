"use client";

import { useEffect, useState } from "react";

/**
 * `false` durante el renderizado en servidor y durante la hidratación en el
 * primer render del cliente; `true` a partir del montaje.
 *
 * Sirve para renderizar contenido que depende de datos que solo existen en el
 * navegador (almacenamiento local). Sin esto, el HTML del servidor y el del
 * cliente no coinciden en el primer render y React avisa de un desajuste de
 * hidratación.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
