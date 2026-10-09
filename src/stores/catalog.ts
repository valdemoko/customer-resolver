"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Estado de la interfaz del catálogo (búsqueda, filtro, orden, favoritos).
 *
 * Vive separado del estado del mapa/visor a propósito: cambiar un filtro no
 * debe re-renderizar la escena 3D. Este store nunca lo lee el visor.
 *
 * Favoritos: se guardan en `localStorage` mientras no haya sesión (Fase D).
 * La interfaz lo dice explícitamente ("solo en este navegador"); no se
 * presenta como una cuenta.
 *
 * Rehidratación: se lanza UNA vez, al evaluar este módulo en el navegador. Se
 * probó a hacerlo desde un `useEffect` del catálogo y producía una carrera:
 * si el usuario marcaba un favorito antes de que la rehidratación terminara,
 * el estado persistido (vacío) pisaba su acción y el favorito se perdía.
 * Lanzándola en el arranque del módulo, la lectura del almacenamiento ocurre
 * antes de que el usuario pueda interactuar.
 */
export type CatalogFilter = "all" | "available" | "saved";
export type CatalogSort = "relevance" | "name";

type CatalogState = {
  query: string;
  filter: CatalogFilter;
  sort: CatalogSort;
  favorites: string[];
  setQuery: (query: string) => void;
  setFilter: (filter: CatalogFilter) => void;
  setSort: (sort: CatalogSort) => void;
  toggleFavorite: (slug: string) => void;
  isFavorite: (slug: string) => boolean;
  clearFavorite: (slug: string) => void;
};

export const useCatalogStore = create<CatalogState>()(
  persist(
    (set, get) => ({
      query: "",
      filter: "all",
      sort: "relevance",
      favorites: [],
      setQuery: (query) => set({ query }),
      setFilter: (filter) => set({ filter }),
      setSort: (sort) => set({ sort }),
      toggleFavorite: (slug) =>
        set((state) => ({
          favorites: state.favorites.includes(slug)
            ? state.favorites.filter((s) => s !== slug)
            : [...state.favorites, slug],
        })),
      isFavorite: (slug) => get().favorites.includes(slug),
      clearFavorite: (slug) =>
        set((state) => ({ favorites: state.favorites.filter((s) => s !== slug) })),
    }),
    {
      name: "alzado.catalog.v1",
      storage: createJSONStorage(() => localStorage),
      // Solo se persisten preferencias del usuario, nunca estado derivado.
      partialize: (state) => ({
        favorites: state.favorites,
        sort: state.sort,
        filter: state.filter,
      }),
      // La hidratación se lanza a mano (abajo) para que el renderizado en
      // servidor no intente tocar `localStorage`.
      skipHydration: true,
    },
  ),
);

if (typeof window !== "undefined") {
  void useCatalogStore.persist.rehydrate();
}
