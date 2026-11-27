import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { usuarioActual } from "@/lib/push"
import { nombreCanonico, CLOSERS_ACTIVOS } from "@/lib/equipo"
import { esAgendaCalificada, leerArquetipoCrm } from "@/lib/arquetipos-closing"

export const dynamic = "force-dynamic"

// Fichas de Seguimientos (Nahuel, 26/11/2026). Solo lectura: une cada lead a seguir con su agenda y sus pagos,
// leídos EN VIVO de las tablas `agendas` y `pagos` (las mismas que usa el Resumen de ventas), así lo que se cambia
// en otra ficha se ve acá sin copiar nada. Lo propio del seguimiento (FUP, estado, diagnóstico) sigue en `seguimientos`
// y se edita con PATCH /api/seguimientos; lo de la agenda (calificación, arquetipo, calificaba) con PATCH /api/agendas.
//
// Entran: todos los seguimientos cargados + las agendas de los últimos 90 días que no cerraron o que pagaron fee o
// cuota y todavía deben (las ventas completas quedan afuera). Cada lead trae etiquetas: calificado · fee · cuota ·
// presentado · no_show · reprogramo · cerrado · sin_seguimiento.
const MANAGERS = new Set(["CEO", "Sales Manager", "Manager MKT"])
const hoyAR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
const digitos = (v: unknown) => String(v || "").replace(/\D/g, "").slice(-10)
const AGENDA_COLS = "id,person_id,nombre,telefono,instagram,email,fecha_closer,fecha_agenda,closer,setter,estado,show,cerro,calificacion,lead_score_grade,lead_score,calificaba_realmente,ocupacion,ingresos,inversion,problema_actual,tiempo_problema,intentos_previos,motivo_urgencia,motivo_no_cierre,link_fathom,fuente"

