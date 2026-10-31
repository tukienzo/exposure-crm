// A qué embudo pertenece una agenda o un pago. Una sola regla para Ventas → Embudos y Operaciones → Métricas.
//  · Agenda: por su fuente (webinar/masterclass → Webinar; outbound/prospección → Outbound; youtube/yt → YouTube
//    (la landing /llamada-de-admision?utm_source=yt, que iClosed registra y el sync vuelca en agendas.utm_*);
//    demo de la app (utm_source=demo-app) → Demo app; vacía → Sin fuente; todo lo demás — reels, historias, carruseles, Ads, referidos — → Orgánico).
//  · Pago: hereda el embudo de la agenda del cliente, enlazada por persona, por teléfono o por nombre (nombre de
//    pila igual + un apellido igual). Si no hay agenda, la fuente cargada en el pago; si tampoco, Sin fuente.

import type { SupabaseClient } from "@supabase/supabase-js"

export const EMBUDOS = ["Webinar", "Orgánico", "Outbound", "YouTube", "Demo app", "Sin fuente"] as const
export type Embudo = (typeof EMBUDOS)[number]

export const minus = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
export const tokens = (s: unknown) => minus(s).replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean)
export const tel9 = (s: unknown) => { const d = String(s ?? "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : "" }

export function embudoDe(fuente: unknown): Embudo {
  const f = minus(fuente).trim()
  if (!f) return "Sin fuente"
  if (/webinar|masterclass/.test(f)) return "Webinar"
  if (/outbound|prospecci/.test(f)) return "Outbound"
  if (/demo.?app/.test(f)) return "Demo app"
  if (/youtube|^yt$|\byt\b/.test(f)) return "YouTube"
  return "Orgánico"
}

export function esEmbudo(v: unknown): v is Embudo {
  return (EMBUDOS as readonly string[]).includes(String(v))
}

// ?embudo= acepta uno o varios separados por coma ("Orgánico,Outbound"): se miden juntos, como si fueran un solo
// embudo (las tasas salen de los conteos sumados, así que quedan promediadas por volumen). null = todos.
export function leerEmbudos(param: string | null): Embudo[] | null {
  const pedidos = String(param ?? "").split(",").map((s) => s.trim()).filter(esEmbudo)
  const lista = EMBUDOS.filter((e) => pedidos.includes(e))
  return lista.length === 0 || lista.length === EMBUDOS.length ? null : lista
}
export const nombreEmbudos = (lista: Embudo[] | null) => (lista ? lista.join(" + ") : null)

export type AgendaEnlace = { id: string; person_id: string | null; nombre: string; telefono: string | null; fuente: string | null; fecha_closer: string | null }
export type PagoEnlace = { fecha?: string | null; cliente?: string | null; telefono?: string | null; person_id?: string | null; fuente?: string | null }

// misma persona si comparten nombre de pila y un apellido, o dos palabras de más de 2 letras ("Tiago Agustin Alegre" = "Agustín Alegre")
export function mismoNombre(x: string[], y: string[]) {
  if (x.length < 2 || y.length < 2) return false
  if (x[0] === y[0] && x.slice(1).some((s) => s.length > 2 && y.slice(1).includes(s))) return true
  return x.filter((s) => s.length > 2 && y.includes(s)).length >= 2
}

// Arma el enlazador pago → agenda con las agendas de los últimos 13 meses.
export function armarEnlazador(todas: AgendaEnlace[]) {
  const porPersona = new Map<string, AgendaEnlace>(), porTel = new Map<string, AgendaEnlace>()
  const porNombre: Array<{ t: string[]; a: AgendaEnlace }> = []
  for (const a of todas) {
    if (a.person_id && !porPersona.has(a.person_id)) porPersona.set(a.person_id, a)
    const t = tel9(a.telefono); if (t && !porTel.has(t)) porTel.set(t, a)
    const tk = tokens(a.nombre); if (tk.length >= 2) porNombre.push({ t: tk, a })
  }
  function agendaDe(pg: PagoEnlace): { a: AgendaEnlace; via: string } | null {
    if (pg.person_id && porPersona.has(pg.person_id)) return { a: porPersona.get(pg.person_id)!, via: "persona" }
    const t = tel9(pg.telefono); if (t && porTel.has(t)) return { a: porTel.get(t)!, via: "teléfono" }
    const tk = tokens(pg.cliente)
    if (!tk.length) return null
    // preferimos la agenda más cercana a la fecha del pago entre las que coinciden por nombre
    let cand = porNombre.filter((x) => mismoNombre(tk, x.t)).map((x) => x.a)
    // nombre con una sola palabra útil ("Jeyson R"): se acepta solo si hay una única agenda con ese nombre de pila
    if (!cand.length && tk.filter((s) => s.length > 2).length === 1 && tk[0].length > 3) {
      const unicos = porNombre.filter((x) => x.t[0] === tk[0]).map((x) => x.a)
      if (unicos.length === 1) cand = unicos
    }
    const f = Date.parse(pg.fecha || "")
    cand = cand.sort((a, b) => Math.abs(Date.parse(a.fecha_closer || "") - f) - Math.abs(Date.parse(b.fecha_closer || "") - f))
    return cand.length ? { a: cand[0], via: "nombre" } : null
  }
  const embudoDePago = (pg: PagoEnlace): Embudo => { const e = agendaDe(pg); return embudoDe(e ? e.a.fuente : pg.fuente) }
  return { agendaDe, embudoDePago }
}

export async function cargarAgendasEnlace(sb: SupabaseClient): Promise<AgendaEnlace[]> {
  const { data, error } = await sb.from("agendas").select("id,person_id,nombre,telefono,fuente,fecha_closer")
    .gte("created_at", new Date(Date.now() - 400 * 86400000).toISOString()).limit(8000)
  if (error) throw new Error(error.message)
  return (data || []) as AgendaEnlace[]
}
