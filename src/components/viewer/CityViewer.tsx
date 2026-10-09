"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Compass, Layers, Pause, Play, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { CityConfig } from "@/lib/cities/schema";
import { createCityEngine, PHASE_IDS, PHASE_LABELS } from "@/lib/scene/engine";
import type { PhaseId } from "@/lib/scene/engine";
import type { BuildingRecord } from "@/lib/scene/city";
import type { ParcelRecord } from "@/lib/scene/parcels";
import { AttributionButton } from "./AttributionButton";
import { BuildingPanel } from "./BuildingPanel";
import { ParcelPanel } from "./ParcelPanel";
import { AdPanel } from "./AdPanel";
import { PurchaseStudio } from "./PurchaseStudio";
import { RankingDock } from "./RankingDock";
import { UnitTooltip } from "./UnitTooltip";
import { OwnerSidePanel } from "./OwnerSidePanel";
import { useMarket } from "./useMarket";
import { confirmCheckout } from "@/lib/market/client";
import type { UnitView } from "@/lib/market/types";
import { unitLabel } from "@/lib/market/label";

type PhaseState = { done: number; total: number; note: string };
type Status = "loading" | "ready" | "no-webgl" | "context-lost" | "error";

const INITIAL_PHASES: Record<PhaseId, PhaseState> = {
  datos: { done: 0, total: 1, note: "" },
  edificios: { done: 0, total: 1, note: "" },
  terreno: { done: 0, total: 1, note: "" },
  puerto: { done: 0, total: 1, note: "" },
  locales: { done: 0, total: 1, note: "" },
  arboles: { done: 0, total: 1, note: "" },
  nubes: { done: 0, total: 1, note: "" },
  fotograma: { done: 0, total: 1, note: "" },
};

function hasWebgl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Visor 3D de la ciudad.
 *
 * LIMPIO A PROPÓSITO: sobre el mapa solo hay la ficha del edificio seleccionado
 * (abajo a la izquierda), los controles mínimos de cámara, el icono de
 * atribuciones y un botón de vuelta. Ninguna etiqueta de lugar, ni leyenda, ni
 * pie de fuentes, ni bloques de datos: el difuminado de los bordes ya comunica
 * qué zona está cubierta.
 */
