# Informe — Fase A: fundación

Fecha: 2026-10-09 · Estado: **completa y verificada**

---

## 1. Qué se ha implementado

Identidad visual, sistema de diseño, catálogo de ciudades, configuración de
ciudades, rutas y decisiones documentadas.

### Archivos creados

| Archivo | Contenido |
| --- | --- |
| `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs` | Andamiaje: Next 16, TypeScript estricto, Tailwind 4, cabeceras de seguridad. |
| `src/app/globals.css` | Tokens del sistema de diseño y utilidades. |
| `src/app/layout.tsx` | Fuentes (Geist autoalojada + Fraunces), metadatos, `lang="es"`. |
| `src/app/page.tsx` | Portada = catálogo. Server Component. |
| `src/app/city/[slug]/page.tsx` | Ficha informativa indexable con contenido real. |
| `src/app/design/page.tsx` | Taller de diseño (solo desarrollo, `noindex`). |
| `src/app/error.tsx`, `src/app/not-found.tsx` | Estados de error diseñados. |
| `src/app/robots.ts`, `src/app/sitemap.ts` | SEO. |
| `src/app/como-funciona/page.tsx` | Explicación de fuentes, alturas y límites. |
| `src/app/cuenta/page.tsx` | Declara que el acceso aún no existe. |
| `src/app/legal/[slug]/page.tsx`, `src/lib/legal.ts` | Cuatro borradores legales marcados. |
| `src/lib/brand.ts` | Marca en un único punto. |
| `src/lib/cities/schema.ts` | Esquema Zod con las invariantes de honestidad. |
| `src/lib/cities/data/malaga.ts` | Configuración real de Málaga. |
| `src/lib/cities/registry.ts` | Registro que valida al importar. |
| `src/lib/money.ts` | Aritmética entera de céntimos. |
| `src/lib/search.ts` | Búsqueda sin acentos. |
| `src/lib/use-mounted.ts` | Evita desajustes de hidratación. |
| `src/stores/catalog.ts` | Estado de interfaz (búsqueda, filtro, orden, favoritos). |
| `src/components/**` | Wordmark, barra, buscador, tarjeta, miniatura, estados vacíos, esqueletos, botones, píldora de estado. |
| `docs/decisions.md` | Registro de decisiones. |

---

## 2. Pruebas ejecutadas

| Prueba | Comando | Resultado |
| --- | --- | --- |
| Tipos | `pnpm exec tsc --noEmit` | **0 errores**, con `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` y `verbatimModuleSyntax`. |
| Tests unitarios | `pnpm exec vitest run` | **32/32 en verde** (20 de dinero, 12 de invariantes del esquema). |
| Compilación | `pnpm exec next build` | Correcta. 13 páginas generadas; `/` dinámica, el resto estático o SSG. |
| Rutas en desarrollo | `curl` sobre 8 rutas | `/`, `/design`, `/city/malaga`, `/como-funciona`, `/legal/privacidad`, `/robots.txt`, `/sitemap.xml` → **200**; `/no-existe` → **404**. |
| Búsqueda instantánea | Navegador: escribir «lisboa» | 0 ciudades, estado «Sin resultados» con la consulta citada y botón de reinicio. |
| Favoritos | Navegador: clic real en la estrella | `aria-pressed=true`, etiqueta «Quitar Málaga de guardadas», contador en la barra `Guardadas: 1`, persistido en `localStorage`. |
| Filtro por guardadas | Navegador: clic en «Guardadas» | Filtra a 1 ciudad y muestra el aviso de almacenamiento local. |

### Defectos encontrados y corregidos durante la verificación

1. **Precio congelado en importes mínimos.** `nextPriceCents(1)` devolvía 1, así
   que revender no subía el precio. Corregido en la implementación con un suelo
   de +1 céntimo, y añadido test de regresión.
2. **Desbordamiento silencioso.** Al encadenar reventas se superaba el rango
   entero seguro. Ahora lanza `MoneyError` explícitamente.
3. **Glifos de estado como cajas.** `◐ ● ○` no existen en todas las fuentes del
   sistema. Sustituidos por SVG en línea, que además refuerzan la distinción por
   forma que exige WCAG 1.4.1.
