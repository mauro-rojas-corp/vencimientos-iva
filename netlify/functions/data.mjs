import { getStore } from "@netlify/blobs";

// Almacenamiento agrupado para que la app siga rápida con cientos de clientes:
//   "clientes"        → { idCliente: {...}, ... }         (1 archivo)
//   "config"          → { ajustes: {...} }                 (1 archivo)
//   "liq/AAAA-MM"     → { idCliente: {...}, ... }         (1 archivo por mes)
// Cada cambio se escribe con control de versión (ETag): si dos personas guardan
// al mismo tiempo, se reintenta sin perder ninguno de los dos cambios.
const ID = /^[A-Za-z0-9_.-]{1,120}$/;
const PER = /^\d{4}-\d{2}$/;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function readBucket(store, key) {
  return (await store.get(key, { type: "json" })) || {};
}

async function updateBucket(store, key, fn) {
  for (let i = 0; i < 8; i++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const obj = cur ? { ...cur.data } : {};
    fn(obj);
    const res = cur
      ? await store.setJSON(key, obj, { onlyIfMatch: cur.etag })
      : await store.setJSON(key, obj, { onlyIfNew: true });
    if (res.modified) return true;
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
  }
  return false;
}

export default async (req) => {
  const clave = process.env.CLAVE_ACCESO;
  if (!clave) return json({ error: "Falta configurar la variable CLAVE_ACCESO en Netlify." }, 500);
  if (req.headers.get("x-clave") !== clave) return json({ error: "Clave incorrecta" }, 401);

  const store = getStore({ name: "vencimientos-iva", consistency: "strong" });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const periodos = (url.searchParams.get("periodos") || "").split(",").filter((p) => PER.test(p)).slice(0, 6);
    const [clientes, config, ...meses] = await Promise.all([
      readBucket(store, "clientes"),
      readBucket(store, "config"),
      ...periodos.map((p) => readBucket(store, "liq/" + p)),
    ]);
    const liq = {};
    periodos.forEach((p, i) => { liq[p] = meses[i]; });
    return json({ clientes, config, liq });
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "Solicitud inválida" }, 400); }
  const { col, id, periodo, data } = body || {};
  if (!ID.test(id || "")) return json({ error: "Identificador inválido" }, 400);

  let key;
  if (col === "clientes" || col === "config") key = col;
  else if (col === "liq" && PER.test(periodo || "")) key = "liq/" + periodo;
  else return json({ error: "Colección inválida" }, 400);

  if (req.method === "PUT") {
    if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "Datos inválidos" }, 400);
    if (JSON.stringify(data).length > 50000) return json({ error: "Documento demasiado grande" }, 413);
    const ok = await updateBucket(store, key, (o) => { o[id] = data; });
    return ok ? json({ ok: true }) : json({ error: "Muchos cambios simultáneos, reintentá." }, 409);
  }

  if (req.method === "DELETE") {
    const ok = await updateBucket(store, key, (o) => { delete o[id]; });
    if (ok && col === "clientes") {
      // Quita también sus liquidaciones de todos los meses
      const { blobs } = await store.list({ prefix: "liq/" });
      await Promise.all(blobs.map((b) => updateBucket(store, b.key, (o) => { delete o[id]; })));
    }
    return ok ? json({ ok: true }) : json({ error: "Muchos cambios simultáneos, reintentá." }, 409);
  }

  return json({ error: "Método no permitido" }, 405);
};

export const config = { path: "/api/data" };
