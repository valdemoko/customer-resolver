import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { TopBar } from "@/components/layout/TopBar";
import { isAdminEmail } from "@/lib/admin/auth";
import { authConfigured } from "@/lib/auth/google";
import { currentUser } from "@/lib/auth/server";
import { formatCents } from "@/lib/money";
import { getUserPurchases } from "@/lib/market/service";
import { publicUnitLabel } from "@/lib/market/label";
import { buildingNameOf } from "@/lib/market/units";

export const metadata: Metadata = {
  title: "Mi cuenta",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  cancelado: "Has cancelado el acceso con Google. Puedes volver a intentarlo cuando quieras.",
  estado: "La sesión de acceso caducó. Vuelve a pulsar el botón.",
  google: "Google no ha podido confirmar tu cuenta. Inténtalo de nuevo en un momento.",
  suspendida: "Esta cuenta está suspendida. Si crees que es un error, escribe al correo de contacto.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Mi cuenta. Sin sesión: un único botón de Google. Con sesión: quién eres y los
 * espacios que has comprado estando conectado, con enlace directo para verlos en el mapa.
 */
export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const user = await currentUser();
  let purchases: Awaited<ReturnType<typeof getUserPurchases>> = [];
  let storeError = false;
  if (user) {
    try {
      purchases = await getUserPurchases(user.id, user.email);
    } catch {
      storeError = true;
    }
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-14 sm:px-6">
        {!user ? (
          <section aria-labelledby="acceso-titulo">
            <h1 id="acceso-titulo" className="display-face text-[2.6rem] font-medium leading-[1.05] tracking-[-0.03em] text-ink">
              Entra para guardar tus compras
            </h1>
            <p className="mt-4 max-w-[34rem] text-base leading-relaxed text-muted">
              Con tu cuenta de Google, los espacios que compres quedan guardados aquí y puedes volver a verlos en el mapa cuando quieras. No hace falta cuenta para comprar y no guardamos ninguna contraseña.
            </p>
            {error ? (
              <p role="alert" className="mt-6 rounded-2xl border border-[#d98a6c]/40 bg-[#d98a6c]/10 px-4 py-3 text-sm text-ink">
                {error}
              </p>
            ) : null}
            <div className="mt-8">
              {authConfigured() ? (
                <GoogleButton next="/cuenta" />
              ) : (
                <p className="text-sm text-muted">El acceso con Google aún no está disponible.</p>
              )}
            </div>
          </section>
        ) : (
          <section aria-labelledby="cuenta-titulo">
            <div className="flex items-center gap-4">
              {user.picture ? (
                // Foto de perfil de Google: URL externa, sin optimizador.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-full" />
              ) : null}
              <div className="min-w-0">
                <h1 id="cuenta-titulo" className="display-face truncate text-[1.9rem] font-medium leading-tight tracking-[-0.02em] text-ink">
                  {user.name}
                </h1>
                <p className="truncate text-sm text-muted">{user.email}</p>
              </div>
              <div className="ml-auto shrink-0">
                <LogoutButton />
              </div>
            </div>

            {isAdminEmail(user.email) ? (
              <Link
                href="/admin"
                className="btn-sweep mt-8 inline-flex h-11 items-center gap-2 rounded-full border border-accent/60 bg-accent/10 px-5 text-sm font-medium text-accent-ink"
              >
                <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />
                Ir al panel de administración
              </Link>
            ) : null}

            <h2 className="display-face mt-12 text-xl font-medium tracking-[-0.02em] text-ink">Tus espacios</h2>
            {storeError ? (
              <p className="mt-4 text-sm text-muted">No se pudieron cargar tus compras ahora mismo. Recarga la página en unos segundos.</p>
            ) : purchases.length === 0 ? (
              <div className="mt-4 rounded-3xl border border-dashed border-line-strong p-6">
                <p className="text-sm text-muted">
                  Todavía no has comprado ningún espacio con esta cuenta. Cuando compres uno conectado, aparecerá aquí.
                </p>
                <Link
                  href="/city/malaga/viewer"
                  className="btn-sweep mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-accent/50 px-4 text-sm font-medium text-accent-ink"
                >
                  Explorar Málaga en 3D
                  <ArrowUpRight size={14} strokeWidth={2.2} aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {purchases.map((purchase) => (
                  <li key={`${purchase.unitId}-${purchase.createdAt}`} className="relative rounded-2xl border border-line bg-surface/60 px-4 py-3 transition-colors hover:border-line-strong">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{purchase.name}</p>
                        <p className="truncate text-xs text-subtle">
                          {publicUnitLabel(purchase.unitId, buildingNameOf)} · {new Date(purchase.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tnum font-mono text-sm text-ink">{formatCents(purchase.amountCents)}</p>
                        <p className={`text-xs ${purchase.current ? "text-accent-ink" : "text-subtle"}`}>{purchase.current ? "Es tuyo ahora" : "Otra persona lo compró después"}</p>
                      </div>
                      <ArrowUpRight size={14} strokeWidth={2.2} aria-hidden="true" className="shrink-0 text-subtle" />
                    </div>
                    <Link
                      href={`/city/malaga/viewer?unit=${encodeURIComponent(purchase.unitId)}`}
                      aria-label={`Ver ${purchase.name} en el mapa`}
                      className="absolute inset-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
