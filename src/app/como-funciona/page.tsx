import type { Metadata } from "next";
import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description:
    "Cómo se construyen las ciudades en 3D, de dónde salen los datos, con qué licencias y qué limitaciones tiene el servicio.",
  alternates: { canonical: "/como-funciona" },
};

/**
 * Página explicativa. Su función es reducir expectativas mal calibradas:
 * explica de dónde salen los datos, qué se mide y qué no se promete.
 */
export default function HowItWorksPage() {
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6">
        <h1 className="display-face text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
          Cómo funciona
        </h1>
        <p className="mt-4 text-base text-muted">
          {brand.name} reconstruye centros urbanos en tres dimensiones a partir de cartografía
          pública y vende espacios publicitarios virtuales sobre esas geometrías.
        </p>

        <div className="mt-10 space-y-10">
          <Section title="De dónde salen las ciudades">
            <p>
              Cada ciudad se genera con un proceso reproducible: se descargan las huellas de los
              edificios y la red viaria de fuentes públicas, se fusionan con reglas explícitas de
              prioridad y se convierten en un paquete de teselas vectoriales que se sirve desde un
              CDN.
            </p>
            <p>
              Cada capa declara su fuente, su fecha de extracción y su licencia en la propia ficha
              de la ciudad. Las atribuciones obligatorias se muestran siempre, dentro del mapa y en
              la ficha.
            </p>
          </Section>

          <Section title="Alturas: reales frente a estimadas">
            <p>
              La altura de un edificio se toma de la fuente más fiable disponible en este orden:
              número de plantas del Catastro, altura declarada en OpenStreetMap, estimación a
              partir del número de plantas, y por último un valor por defecto. El origen de cada
              altura se conserva en el propio dato y el informe de calidad indica qué porcentaje
              es real y qué porcentaje es estimado.
            </p>
            <p>
              Los edificios singulares con modelado detallado se añadirán más adelante. Cuando no
              exista un modelo fiel de un edificio histórico, no se inventará una fachada y se
              presentará como réplica.
            </p>
          </Section>

          <Section title="Qué zona está cubierta y qué no">
            <p>
              La cobertura inicial es un área concreta del centro histórico, con coordenadas
              publicadas en la ficha de cada ciudad. No se afirma que la ciudad entera esté
              recreada: el visor indica en todo momento qué área tiene datos.
            </p>
          </Section>

          <Section title="Parcelas y precios">
            <p>
              Las ubicaciones publicitarias son espacios virtuales definidos sobre geometrías
              reales: fachadas, medianeras o superficies junto a una calle. Nunca atraviesan
              edificios ni bloquean la navegación.
            </p>
            <p>
              El precio se calcula en el servidor con aritmética entera de céntimos y queda
              registrado en un historial. Cuando una ubicación cambia de titular, el precio del
              siguiente titular se recalcula con una regla fija y publicada.
            </p>
          </Section>

          <Section title="Qué no es">
            <ul className="list-inside list-disc space-y-1.5">
              <li>No es una oferta inmobiliaria y no otorga derechos sobre bienes reales.</li>
              <li>No promete revalorización ni rentabilidad de ningún tipo.</li>
              <li>
                No es una réplica certificada de la realidad: es una reconstrucción a partir de
                datos públicos, con la precisión que esos datos permiten.
              </li>
            </ul>
          </Section>
        </div>

        <p className="mt-12 border-t border-line pt-6 text-sm text-muted">
          ¿Tienes una ciudad en mente? <Link href="/" className="text-accent underline underline-offset-2">Mira el catálogo</Link>.
        </p>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-medium text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}
