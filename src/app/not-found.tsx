import { Compass } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <>
      <TopBar />
      <main className="mx-auto flex max-w-2xl flex-col items-start px-4 py-24 sm:px-6">
        <Compass size={30} strokeWidth={1.4} aria-hidden="true" className="text-subtle" />
        <h1 className="display-face mt-5 text-3xl font-semibold tracking-[-0.03em] text-ink">
          Aquí no hay ninguna calle
        </h1>
        <p className="mt-3 text-base text-muted">
          La página que buscas no existe o la ciudad todavía no está en el catálogo.
        </p>
        <ButtonLink href="/" variant="primary" className="mt-7">
          Ir al catálogo de ciudades
        </ButtonLink>
      </main>
    </>
  );
}