export function CityViewer({ city }: { city: CityConfig }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ReturnType<typeof createCityEngine> | null>(null);

  const [status, setStatus] = useState<Status>("loading");
  const [phases, setPhases] = useState<Record<PhaseId, PhaseState>>(INITIAL_PHASES);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<BuildingRecord | null>(null);
  const [selectedParcel, setSelectedParcel] = useState<ParcelRecord | null>(null);
  const [selectedAd, setSelectedAd] = useState<string | null>(null);
  const [hoverUnit, setHoverUnit] = useState<string | null>(null);
  const [studioUnit, setStudioUnit] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const [manualPause, setManualPause] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const scene = city.scene;

  const market = useMarket((state) => engineRef.current?.setMarket(state.units, state.version));
  // El motor puede arrancar después de la primera lectura del mercado: se le
  // vuelve a entregar al estar listo.
  useEffect(() => {
    if (status === "ready" && market.state) engineRef.current?.setMarket(market.state.units, market.state.version);
  }, [status, market.state]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  /* -------------------------------------------------------------- el motor */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !city.tiles) return;
    if (!hasWebgl()) {
      setStatus("no-webgl");
      return;
    }

    const engine = createCityEngine({
      container,
      tileUrl: city.tiles.url,
      center: [scene.center[0], scene.center[1]],
      radiusM: scene.coverage.circle.radiusM,
      fadeBandM: scene.coverage.fadeBandM,
      exaggeration: scene.verticalExaggeration.factor,
      waterLevelsM: scene.water.levelsM,
      fortresses: scene.fortresses,
      ships: scene.ships,
      traffic: scene.market,
      seed: scene.seed,
      detailZoom: scene.detailZoom,
      camera: {
        limits: {
          minDistance: scene.camera.minDistanceM,
          maxDistance: scene.camera.maxDistanceM,
          minPitchDeg: scene.camera.minPitchDeg,
          maxPitchDeg: scene.camera.maxPitchDeg,
          minHeight: scene.camera.minHeightM,
          panBelowDistance: scene.camera.panBelowDistanceM,
        },
        initial: {
          azimuthDeg: scene.camera.initialAzimuthDeg,
          pitchDeg: scene.camera.initialPitchDeg,
          distance: scene.camera.initialDistanceM,
        },
        rotationSeconds: scene.camera.rotationSeconds,
        idleReturnMs: scene.camera.idleReturnMs,
        returnDurationMs: scene.camera.returnDurationMs,
      },
      clouds: scene.clouds,
      trees: scene.trees,
      landmarks: scene.landmarks,
      heightOverrides: scene.heightOverrides,
      shadows: scene.shadows,
      onPhase: (phase, progress) => {
        setPhases((current) => ({
          ...current,
          [phase]: { done: progress.done, total: progress.total, note: progress.note ?? "" },
        }));
        if (phase === "fotograma") setStatus("ready");
      },
      onSelect: (record) => {
        setSelected(record);
        if (record) setSelectedAd(null);
      },
      onSelectParcel: (parcel) => {
        setSelectedParcel(parcel);
        if (parcel) setSelectedAd(null);
      },
      onHover: () => undefined,
      onHoverUnit: (unitId) => setHoverUnit(unitId),
      onSelectAd: (unitId) => {
        setSelectedAd(unitId);
        if (unitId) {
          setSelected(null);
          setSelectedParcel(null);
        }
      },
      onStats: () => undefined,
      onContextLost: () => setStatus("context-lost"),
    });
    engineRef.current = engine;

    // Si el motor no arranca, deja el motivo escrito: una pantalla en blanco sin
    // explicación es indistinguible de «no hay datos».
    const guard = window.setTimeout(() => {
      const error = container.dataset.islandError;
      if (error) {
        setErrorMessage(error);
        setStatus("error");
      }
    }, 12000);

    return () => {
      window.clearTimeout(guard);
      engine.dispose();
      engineRef.current = null;
    };
  }, [city, scene]);

  const toggleRotation = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const next = !engine.isManuallyPaused();
    engine.setManuallyPaused(next);
    setManualPause(next);
  }, []);

  const resetView = useCallback(() => {
    engineRef.current?.requestHome();
    setSelected(null);
    setSelectedParcel(null);
    setSelectedAd(null);
  }, []);

  const closeSelection = useCallback(() => {
    engineRef.current?.select(null);
    setSelected(null);
    setSelectedParcel(null);
    setSelectedAd(null);
  }, []);

  // Escape también cierra la ficha en React (el motor deselecciona por su lado).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setSelectedParcel(null);
        setSelectedAd(null);
        setStudioUnit(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ------------------------------------------- enlace directo (?unit=…) */
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (status !== "ready" || deepLinkHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const unitId = params.get("unit");
    if (!unitId || params.get("checkout")) return;
    // Un frame después de «ready» para que el motor ya tenga edificios, parcelas y tráfico.
    const frame = window.requestAnimationFrame(() => {
      deepLinkHandled.current = true;
      engineRef.current?.flyToUnit(unitId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [status]);

  /* ------------------------------------------- vuelta de Stripe (?checkout=…) */
  const returnHandled = useRef(false);
  useEffect(() => {
    if (status !== "ready" || returnHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (!outcome) return;
    returnHandled.current = true;
    const sessionId = params.get("session_id");
    const unitId = params.get("unit");
    const next = new URL(window.location.href);
    for (const key of ["checkout", "session_id", "unit"]) next.searchParams.delete(key);
    window.history.replaceState(null, "", next.toString());
    if (outcome === "success" && sessionId) {
      void confirmCheckout(sessionId)
        .then(async (result) => {
          await market.refresh();
          setNotice({
            kind: "ok",
            text: result.unit.owner ? `Ya es tuyo: «${result.unit.owner.name}» luce en la ciudad.` : "Pago recibido.",
          });
          engineRef.current?.selectUnit(unitId ?? result.unit.id);
        })
        .catch((failure: unknown) =>
          setNotice({ kind: "warn", text: failure instanceof Error ? failure.message : "No se pudo confirmar el pago." }),
        );
    } else if (outcome === "cancelled") {
      setNotice({ kind: "warn", text: "Pago cancelado. No se ha cobrado nada." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const unitOfSelected = selected ? (engineRef.current?.unitIdOfBuilding(selected.id) ?? null) : null;
  const slot = (unitId: string) => ({
    unitId,
    view: market.unit(unitId),
    purchasesEnabled: market.purchasesEnabled,
    onBuy: () => setStudioUnit(unitId),
  });
  // Con identidad estable: el estudio reconstruye su escena 3D si el modelo cambia.
  const studioModel = useMemo(
    () => (studioUnit ? (engineRef.current?.studioModel(studioUnit) ?? null) : null),
    [studioUnit],
  );
  const studioView: UnitView | null = studioUnit ? market.unit(studioUnit) : null;
  const studioLabel = studioUnit ? unitLabel(studioUnit, { building: selected, parcel: selectedParcel }) : "";
  const hoverView = hoverUnit && !studioUnit ? market.unit(hoverUnit) : null;
  const hoverLabel = hoverUnit ? unitLabel(hoverUnit, { building: null, parcel: null }) : "";
  // Espacio seleccionado (edificio, local o anuncio móvil), para el panel del anunciante de la derecha.
  const selectedUnitId = unitOfSelected ?? (selectedParcel ? `p:${selectedParcel.id}` : selectedAd);
  const selectedView = selectedUnitId ? market.unit(selectedUnitId) : null;
  // A la derecha: el anunciante del espacio bajo el ratón (si está comprado) o, si no, el del seleccionado.
  const sideUnit = hoverView?.owned && hoverUnit ? hoverUnit : selectedView?.owned && selectedUnitId ? selectedUnitId : null;
  const sideView = sideUnit ? market.unit(sideUnit) : null;
  const sideLabel = sideUnit ? unitLabel(sideUnit, { building: sideUnit === selectedUnitId ? selected : null, parcel: sideUnit === selectedUnitId ? selectedParcel : null }) : "";

  const phasesDone = PHASE_IDS.filter((id) => phases[id].done > 0).length;
  const dataPhase = phases.datos;

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label={`Ciudad de ${city.name} en 3D. Flechas para orbitar, más y menos para acercar, cero o Inicio para la vista inicial, Escape para cerrar la ficha.`}
        className="h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
        data-island={city.slug}
      />

      {/* ------------------------------------------------------- carga por fases */}
      {status === "loading" ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-[#385070] py-6">
          <div className="w-[min(28rem,calc(100%-2rem))] rounded-3xl border border-line-strong bg-surface/90 p-5 shadow-[var(--shadow-float)] backdrop-blur-md">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-subtle">
              {city.name} · {city.tiles?.dataVersion ?? "sin versión"}
            </p>
            <h1 className="display-face mt-2 text-2xl font-semibold tracking-[-0.02em] text-ink">
              Levantando la ciudad
            </h1>
            <ol className="mt-4 space-y-2" aria-live="polite">
              {PHASE_IDS.map((id) => {
                const phase = phases[id];
                const complete = phase.done > 0 && phase.done >= phase.total;
                return (
                  <li key={id} className="flex items-start gap-2.5 text-sm">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-[6px] inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                        complete ? "bg-available" : "bg-line-strong",
                      )}
                    />
                    <span className="flex-1">
                      <span className={complete ? "text-ink" : "text-muted"}>
                        {PHASE_LABELS[id]}
                      </span>
                      {phase.note ? (
                        <span className="block font-mono text-[11px] text-subtle">
                          {phase.note}
                          {id === "datos" && phase.total > 1
                            ? ` · ${phase.done}/${phase.total} teselas`
                            : ""}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
            {/* Porcentaje solo donde es medible: las teselas leídas sobre las
                que hacen falta. El resto de fases no tiene una cuenta real. */}
            {dataPhase.total > 1 ? (
              <div
                className="mt-4 h-1 w-full overflow-hidden rounded-full bg-sunken"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={dataPhase.total}
                aria-valuenow={dataPhase.done}
                aria-label="Teselas de datos leídas"
              >
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{ width: `${(dataPhase.done / dataPhase.total) * 100}%` }}
                />
              </div>
            ) : null}
            <p className="mt-3 text-xs text-muted">
              {phasesDone}/{PHASE_IDS.length} fases
            </p>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ controles */}
      <Link
        href={`/city/${city.slug}`}
        aria-label={`Volver a la ficha de ${city.name}`}
        className="absolute left-3 top-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-surface/85 text-ink shadow-[var(--shadow-float)] backdrop-blur-md transition-colors hover:bg-sunken"
      >
        <ArrowLeft size={16} strokeWidth={1.9} aria-hidden="true" />
      </Link>

      <div className="absolute right-3 top-3 z-20 flex items-start gap-2">
        {!reduceMotion ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={toggleRotation}
            aria-pressed={manualPause}
            aria-label={manualPause ? "Reanudar el giro" : "Pausar el giro"}
            title={manualPause ? "Reanudar el giro" : "Pausar el giro"}
            className="bg-surface/85 shadow-[var(--shadow-float)] backdrop-blur-md"
          >
            {manualPause ? (
              <Play size={14} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Pause size={14} strokeWidth={2} aria-hidden="true" />
            )}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          onClick={resetView}
          title="Vista inicial (0)"
          className="bg-surface/85 shadow-[var(--shadow-float)] backdrop-blur-md"
        >
          <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
          Vista inicial
        </Button>
      </div>

      {status === "ready" ? <RankingDock onGo={(unitId) => engineRef.current?.flyToUnit(unitId) ?? false} /> : null}

      {selected ? (
        <BuildingPanel
          record={selected}
          market={unitOfSelected ? slot(unitOfSelected) : null}
          onClose={closeSelection}
        />
      ) : null}
      {selectedParcel ? (
        <ParcelPanel parcel={selectedParcel} market={slot(`p:${selectedParcel.id}`)} onClose={closeSelection} />
      ) : null}
      {selectedAd ? (
        <AdPanel
          unitId={selectedAd}
          label={unitLabel(selectedAd, { building: null, parcel: null })}
          view={market.unit(selectedAd)}
          purchasesEnabled={market.purchasesEnabled}
          onBuy={() => setStudioUnit(selectedAd)}
          onClose={closeSelection}
        />
      ) : null}

      {/* Libre: aviso junto al cursor con su precio. Comprado: panel del anunciante a la derecha. */}
      {hoverView && hoverUnit && !hoverView.owned ? <UnitTooltip unitId={hoverUnit} label={hoverLabel} view={hoverView} /> : null}
      {sideUnit && sideView ? <OwnerSidePanel unitId={sideUnit} label={sideLabel} view={sideView} /> : null}

      {notice ? (
        <p
          role="status"
          className={cn(
            "stamp-in absolute left-1/2 top-3 z-40 max-w-[min(28rem,calc(100%-6rem))] -translate-x-1/2 rounded-md border bg-surface px-3 py-2 text-sm text-ink shadow-[var(--shadow-float)]",
            notice.kind === "ok" ? "border-available/50" : "border-premium/40",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      {studioUnit && studioModel && studioView ? (
        <PurchaseStudio
          unitId={studioUnit}
          label={studioLabel}
          view={studioView}
          model={studioModel}
          returnPath={`/city/${city.slug}/viewer`}
          onClose={() => setStudioUnit(null)}
        />
      ) : null}

      <AttributionButton attributions={city.attributions} />

      {status === "no-webgl" ? (
        <Fallback
          title="Tu navegador no puede mostrar la ciudad en 3D"
          body="La ciudad se dibuja con WebGL y este navegador no lo ofrece. Toda la información —cobertura, fuentes, alturas y estado de los datos— está en la ficha de la ciudad, que no depende del 3D."
          icon={<Layers size={22} strokeWidth={1.6} />}
        />
      ) : null}

      {status === "context-lost" ? (
        <Fallback
          title="Se ha perdido el contexto gráfico"
          body="El sistema ha retirado la memoria de la tarjeta gráfica. Puedes recuperar la ciudad sin salir de la página."
          icon={<Compass size={22} strokeWidth={1.6} />}
          action={
            <Button variant="primary" onClick={() => window.location.reload()}>
              Recuperar la ciudad
            </Button>
          }
        />
      ) : null}

      {status === "error" ? (
        <Fallback
          title="No hemos podido construir la ciudad"
          body={
            errorMessage
              ? `Detalle técnico: ${errorMessage}`
              : "Puede ser un problema de conexión con el paquete de datos."
          }
          icon={<TriangleAlert size={22} strokeWidth={1.6} />}
          action={
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reintentar
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

function Fallback({
  title,
  body,
  icon,
  action,
}: {
  title: string;
  body: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-ivory/97 px-4">
      <div className="max-w-md">
        <span className="text-premium" aria-hidden="true">
          {icon}
        </span>
        <h2 className="display-face mt-3 text-xl font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {action}
          <a
            href="/"
            className="inline-flex h-8 items-center rounded-sm border border-line-strong bg-surface px-2.5 text-sm text-ink hover:bg-sunken"
          >
            <Compass size={14} strokeWidth={2} aria-hidden="true" className="mr-1.5" />
            Volver al catálogo
          </a>
        </div>
      </div>
    </div>
  );
}
