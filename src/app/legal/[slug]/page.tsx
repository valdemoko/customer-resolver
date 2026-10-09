import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PenLine } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { getLegalDoc, legalDocs } from "@/lib/legal";
import { purchasesEnabled } from "@/lib/env";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return legalDocs.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const doc = getLegalDoc(slug);
  if (!doc) return { title: "Documento no encontrado" };
  return {
    title: doc.title,
    description: doc.summary,
    // Los borradores no se indexan: publicar un borrador en buscadores genera
    // obligaciones y expectativas que todavía no podemos cumplir.
    robots: { index: false, follow: false },
  };
}

/**
 * Los textos legales se sirven como BORRADORES visibles. No se presentan como
 * asesoramiento jurídico ni como documentos definitivos.
 */
export default async function LegalPage({ params }: { params: Params }) {
  const { slug } = await params;
  const doc = getLegalDoc(slug);
  if (!doc) notFound();

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft size={15} strokeWidth={1.9} aria-hidden="true" />
          Volver al catálogo
        </Link>

        <header className="mt-6 border-b border-line pb-6">
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-premium/35 bg-premium-soft px-2 py-[3px] text-xs font-medium text-premium">
            <PenLine size={12} strokeWidth={2} aria-hidden="true" />
            Borrador · pendiente de revisión profesional
          </span>
          <h1 className="display-face mt-4 text-3xl font-semibold tracking-[-0.03em] text-ink">
            {doc.title}
          </h1>
          <p className="mt-3 text-base text-muted">{doc.summary}</p>
        </header>

        <div className="mt-8 space-y-8">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-medium text-ink">{section.heading}</h2>
              <div className="mt-2 space-y-2">
                {section.body.map((paragraph, index) => (
                  <p key={index} className="text-sm leading-relaxed text-muted">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}

          <section className="rounded-md border border-premium/35 bg-premium-soft p-5">
            <h2 className="text-sm font-medium text-premium">
              Decisiones que solo puede cerrar la propiedad
            </h2>
            <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-premium/90">
              {doc.openQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </section>

          {!purchasesEnabled ? (
            <p className="border-t border-line pt-5 text-sm text-muted">
              Recordatorio: la contratación está desactivada. Las condiciones de contratación
              se publican únicamente como borrador a revisar.
            </p>
          ) : null}
        </div>
      </main>
    </>
  );
}
