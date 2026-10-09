/**
 * Prueba del webhook de Stripe contra el servidor indicado (por defecto, el entorno
 * local de Cloudflare en :8787), SIN cobrar nada:
 *   1. crea un borrador de prueba en Neon;
 *   2. firma con el secreto del webhook un evento `checkout.session.completed` falso
 *      (con la misma firma HMAC que usa Stripe);
 *   3. lo envía y comprueba que la compra se aplica una sola vez aunque el aviso llegue
 *      dos veces, y que una firma incorrecta se rechaza;
 *   4. borra todo lo que creó.
 *
 *   node tools/check-webhook.mjs [--url http://localhost:8787]
 *
 * Lee `.env.local` (solo DATABASE_URL y STRIPE_WEBHOOK_SECRET) y no los imprime.
 */
import { neon } from "@neondatabase/serverless";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const base = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : "http://localhost:8787";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const sql = neon(env.DATABASE_URL);
const secret = env.STRIPE_WEBHOOK_SECRET;
const unit = "a:plane-3";
const draftId = "dr_prueba_webhook";
const sessionId = "cs_live_prueba_webhook_1";
const results = [];
const check = (name, ok, extra) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} · ${name}`, extra ? JSON.stringify(extra) : "");
};

const event = {
  id: "evt_prueba_webhook",
  object: "event",
  type: "checkout.session.completed",
  data: { object: { id: sessionId, object: "checkout.session", payment_status: "paid", amount_total: 100, metadata: { draftId, unitId: unit } } },
};
const payload = JSON.stringify(event);
const sign = (key) => {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${createHmac("sha256", key).update(`${t}.${payload}`).digest("hex")}`;
};
const post = (signature) =>
  fetch(`${base}/api/market/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": signature }, body: payload });

try {
  await sql`insert into market_drafts (id, unit_id, content, purchases_at_creation, created_at)
    values (${draftId}, ${unit}, ${JSON.stringify({ name: "Prueba webhook", url: "", description: "", logo: "", sameForAll: true, images: {} })}::jsonb, 0, now())
    on conflict (id) do nothing`;
  const bad = await post(sign("whsec_clave_incorrecta"));
  check("una firma incorrecta se rechaza (400)", bad.status === 400, { status: bad.status });
  const first = await post(sign(secret));
  check("el evento firmado se acepta (200)", first.status === 200, { status: first.status, body: (await first.text()).slice(0, 80) });
  const unitRow = await sql`select purchases from market_units where id = ${unit}`;
  check("la compra se aplica: la unidad queda comprada una vez", unitRow[0]?.purchases === 1, unitRow[0]);
  const second = await post(sign(secret));
  const again = await sql`select purchases from market_units where id = ${unit}`;
  check("el mismo aviso otra vez no duplica la compra", second.status === 200 && again[0]?.purchases === 1, { status: second.status, purchases: again[0]?.purchases });
  const rows = await sql`select amount_cents from market_purchases where session_id = ${sessionId}`;
  check("queda un único registro de pago de 1,00 €", rows.length === 1 && rows[0].amount_cents === 100, rows);
} finally {
  await sql`delete from market_purchases where session_id = ${sessionId}`;
  await sql`delete from market_units where id = ${unit}`;
  await sql`delete from market_drafts where id = ${draftId}`;
  const left = await sql`select (select count(*) from market_purchases)::int as compras, (select count(*) from market_units)::int as unidades`;
  console.log("tras limpiar:", JSON.stringify(left[0]));
}
process.exit(results.every(Boolean) ? 0 : 1);
