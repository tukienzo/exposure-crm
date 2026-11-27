import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import {
  leerArquetipoCrm,
  esAgendaCalificada,
  leerLeadScoringCrm,
  type MacroArquetipo,
} from "@/lib/arquetipos-closing"
import {
  generarTextoWhatsApp,
  type CallDetalle,
  type MetricasClosing,
  type ResumenPayload,
  type FathomDiagnostico,
  type ArquetiposMetricas,
} from "@/lib/closing-whatsapp-formatter"
import { extractBookingContentOrigin } from "@/lib/chat-summary-attribution"
import { armarEnlazador, cargarAgendasEnlace, tel9 } from "@/lib/embudo-atribucion"
import { etiquetaReprogramada } from "@/lib/reprogramaciones"
import { metricasVentas } from "@/lib/metricas-ventas"
import { bloqueSeguimientos } from "@/lib/resumen-seguimientos"

export const dynamic = "force-dynamic"
export const revalidate = 0

const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0)

function hoyIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function parseFathomText(summary?: string | null, transcript?: string | null): FathomDiagnostico {
  const diag: FathomDiagnostico = {}
  const txt = `${summary || ""} ${transcript || ""}`.toLowerCase()

  if (txt.includes("alex") || txt.includes("carrera")) {
    diag.mencion_alex = "Mencionó conocer el contenido de Alex"
  }
  if (txt.includes("claude") || txt.includes("notion")) {
    diag.contenido_recuerda = "Reel o video de Claude / automatización"
  } else if (txt.includes("flex")) {
    diag.contenido_recuerda = "Caso Flex"
  } else if (txt.includes("fran")) {
    diag.contenido_recuerda = "Caso Fran Puleo"
  }

  // Citas textuales o insights si el summary / ia_analisis los trae
  if (summary) {
    const lines = summary.split("\n")
    for (const l of lines) {
      const lLow = l.toLowerCase()
      if (lLow.includes("dolor") || lLow.includes("pain") || lLow.includes("problema")) {
        diag.dolor_principal = l.replace(/^[-*•#\s]+/, "").slice(0, 200)
      }
      if (lLow.includes("deseo") || lLow.includes("objetivo") || lLow.includes("goal")) {
        diag.deseo_principal = l.replace(/^[-*•#\s]+/, "").slice(0, 200)
      }
      if (lLow.includes("objeci") || lLow.includes("freno")) {
        diag.oferta_interes = l.replace(/^[-*•#\s]+/, "").slice(0, 200)
      }
      if (lLow.includes("urgencia")) {
        diag.urgencia = l.replace(/^[-*•#\s]+/, "").slice(0, 200)
      }
    }
  }

  return diag
}


function parseFathomMarkdown(text?: string | null): {
  summary: string
  pain_points: string[]
  goals: string[]
  objections: string[]
  situation: string
  next_steps: string[]
} {
  const res = {
    summary: "",
    pain_points: [] as string[],
    goals: [] as string[],
    objections: [] as string[],
    situation: "",
    next_steps: [] as string[],
  }
  if (!text) return res

  const lines = text.split("\n")
  let currentSec = ""
  const summaryLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (/^#+\s+(?:summary|resumen|overview)/i.test(trimmed)) {
      currentSec = "summary"
      continue
    } else if (/^#+\s+(?:pain\s*points?|challenges?|problemas?|dolores?)/i.test(trimmed)) {
      currentSec = "pain_points"
      continue
    } else if (/^#+\s+(?:goals?|desired\s*outcomes?|objetivos?|metas?|deseos?)/i.test(trimmed)) {
      currentSec = "goals"
      continue
    } else if (/^#+\s+(?:objections?|concerns?|objecion(?:es)?|frenos?)/i.test(trimmed)) {
      currentSec = "objections"
      continue
    } else if (/^#+\s+(?:next\s*steps?|action\s*items?|pr[oó]ximos\s*pasos?)/i.test(trimmed)) {
      currentSec = "next_steps"
      continue
    } else if (/^#+\s+(?:situation|situaci[oó]n|contexto|background)/i.test(trimmed)) {
      currentSec = "situation"
      continue
    } else if (/^#+\s+/i.test(trimmed)) {
      currentSec = "other"
    }

    const cleanBullet = trimmed.replace(/^[-*•\d.]+\s*/, "").trim()
    const cleanTag = cleanBullet.replace(/^\*\*([^*]+)\*\*[:\s-]*/, "$1: ").trim()

    if (/^(?:current\s*situation|situaci[oó]n\s*actual|perfil|background|situaci[oó]n)[:\s-]/i.test(cleanTag)) {
      res.situation = cleanTag.replace(/^(?:current\s*situation|situaci[oó]n\s*actual|perfil|background|situaci[oó]n)[:\s-]+/i, "").trim()
    } else if (/^(?:goal|goals|desired\s*outcome|desired\s*outcomes|objetivo|objetivos|meta|metas|deseo|deseos)[:\s-]/i.test(cleanTag)) {
      res.goals.push(cleanTag.replace(/^(?:goal|goals|desired\s*outcome|desired\s*outcomes|objetivo|objetivos|meta|metas|deseo|deseos)[:\s-]+/i, "").trim())
    } else if (/^(?:pain\s*point|pain\s*points|dolor|dolores|problema|problemas|desaf[ií]o|frustraci[oó]n)[:\s-]/i.test(cleanTag)) {
      res.pain_points.push(cleanTag.replace(/^(?:pain\s*point|pain\s*points|dolor|dolores|problema|problemas|desaf[ií]o|frustraci[oó]n)[:\s-]+/i, "").trim())
    } else if (/^(?:objection|objections|objeci[oó]n|objeciones|freno|frenos|duda|dudas|concern|concerns)[:\s-]/i.test(cleanTag)) {
      res.objections.push(cleanTag.replace(/^(?:objection|objections|objeci[oó]n|objeciones|freno|frenos|duda|dudas|concern|concerns)[:\s-]+/i, "").trim())
    } else if (/^(?:next\s*step|next\s*steps|pr[oó]ximo\s*paso|pr[oó]ximos\s*pasos|acuerdo|acuerdos)[:\s-]/i.test(cleanTag)) {
      res.next_steps.push(cleanTag.replace(/^(?:next\s*step|next\s*steps|pr[oó]ximo\s*paso|pr[oó]ximos\s*pasos|acuerdo|acuerdos)[:\s-]+/i, "").trim())
    } else if (currentSec === "pain_points") {
      res.pain_points.push(cleanBullet.replace(/^\*\*|\*\*$/g, ""))
    } else if (currentSec === "goals") {
      res.goals.push(cleanBullet.replace(/^\*\*|\*\*$/g, ""))
    } else if (currentSec === "objections") {
      res.objections.push(cleanBullet.replace(/^\*\*|\*\*$/g, ""))
    } else if (currentSec === "next_steps") {
      res.next_steps.push(cleanBullet.replace(/^\*\*|\*\*$/g, ""))
    } else if (currentSec === "situation" && !res.situation) {
      res.situation = cleanBullet.replace(/^\*\*|\*\*$/g, "")
    } else if (currentSec === "summary") {
      summaryLines.push(trimmed)
    }
  }

  res.summary = summaryLines.join("\n").trim()
  return res
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sb = createSupabaseAdmin()

    // 1. MODO CONSULTA DE HISTÓRICO
    if (searchParams.get("historico") === "1") {
      const limite = Math.min(100, Number(searchParams.get("limite") || 30))
      const { data, error } = await sb
        .from("crm_integration_assets")
        .select("id, source_id, asset_type, name, metadata, last_seen_at")
        .eq("source", "closing")
        .order("last_seen_at", { ascending: false })
        .limit(limite)

      if (error) throw new Error(error.message)

      return NextResponse.json({
        ok: true,
        reportes: (data || []).map((r) => ({
          id: r.id,
          source_id: r.source_id,
          asset_type: r.asset_type,
          name: r.name,
          metadata: r.metadata,
          fecha_guardado: r.last_seen_at,
        })),
      })
    }

    // 2. MODO OBTENER REPORTE ESPECÍFICO POR SOURCE_ID
    const sourceId = searchParams.get("source_id")
    if (sourceId) {
      const { data, error } = await sb
        .from("crm_integration_assets")
        .select("id, source_id, asset_type, name, metadata, last_seen_at")
        .eq("source", "closing")
        .eq("source_id", sourceId)
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) return NextResponse.json({ error: "No se encontró el reporte guardado" }, { status: 404 })

      return NextResponse.json({ ok: true, reporte: data.metadata, name: data.name })
    }

    // 3. MODO GENERACIÓN EN TIEMPO REAL
    const periodo = (searchParams.get("periodo") || "dia") as "dia" | "semana" | "mes"
    const fecha = searchParams.get("fecha") || hoyIso()
    let fechaDesde = searchParams.get("fecha_desde") || fecha
    let fechaHasta = searchParams.get("fecha_hasta") || fecha
    const closer = (searchParams.get("closer") || "todos").toLowerCase()
    const modo = (searchParams.get("modo") || "detallado") as "detallado" | "corto"

    if (periodo === "dia") {
      fechaDesde = fecha
      fechaHasta = fecha
    } else if (periodo === "semana" && !searchParams.get("fecha_desde")) {
      const parts = fecha.split("-").map(Number)
      const d = new Date(parts[0], parts[1] - 1, parts[2])
      const day = d.getDay() // 0 = Domingo, 1 = Lunes
      const diffToMonday = day === 0 ? -6 : 1 - day
      const monday = new Date(parts[0], parts[1] - 1, parts[2] + diffToMonday)
      const sunday = new Date(parts[0], parts[1] - 1, parts[2] + diffToMonday + 6)
      const fmt = (x: Date) =>
        `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`
      fechaDesde = fmt(monday)
      fechaHasta = fmt(sunday)
    } else if (periodo === "mes" && !searchParams.get("fecha_desde")) {
      const parts = fecha.split("-").map(Number)
      const year = parts[0]
      const month = parts[1]
      const lastDay = new Date(year, month, 0).getDate()
      const mStr = String(month).padStart(2, "0")
      fechaDesde = `${year}-${mStr}-01`
      fechaHasta = `${year}-${mStr}-${String(lastDay).padStart(2, "0")}`
    }

    // Consultamos agendas reales del CRM por fecha_closer (excluyendo registros archivados manualmente)
    const AG_COLS =
      "id, nombre, email, telefono, instagram, fecha_closer, fecha_agenda, closer, setter, show, cerro, estado, calificacion, lead_score, lead_score_grade, lead_score_detalle, calificaba_realmente, ocupacion, angulo_entrada, recurso, manychat, fuente, medio_de_pago, motivo_no_cierre, plan_de_pago, cc_dia_1, person_id, problema_actual, motivo_urgencia, ingresos, inversion, link_fathom, ia_analisis, resumen_chat"
    let query = sb
      .from("agendas")
      .select(AG_COLS)
      .gte("fecha_closer", `${fechaDesde}T00:00:00`)
      .lte("fecha_closer", `${fechaHasta}T23:59:59`)
      .or("estado.is.null,estado.neq.Archivada manualmente")
      .order("fecha_closer", { ascending: true })

    if (closer && closer !== "todos") {
      query = query.ilike("closer", `%${closer}%`)
    }

    const { data: agendas, error: errAg } = await query
    if (errAg) throw new Error(errAg.message)

    // Filtrar archivadas defensivamente y deduplicar en memoria por identidad y fecha
    const rawAgendas = (agendas || []).filter(
      (a: any) => a.estado !== "Archivada manualmente" && a.estado !== "Archivada"
    )

    const normPhone = (p?: string | null) => (p || "").replace(/\D/g, "")
    const normIg = (i?: string | null) => (i || "").replace(/[@\s]/g, "").toLowerCase()
    const normName = (n?: string | null) =>
      (n || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()

    function getLeadCompletenessScore(item: any): number {
      let score = 0
      if (item.calificaba_realmente) score += 20
      if (item.calificacion) score += 15
      if (item.lead_score_grade === "A") score += 25
      else if (item.lead_score_grade === "B") score += 20
      else if (item.lead_score_grade === "C") score += 15
      else if (item.lead_score_grade === "D") score += 10
      if (item.cerro) score += 50
      if (item.show === true) score += 30
      if (item.medio_de_pago || item.cc_dia_1) score += 20
      if (item.ocupacion) score += 10
      if (item.problema_actual) score += 10
      if (item.ingresos) score += 5
      if (item.inversion) score += 5
      if (item.motivo_urgencia) score += 5
      if (item.intentos_previos) score += 5
      if (item.link_fathom) score += 10
      return score
    }

    // ── Reprogramaciones (eventos agenda_reprogramada que guarda PATCH /api/agendas) ──
    // La agenda vive en su día nuevo. En el día original se muestra UNA fila de NO SHOW
    // ("Reprogramó para el …") solo si la persona no aparece ya en el rango: si el rango
    // incluye el día nuevo, o tiene otra agenda en el rango, queda una sola fila (la real).
    const diaHora = (s?: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}${s.length >= 16 ? ` ${s.slice(11, 16)}` : ""}` : "")
    const identidades = (a: any) => [
      a.person_id && `p:${a.person_id}`,
      normPhone(a.telefono).length >= 7 && `t:${normPhone(a.telefono).slice(-10)}`,
      normIg(a.instagram).length >= 3 && `i:${normIg(a.instagram)}`,
    ].filter(Boolean) as string[]
    const idsEnRango = new Set(rawAgendas.map((a: any) => String(a.id)))
    // Agendas del rango que llegaron acá por una reprogramación: en su día nuevo están pendientes, no son no show.
    const reprogramadaDesde = new Map<string, string>()
    // Agendas que alguna vez se reprogramaron: llevan la etiqueta "Reprogramó y …" en su segunda reunión
    const conReprogramacion = new Set<string>()
    if (idsEnRango.size) {
      const ids = [...idsEnRango]
      for (let i = 0; i < ids.length; i += 300) {
        const { data: evs } = await sb.from("crm_events").select("source_record_id,metadata")
          .eq("event_type", "agenda_reprogramada").in("source_record_id", ids.slice(i, i + 300))
        for (const ev of evs || []) {
          const id = String((ev as any).source_record_id)
          const actual = rawAgendas.find((a: any) => String(a.id) === id)
          const m = (ev as any).metadata || {}
          conReprogramacion.add(id)
          if (actual && String(m.fecha_nueva || "").slice(0, 10) === String(actual.fecha_closer || "").slice(0, 10)) {
            reprogramadaDesde.set(id, String(m.fecha_original || ""))
          }
        }
      }
    }
    const { data: evsOrigen } = await sb.from("crm_events").select("source_record_id,metadata")
      .eq("event_type", "agenda_reprogramada")
      .gte("occurred_at", `${fechaDesde}T00:00:00-03:00`).lte("occurred_at", `${fechaHasta}T23:59:59-03:00`)
    // Una sola fila por agenda: si se reprogramó dos veces dentro del rango, queda el último día original.
    const origenPorAgenda = new Map<string, { fecha_original: string; fecha_nueva: string }>()
    for (const ev of evsOrigen || []) {
      const id = String((ev as any).source_record_id)
      const m = (ev as any).metadata || {}
      const dia = String(m.fecha_original || "").slice(0, 10)
      if (!dia || dia < fechaDesde || dia > fechaHasta || idsEnRango.has(id)) continue
      const previo = origenPorAgenda.get(id)
      if (!previo || String(m.fecha_original) > previo.fecha_original) origenPorAgenda.set(id, { fecha_original: String(m.fecha_original), fecha_nueva: String(m.fecha_nueva || "") })
    }
    if (origenPorAgenda.size) {
      const vistas = new Set(rawAgendas.flatMap(identidades))
      const { data: originales } = await sb.from("agendas").select(AG_COLS).in("id", [...origenPorAgenda.keys()])
      const filtroCloser = closer && closer !== "todos" ? closer.toLowerCase() : ""
      for (const row of (originales || []) as any[]) {
        const ev = origenPorAgenda.get(String(row.id))
        if (!ev || String(row.estado || "").startsWith("Archivada")) continue
        if (filtroCloser && !String(row.closer || "").toLowerCase().includes(filtroCloser)) continue
        const claves = identidades(row)
        if (claves.some(k => vistas.has(k))) continue
        claves.forEach(k => vistas.add(k))
        rawAgendas.push({
          ...row,
          fecha_closer: ev.fecha_original,
          show: false,
          cerro: false,
          estado: "No Show",
          motivo_no_cierre: null,
          link_fathom: null,
          ia_analisis: null,
          medio_de_pago: null,
          plan_de_pago: null,
          cc_dia_1: null,
          _reprogramada_a: ev.fecha_nueva,
        } as any)
      }
      rawAgendas.sort((a: any, b: any) => String(a.fecha_closer || "").localeCompare(String(b.fecha_closer || "")))
    }

    const agendaList: typeof rawAgendas = []
    const clusters: Record<string, typeof rawAgendas> = {}

    // Mapeo para enlazar pagos de IDs duplicados al registro ganador consolidado
    const clusterIdMap = new Map<string | number, string | number>()

    for (const item of rawAgendas) {
      const p = normPhone(item.telefono)
      const ig = normIg(item.instagram)
      const nm = normName(item.nombre)

      // Clave unívoca por persona en todo el período seleccionado (evita duplicar métricas entre días de la semana o mes)
      let clusterKey = ""
      if (item.person_id) {
        clusterKey = `person:${item.person_id}`
      } else if (p && p.length >= 7) {
        clusterKey = `phone:${p}`
      } else if (ig && ig.length >= 3) {
        clusterKey = `ig:${ig}`
      } else if (nm && nm.length >= 5) {
        clusterKey = `nm:${nm}`
      } else {
        clusterKey = `id:${item.id}`
      }

      if (!clusters[clusterKey]) {
        clusters[clusterKey] = []
      }
      clusters[clusterKey].push(item)
    }

    for (const key of Object.keys(clusters)) {
      const items = clusters[key]
      if (items.length === 1) {
        agendaList.push(items[0])
      } else {
        // Ordenar por completitud y calificación
        items.sort((a, b) => getLeadCompletenessScore(b) - getLeadCompletenessScore(a))
        const winner = { ...items[0] }
        for (let i = 1; i < items.length; i++) {
          const other = items[i]
          clusterIdMap.set(other.id, winner.id)
          for (const field of Object.keys(other)) {
            if ((winner as any)[field] === null || (winner as any)[field] === undefined || (winner as any)[field] === "") {
              (winner as any)[field] = (other as any)[field]
            }
          }
        }
        agendaList.push(winner)
      }
    }
    const agendaIds = agendaList.map((a) => a.id).filter(Boolean)

    // Motivo del no show cargado a mano en la ficha (vive en crm_events, ver /api/agendas).
    // Si la persona tenía agendas duplicadas en el período, el motivo pasa a la agenda consolidada.
    const motivoNoShowPorAgenda = new Map<string, string>()
    const rawIds = rawAgendas.map((a: any) => String(a.id)).filter(Boolean)
    for (let i = 0; i < rawIds.length; i += 300) {
      const { data: motivos } = await sb.from("crm_events").select("source_record_id,metadata")
        .eq("event_type", "agenda_no_show_motivo").in("source_record_id", rawIds.slice(i, i + 300))
      for (const m of motivos || []) {
        const motivo = String((m as any).metadata?.motivo || "").trim()
        if (!motivo) continue
        const rid = String((m as any).source_record_id)
        const destino = String(clusterIdMap.get(rid) ?? clusterIdMap.get(Number(rid)) ?? rid)
        if (!motivoNoShowPorAgenda.has(destino) || destino === rid) motivoNoShowPorAgenda.set(destino, motivo)
      }
    }

    // Calificada con el criterio vigente (08/10/2026): ingreso declarado USD 1.000-3.000 + arquetipo foco.
    // Sale del resumen de setting clasificado (crm_setting_resumenes.calificada), no del Lead S/A/B/C.
    // Si la persona tenía varias agendas o varios resúmenes, manda el resumen más nuevo.
    type ResumenSetting = { calificada: boolean | null; arquetipo: string | null; ingreso: string | null; publicado: string }
    const resumenPorAgenda = new Map<string, ResumenSetting>()
    for (let i = 0; i < rawIds.length; i += 300) {
      const { data: resumenes } = await sb.from("crm_setting_resumenes")
        .select("agenda_id,calificada,arquetipo,ingreso_declarado,publicado_at")
        .in("agenda_id", rawIds.slice(i, i + 300))
      for (const r of (resumenes || []) as any[]) {
        const rid = String(r.agenda_id)
        const destino = String(clusterIdMap.get(rid) ?? clusterIdMap.get(Number(rid)) ?? rid)
        const nuevo: ResumenSetting = { calificada: r.calificada ?? null, arquetipo: r.arquetipo ?? null, ingreso: r.ingreso_declarado ?? null, publicado: String(r.publicado_at || "") }
        const previo = resumenPorAgenda.get(destino)
        if (!previo || nuevo.publicado > previo.publicado) resumenPorAgenda.set(destino, nuevo)
      }
    }
    // Respaldo por persona: el resumen puede haber quedado en una agenda duplicada que se archivó a mano
    const agendaPorPersona = new Map<string, string>()
    for (const a of agendaList as any[]) {
      if (a.person_id && !resumenPorAgenda.has(String(a.id))) agendaPorPersona.set(String(a.person_id), String(a.id))
    }
    const personasSinResumen = [...agendaPorPersona.keys()]
    for (let i = 0; i < personasSinResumen.length; i += 300) {
      const { data: resumenes } = await sb.from("crm_setting_resumenes")
        .select("person_id,calificada,arquetipo,ingreso_declarado,publicado_at")
        .in("person_id", personasSinResumen.slice(i, i + 300))
      for (const r of (resumenes || []) as any[]) {
        const destino = agendaPorPersona.get(String(r.person_id))
        if (!destino) continue
        const nuevo: ResumenSetting = { calificada: r.calificada ?? null, arquetipo: r.arquetipo ?? null, ingreso: r.ingreso_declarado ?? null, publicado: String(r.publicado_at || "") }
        const previo = resumenPorAgenda.get(destino)
        if (!previo || nuevo.publicado > previo.publicado) resumenPorAgenda.set(destino, nuevo)
      }
    }
    const tcv = {
      presentadas: 0, cierres: 0,
      calificadas_presentadas: 0, cierres_calificados: 0,
      no_calificadas_presentadas: 0, cierres_no_calificados: 0,
      sin_resumen_presentadas: 0, cierres_sin_resumen: 0,
    }

    // Pagos del período. Ojo: la tabla pagos no tiene agenda_id; hasta el 12/10/2026 esta consulta lo pedía,
    // fallaba sin avisar y el resumen no cruzaba ningún pago (cierres y cash salían solo de la agenda).
    const { data: pagosTodos, error: errPagos } = await sb
      .from("pagos")
      .select("id, person_id, cliente, telefono, fecha, monto, tipo, operacion, closer, medio_de_pago, comprobante, record_status")
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)
      .order("fecha", { ascending: true })
    if (errPagos) throw new Error(`No se pudieron leer los pagos: ${errPagos.message}`)
    // los anulados o borrados no cuentan
    const pagos = (pagosTodos || []).filter((p: any) => (p.record_status || "active") === "active")

    // Cada pago va a UNA sola agenda del período, con la misma regla que Métricas y Embudos
    // (persona → teléfono → nombre y apellido, la agenda más cercana a la fecha del pago).
    // Si esa agenda es de otro mes, se busca la llamada de la misma persona en este período.
    const { agendaDe } = armarEnlazador(await cargarAgendasEnlace(sb))
    const idGanador = (id: unknown) => String(clusterIdMap.get(id as any) ?? id)
    const idsDelPeriodo = new Set(agendaList.map((a: any) => String(a.id)))
    const ganadorPorPersona = new Map<string, string>(), ganadorPorTel = new Map<string, string>()
    for (const a of agendaList as any[]) {
      if (a.person_id) ganadorPorPersona.set(String(a.person_id), String(a.id))
      const t = tel9(a.telefono); if (t) ganadorPorTel.set(t, String(a.id))
    }
    const pagosPorAgenda = new Map<string, any[]>()
    const viaPorAgenda = new Map<string, string>()
    const destinoPorPago = new Map<string, { destino: string | null; via: string | null }>()
    for (const p of pagos as any[]) {
      let destino: string | null = null
      let via: string | null = null
      if (p.person_id && ganadorPorPersona.has(String(p.person_id))) {
        destino = ganadorPorPersona.get(String(p.person_id))!; via = "persona"
      } else {
        const enl = agendaDe(p)
        if (enl) {
          via = enl.via
          destino = idsDelPeriodo.has(idGanador(enl.a.id)) ? idGanador(enl.a.id)
            : (enl.a.person_id && ganadorPorPersona.get(String(enl.a.person_id))) || ganadorPorTel.get(tel9(enl.a.telefono)) || null
        }
      }
      if (destino && !idsDelPeriodo.has(destino)) destino = null
      destinoPorPago.set(String(p.id), { destino, via })
      if (!destino) continue
      if (!pagosPorAgenda.has(destino)) pagosPorAgenda.set(destino, [])
      pagosPorAgenda.get(destino)!.push(p)
      const previa = viaPorAgenda.get(destino)
      if (!previa || previa === "nombre") viaPorAgenda.set(destino, via || "nombre")
    }
    // auditar_cruce=1: qué mostraba el resumen antes (solo la agenda) y qué muestra ahora (agenda + pagos)
    const antesPorAgenda = new Map<string, { resultado: string; cash: number }>()

    // Consultamos grabaciones Fathom enlazadas
    let callRecords: Record<string, any> = {}
    let cRecsWindowList: any[] = []
    if (agendaIds.length > 0) {
      const personIds = agendaList.map((a: any) => a.person_id).filter(Boolean)
      const fathomUrls = agendaList.map((a: any) => a.link_fathom).filter(Boolean)

      // 1. Por agenda_id
      const { data: cRecs } = await sb
        .from("crm_call_records")
        .select("id, agenda_id, person_id, fathom_summary, transcript, trace_analysis, fathom_url, title, participants, occurred_at")
        .in("agenda_id", agendaIds)

      if (cRecs) {
        cRecs.forEach((r: any) => {
          if (r.agenda_id) callRecords[r.agenda_id] = r
          if (r.person_id) callRecords[r.person_id] = r
          if (r.fathom_url) callRecords[r.fathom_url] = r
        })
      }

      // 2. Por person_id
      if (personIds.length > 0) {
        const { data: cRecsPersons } = await sb
          .from("crm_call_records")
          .select("id, agenda_id, person_id, fathom_summary, transcript, trace_analysis, fathom_url, title, participants, occurred_at")
          .in("person_id", personIds)

        if (cRecsPersons) {
          cRecsPersons.forEach((r: any) => {
            if (r.person_id && !callRecords[r.person_id]) callRecords[r.person_id] = r
            if (r.agenda_id && !callRecords[r.agenda_id]) callRecords[r.agenda_id] = r
            if (r.fathom_url && !callRecords[r.fathom_url]) callRecords[r.fathom_url] = r
          })
        }
      }

      // 3. Por fathom_url (de los links directos guardados en las agendas)
      if (fathomUrls.length > 0) {
        const { data: cRecsUrls } = await sb
          .from("crm_call_records")
          .select("id, agenda_id, person_id, fathom_summary, transcript, trace_analysis, fathom_url, title, participants, occurred_at")
          .in("fathom_url", fathomUrls)

        if (cRecsUrls) {
          cRecsUrls.forEach((r: any) => {
            if (r.fathom_url) callRecords[r.fathom_url] = r
            if (r.agenda_id && !callRecords[r.agenda_id]) callRecords[r.agenda_id] = r
            if (r.person_id && !callRecords[r.person_id]) callRecords[r.person_id] = r
          })
        }
      }

      // 4. Por ventana de fechas (con margen de 1 día antes y después por husos horarios)
      const dDesde = new Date(fechaDesde)
      dDesde.setDate(dDesde.getDate() - 1)
      const dHasta = new Date(fechaHasta)
      dHasta.setDate(dHasta.getDate() + 1)
      const fmtIsoDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

      const { data: cRecsWindow } = await sb
        .from("crm_call_records")
        .select("id, agenda_id, person_id, fathom_summary, transcript, trace_analysis, fathom_url, title, participants, occurred_at")
        .gte("occurred_at", `${fmtIsoDate(dDesde)}T00:00:00`)
        .lte("occurred_at", `${fmtIsoDate(dHasta)}T23:59:59`)

      if (cRecsWindow) {
        cRecsWindowList = cRecsWindow
        cRecsWindow.forEach((r: any) => {
          if (r.agenda_id && !callRecords[r.agenda_id]) callRecords[r.agenda_id] = r
          if (r.person_id && !callRecords[r.person_id]) callRecords[r.person_id] = r
          if (r.fathom_url && !callRecords[r.fathom_url]) callRecords[r.fathom_url] = r
        })
      }
    }

    // Acumuladores de métricas
    let programadas = agendaList.length
    let presentadas = 0
    let noShows = 0
    let canceladas = 0
    let calificadasProgramadas = 0
    let calificadasPresentadas = 0
    let noShowsCalificados = 0
    let cierres = 0
    let cierresCalificados = 0
    let noCierres = 0
    let fees = 0
    let cashD1 = 0
    let cashFees = 0
    let ticketTotal = 0

    const arquetipos: ArquetiposMetricas = {
      dueno_negocio: { total: 0, calificadas: 0, presentadas_calificadas: 0, cierres_calificados: 0, cierres_no_calificados: 0, cierres: 0, cash_d1: 0 },
      empleado: { total: 0, calificadas: 0, presentadas_calificadas: 0, cierres_calificados: 0, cierres_no_calificados: 0, cierres: 0, cash_d1: 0 },
      estudiante: { total: 0, calificadas: 0, presentadas_calificadas: 0, cierres_calificados: 0, cierres_no_calificados: 0, cierres: 0, cash_d1: 0 },
      sin_clasificar: { total: 0, calificadas: 0, presentadas_calificadas: 0, cierres_calificados: 0, cierres_no_calificados: 0, cierres: 0, cash_d1: 0 },
    }

    const motivosNoCierre: Record<string, number> = {}
    const angulosCalificados: Record<string, number> = {}

    const callsDetalle: CallDetalle[] = agendaList.map((a) => {
      // 1. Arquetipo leído estrictamente del CRM (sin heurísticas)
      const arq = leerArquetipoCrm(a.ocupacion, (a as any).arquetipo, (a as any).subarquetipo)

      // 2. Calificación leída mediante la definición canónica de Exposure OS
      const esCalif = esAgendaCalificada(a.calificacion, a.lead_score_grade)

      // 3. Lead scoring leído del CRM
      const leadScoreStr = leerLeadScoringCrm(a.lead_score_grade, a.calificacion, a.lead_score)

      // Estados operativos
      const estadoStr = (a.estado || "").toLowerCase()
      const esCancel = estadoStr.includes("cancelad")
      // En su día nuevo, una agenda reprogramada está pendiente: no cuenta como no show.
      const llegoReprogramada = reprogramadaDesde.has(String(a.id)) && estadoStr.includes("reprogram")
      const reprogramadaA: string | null = (a as any)._reprogramada_a || null
      const esNoShow = Boolean(!esCancel && !llegoReprogramada && (a.show === false || estadoStr.includes("no show")))
      const esShow = Boolean(!esCancel && !esNoShow && (a.show === true || estadoStr.includes("adentro") || estadoStr.includes("fee") || estadoStr.includes("cierre") || a.cerro === true))

      const hora = a.fecha_closer ? a.fecha_closer.slice(11, 16) : undefined

      if (esCalif) {
        calificadasProgramadas++
      }

      if (esCancel) {
        canceladas++
      } else if (esNoShow) {
        noShows++
        if (esCalif) noShowsCalificados++
      } else if (esShow) {
        presentadas++
        if (esCalif) calificadasPresentadas++
      }

      // Pagos de esta agenda (cada pago quedó asignado a una sola agenda más arriba)
      const pagosLead = pagosPorAgenda.get(String(a.id)) || []

      let resComercial: CallDetalle["resultado"] = "NO CIERRE"
      let cashLead = Number(a.cc_dia_1) || 0
      let ticketLead = 0
      let formaPagoLead = a.medio_de_pago || ""

      // Lo que mostraba el resumen antes del 12/10/2026, cuando no cruzaba pagos: solo lo cargado en la agenda
      antesPorAgenda.set(String(a.id), esCancel ? { resultado: "CANCELADA", cash: 0 }
        : esNoShow ? { resultado: "NO SHOW", cash: 0 }
        : a.cerro === true || estadoStr.includes("cierre") ? { resultado: "CIERRE", cash: Number(a.cc_dia_1) || 0 }
        : estadoStr.includes("fee") ? { resultado: "FEE", cash: Number(a.cc_dia_1) || 0 }
        : estadoStr.includes("seguimiento") || estadoStr.includes("fup") ? { resultado: "SEGUIMIENTO", cash: 0 }
        : { resultado: "NO CIERRE", cash: 0 })

      if (esCancel) {
        resComercial = "CANCELADA"
      } else if (esNoShow) {
        resComercial = "NO SHOW"
      } else if (pagosLead.length > 0) {
        const esFee = pagosLead.some((p: any) => String(p.tipo || "").toLowerCase().includes("fee") || Number(p.monto) === 27)
        const sumaPagos = pagosLead.reduce((acc: number, p: any) => acc + (Number(p.monto) || 0), 0)
        cashLead = sumaPagos > 0 ? sumaPagos : cashLead

        if (esFee) {
          resComercial = "FEE"
          fees++
          cashFees += cashLead
          ticketLead = cashLead
        } else {
          resComercial = "CIERRE"
          cierres++
          if (esCalif) cierresCalificados++
          cashD1 += cashLead
          ticketLead = 1500 // Ticket base de contrato
          ticketTotal += ticketLead
        }
        formaPagoLead = pagosLead.map((p: any) => p.medio_de_pago).filter(Boolean).join(" / ") || formaPagoLead
      } else if (a.cerro === true || estadoStr.includes("cierre")) {
        resComercial = "CIERRE"
        cierres++
        if (esCalif) cierresCalificados++
        cashD1 += cashLead
        ticketLead = 1500
        ticketTotal += ticketLead
      } else if (estadoStr.includes("fee")) {
        resComercial = "FEE"
        fees++
        cashFees += cashLead
        ticketLead = cashLead
      } else if (estadoStr.includes("seguimiento") || estadoStr.includes("fup")) {
        resComercial = "SEGUIMIENTO"
      }

      if (esShow && resComercial === "NO CIERRE") {
        noCierres++
      }

      // Distribución por Arquetipos (con grupo sin_clasificar)
      const arqKey: keyof ArquetiposMetricas =
        arq.macro === "DUEÑO DE NEGOCIO"
          ? "dueno_negocio"
          : arq.macro === "EMPLEADO"
          ? "empleado"
          : arq.macro === "ESTUDIANTE"
          ? "estudiante"
          : "sin_clasificar"

            arquetipos[arqKey].total++
      if (esCalif) {
        arquetipos[arqKey].calificadas++
        if (esShow) {
          arquetipos[arqKey].presentadas_calificadas++
        }
      }
      if (resComercial === "CIERRE") {
        arquetipos[arqKey].cierres++
        if (esCalif) {
          arquetipos[arqKey].cierres_calificados++
        } else {
          arquetipos[arqKey].cierres_no_calificados++
        }
        arquetipos[arqKey].cash_d1 += cashLead
      }

      // Tasa de cierre con el criterio vigente: un cierre cuenta como presentada aunque falte el show
      const resumenSetting = resumenPorAgenda.get(String(a.id))
      const esCierre = resComercial === "CIERRE"
      const presento = esShow || esCierre
      if (presento) {
        tcv.presentadas++
        if (esCierre) tcv.cierres++
        if (!resumenSetting || resumenSetting.calificada === null) {
          tcv.sin_resumen_presentadas++
          if (esCierre) tcv.cierres_sin_resumen++
        } else if (resumenSetting.calificada) {
          tcv.calificadas_presentadas++
          if (esCierre) tcv.cierres_calificados++
        } else {
          tcv.no_calificadas_presentadas++
          if (esCierre) tcv.cierres_no_calificados++
        }
      }

      // Registro de patrones
      if (a.motivo_no_cierre && resComercial === "NO CIERRE") {
        // varias objeciones juntas ("Miedo · Desconfianza") cuentan cada una
        for (const objKey of a.motivo_no_cierre.split(/\s·\s|\n/).map((x: string) => x.trim()).filter(Boolean)) {
          motivosNoCierre[objKey] = (motivosNoCierre[objKey] || 0) + 1
        }
      }
      if (a.angulo_entrada && esCalif) {
        const angKey = a.angulo_entrada.trim()
        angulosCalificados[angKey] = (angulosCalificados[angKey] || 0) + 1
      }

      // Diagnóstico Fathom: cruza crm_call_records por ID, person_id, link_fathom o coincidencia de nombre
      // La fila del día original de una reprogramación no tiene llamada: no se le cruza Fathom.
      let fathomData = reprogramadaA ? null : callRecords[a.id] || (a.person_id ? callRecords[a.person_id] : null)
      if (!fathomData && a.link_fathom) {
        fathomData = callRecords[a.link_fathom]
        if (!fathomData && cRecsWindowList.length > 0) {
          const normAUrl = (a.link_fathom || "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase()
          fathomData = cRecsWindowList.find((r: any) => {
            const rUrl = (r.fathom_url || "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase()
            return rUrl && (rUrl === normAUrl || normAUrl.includes(rUrl) || rUrl.includes(normAUrl))
          })
        }
      }
      if (!reprogramadaA && !fathomData && cRecsWindowList.length > 0 && a.nombre) {
        const aNorm = normName(a.nombre)
        if (aNorm.length >= 4) {
          fathomData = cRecsWindowList.find((r: any) => {
            const tNorm = normName(r.title)
            if (tNorm.includes(aNorm) || aNorm.includes(tNorm)) return true
            if (Array.isArray(r.participants)) {
              return r.participants.some((p: any) => {
                const pNorm = normName(p?.name || p?.email)
                return pNorm && (pNorm.includes(aNorm) || aNorm.includes(pNorm))
              })
            }
            return false
          })
        }
      }

      const fSummary = fathomData?.fathom_summary || null
      const fTranscript = fathomData?.transcript || null
      const fTrace = fathomData?.trace_analysis || null
      const fUrl = fathomData?.fathom_url || a.link_fathom || null
      const fDiag = parseFathomText(fSummary || a.ia_analisis, fTranscript)
      const fParsed = parseFathomMarkdown(fSummary || a.ia_analisis)

      // Extracción estructurada y enriquecida de los 8 campos solicitados (CRM + FATHOM)
      const califLetra = (a.calificacion || a.lead_score || "B").replace(/LEAD\s*/i, "").trim().slice(0, 1).toUpperCase() || "B"
      const esCerrado = resComercial === "CIERRE" || resComercial === "FEE"

      // 1. Situación actual: CRM base + Fathom
      let situacionActualFinal = ""
      const baseOcupacion = a.ocupacion ? `${a.ocupacion}${a.problema_actual ? ` (Problema: ${a.problema_actual})` : ""}` : ""
      const fathomSit = fTrace?.situacion || fParsed.situation || ""
      if (baseOcupacion && fathomSit && !baseOcupacion.toLowerCase().includes(fathomSit.toLowerCase().slice(0, 20))) {
        situacionActualFinal = `${baseOcupacion} — Fathom: ${fathomSit}`
      } else {
        situacionActualFinal = baseOcupacion || fathomSit || fDiag.urgencia || "No registrada en la llamada"
      }

      // 2. Situación deseada: Fathom (metas/goals) + CRM
      let situacionDeseadaFinal = ""
      if (Array.isArray(fTrace?.desired_outcomes) && fTrace.desired_outcomes.length > 0) {
        situacionDeseadaFinal = fTrace.desired_outcomes.join("; ")
      } else if (fParsed.goals && fParsed.goals.length > 0) {
        situacionDeseadaFinal = fParsed.goals.join("; ")
      } else if (fDiag.deseo_principal) {
        situacionDeseadaFinal = fDiag.deseo_principal
      } else if (a.motivo_urgencia) {
        situacionDeseadaFinal = a.motivo_urgencia
      } else if (a.problema_actual && /quiere|vivir de|ganar|libertad|extra/i.test(a.problema_actual)) {
        const m = a.problema_actual.match(/(?:quiere|busca|desea)\s+([^.]+)/i)
        if (m) situacionDeseadaFinal = `Quiere ${m[1].trim()}`
      }
      if (!situacionDeseadaFinal) {
        situacionDeseadaFinal = "No especificada en la llamada"
      }

      // 3. Dolor o Problema: CRM + Fathom (dolores detectados)
      let dolorProblemaFinal = ""
      const crmProblema = a.problema_actual || ""
      const fathomPains = [
        ...(Array.isArray(fTrace?.pain_points) ? fTrace.pain_points : []),
        ...(Array.isArray(fParsed.pain_points) ? fParsed.pain_points : [])
      ].filter(Boolean)
      const extraPains = fathomPains.filter((p: string) => !crmProblema.toLowerCase().includes(p.toLowerCase().slice(0, 15)))
      if (crmProblema && extraPains.length > 0) {
        dolorProblemaFinal = `${crmProblema} | Fathom: ${extraPains.slice(0, 2).join("; ")}`
      } else if (crmProblema) {
        dolorProblemaFinal = crmProblema
      } else if (fathomPains.length > 0) {
        dolorProblemaFinal = fathomPains.join("; ")
      } else {
        dolorProblemaFinal = fDiag.dolor_principal || "No detectado"
      }

      // 4. Objeción: CRM + Fathom (frenos/dudas)
      let objecionFinal = ""
      const crmObjecion = a.motivo_no_cierre || ""
      const fathomObjs = [
        ...(Array.isArray(fTrace?.objections) ? fTrace.objections : []),
        ...(Array.isArray(fParsed.objections) ? fParsed.objections : [])
      ].filter(Boolean)
      const extraObjs = fathomObjs.filter((o: string) => !crmObjecion.toLowerCase().includes(o.toLowerCase().slice(0, 15)))
      if (crmObjecion && extraObjs.length > 0) {
        objecionFinal = `${crmObjecion} | Fathom: ${extraObjs.slice(0, 2).join("; ")}`
      } else if (crmObjecion) {
        objecionFinal = crmObjecion
      } else if (fathomObjs.length > 0) {
        objecionFinal = fathomObjs.join("; ")
      } else {
        objecionFinal = fDiag.oferta_interes || "Sin objeción registrada"
      }

      // 5. Por qué no cerró: CRM + Fathom
      let porqueNoCerroFinal = ""
      if (esCerrado) {
        porqueNoCerroFinal = "N/A (Llamada cerrada exitosamente)"
      } else {
        const crmMotivo = a.motivo_no_cierre || ""
        const fathomWhyNot = fTrace?.why_not_bought || ""
        const nextSteps = fParsed.next_steps?.[0] || ""
        if (crmMotivo && fathomWhyNot && !crmMotivo.toLowerCase().includes(fathomWhyNot.toLowerCase().slice(0, 15))) {
          porqueNoCerroFinal = `${crmMotivo} (Fathom: ${fathomWhyNot})`
        } else if (crmMotivo) {
          porqueNoCerroFinal = crmMotivo
        } else if (fathomWhyNot) {
          porqueNoCerroFinal = fathomWhyNot
        } else if (nextSteps) {
          porqueNoCerroFinal = `No cerrada — Siguiente paso: ${nextSteps}`
        } else {
          porqueNoCerroFinal = fDiag.motivo_cierre_no_cierre || "No cerrada sin motivo detallado"
        }
      }

      // 6. Motivo de cierre: CRM + Fathom
      let motivoCierreFinal = ""
      if (!esCerrado) {
        motivoCierreFinal = "N/A (No cerró en esta llamada)"
      } else {
        motivoCierreFinal = fTrace?.why_bought || (cashLead > 0 ? `Cierre confirmado con cobro D1 de ${cashLead} USD` : "Propuesta y claridad en el modelo")
      }

      // 7. Resumen de la llamada: PRIORIDAD AL SUMMARY REAL DE FATHOM
      let resumenLlamadaFinal = ""
      if (fSummary && fSummary.trim().length > 20) {
        resumenLlamadaFinal = fSummary.trim()
      } else if (fTrace?.analisis && fTrace.analisis.trim().length > 20) {
        resumenLlamadaFinal = fTrace.analisis.trim()
      } else if (a.ia_analisis && a.ia_analisis.trim().length > 20) {
        resumenLlamadaFinal = a.ia_analisis.trim()
      } else {
        resumenLlamadaFinal = `Llamada de closing con ${a.closer || "Nahuel"}. Resultado: ${resComercial}. Lead: ${a.nombre || "Sin nombre"}.`
      }

      const fLeadDetalle = {
        situacion_actual: situacionActualFinal,
        calificacion: califLetra,
        situacion_deseada: situacionDeseadaFinal,
        dolor_problema: dolorProblemaFinal,
        objecion: objecionFinal,
        porque_no_cerro: porqueNoCerroFinal,
        motivo_cierre: motivoCierreFinal,
        resumen_llamada: resumenLlamadaFinal,
        link_fathom: fUrl,
      }

      // Atribución de ESA agenda limpia y separada:
      // 1. Origen: canal base (limpiando si viniera con comas o concatenaciones)
      const origenLimpio = (a.fuente || "Instagram").split(",")[0].trim()

      // 2. Pieza de entrada específica
      const piezaEntradaLimpia = (a.recurso || "").trim()

      // 3. Keyword / Manychat de ESA agenda
      const keywordLimpia = (a.manychat || "").trim()

      // 4. Ángulo de adquisición: si angulo_entrada está vacío, intentar extraerlo del gatillo del chat
      let anguloLimpio = (a.angulo_entrada || "").trim()
      if (!anguloLimpio && a.resumen_chat) {
        const gatillo = extractBookingContentOrigin(a.resumen_chat)
        if (gatillo) anguloLimpio = gatillo
      }

      return {
        agenda_id: a.id,
        es_show: esShow,
        tipos_pago: pagosLead.map((p: any) => String(p.tipo || "")).filter(Boolean),
        reprogramada_desde: reprogramadaA ? null : reprogramadaDesde.get(String(a.id)) || null,
        etiqueta_reprogramada: reprogramadaA ? null : etiquetaReprogramada(a, conReprogramacion.has(String(a.id))),
        pago_enlazado_por: pagosLead.length ? viaPorAgenda.get(String(a.id)) || null : null,
        nombre: a.nombre || "Sin nombre",
        fecha: a.fecha_closer ? a.fecha_closer.slice(0, 10) : undefined,
        hora,
        closer: a.closer || "Cristian",
        arquetipo_macro: arq.macro,
        subarquetipo: arq.subarquetipo,
        lead_score: leadScoreStr,
        es_calificado: esCalif,
        calificaba_realmente: a.calificaba_realmente || null,
        ingresos_declarados: a.ingresos || "",
        origen: origenLimpio,
        pieza_entrada: piezaEntradaLimpia,
        keyword: keywordLimpia,
        angulo_adquisicion: anguloLimpio,
        porque_agendo: a.problema_actual || a.motivo_urgencia || "",
        resultado: resComercial,
        cash_d1: cashLead,
        ticket_total: ticketLead,
        forma_pago: formaPagoLead,
        objecion_principal: a.motivo_no_cierre || (resComercial === "NO CIERRE" ? "Sin motivo cargado" : ""),
        motivo_real: a.motivo_no_cierre || (resComercial === "CIERRE" ? "Propuesta y claridad en el modelo" : ""),
        motivo_no_show: reprogramadaA
          ? [`Reprogramó para el ${diaHora(reprogramadaA)}`, motivoNoShowPorAgenda.get(String(a.id))].filter(Boolean).join(" · ")
          : resComercial === "NO SHOW" || resComercial === "CANCELADA" ? (motivoNoShowPorAgenda.get(String(a.id)) || null) : null,
        siguiente_paso: reprogramadaA ? `Reprogramada al ${diaHora(reprogramadaA)}`
          : llegoReprogramada ? `Reprogramada (venía del ${diaHora(reprogramadaDesde.get(String(a.id)))})`
          : resComercial === "CIERRE" ? "Onboarding" : (a.estado || "Seguimiento"),
        fathom: fDiag,
        fathom_lead: fLeadDetalle,
        link_fathom: fUrl,
        ia_analisis: a.ia_analisis || fTrace?.analisis || fSummary || null,
        fathom_summary: fSummary || null,
        transcript: fTranscript || null,
        trace_analysis: fTrace || null,
        resumen_chat: a.resumen_chat || null,
        calificacion: califLetra,
        presento,
        calificada_vigente: resumenSetting ? resumenSetting.calificada : null,
        arquetipo_setting: resumenSetting?.arquetipo || null,
        ingreso_setting: resumenSetting?.ingreso || null,
      }
    })

    // ── Regla única (lib/metricas-ventas, 15/10/2026): los mismos números que Métricas y Home ──
    // Cierre = 1 por persona, primer pago de venta nueva, en el día del pago; fees aparte; cuotas y back end no
    // son cierres. Calificada = Lead S/A/B/C. Cash = todo lo cobrado en el período, con desglose.
    const u = await metricasVentas(sb, { desde: fechaDesde, hasta: fechaHasta, closer })
    const personaPorAgenda = new Map<string, string>()
    for (const l of u.llamadas) for (const id of l.agenda_ids || [l.agenda_id]) personaPorAgenda.set(String(id), l.persona)
    const cierrePorPersona = new Map(u.lista_cierres.map((c) => [c.persona, c]))
    const feePorPersona = new Map(u.lista_fees.map((c) => [c.persona, c]))
    const cierrePorAgenda = new Map(u.lista_cierres.filter((c) => c.agenda_id).map((c) => [String(c.agenda_id), c]))
    for (const c of callsDetalle) {
      if (c.resultado === "NO SHOW" || c.resultado === "CANCELADA") continue
      const persona = personaPorAgenda.get(String(c.agenda_id))
      const cierre = (persona && cierrePorPersona.get(persona)) || cierrePorAgenda.get(String(c.agenda_id))
      const fee = persona ? feePorPersona.get(persona) : undefined
      if (cierre) {
        c.resultado = "CIERRE"; c.cash_d1 = cierre.monto; c.ticket_total = c.ticket_total || 1500
      } else if (fee) {
        c.resultado = "FEE"; c.cash_d1 = fee.monto; c.ticket_total = fee.monto
      } else if (c.resultado === "CIERRE" || c.resultado === "FEE") {
        // marcada como cerrada o con pagos que no son venta nueva del período (cuota, back end, venta de otro mes)
        c.resultado = "SEGUIMIENTO"
        c.siguiente_paso = c.cash_d1 > 0 ? "Pago del período que no es venta nueva (cuota, back end o venta anterior)" : "Marcada como cerrada, sin pago de venta nueva cargado"
        c.cash_d1 = 0; c.ticket_total = 0
      }
    }
    const llamadasCalif = u.llamadas.filter((l) => l.calificada)
    const metricas: MetricasClosing = {
      programadas: u.agendas,
      presentadas: u.presentadas,
      no_shows: u.no_show,
      canceladas: u.canceladas,
      calificadas_programadas: u.calificadas,
      calificadas_presentadas: u.calif_presentadas,
      no_shows_calificados: llamadasCalif.filter((l) => l.estado_llamada === "no_show").length,
      calificados_no_cerrados: Math.max(0, u.calif_presentadas - u.cierres_calificados),
      cierres: u.cierres,
      cierres_calificados: u.cierres_calificados,
      no_cierres: Math.max(0, u.presentadas - u.cierres),
      fees: u.fees,
      cash_d1: u.cash.ventas_nuevas,
      aov_dia1: u.cierres + u.fees > 0 ? Math.round((u.cash.ventas_nuevas + u.fees_monto) / (u.cierres + u.fees)) : 0,
      cash_fees: u.fees_monto,
      cash_total: u.cash.total,
      ticket_total: u.cierres * 1500,
      show_rate_pct: u.show_rate ?? 0,
      show_rate_calificados_pct: u.show_rate_calif ?? 0,
      tc_presentadas_pct: u.tasa_cierre ?? 0,
      tc_calificadas_pct: u.tasa_cierre_calif ?? 0,
    }

    if (searchParams.get("auditar_cruce") === "1") {
      const ficha = (id: string) => {
        const c = callsDetalle.find((x) => String(x.agenda_id) === id)
        return c ? { id, nombre: c.nombre, fecha: c.fecha || "", closer: c.closer } : { id, nombre: "Agenda fuera del período", fecha: "", closer: "" }
      }
      const resumenPago = (p: any) => ({ id: p.id, cliente: p.cliente, fecha: p.fecha, monto: Number(p.monto) || 0, tipo: p.tipo, operacion: p.operacion, closer: p.closer, estado: p.record_status || "active" })
      // Agendas cuyo resultado o cash cambia al cruzar los pagos
      const agendasCambian = callsDetalle.flatMap((c) => {
        const antes = antesPorAgenda.get(String(c.agenda_id)) || { resultado: c.resultado, cash: 0 }
        const ahora = { resultado: c.resultado, cash: c.resultado === "CIERRE" || c.resultado === "FEE" ? c.cash_d1 : 0 }
        if (antes.resultado === ahora.resultado && Math.round(antes.cash) === Math.round(ahora.cash)) return []
        return [{ agenda: ficha(String(c.agenda_id)), antes, ahora, via: c.pago_enlazado_por || null, pagos: (pagosPorAgenda.get(String(c.agenda_id)) || []).map(resumenPago) }]
      })
      // Pagos para revisar: los que entraron solo por nombre, los que no tienen agenda en el período y los anulados
      const pagosRevisar = (pagosTodos || []).flatMap((p: any) => {
        const activo = (p.record_status || "active") === "active"
        const d = destinoPorPago.get(String(p.id))
        const estado = !activo ? "anulado" : !d?.destino ? "sin_agenda" : d.via === "nombre" ? "nombre" : null
        if (!estado) return []
        // cuotas y back end de clientes viejos: es normal que no tengan llamada en el período
        if (estado === "sin_agenda" && /cuota|interna|upsell|renov/i.test(String(p.tipo || ""))) return []
        return [{ pago: resumenPago(p), estado, agenda: d?.destino ? ficha(d.destino) : null, via: d?.via || null }]
      })
      return NextResponse.json({ ok: true, fecha_desde: fechaDesde, fecha_hasta: fechaHasta, total_pagos: (pagosTodos || []).length, agendas: agendasCambian, pagos: pagosRevisar })
    }

    const payload: ResumenPayload = {
      periodo,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      closer,
      modo,
      metricas,
      arquetipos,
      tasa_cierre_vigente: {
        ...tcv,
        tc_pct: pct(tcv.cierres, tcv.presentadas),
        tc_calificadas_pct: pct(tcv.cierres_calificados, tcv.calificadas_presentadas),
        tc_no_calificadas_pct: pct(tcv.cierres_no_calificados, tcv.no_calificadas_presentadas),
      },
      calls: callsDetalle,
      patrones: {
        motivos_no_cierre: motivosNoCierre,
        angulos_calificados: angulosCalificados,
      },
    }

    const textoWhatsApp = generarTextoWhatsApp(payload) + (searchParams.get("ligero") === "1" ? "" : await bloqueSeguimientos(sb, fechaDesde, fechaHasta, closer, pagos))

    // ligero=1: la auditoría mensual no necesita transcripciones ni resúmenes largos.
    if (searchParams.get("ligero") === "1") {
      payload.calls = payload.calls.map(({ transcript, fathom_summary, trace_analysis, ia_analisis, resumen_chat, ...c }) => c)
    }

    return NextResponse.json({
      ok: true,
      datos: payload,
      texto_whatsapp: textoWhatsApp,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { accion = "guardar", periodo = "dia", fecha_desde, fecha_hasta, closer = "todos", datos, texto_whatsapp } = body

    if (accion !== "guardar") {
      return NextResponse.json({ error: "Acción no soportada" }, { status: 400 })
    }

    if (!fecha_desde || !datos) {
      return NextResponse.json({ error: "Faltan parámetros obligatorios (fecha_desde, datos)" }, { status: 400 })
    }

    const sb = createSupabaseAdmin()
    const closerSlug = (closer || "todos").toLowerCase().replace(/\s+/g, "_")

    let sourceId = ""
    let assetType = ""
    let name = ""

    if (periodo === "dia") {
      sourceId = `${fecha_desde}_${closerSlug}`
      assetType = "resumen_diario"
      name = `Closing Diario ${fecha_desde} · ${closer.toUpperCase()}`
    } else if (periodo === "semana") {
      sourceId = `${fecha_desde}_${fecha_hasta || fecha_desde}_${closerSlug}`
      assetType = "resumen_semanal"
      name = `Closing Semanal ${fecha_desde} a ${fecha_hasta} · ${closer.toUpperCase()}`
    } else {
      const mes = fecha_desde.slice(0, 7)
      sourceId = `${mes}_${closerSlug}`
      assetType = "resumen_mensual"
      name = `Closing Mensual ${mes} · ${closer.toUpperCase()}`
    }

    const metadataToStore = {
      ...datos,
      texto_whatsapp,
      version_schema: "1.0",
      timestamp_guardado: new Date().toISOString(),
    }

    const { error: upsertErr } = await sb.from("crm_integration_assets").upsert(
      {
        source: "closing",
        asset_type: assetType,
        source_id: sourceId,
        name,
        metadata: metadataToStore,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "source,asset_type,source_id" }
    )

    if (upsertErr) throw new Error(upsertErr.message)

    return NextResponse.json({
      ok: true,
      mensaje: "Reporte guardado exitosamente en crm_integration_assets",
      source_id: sourceId,
      asset_type: assetType,
      name,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
