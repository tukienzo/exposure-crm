import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { usuarioActual } from "@/lib/push"
import { nombreCanonico, CLOSERS_ACTIVOS } from "@/lib/equipo"

export const dynamic = "force-dynamic"

// Seguimientos de leads (réplica de la pestaña 🔂 SEGUIMIENTOS del sheet, tabla `seguimientos`).
// Cada closer ve y edita solo los suyos (por el primer nombre de team_members contra la columna closer);
// CEO, Sales Manager y Manager MKT ven todos y pueden borrar; los setters ven todos y pueden editar.
const MANAGERS = new Set(["CEO", "Sales Manager", "Manager MKT"])
const ESTADOS_SEG = ["Activo", "Reagendó", "Cerrado", "Descartado"]
const EDITABLES = new Set(["mes", "nombre", "telefono", "instagram", "fecha_call", "closer", "tuvo_call", "situacion", "enviado_audio", "tipo_lead", "problema_dolor", "proximo_fup", "razon_call", "transcripcion_fathom", "notas", "estado"])
// Estados de agenda que significan "este lead queda en seguimiento"
const ESTADOS_AGENDA_FUP = ["Hacer Seguimiento", "Seguimiento por wpp", "Adentro en FUP", "Agendó 2da call", "Fee"]

const hoyAR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
const texto = (v: unknown, max = 4000) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null }
const mismoCloser = (a: unknown, b: unknown) => nombreCanonico(a).toLowerCase() === nombreCanonico(b).toLowerCase()

type Contexto = { email: string; nombre: string; rol: string; primerNombre: string; manager: boolean; soloPropios: boolean }
async function contexto(): Promise<Contexto | null> {
  const u = await usuarioActual()
  if (!u) return null
  const manager = MANAGERS.has(u.rol)
  return { ...u, primerNombre: nombreCanonico(u.nombre), manager, soloPropios: u.rol === "Closer" }
}
const db = () => createSupabaseAdmin()

function desdeAgenda(a: Record<string, any>, ctx: Contexto) {
  const fc = a.fecha_closer || a.fecha_agenda || null
  const estado = String(a.estado || "")
  return {
    agenda_id: a.id, person_id: a.person_id || null, mes: fc ? String(fc).slice(0, 7) : null,
    nombre: a.nombre || "Sin nombre", telefono: a.telefono || null, instagram: a.instagram || null, fecha_call: fc,
    closer: a.closer ? nombreCanonico(a.closer) : (ctx.soloPropios ? ctx.primerNombre : null),
    tuvo_call: typeof a.show === "boolean" ? a.show : null, situacion: a.motivo_no_cierre || null, tipo_lead: a.calificacion || null,
    transcripcion_fathom: a.link_fathom || null, notas: estado || null,
    estado: /2da/i.test(estado) ? "Reagendó" : "Activo", creado_por: ctx.primerNombre || ctx.email,
  }
}

async function candidatas(ctx: Contexto, closer: string | null) {
  const desde = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  let q = db().from("agendas")
    .select("id,person_id,nombre,telefono,instagram,fecha_agenda,fecha_closer,closer,calificacion,show,cerro,estado,motivo_no_cierre,link_fathom")
    .gte("fecha_closer", desde).or("estado.is.null,estado.neq.Archivada manualmente").eq("cerro", false)
    .order("fecha_closer", { ascending: false }).limit(400)
  const dueno = ctx.soloPropios ? ctx.primerNombre : closer
  if (dueno) q = q.ilike("closer", `${dueno}%`)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const { data: ya } = await db().from("seguimientos").select("agenda_id").not("agenda_id", "is", null)
  const existentes = new Set((ya || []).map(r => String(r.agenda_id)))
  return (data || []).filter(a => !existentes.has(String(a.id))).map(a => ({ ...a, en_fup: ESTADOS_AGENDA_FUP.includes(String(a.estado || "")) }))
}

