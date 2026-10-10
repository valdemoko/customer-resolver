/**
 * Pruebas del panel de administración, la encuesta y los bloqueos contra un servidor de DESARROLLO con
 * almacén vacío (nunca contra producción: crea reclamaciones, bloquea cuentas de prueba y reinicia la
 * encuesta). Arranque del servidor:
 *
 *   DATABASE_URL= ADMIN_EMAILS=admin@test.local SESSION_SECRET=prueba-local-prueba-local-prueba-local-0123456789  *   APP_ORIGIN=http://localhost:3300 PURCHASES_ENABLED=true STRIPE_SECRET_KEY=sk_test_local npx next dev -p 3300
 *   (borra antes .data/market.json) y después:  node tools/verify-admin.mjs
 */
import { createHmac } from "node:crypto";
const base = "http://localhost:3300";
const secret = "prueba-local-prueba-local-prueba-local-0123456789";
const b64 = (buffer) => Buffer.from(buffer).toString("base64url");
const cookieFor = (user) => {
  const value = b64(JSON.stringify({ ...user, picture: "", exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `rs_session=${value}.${createHmac("sha256", secret).update(value).digest("base64url")}`;
};
const admin = cookieFor({ id: "g-admin", email: "admin@test.local", name: "Admin" });
const ana = cookieFor({ id: "g-1", email: "ana@test.local", name: "Ana" });
const beto = cookieFor({ id: "g-2", email: "beto@test.local", name: "Beto" });
let failed = 0, total = 0;
const check = (name, ok, extra) => { total += 1; if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} · ${name}${extra === undefined ? "" : " · " + JSON.stringify(extra)}`); };
const call = async (path, { cookie, method = "GET", body, headers = {} } = {}) => {
  const response = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json().catch(() => null) };
};
const post = (body, cookie = admin, headers = { "x-admin-request": "1" }) => call("/api/admin", { cookie, method: "POST", body, headers });
const state = (await call("/api/market/state")).data;
const free = state.free;
const content = (name) => ({ name, url: "https://example.com", description: `Anuncio de ${name}`, images: {} });

/* datos de prueba: Ana reclama 2, Beto 1; votos anónimos */
check("Ana reclama un espacio gratis", (await call("/api/market/claim", { cookie: ana, method: "POST", body: { unitId: free[0], content: content("Panadería Sol") } })).status === 200);
check("Ana reclama otro", (await call("/api/market/claim", { cookie: ana, method: "POST", body: { unitId: free[1], content: content("Librería Luna") } })).status === 200);
check("Beto reclama uno", (await call("/api/market/claim", { cookie: beto, method: "POST", body: { unitId: free[2], content: content("Café Beto") } })).status === 200);
const vote = await call("/api/poll", { method: "POST", body: { optionId: "madrid" } });
check("un visitante anónimo vota y la encuesta cuenta 1", vote.status === 200 && vote.data.total === 1 && vote.data.mine === "madrid", vote.data?.total);

/* permisos */
check("sin sesión: el panel responde 401", (await call("/api/admin")).status === 401);
check("una cuenta normal: 403 en lecturas", (await call("/api/admin", { cookie: ana })).status === 403);
check("una cuenta normal: 403 en acciones", (await post({ action: "release", unitId: free[0] }, ana)).status === 403);
check("administrador sin la cabecera propia: 403 (CSRF)", (await post({ action: "purge-drafts" }, admin, {})).status === 403);
check("administrador desde otro origen: 403 (CSRF)", (await post({ action: "purge-drafts" }, admin, { "x-admin-request": "1", origin: "https://evil.example" })).status === 403);
check("cookie de sesión falsificada con el correo del administrador: 401/403", [401, 403].includes((await call("/api/admin", { cookie: "rs_session=" + b64(JSON.stringify({ id: "x", email: "admin@test.local", exp: 9999999999 })) + ".firmafalsa" })).status));

/* lecturas */
const overview = (await call("/api/admin?view=overview", { cookie: admin })).data;
check("resumen: 3 reclamaciones y 117 gratis libres", overview.freeClaims === 3 && overview.freeLeft === 117 && overview.unitsOwned === 3, overview);
const unitsList = (await call("/api/admin?view=units", { cookie: admin })).data;
check("espacios: 3 filas con correo del dueño", unitsList.length === 3 && unitsList.some((u) => u.ownerEmail === "ana@test.local"), unitsList.map((u) => u.name));
const accounts = (await call("/api/admin?view=accounts", { cookie: admin })).data;
check("cuentas: Ana con 2 espacios y 2 gratis", accounts.accounts.find((a) => a.key === "ana@test.local")?.units === 2 && accounts.accounts.find((a) => a.key === "ana@test.local")?.freeClaims === 2);

/* acciones */
check("editar anuncio (moderación)", (await post({ action: "edit-unit", unitId: free[0], name: "Anuncio retirado" })).status === 200);
check("el mapa ya enseña el nombre nuevo", (await call("/api/market/state")).data.units.some((u) => u.owner.name === "Anuncio retirado"));
check("editar con una web peligrosa: 400", (await post({ action: "edit-unit", unitId: free[0], url: "javascript:alert(1)" })).status === 400);
check("quitar protección", (await post({ action: "unlock", unitId: free[0] })).status === 200);
check("retirar un anuncio devuelve el espacio a gratis", (await post({ action: "release", unitId: free[2], reason: "prueba" })).status === 200 && (await call("/api/market/state")).data.free.includes(free[2]));
const ban = await post({ action: "ban", key: "ana@test.local", reason: "spam", releaseUnits: true });
check("bloquear a Ana y retirar sus anuncios", ban.status === 200 && ban.data.released === 2, ban.data);
check("Ana bloqueada ya no puede reclamar", (await call("/api/market/claim", { cookie: ana, method: "POST", body: { unitId: free[3], content: content("Otra vez") } })).status === 403);
check("no se puede bloquear a un administrador", (await post({ action: "ban", key: "admin@test.local" })).status === 400);
check("desbloquear a Ana", (await post({ action: "unban", key: "ana@test.local" })).status === 200);
check("Ana desbloqueada reclama de nuevo", (await call("/api/market/claim", { cookie: ana, method: "POST", body: { unitId: free[3], content: content("Vuelvo") } })).status === 200);
check("encuesta: añadir ciudad, ocultar y reiniciar", (await post({ action: "poll-add", name: "Ciudad de México" })).status === 200 && (await post({ action: "poll-toggle", id: "madrid", active: false })).status === 200 && (await post({ action: "poll-reset" })).status === 200);
check("encuesta pública: sin Madrid y con votos a cero", (await call("/api/poll")).data.options.every((o) => o.id !== "madrid") && (await call("/api/poll")).data.total === 0);
check("acción desconocida: 400", (await post({ action: "borrar-todo" })).status === 400);
const log = (await call("/api/admin?view=log", { cookie: admin })).data;
check("registro: cada acción deja su línea con quién y por qué", log.length >= 8 && log.every((e) => e.admin === "admin@test.local") && log.some((e) => e.action === "retirar-anuncio" && e.detail.includes("prueba")), log.map((e) => e.action));
console.log(`\n${total - failed}/${total} comprobaciones pasan`);
process.exit(failed ? 1 : 0);
