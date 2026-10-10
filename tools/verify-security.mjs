/**
 * Pruebas de ATAQUE contra la API: ninguna debe permitir publicar o tocar un anuncio
 * sin haber pagado ni ser el dueño. No crea sesiones de pago ni escribe datos: todas
 * deben ser rechazadas.
 *
 *   node tools/verify-security.mjs [--url https://resolveo.site]
 */
const url = (process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : "http://localhost:3210").replace(/\/$/, "");
let failed = 0;
let total = 0;
const check = (name, ok, extra) => {
  total += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} · ${name}${extra === undefined ? "" : " · " + JSON.stringify(extra)}`);
};
const call = async (path, init = {}) => {
  const response = await fetch(url + path, { redirect: "manual", ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  let body = null;
  const text = await response.text();
  try { body = JSON.parse(text); } catch { body = text.slice(0, 120); }
  return { status: response.status, body, headers: response.headers };
};
const post = (path, data, headers) => call(path, { method: "POST", body: JSON.stringify(data), headers });
const put = (path, data, headers) => call(path, { method: "PUT", body: JSON.stringify(data), headers });

const state = (await call("/api/market/state")).body;
const owned = state.units?.[0]?.id ?? "b:way/153212848";
const free = state.free?.[0] ?? "b:way/1";
const good = { name: "Intruso", url: "https://example.com", description: "", images: {} };

/* ------------------------------------------------------- publicar sin pagar */
let r = await put("/api/market/edit", { unitId: owned, content: good });
check("editar un anuncio ajeno sin sesión ni enlace: 403", r.status === 403, r.status);
r = await put("/api/market/edit", { unitId: owned, content: good, token: "inventado.firma" });
check("editar con un enlace de edición falso: 403", r.status === 403, r.status);
r = await put("/api/market/edit", { unitId: free, content: good });
check("editar un espacio que nadie ha comprado: 404", r.status === 404, r.status);
r = await post("/api/market/claim", { unitId: free, content: good });
check("reclamar un espacio gratis sin cuenta de Google: 401", r.status === 401, r.status);
r = await post("/api/market/claim", { unitId: owned, content: good });
check("reclamar «gratis» un espacio que no es gratis: 400", r.status === 400, r.status);
r = await post("/api/market/claim", { unitId: "b:way/153212848", content: good }, { cookie: "rs_session=falsa.firma" });
check("reclamar con una cookie de sesión falsificada: rechazado", r.status === 401 || r.status === 400, r.status);
r = await post("/api/market/checkout", { unitId: free, content: good });
check("pagar por un espacio gratis no crea ninguna sesión de Stripe: 400", r.status === 400, r.status);
r = await post("/api/market/checkout", { unitId: "b:way/999999999999", content: good });
check("comprar una unidad que no existe: 404", r.status === 404, r.status);
r = await post("/api/market/checkout", { unitId: "b:way/1'; drop table market_units;--", content: good });
check("identificador con inyección SQL: rechazado", r.status >= 400 && r.status < 500, r.status);

/* ------------------------------------------------ pagos falsos y webhooks */
r = await post("/api/market/webhook", { type: "checkout.session.completed", data: { object: { id: "cs_live_falso", payment_status: "paid", amount_total: 100, metadata: { draftId: "x", unitId: free } } } });
check("webhook sin firma de Stripe: 400", r.status === 400, r.status);
r = await post("/api/market/webhook", { type: "checkout.session.completed" }, { "stripe-signature": "t=1,v1=abcdef" });
check("webhook con firma falsa: 400", r.status === 400, r.status);
r = await call("/api/market/confirm?session_id=cs_live_inventada1234567890");
check("confirmar una sesión de pago inventada: no publica nada", r.status >= 400, { status: r.status, body: r.body });
r = await call("/api/market/confirm?session_id=' or 1=1 --");
check("confirmar con un identificador malformado: 400", r.status === 400, r.status);
const after = (await call("/api/market/state")).body;
check("tras todos los ataques no hay ninguna unidad nueva", after.units.length === state.units.length, { antes: state.units.length, despues: after.units.length });

/* ------------------------------------------------------ entradas abusivas */
r = await post("/api/market/checkout", { unitId: free, content: { ...good, description: "x".repeat(2_500_000) } });
check("cuerpo de más de 2 MB: 413", r.status === 413, r.status);
r = await post("/api/market/checkout", { unitId: free, content: { ...good, url: "javascript:alert(1)" } });
check("enlace `javascript:` en el anuncio: rechazado", r.status >= 400 && r.status < 500, r.status);
r = await call("/api/market/image?unit=a:plane-1&face=../../etc/passwd");
check("imagen con cara maliciosa: 400", r.status === 400, r.status);

/* ------------------------------------------------- panel de administración y encuesta */
r = await call("/api/admin?view=units");
check("el panel de administración sin sesión: 401", r.status === 401, r.status);
r = await post("/api/admin", { action: "release", unitId: owned }, { "x-admin-request": "1" });
check("retirar un anuncio sin ser administrador: 401", r.status === 401, r.status);
r = await post("/api/admin", { action: "ban", key: "cualquiera@example.com" }, { "x-admin-request": "1", cookie: "rs_session=" + Buffer.from(JSON.stringify({ id: "x", email: "intruso@example.com", exp: 9999999999 })).toString("base64url") + ".firmafalsa" });
check("bloquear a alguien con una sesión falsificada: rechazado", r.status === 401 || r.status === 403, r.status);
const adminPage = await fetch(url + "/admin");
const adminHtml = await adminPage.text();
check("la página /admin no se indexa y sin sesión solo enseña el acceso", /noindex/.test(adminHtml) && !/Retirar anuncio|Reembolsar/.test(adminHtml), adminPage.status);
r = await call("/api/poll");
check("la encuesta pública responde con ciudades y sin datos de personas", Array.isArray(r.body?.options) && r.body.options.length > 0 && !JSON.stringify(r.body).includes("@"), r.status);
r = await post("/api/poll", { optionId: "atlantida" });
check("votar una ciudad que no existe: 404", r.status === 404, r.status);

/* ----------------------------------------------------------- sesión y acceso */
r = await call("/api/auth/me", { headers: { cookie: "rs_session=eyJpZCI6IngifQ.firmafalsa" } });
check("una cookie de sesión falsificada no inicia sesión", r.body?.user === null, r.body);
r = await call("/api/market/mine", { headers: { cookie: "rs_session=eyJpZCI6IngifQ.firmafalsa" } });
check("una cookie falsa no da espacios propios", Array.isArray(r.body?.unitIds) && r.body.unitIds.length === 0, r.body);
r = await call("/api/auth/google?next=https://evil.example/robo");
const location = r.headers.get("location") ?? "";
check("el login con Google no acepta una redirección externa", r.status === 307 || r.status === 503, { status: r.status, aGoogle: location.startsWith("https://accounts.google.com/") });

/* ----------------------------------------------------------------- cabeceras */
const home = await fetch(url + "/");
const h = (name) => home.headers.get(name) ?? "";
if (url.startsWith("https://")) {
  check("cabecera HSTS", h("strict-transport-security").includes("max-age"), h("strict-transport-security"));
  check("política de contenido (CSP) con frame-ancestors 'none'", h("content-security-policy").includes("frame-ancestors 'none'"), h("content-security-policy").slice(0, 60));
}
check("cabecera X-Frame-Options y nosniff", h("x-frame-options") === "DENY" && h("x-content-type-options") === "nosniff");
check("la web no anuncia el framework (X-Powered-By)", h("x-powered-by") === "");
const cookieHeader = (await fetch(url + "/api/auth/google", { redirect: "manual" })).headers.get("set-cookie") ?? "";
if (cookieHeader) check("cookie de acceso HttpOnly y SameSite", /httponly/i.test(cookieHeader) && /samesite=lax/i.test(cookieHeader), cookieHeader.slice(0, 50) + "…");

console.log(`\n${total - failed}/${total} comprobaciones pasan`);
process.exit(failed ? 1 : 0);
