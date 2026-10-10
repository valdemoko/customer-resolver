import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Wordmark } from "@/components/brand/Wordmark";
import { isAdminEmail } from "@/lib/admin/auth";
import { authConfigured } from "@/lib/auth/google";
import { currentUser } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Panel de administración. Solo entran las cuentas de Google de `ADMIN_EMAILS`. La página decide aquí quién ve
 * qué, pero la seguridad real está en la API: cada lectura y cada acción vuelve a comprobar que eres administrador.
 */
export default async function AdminPage() {
  const user = await currentUser();
  const admin = user && isAdminEmail(user.email);

  if (admin) return <AdminPanel adminEmail={user.email} />;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" aria-label="Inicio" className="mb-10 inline-block">
        <Wordmark size="sm" />
      </Link>
      <ShieldAlert size={26} strokeWidth={1.6} aria-hidden="true" className="text-accent-ink" />
      <h1 className="display-face mt-4 text-[2.2rem] font-medium tracking-[-0.03em] text-ink">Administración</h1>
      {!user ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted">Entra con la cuenta de Google de administrador.</p>
          <div className="mt-6">{authConfigured() ? <GoogleButton next="/admin" /> : <p className="text-sm text-muted">El acceso con Google no está configurado.</p>}</div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            La cuenta <span className="font-medium text-ink">{user.email}</span> no tiene acceso a este panel.
          </p>
          <div className="mt-6">
            <LogoutButton />
          </div>
        </>
      )}
    </main>
  );
}