export async function GET(request: Request) {
  try {
    const ctx = await contexto()
    if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const p = new URL(request.url).searchParams
    const closer = p.get("closer") && p.get("closer") !== "todos" ? p.get("closer") : null
    if (p.get("candidatas") === "1") return NextResponse.json({ candidatas: await candidatas(ctx, closer) })
    const estado = p.get("estado") || "activos"
    const mes = p.get("mes")
    let q = db().from("seguimientos").select("*").order("proximo_fup", { ascending: true, nullsFirst: false }).order("fecha_call", { ascending: false }).limit(2000)
    if (ctx.soloPropios) q = q.ilike("closer", `${ctx.primerNombre}%`)
    else if (closer) q = q.ilike("closer", `${closer}%`)
    if (estado === "activos") q = q.in("estado", ["Activo", "Reagendó"])
    else if (estado !== "todos") q = q.eq("estado", estado)
    if (mes) q = q.eq("mes", mes)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      yo: { nombre: ctx.nombre, rol: ctx.rol, primerNombre: ctx.primerNombre, manager: ctx.manager, soloPropios: ctx.soloPropios },
      closers: CLOSERS_ACTIVOS, hoy: hoyAR(), filas: data || [],
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST: crear seguimientos. { agenda_ids: [...] } desde agendas · { importar: true, closer? } trae solas las agendas
// que quedaron en estado de seguimiento · { nombre, telefono, ... } carga manual.
export async function POST(request: Request) {
  try {
    const ctx = await contexto()
    if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const filas: Record<string, unknown>[] = []
    if (Array.isArray(body.agenda_ids) && body.agenda_ids.length) {
      const { data, error } = await db().from("agendas").select("*").in("id", body.agenda_ids.slice(0, 200))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      for (const a of data || []) {
        if (ctx.soloPropios && a.closer && !mismoCloser(a.closer, ctx.primerNombre)) continue
        filas.push(desdeAgenda(a, ctx))
      }
    } else if (body.importar) {
      const lista = await candidatas(ctx, body.closer && body.closer !== "todos" ? String(body.closer) : null)
      for (const a of lista) if (a.en_fup) filas.push(desdeAgenda(a, ctx))
    } else {
      const nombre = texto(body.nombre, 200)
      if (!nombre) return NextResponse.json({ error: "Falta el nombre del lead" }, { status: 400 })
      const fc = texto(body.fecha_call, 40)
      filas.push({
        nombre, telefono: texto(body.telefono, 40), instagram: texto(body.instagram, 100)?.replace(/^@/, "") || null, fecha_call: fc, mes: fc ? fc.slice(0, 7) : hoyAR().slice(0, 7),
        closer: ctx.soloPropios ? ctx.primerNombre : (texto(body.closer, 60) ? nombreCanonico(body.closer) : ctx.primerNombre || null),
        tipo_lead: texto(body.tipo_lead, 20), situacion: texto(body.situacion, 200), problema_dolor: texto(body.problema_dolor), notas: texto(body.notas),
        estado: "Activo", creado_por: ctx.primerNombre || ctx.email,
      })
    }
    if (!filas.length) return NextResponse.json({ creados: 0 })
    const conAgenda = filas.filter(f => f.agenda_id)
    const sinAgenda = filas.filter(f => !f.agenda_id)
    let creados = 0
    if (conAgenda.length) {
      const { data, error } = await db().from("seguimientos").upsert(conAgenda, { onConflict: "agenda_id", ignoreDuplicates: true }).select("id")
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      creados += (data || []).length
    }
    if (sinAgenda.length) {
      const { data, error } = await db().from("seguimientos").insert(sinAgenda).select("id")
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      creados += (data || []).length
    }
    return NextResponse.json({ creados })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// PATCH: { id, ...campos } edita la fila.
// { id, fup: 3, hecho?, fecha?, nota?, mensaje?, link?, adjuntos? } crea o edita el FUP 3: hecho = true es un seguimiento
// realizado (la fecha puede ser anterior a hoy, para dejar registro), hecho = false es un seguimiento preparado para esa
// fecha (texto, link y capturas listos para usar). Los campos que no vienen se conservan. { id, fup: 3, borrar: true } lo quita.
// Si queda un FUP preparado a futuro, el próximo contacto se corre a esa fecha cuando estaba vacío o era posterior.
const FECHA = /^\d{4}-\d{2}-\d{2}$/
// Fichas (26/11/2026): cada FUP suma tipo (Texto · Audio · Foto 1 VW · Video 1 VW · Llamada) y si respondió.
// El diagnóstico de la ficha (arquetipo comercial, temperatura, objeción, próximo movimiento) va en fups._ficha:
// no tiene "hecho" ni "fecha", así que la etapa, el próximo contacto y la Ciudad lo ignoran.
const TIPOS_FUP = ["Texto", "Audio", "Foto 1 VW", "Video 1 VW", "Llamada"]
const CAMPOS_FICHA = ["arquetipo_comercial", "temperatura", "objecion_principal", "objecion_secundaria", "proximo_movimiento", "proxima_accion", "compromiso", "capacidad_inversion", "decide"]
const limpiarLink = (v: unknown) => { const t = texto(v, 500); return t && /^https?:\/\//i.test(t) ? t : null }
const limpiarAdjuntos = (v: unknown) => Array.isArray(v)
  ? v.slice(0, 10).map(a => ({ url: String(a?.url || ""), nombre: texto(a?.nombre, 120) || "adjunto", tipo: texto(a?.tipo, 60) || "" }))
      .filter(a => a.url.startsWith("/api/seguimientos/adjunto?path=") || /^https?:\/\//i.test(a.url))
  : []
export async function PATCH(request: Request) {
  try {
    const ctx = await contexto()
    if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const { id, fup, hecho, nota, mensaje, link, adjuntos, fecha, borrar, tipo, respondio, ficha, ...resto } = await request.json()
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    const { data: fila, error: e0 } = await db().from("seguimientos").select("id,closer,fups,proximo_fup").eq("id", id).maybeSingle()
    if (e0) return NextResponse.json({ error: e0.message }, { status: 500 })
    if (!fila) return NextResponse.json({ error: "No existe el seguimiento" }, { status: 404 })
    if (ctx.soloPropios && fila.closer && !mismoCloser(fila.closer, ctx.primerNombre)) return NextResponse.json({ error: "Este lead es de otro closer" }, { status: 403 })
    const updates: Record<string, unknown> = { actualizado_por: ctx.primerNombre || ctx.email }
    for (const [k, v] of Object.entries(resto)) {
      if (!EDITABLES.has(k)) continue
      if (k === "tuvo_call") updates[k] = v === null || v === "" ? null : Boolean(v)
      else if (k === "enviado_audio") updates[k] = Boolean(v)
      else if (k === "estado") { if (ESTADOS_SEG.includes(String(v))) updates[k] = v }
      else if (k === "closer") updates[k] = ctx.soloPropios ? fila.closer : (texto(v, 60) ? nombreCanonico(v) : null)
      else if (k === "proximo_fup") updates[k] = /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null
      else if (k === "fecha_call") { const t = texto(v, 40); updates[k] = t; if (t) updates.mes = t.slice(0, 7) }
      else if (k === "instagram") updates[k] = texto(v, 100)?.replace(/^@/, "") || null
      else updates[k] = texto(v)
    }
    if (fup !== undefined) {
      const n = Number(fup)
      if (!Number.isInteger(n) || n < 1 || n > 15) return NextResponse.json({ error: "FUP inválido (1 a 15)" }, { status: 400 })
      type Entrada = { hecho: boolean; fecha: string; por?: string; nota?: string; mensaje?: string; link?: string; adjuntos?: { url: string; nombre: string; tipo: string }[]; tipo?: string; respondio?: boolean | null }
      const fups = { ...((fila.fups as Record<string, Entrada>) || {}) }
      const k = String(n)
      const previo = fups[k] || null
      if (borrar) delete fups[k]
      else {
        const f = fecha !== undefined && fecha !== null && fecha !== "" ? String(fecha) : (previo?.fecha || hoyAR())
        if (!FECHA.test(f)) return NextResponse.json({ error: "Fecha inválida (AAAA-MM-DD)" }, { status: 400 })
        const estaHecho = hecho !== undefined && hecho !== null ? Boolean(hecho) : (previo ? Boolean(previo.hecho) : true)
        const entrada: Entrada = {
          hecho: estaHecho, fecha: f,
          por: previo?.por || ctx.primerNombre || ctx.email,
          nota: nota !== undefined ? (texto(nota, 500) || undefined) : previo?.nota,
          mensaje: mensaje !== undefined ? (texto(mensaje, 4000) || undefined) : previo?.mensaje,
          link: link !== undefined ? (limpiarLink(link) || undefined) : previo?.link,
          adjuntos: adjuntos !== undefined ? limpiarAdjuntos(adjuntos) : previo?.adjuntos,
          tipo: tipo !== undefined ? (TIPOS_FUP.includes(String(tipo)) ? String(tipo) : undefined) : previo?.tipo,
          respondio: respondio !== undefined ? (respondio === null || respondio === "" ? null : Boolean(respondio)) : previo?.respondio,
        }
        if (!entrada.tipo) delete entrada.tipo
        if (entrada.respondio === undefined || entrada.respondio === null) delete entrada.respondio
        if (estaHecho && !previo?.hecho) entrada.por = ctx.primerNombre || ctx.email   // quien lo dio por hecho
        if (!entrada.adjuntos?.length) delete entrada.adjuntos
        for (const c of ["nota", "mensaje", "link"] as const) if (!entrada[c]) delete entrada[c]
        fups[k] = entrada
      }
      updates.fups = fups
      updates.etapa = Math.max(0, ...Object.entries(fups).filter(([kk, e]) => /^d+$/.test(kk) && e?.hecho).map(([kk]) => Number(kk)))
      const hoy = hoyAR()
      const programado = Object.values(fups).filter(e => e && !e.hecho && e.fecha >= hoy).map(e => e.fecha).sort()[0]
      if (programado && (!fila.proximo_fup || String(fila.proximo_fup) > programado) && updates.proximo_fup === undefined) updates.proximo_fup = programado
    }
    if (ficha && typeof ficha === "object") {
      const base = (updates.fups as Record<string, unknown>) || { ...((fila.fups as Record<string, unknown>) || {}) }
      const previa = (base._ficha as Record<string, unknown>) || {}
      const nueva: Record<string, unknown> = { ...previa }
      for (const c of CAMPOS_FICHA) if (c in ficha) { const t = texto((ficha as Record<string, unknown>)[c], 1000); if (t) nueva[c] = t; else delete nueva[c] }
      nueva.actualizado = new Date().toISOString(); nueva.por = ctx.primerNombre || ctx.email
      updates.fups = { ...base, _ficha: nueva }
    }
    if (Object.keys(updates).length === 1) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
    const { data, error } = await db().from("seguimientos").update(updates).eq("id", id).select("*").maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ fila: data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await contexto()
    if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    if (!ctx.manager) return NextResponse.json({ error: "Solo dirección puede borrar; el closer lo pasa a Descartado" }, { status: 403 })
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    const { error } = await db().from("seguimientos").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
