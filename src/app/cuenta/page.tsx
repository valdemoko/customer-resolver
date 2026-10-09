import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = {
  title: "Acceso",
  robots: { index: false, follow: false },
};

/**
 * Sin autenticación todavía. En vez de un formulario que no hace nada, la
 * página declara el estado real y explica qué se guarda hoy y dónde.
 */
export default function AccountPage() {
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-16 sm:px-6">
        <EmptyState
          icon={<KeyRound size={28} strokeWidth={1.5} />}
          title="El acceso con cuenta todavía no está activo"
          description="Estamos preparando el inicio de sesión con enlace por correo y con Google. Hasta que exista, tus ciudades guardadas se almacenan solo en este navegador: no se envían a ningún servidor y desaparecen si borras los datos del navegador."
          className="items-start text-left"
        />
      </main>
    </>
  );
}
