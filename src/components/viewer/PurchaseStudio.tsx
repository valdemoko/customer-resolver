"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Lock, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { dataUrlBytes, downscaleImage, startCheckout } from "@/lib/market/client";
import type { ImagePreset } from "@/lib/market/client";
import { unitHasRoof } from "@/lib/market/faces";
import { formatCents, nextPriceCents } from "@/lib/money";
import { FaceStage } from "@/lib/market/stage";
import type { Content, Framing, UnitView } from "@/lib/market/types";
import { DEFAULT_FRAMING, LIMITS } from "@/lib/market/types";
import type { FaceModel } from "@/lib/scene/ads";

const kB = (dataUrl: string) => `${Math.max(1, Math.round(dataUrlBytes(dataUrl) / 1000))} kB`;

/** Selector de una imagen: vista previa, peso tras comprimir y quitar. */
function ImageSlot({
  title,
  hint,
  value,
  busy,
  onPick,
  onClear,
  size = 64,
}: {
  readonly title: string;
  readonly hint: string;
  readonly value: string;
  readonly busy: boolean;
  readonly onPick: (file: File | undefined) => void;
  readonly onClear: () => void;
  readonly size?: number;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-sunken/40 p-3">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={`Vista previa: ${title}`} width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-xl border border-line object-cover" />
      ) : (
        <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-xl border border-dashed border-line-strong text-subtle">
          <ImagePlus size={20} aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-ink">{title}</p>
        <p className="text-xs text-muted">{value ? `Comprimida a ${kB(value)}` : hint}</p>
        <div className="mt-1.5 flex items-center gap-3">
          <label className="cursor-pointer text-sm font-medium text-accent-ink underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
            {busy ? "Comprimiendo…" : value ? "Cambiar" : "Elegir imagen"}
            <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(event) => onPick(event.target.files?.[0])} />
          </label>
          {value ? (
            <button type="button" onClick={onClear} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
              <Trash2 size={12} aria-hidden="true" /> Quitar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Un control deslizante con etiqueta y extremos legibles (izquierda ↔ derecha…). */
function Slider({
  label,
  low,
  high,
  value,
  min,
  max,
  step,
  onChange,
}: {
  readonly label: string;
  readonly low: string;
  readonly high: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs text-muted">
        <span className="font-medium text-ink">{label}</span>
        <span className="flex gap-2">
          <span>{low}</span>
          <span aria-hidden="true">·</span>
          <span>{high}</span>
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        className="mt-1.5 h-2 w-full cursor-pointer accent-[var(--c-accent)]"
      />
    </label>
  );
}

/** Encuadre de la foto: ampliar y moverla a izquierda/derecha y arriba/abajo. Se ve al instante en el modelo 3D. */
function FramingControls({ framing, onChange }: { readonly framing: Framing; readonly onChange: (framing: Framing) => void }) {
  const changed = framing.x !== 0.5 || framing.y !== 0.5 || framing.zoom !== 1;
  return (
    <fieldset className="space-y-3 rounded-2xl border border-line bg-sunken/40 p-3.5">
      <legend className="sr-only">Encuadre de la foto</legend>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">Encuadre de la foto</p>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FRAMING)}
          disabled={!changed}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          <RotateCcw size={12} aria-hidden="true" /> Centrar
        </button>
      </div>
      <Slider label="Ampliar" low="Entera" high="Más cerca" min={1} max={3} step={0.05} value={framing.zoom} onChange={(zoom) => onChange({ ...framing, zoom })} />
      <Slider label="Mover" low="Izquierda" high="Derecha" min={0} max={1} step={0.01} value={framing.x} onChange={(x) => onChange({ ...framing, x })} />
      <Slider label="Subir o bajar" low="Arriba" high="Abajo" min={0} max={1} step={0.01} value={framing.y} onChange={(y) => onChange({ ...framing, y })} />
      <p className="text-xs text-muted">Amplía para poder mover la foto. El mismo encuadre vale para la fachada, el techo y los paneles.</p>
    </fieldset>
  );
}

/**
 * Estudio de compra: el comprador ve su espacio en 3D, carga UNA foto (hace de
 * logo, de fachada en todas las caras y de techo, así pesa poco), rellena su ficha
 * y paga con Stripe. Las fotos se comprimen en el navegador antes
 * de enviarse. El precio que se enseña es una vista previa: el que se cobra lo
 * calcula el servidor.
 */
export function PurchaseStudio({
  unitId,
  label,
  view,
  model,
  returnPath,
  onClose,
}: {
  unitId: string;
  label: string;
  view: UnitView;
  model: FaceModel;
  returnPath: string;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<FaceStage | null>(null);
  const firstField = useRef<HTMLInputElement | null>(null);
  const framingRef = useRef<Framing>(DEFAULT_FRAMING);

  const flat = !model.footprint;
  const hasRoof = !flat && unitHasRoof(unitId);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  // Una sola foto por espacio: hace de logo, de fachada (repetida en todas las caras) y de techo.
  const [photo, setPhoto] = useState("");
  const [framing, setFraming] = useState<Framing>(DEFAULT_FRAMING);
  const [working, setWorking] = useState<ImagePreset | null>(null);
  const [accepted, setAccepted] = useState(false);
  // Cuenta de Google (opcional): si hay sesión, la compra queda guardada en «Mi cuenta».
  const [account, setAccount] = useState<{ name: string } | null | undefined>(undefined);
  const [authEnabled, setAuthEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { user: { name: string } | null; enabled: boolean } | null) => {
        if (!alive) return;
        setAccount(data?.user ?? null);
        setAuthEnabled(Boolean(data?.enabled));
      })
      .catch(() => alive && setAccount(null));
    return () => {
      alive = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = formatCents(view.priceCents);
  const following = formatCents(nextPriceCents(view.priceCents));

  /* ------------------------------------------------------------- escenario */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stage: FaceStage;
    try {
      stage = new FaceStage(
        canvas,
        { faces: model.faces, bottomM: model.bottomM, topM: model.topM, footprint: model.footprint, flat },
        { reduceMotion: reduce },
      );
    } catch {
      setError("Tu navegador no puede mostrar el modelo 3D, pero puedes rellenar el anuncio igualmente.");
      return;
    }
    stageRef.current = stage;
    stage.setFraming(framingRef.current);
    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, [model, flat]);

  useEffect(() => {
    framingRef.current = framing;
    stageRef.current?.setFraming(framing);
  }, [framing]);

  useEffect(() => {
    // La misma foto en la fachada y en el techo.
    stageRef.current?.setImages(photo || null, photo && hasRoof ? photo : null);
  }, [photo, hasRoof]);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  /* --------------------------------------------------------------- imágenes */
  const pick = useCallback(async (file: File | undefined, preset: ImagePreset, set: (value: string) => void) => {
    if (!file) return;
    setError(null);
    setWorking(preset);
    try {
      set(await downscaleImage(file, preset));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo leer la imagen.");
    } finally {
      setWorking(null);
    }
  }, []);

  const totalBytes = photo ? dataUrlBytes(photo) : 0;

  const content: Content = useMemo(
    () => ({
      name: name.trim(),
      url: url.trim(),
      description: description.trim(),
      logo: "",
      // Una sola foto guardada una sola vez: el servidor y el visor la usan de logo, fachada y techo.
      sameForAll: Boolean(photo), // sin foto no hay imagen común: el servidor la exige solo si se declara
      images: photo ? { all: photo } : {},
      framing,
    }),
    [name, url, description, photo, framing],
  );

  const problem =
    name.trim().length < 2
      ? "Escribe el nombre que verá la gente."
      : url.trim() !== "" && !/^https?:\/\/\S+$/i.test(url.trim())
        ? "La web debe empezar por http:// o https://"
        : !accepted
          ? "Marca que aceptas que el anuncio sea público."
          : null;

  async function pay() {
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await startCheckout({ unitId, unitLabel: label, content, returnPath });
      window.location.assign(result.url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo iniciar el pago.");
      setBusy(false);
    }
  }

  const field =
    "mt-1 h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base text-ink outline-none transition-colors focus:border-accent/70 focus:ring-2 focus:ring-accent/20";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Comprar ${label}`}
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 p-0 backdrop-blur-[3px] sm:p-5"
    >
      <div className="owner-card flex h-full w-full max-w-6xl flex-col overflow-hidden border border-line-strong bg-surface shadow-[var(--shadow-float)] sm:rounded-3xl lg:flex-row">
        {/* ------------------------------------------------------ el modelo */}
        <section className="blueprint relative flex min-h-[34vh] flex-1 flex-col lg:min-h-0">
          <header className="flex items-start justify-between gap-3 p-5">
            <div>
              <p className="text-xs text-muted">Vista previa de tu anuncio</p>
              <h2 className="display-face text-2xl font-medium leading-tight tracking-[-0.02em] text-ink">{label}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Cerrar el estudio"
              className="rounded-full p-2 text-muted hover:bg-sunken hover:text-ink disabled:opacity-40 lg:hidden"
            >
              <X size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </header>
          <canvas ref={canvasRef} className="min-h-0 w-full flex-1 touch-none cursor-grab" aria-label="Modelo 3D de tu espacio. Arrastra para girar." />
          <p className="px-5 pb-4 text-xs text-muted">Arrastra para girar. Tu foto se repite en todas las caras y en el techo.</p>
        </section>

        {/* ----------------------------------------------------- el formulario */}
        <section className="flex w-full flex-col overflow-y-auto border-t border-line lg:w-[27rem] lg:border-l lg:border-t-0">
          <div className="hidden items-center justify-between p-5 pb-0 lg:flex">
            <p className="text-sm text-muted">Tu anuncio</p>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Cerrar el estudio"
              className="rounded-full p-2 text-muted hover:bg-sunken hover:text-ink disabled:opacity-40"
            >
              <X size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4 p-5">
            {account ? (
              <p className="rounded-2xl border border-line bg-sunken/40 px-3.5 py-2.5 text-xs text-muted">
                Comprando como <span className="font-medium text-ink">{account.name}</span>. La compra quedará en Mi cuenta.
              </p>
            ) : account === null && authEnabled ? (
              <p className="rounded-2xl border border-line bg-sunken/40 px-3.5 py-2.5 text-xs text-muted">
                Si quieres guardar esta compra en tu cuenta,{" "}
                <a
                  href={`/api/auth/google?next=${encodeURIComponent(`/city/malaga/viewer?unit=${unitId}`)}`}
                  className="font-medium text-accent-ink underline underline-offset-2"
                >
                  entra con Google
                </a>{" "}
                antes de rellenar el formulario. No es obligatorio.
              </p>
            ) : null}
            <label className="block text-sm">
              <span className="font-medium text-ink">Nombre del anunciante</span>
              <input ref={firstField} value={name} onChange={(event) => setName(event.target.value)} maxLength={LIMITS.name} autoComplete="organization" className={field} />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-ink">Tu web</span>
              <input value={url} onChange={(event) => setUrl(event.target.value)} inputMode="url" placeholder="https://" maxLength={LIMITS.url} className={field} />
            </label>

            <label className="block text-sm">
              <span className="flex justify-between font-medium text-ink">
                Descripción
                <span className="tnum font-normal text-subtle">
                  {description.length}/{LIMITS.description}
                </span>
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={LIMITS.description}
                rows={3}
                className="mt-1 w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-base text-ink outline-none transition-colors focus:border-accent/70 focus:ring-2 focus:ring-accent/20"
              />
            </label>

            <div className="space-y-2.5">
              <ImageSlot
                title="Cargar foto"
                hint={hasRoof ? "Una sola foto: será tu logo, la fachada en todas las caras y el techo." : "Una sola foto: será tu logo y la imagen del anuncio."}
                value={photo}
                busy={working === "facade"}
                size={72}
                onPick={(file) => void pick(file, "facade", setPhoto)}
                onClear={() => {
                  setPhoto("");
                  setFraming(DEFAULT_FRAMING);
                }}
              />
              {totalBytes > 0 ? (
                <p className="px-1 text-xs text-muted">La foto se comprime en tu navegador antes de subirla: {Math.max(1, Math.round(totalBytes / 1000))} kB.</p>
              ) : null}
              {photo ? <FramingControls framing={framing} onChange={setFraming} /> : null}
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-[var(--c-accent)]" />
              <span className="text-muted">
                Acepto que mi nombre, descripción, web e imágenes sean públicos en el mapa, y que quien compre después este espacio sustituirá mi anuncio.
              </span>
            </label>
          </div>

          <div className="mt-auto border-t border-line bg-surface p-5">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-xs text-muted">Pago único</p>
                <p className="tnum font-mono text-3xl font-semibold leading-none text-ink">{price}</p>
              </div>
              <p className="max-w-[10rem] text-right text-xs text-muted">El siguiente comprador pagará {following}.</p>
            </div>
            {error ? (
              <p role="alert" className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}
            <Button variant="primary" className="h-12 w-full" onClick={() => void pay()} disabled={busy || working !== null}>
              <Lock size={15} strokeWidth={2} aria-hidden="true" />
              {busy ? "Abriendo Stripe…" : `Pagar ${price} con Stripe`}
            </Button>
            <p className="mt-2 text-center text-xs text-subtle">El cobro lo gestiona Stripe. No guardamos datos de tu tarjeta.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
