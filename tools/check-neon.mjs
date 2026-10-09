/**
 * Prueba de escritura REAL en Neon, con limpieza: usa el mismo `NeonStore` que la
 * web. Guarda una compra de prueba, comprueba que no se duplica si el aviso llega
 * dos veces (webhook + retorno del navegador), que las clasificaciones la ven y
 * que se puede volver a leer; después borra todo lo que creó.
 *
 *   node --experimental-transform-types tools/check-neon.mjs
 *
 * Lee `DATABASE_URL` de `.env.local` (solo esa línea) y no la imprime.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { NeonStore } from "../src/lib/market/store.ts";

const line = readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.startsWith("DATABASE_URL=")).pop();
if (!line) throw new Error("Falta DATABASE_URL en .env.local");
const sql = neon(line.slice("DATABASE_URL=".length));
const store = new NeonStore(sql);
const unit = "b:way/0000001";
const session = "cs_prueba_integracion_1";
const draft = "dr_prueba_integracion";
const content = { name: "Prueba de integración", url: "https://example.com", description: "borrar", logo: "", sameForAll: true, images: {} };
const results = [];
const check = (name, ok, extra) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} · ${name}`, extra ? JSON.stringify(extra) : "");
};
try {
  await store.saveDraft({ id: draft, unitId: unit, content, purchasesAtCreation: 0, createdAt: new Date().toISOString() });
  const first = await store.completePurchase({ sessionId: session, draftId: draft, amountCents: 100 });
  check("la compra se guarda y la unidad queda comprada", first?.applied === true && first.unit.purchases === 1, first && { applied: first.applied, purchases: first.unit.purchases });
  const again = await store.completePurchase({ sessionId: session, draftId: draft, amountCents: 100 });
  check("avisar dos veces de la misma sesión no la duplica (webhook + retorno)", again?.applied === false && again.unit.purchases === 1, again && { applied: again.applied, purchases: again.unit.purchases });
  const board = await store.leaderboards(15);
  check("las clasificaciones la reflejan", board.stats.purchases >= 1 && board.latest[0]?.unitId === unit && board.valuable.some((v) => v.unitId === unit), { purchases: board.stats.purchases, ultimo: board.latest[0]?.buyer });
  const read = await store.getUnit(unit);
  check("se puede volver a leer la unidad (persistencia)", read?.content?.name === "Prueba de integración", read && { purchases: read.purchases });
} finally {
  await sql`delete from market_purchases where session_id = ${session}`;
  await sql`delete from market_units where id = ${unit}`;
  await sql`delete from market_drafts where id = ${draft}`;
  const left = await sql`select (select count(*) from market_purchases)::int as compras, (select count(*) from market_units)::int as unidades, (select count(*) from market_drafts)::int as borradores`;
  console.log("tras limpiar:", JSON.stringify(left[0]));
}
process.exit(results.every(Boolean) ? 0 : 1);