export async function GET(request: Request) {
  try {
    const u = await usuarioActual()
    if (!u) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const primer = nombreCanonico(u.nombre)
    const soloPropios = u.rol === "Closer"
    const p = new URL(request.url).searchParams
    const closerQ = p.get("closer") && p.get("closer") !== "todos" ? p.get("closer") : null
    const dueno = soloPropios ? primer : closerQ
    const sb = createSupabaseAdmin()

    let qs = sb.from("seguimientos").select("*").limit(3000)
    if (dueno) qs = qs.ilike("closer", `${dueno}%`)
    const { data: segs, error: e1 } = await qs
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

    const desde = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    let qa = sb.from("agendas").select(AGENDA_COLS).gte("fecha_closer", desde)
      .or("estado.is.null,estado.neq.Archivada manualmente").order("fecha_closer", { ascending: false }).limit(1500)
    if (dueno) qa = qa.ilike("closer", `${dueno}%`)
    const { data: recientes, error: e2 } = await qa
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

    // agendas de seguimientos más viejos que 90 días
    const ids = new Set((recientes || []).map(a => String(a.id)))
    const faltan = (segs || []).map(s => s.agenda_id).filter(id => id && !ids.has(String(id)))
    let viejas: Record<string, any>[] = []
    for (let i = 0; i < faltan.length; i += 150) {
      const { data } = await sb.from("agendas").select(AGENDA_COLS).in("id", faltan.slice(i, i + 150))
      viejas = viejas.concat(data || [])
    }
    const agendas = [...(recientes || []), ...viejas] as Record<string, any>[]
    const porId = new Map(agendas.map(a => [String(a.id), a]))

    // pagos por persona o teléfono
    const personas = [...new Set(agendas.map(a => a.person_id).filter(Boolean))] as string[]
    const pagos: Record<string, any>[] = []
    for (let i = 0; i < personas.length; i += 150) {
      const { data } = await sb.from("pagos").select("id,fecha,tipo,monto,closer,telefono,person_id,operacion,voided_at").in("person_id", personas.slice(i, i + 150)).is("voided_at", null)
      pagos.push(...(data || []))
    }
    const tels = [...new Set(agendas.filter(a => !a.person_id).map(a => digitos(a.telefono)).filter(t => t.length >= 8))]
    if (tels.length) {
      const { data } = await sb.from("pagos").select("id,fecha,tipo,monto,closer,telefono,person_id,operacion,voided_at").is("voided_at", null).gte("fecha", desde).limit(2000)
      for (const pg of data || []) if (tels.includes(digitos(pg.telefono)) && !pagos.some(x => x.id === pg.id)) pagos.push(pg)
    }
    const pagosDe = (a: Record<string, any> | undefined) => !a ? [] : pagos
      .filter(pg => (a.person_id && pg.person_id === a.person_id) || (!a.person_id && digitos(a.telefono).length >= 8 && digitos(pg.telefono) === digitos(a.telefono)))
      .sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)))
      .map(pg => ({ fecha: pg.fecha, tipo: pg.tipo, monto: Number(pg.monto) || 0, closer: pg.closer }))

    const armar = (seg: Record<string, any> | null, a: Record<string, any> | undefined) => {
      const lp = pagosDe(a)
      const tipos = lp.map(x => String(x.tipo || ""))
      const pif = tipos.some(t => /complet[oó] pif|^venta nueva$|^venta interna$/i.test(t))
      const fee = tipos.some(t => /fee/i.test(t)) || a?.estado === "Fee"
      const cuota = tipos.some(t => /^cuota/i.test(t)) && !pif
      const calif = a ? (a.calificacion || a.lead_score_grade || null) : (seg?.tipo_lead || null)
      const arq = leerArquetipoCrm(a?.ocupacion)
      const etiquetas: string[] = []
      if (esAgendaCalificada(calif)) etiquetas.push("calificado")
      if (fee) etiquetas.push("fee")
      if (cuota) etiquetas.push("cuota")
      if (a?.show === true && !a?.cerro) etiquetas.push("presentado")
      if (a?.show === false && a?.estado !== "Reprogramó") etiquetas.push("no_show")
      if (a?.estado === "Reprogramó") etiquetas.push("reprogramo")
      if (a?.cerro) etiquetas.push("cerrado")
      if (!seg) etiquetas.push("sin_seguimiento")
      const fups = (seg?.fups || {}) as Record<string, any>
      const hechos = Object.entries(fups).filter(([k, e]) => /^\d+$/.test(k) && e?.hecho).map(([, e]) => e)
      const ultimo = hechos.map(e => String(e.fecha || "")).sort().pop() || null
      return {
        key: seg ? `s:${seg.id}` : `a:${a?.id}`,
        seguimiento: seg, agenda_id: a?.id || seg?.agenda_id || null,
        nombre: a?.nombre || seg?.nombre || "Sin nombre", telefono: a?.telefono || seg?.telefono || null, instagram: a?.instagram || seg?.instagram || null,
        closer: a?.closer ? nombreCanonico(a.closer) : (seg?.closer || null), setter: a?.setter || null,
        fecha_call: a?.fecha_closer || seg?.fecha_call || null,
        calificacion: calif, calificaba_realmente: a?.calificaba_realmente || null,
        arquetipo: arq.macro, subarquetipo: arq.subarquetipo, ocupacion: a?.ocupacion || null,
        agenda: a ? {
          estado: a.estado, show: a.show, cerro: a.cerro, ingresos: a.ingresos, inversion: a.inversion, problema_actual: a.problema_actual,
          tiempo_problema: a.tiempo_problema, intentos_previos: a.intentos_previos, motivo_urgencia: a.motivo_urgencia,
          motivo_no_cierre: a.motivo_no_cierre, link_fathom: a.link_fathom, fuente: a.fuente, lead_score: a.lead_score,
        } : null,
        pagos: lp, pagado: lp.reduce((s, x) => s + x.monto, 0),
        etiquetas, fups_hechos: hechos.length, ultimo_fup: ultimo,
        respondidos: hechos.filter(e => e.respondio === true).length, sin_respuesta: hechos.filter(e => e.respondio === false).length,
      }
    }

    const leads = []
    const usadas = new Set<string>()
    for (const s of segs || []) {
      const a = s.agenda_id ? porId.get(String(s.agenda_id)) : undefined
      if (s.agenda_id) usadas.add(String(s.agenda_id))
      leads.push(armar(s, a))
    }
    for (const a of recientes || []) {
      if (usadas.has(String(a.id))) continue
      const l = armar(null, a)
      if (a.cerro && !l.etiquetas.includes("cuota") && !l.etiquetas.includes("fee")) continue   // venta completa: no hay que seguirla
      if (!a.show && a.show !== false && !l.etiquetas.includes("fee")) continue                  // todavía no tuvo la call
      leads.push(l)
    }
    return NextResponse.json({
      yo: { nombre: u.nombre, rol: u.rol, primerNombre: primer, manager: MANAGERS.has(u.rol), soloPropios },
      closers: CLOSERS_ACTIVOS, hoy: hoyAR(), leads,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