4. **Botón de guardar inalcanzable con el puntero.** El bloque de texto de la
   miniatura lo cubría con `z-index` superior. Un `click()` programático sí
   funcionaba, por lo que ni la compilación ni los tests lo detectaban: se
   encontró usando el navegador de verdad.
5. **Carrera en la rehidratación de favoritos.** Rehidratar desde un
   `useEffect` podía pisar un favorito recién marcado con el estado vacío del
   almacenamiento. La rehidratación se lanza ahora al evaluar el módulo.
6. **Build roto sin variables de entorno.** `appOrigin()` lanzaba en producción y
   impedía compilar. Se separa el valor por defecto (`appOrigin()`) del valor
   obligatorio (`requireAppOrigin()`), que se usará solo donde un origen
   equivocado es un fallo de seguridad.

---

## 3. Cumplimiento de los criterios de esta fase

| Criterio pedido | Estado |
| --- | --- |
| La portada es el catálogo, sin landing ni marketing | Hecho |
| Búsqueda instantánea por ciudad y país | Hecho, sin recargar |
| Filtro por disponibles y por guardadas | Hecho |
| Orden alfabético | Hecho. El orden por popularidad **no** existe: no hay dato verificable que lo sostenga. |
| Favoritos | Hecho con `localStorage` mientras no hay sesión, y declarado como tal |
| Estados: carga, vacío, error con reintento, sin resultados, en preparación, no disponible | Hecho y revisable en `/design` |
| Málaga como primera ciudad | Hecho, con coordenadas, límites de cámara y zonas reales |
| Añadir una ciudad = datos + registro | Hecho: un archivo en `src/lib/cities/data/` y una línea en el registro |
| Miniatura desde la propia escena, no de stock | Hecho: la tarjeta declara «Vista 3D sin publicar» en lugar de usar una foto |
| Primera página sin JavaScript del mapa | Hecho: el visor no se importa en la portada |
| Página `/design` con todos los componentes y estados, `noindex`, solo desarrollo | Hecho |
| Borradores legales marcados para revisión | Hecho: cuatro documentos con preguntas abiertas explícitas |

---

## 4. Lo que **no** está hecho, dicho sin rodeos

- **La Fase A no tiene mediciones de rendimiento.** Los presupuestos de la
  sección 12 (LCP < 2,0 s, CLS < 0,05, JS inicial < 150 kB) son objetivos
  declarados, no resultados medidos. Falta ejecutar Lighthouse y Web Vitals
  sobre un build de producción servido de verdad. Sin esos números, la palabra
  «optimizado» no se usa en ningún sitio de este repositorio.
- **El visor 3D no existe todavía.** No hay MapLibre ni Three.js en el proyecto.
  La ruta `/city/malaga/viewer` se menciona en la ficha pero solo se enlaza si la
  ciudad está publicada; hoy no lo está, así que no hay enlace roto.
- **No hay base de datos.** No hay esquema, ni migraciones, ni PostGIS. Nada de
  la Fase D está empezado salvo el módulo de precios.
- **No hay autenticación.** `/cuenta` lo declara en lugar de simular un login.
- **No hay capa de pagos.** Existe el interruptor `PURCHASES_ENABLED` y la
  decisión de que no habrá modo simulado, pero no hay módulo `payments/`, ni
  rutas de Checkout, ni verificación de firma de webhook.
- **No hay parcelas.** Ni datos, ni script de administrador, ni consulta espacial.
- **La ficha de ciudad calcula la extensión en km con una aproximación** de
  grados a kilómetros por latitud. Es suficientemente buena para una etiqueta
  informativa, no para medir.

---

## 5. Dependencias externas que hacen falta para continuar

| Necesidad | Para qué | ¿Bloquea? |
| --- | --- | --- |
| Decisión de alojamiento (Vercel / Cloudflare con adaptador verificado) | Despliegue | Bloquea el despliegue, no el desarrollo |
| PostgreSQL con PostGIS | Fase D | Sí, para la Fase D |
| Java 21+ **o** autorización para el pipeline en Node | Fase B (PMTiles) | Sí, para la Fase B |
| Cuenta de Stripe **no** necesaria todavía | La capa de pagos se construye y se prueba sin claves | No |
| Lectura manual del PDF de licencia del Catastro | Publicar atribuciones correctas | Sí, antes de publicar Málaga |
