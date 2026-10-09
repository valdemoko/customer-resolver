import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { TopBar } from "@/components/layout/TopBar";
import { legalEntity } from "@/lib/legal-entity";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Cómo contactar con Resolveo: dudas, reclamaciones, contenidos y derechos de privacidad.",
  alternates: { canonical: "/contacto" },
};

const TOPICS: ReadonlyArray<{ title: string; text: string }> = [
  { title: "Dudas sobre una compra", text: "Indica el correo con el que pagaste, el espacio (puedes pegar su enlace) y la fecha." },
  { title: "Un contenido que incumple las normas", text: "Pega el enlace del espacio y cuéntanos qué incumple. Lo revisamos con prontitud." },
  { title: "Tus datos personales", text: "Acceso, rectificación, supresión u oposición: dinos qué derecho quieres ejercer." },
  { title: "Un fallo del mapa o de la web", text: "Cuéntanos qué hacías, en qué dispositivo y navegador, y qué esperabas ver." },
];

export default function ContactPage() {
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6">
        <h1 className="display-face text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">Contacto</h1>
        <p className="mt-4 max-w-[60ch] text-base text-muted">Escríbenos y te respondemos por correo.</p>

        <div className="mt-8">
          {legalEntity.email ? (
            <a
              href={`mailto:${legalEntity.email}`}
              className="btn-sweep inline-flex h-12 items-center gap-3 rounded-full border border-accent/50 bg-accent/10 px-6 text-base font-medium text-accent-ink"
            >
              <Mail size={18} strokeWidth={1.9} aria-hidden="true" />
              {legalEntity.email}
            </a>
          ) : (
            <p className="rounded-2xl border border-dashed border-line-strong px-5 py-4 text-sm text-muted">
              El correo de contacto se publicará aquí muy pronto.
            </p>
          )}
        </div>

        <h2 className="display-face mt-12 text-xl font-medium tracking-[-0.02em] text-ink">Qué incluir según el motivo</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {TOPICS.map((topic) => (
            <li key={topic.title} className="rounded-3xl border border-line p-5">
              <p className="text-[0.95rem] font-medium text-ink">{topic.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{topic.text}</p>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-sm text-muted">
          Antes de escribir, quizá te ayude la página de{" "}
          <Link href="/preguntas-frecuentes" className="underline underline-offset-2 hover:text-ink">
            preguntas frecuentes
          </Link>
          . Recuerda que las compras no tienen devolución; consulta los casos excepcionales en{" "}
          <Link href="/legal/pagos-y-devoluciones" className="underline underline-offset-2 hover:text-ink">
            Pagos y sin devoluciones
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
