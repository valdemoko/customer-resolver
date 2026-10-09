import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { TopBar } from "@/components/layout/TopBar";
import { LEGAL_UPDATED } from "@/lib/legal-entity";
import { getLegalDoc, legalDocs } from "@/lib/legal";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return legalDocs.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const doc = getLegalDoc(slug);
  if (!doc) return { title: "Documento no encontrado" };
  return { title: doc.title, description: doc.summary, alternates: { canonical: `/legal/${doc.slug}` } };
}

/** Páginas legales: un documento, con su fecha de actualización y los demás a un clic. */
export default async function LegalPage({ params }: { params: Params }) {
  const { slug } = await params;
  const doc = getLegalDoc(slug);
  if (!doc) notFound();
  const others = legalDocs.filter((other) => other.slug !== doc.slug);

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} strokeWidth={1.9} aria-hidden="true" />
          Volver al inicio
        </Link>

        <header className="mt-6 border-b border-line pb-6">
          <h1 className="display-face text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">{doc.title}</h1>
          <p className="mt-3 text-base text-muted">{doc.summary}</p>
          <p className="mt-3 text-xs text-subtle">Última actualización: {LEGAL_UPDATED}</p>
        </header>

        <div className="mt-8 space-y-9">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="display-face text-lg font-medium tracking-[-0.01em] text-ink">{section.heading}</h2>
              <div className="mt-2.5 space-y-3">
                {section.body.map((paragraph, index) => (
                  <p key={index} className="max-w-[68ch] text-[0.95rem] leading-relaxed text-muted">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <nav aria-label="Otros documentos legales" className="mt-14 border-t border-line pt-6">
          <p className="text-sm text-subtle">Otros documentos</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {others.map((other) => (
              <li key={other.slug}>
                <Link
                  href={`/legal/${other.slug}`}
                  className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-sm text-muted transition-colors hover:border-accent/60 hover:text-ink"
                >
                  {other.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
      <SiteFooter />
    </>
  );
}
