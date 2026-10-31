// ── Panel del negocio: del CRM al formato del panel ────────────────────────
// El "Panel del negocio" (public/panel/index.html, el dashboard de Agustín
// Ruppel) lee un objeto DATOS con números CRUDOS y calcula solo las tasas,
// deltas y proyecciones. Este archivo arma ese objeto a partir de las tablas
// del CRM (agendas, pagos, cuotas, clientes, metricas_manual).
//
// Reglas que se respetan a rajatabla:
//  · Acá solo se escriben conteos y montos. Ningún porcentaje.
//  · Lo que el CRM no registra NO se inventa: queda en 0 o vacío, y el panel
//    esconde la sección (contenido, reels) o muestra "—".
//  · Los bloques "de 90 días" (closers, setters, fuentes) se calculan sobre
//    los ÚLTIMOS 3 MESES CALENDARIO, igual que la suma de meses del panel,
//    para que su verificación de aritmética cierre.

import { isCashCollectedType } from "@/lib/cash-collected"
import { contractValueFromOperation, newSalesRevenue } from "@/lib/revenue"
import { parseMesLabel } from "@/lib/meses"

export type AgendaPanel = {
  id?: number | string | null
  nombre?: string | null
  fecha_agenda?: string | null
  fecha_closer?: string | null
  fecha_lead?: string | null
  fecha_tc?: string | null
  closer?: string | null
  setter?: string | null
  fuente?: string | null
  recurso?: string | null
  angulo_entrada?: string | null
  calificacion?: string | null
  lead_score_grade?: string | null
  lead_score?: number | null
  calificaba_realmente?: string | null
  show?: boolean | null
  cerro?: boolean | null
  estado?: string | null
  tipo_cierre?: string | null
  seguimiento_estado?: string | null
  seguimiento_nota?: string | null
  seguimiento_actualizado_at?: string | null
  motivo_urgencia?: string | null
  operacion?: string | null
  plan_de_pago?: string | null
  cc_dia_1?: number | null
  created_at?: string | null
}
export type PagoPanel = {
  fecha?: string | null
  cliente?: string | null
  tipo?: string | null
  operacion?: string | null
  ppp?: string | null
  closer?: string | null
  setter?: string | null
  fuente?: string | null
  monto?: number | null
}
export type CuotaPanel = {
  cliente?: string | null
  monto?: number | null
  monto_cobrado?: number | null
  fecha_vencimiento?: string | null
  estado?: string | null
  closer?: string | null
}
export type ClientePanel = {
  fecha_ingreso?: string | null
  fecha_baja?: string | null
  estado?: string | null
  created_at?: string | null
}
export type MetricaPanel = {
  tipo?: string | null
  valor?: number | null
  semana?: string | null
  persona?: string | null
  mes?: string | null
  created_at?: string | null
}

export type EntradaPanel = {
  agendas: AgendaPanel[]
  pagos: PagoPanel[]
  cuotas: CuotaPanel[]
  clientes: ClientePanel[]
  metricas: MetricaPanel[]
  // inversión en Meta Ads por mes ('AAAA-MM' → USD), de lib/ads-embudos.ts
  ads?: Record<string, number>
  // reportes diarios del setter (crm_integration_assets source=setting), tal como los cargó scripts/setting
  setting?: SettingDiaPanel[]
  hoy?: Date
  metaMensual?: number
  precioBase?: number
  marca?: { nombre?: string; bajada?: string; moneda?: string }
}

export type SettingDiaPanel = {
  fecha: string; setter: string
  calendarios_enviados: number | null; agendas: number | null; calificados_dia: number | null; fups: number | null
  nuevos_seguidores: number | null; ns_contestan: number | null; ns_califican: number | null; ns_bookeados: number | null
  historia: string | null; historia_comentaron: number | null; historia_calificaron: number | null; historia_bookeados: number | null
  outbound_enviados: number | null; outbound_respuestas: number | null; outbound_agendas: number | null
  leads: Array<{ lead: string; usuario: string; nombre: string; origen: string; calificado: boolean; ciclo: string; gatillo: string; feed: string | null; fups: number | null; dolor: string | null; objetivo: string | null; agenda_id?: string | null; agenda_nombre?: string | null }>
}

export type DatosPanel = {
  marca: { nombre: string; bajada: string; moneda: string; metaMensual: number }
  meses: Array<{
    mes: string; facturado: number; cobrado: number; leads: number; agendas: number
    presentadas: number; calificadas: number; cierres: number; ads: number; alumnos: number
    // agendas = llamadas con fecha de llamada en el mes · vencidas = ya ocurrieron · pendientes = todavía no
    // presentadas / noShow / sinDato reparten las vencidas según el show cargado (true / false / null)
    vencidas: number; pendientes: number; noShow: number; sinDato: number
    dias?: number; diasTotal?: number
  }>
  // todas las agendas del mes en curso, una por fila, para la vista "todas / pendientes / sin resultado"
  agendasMes: Array<{ fecha: string; lead: string; closer: string; setter: string; fuente: string; segmento: string; estado: string; show: boolean | null; cerro: boolean; pendiente: boolean; calificado: boolean; tipo: string | null }>
  // el mes en curso por tipo de lead (scoring automático S/A/B/C/D; null = sin scoring)
  tiposMes: Array<{ tipo: string | null; agendas: number; vencidas: number; pendientes: number; presentadas: number; noShow: number; sinDato: number; cierres: number }>
  // el mes en curso por segmento de origen (Webinar, Orgánico, Ads, Outbound…)
  segmentos: Array<{ segmento: string; agendas: number; vencidas: number; pendientes: number; presentadas: number; noShow: number; sinDato: number; calificadas: number; cierres: number }>
  closers: Array<{ nombre: string; presentadas: number; calificadas: number; cierres: number; cobrado: number }>
  setters: Array<{ nombre: string; inbound: number; fups: number; agendas: number }>
  // setting diario: un elemento por día reportado por el setter (vacío si no hay reportes cargados)
  setting: SettingDiaPanel[]
  fuentes: Array<{ nombre: string; leads: number; agendas: number; cierres: number }>
  contenido: Array<{ formato: string; piezas: number; views: number; ctas: number; leads: number; agendas: number }>
  reels: Array<Record<string, unknown>>
  pipelineEtapas: Array<{ nombre: string; prob: number }>
  pipeline: Array<{ lead: string; closer: string; etapa: string; monto: number; dias: number; fuente: string; prox: string }>
  cuotas: Array<{ alumno: string; monto: number; vence: string; closer: string; estado: "cobrado" | "por-cobrar" | "vencida" | "protocolo" }>
  llamadas: Array<{ fecha: string; lead: string; closer: string; fuente: string; estrategia: string; calificado: boolean; tipo: string | null; situacion: string; monto: number }>
}

// ── fechas ──────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0")
export const claveMes = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const isoDia = (d: Date) => `${claveMes(d)}-${pad(d.getDate())}`

function fecha(valor: string | null | undefined): Date | null {
  if (!valor) return null
  const s = String(valor).trim()
  // "2026-09-08" o "2026-09-08T14:00:00…" → se toma el día tal cual está escrito
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}
const mesDe = (valor: string | null | undefined) => {
  const d = fecha(valor)
  return d ? claveMes(d) : null
}
const diasEntre = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000))

// ── normalización de textos ────────────────────────────────────────────────
const limpio = (s: string | null | undefined) => String(s || "").trim()
const minus = (s: string | null | undefined) => limpio(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
// Calificada = LEAD A, B o C (D no). En EXPOSURE la mayoría de los cierres son LEAD C (29 de 44 desde junio 2026).
const CALIF_AB = new Set(["lead a", "lead b", "lead c", "a", "b", "c", "s"])
// tipo de lead: el scoring automático (S/A/B/C/D) o, si no corrió, la calificación cargada si tiene esa forma
const tipoDeLead = (a: AgendaPanel): string | null => {
  const g = String(a.lead_score_grade || "").toUpperCase().trim()
  if (/^LEAD [SABCD]$/.test(g)) return g
  const c = String(a.calificacion || "").toUpperCase().trim()
  if (/^LEAD [SABCD]$/.test(c)) return c
  if (/^[SABCD]$/.test(c)) return `LEAD ${c}`
  return null
}
const esCalificada = (a: AgendaPanel) => {
  const real = minus(a.calificaba_realmente)
  if (real) return real.startsWith("s") || real === "true"
  return CALIF_AB.has(minus(a.calificacion))
}
const archivada = (a: AgendaPanel) => minus(a.estado) === "archivada manualmente"

// Etiqueta de fuente: se agrupa por canal para que el donut tenga 4 a 6
// porciones y no 30 (las opciones del CRM son muy granulares).
export function canalDe(fuente: string | null | undefined): string {
  const f = minus(fuente)
  if (!f) return "Sin fuente"
  if (/ads|rmkt|frio|anuncio/.test(f)) return "Ads Meta"
  if (/youtube/.test(f)) return "YouTube"
  if (/demo.?app/.test(f)) return "Demo app"
  if (/tiktok/.test(f)) return "TikTok"
  if (/referid|recomend/.test(f)) return "Referidos"
  if (/outbound|prospecci/.test(f)) return "Outbound"
  if (/instagram|ig |reel|story|historia|carrusel|bio|manychat|dm/.test(f)) return "Instagram orgánico"
  if (/whatsapp|wpp/.test(f)) return "WhatsApp / otro"
  return limpio(fuente)
}

// Segmento de origen de una agenda (para comparar webinar vs orgánico).
export function segmentoDe(fuente: string | null | undefined): string {
  const f = minus(fuente)
  if (!f) return "Sin fuente"
  if (/webinar|masterclass|clase/.test(f)) return "Webinar"
  if (/ads|anuncio|frio|rmkt/.test(f)) return "Ads"
  if (/outbound|prospecci/.test(f)) return "Outbound"
  if (/instagram|ig |reel|story|historia|carrusel|bio|manychat|dm|bienvenida|referid|youtube|tiktok|producto|demo.?app/.test(f)) return "Orgánico"
  return "Otro"
}

// Mes de una fila de metricas_manual: "2026-09", "Septiembre 2026", una
// semana ISO "2026-W37" o una fecha; si no hay nada, el mes de created_at.
function mesMetrica(m: MetricaPanel): string | null {
  const mes = limpio(m.mes)
  if (/^\d{4}-\d{2}$/.test(mes)) return mes
  const parsed = mes ? parseMesLabel(mes) : null
  if (parsed) return `${parsed.year}-${pad(parsed.idx + 1)}`
  const sem = limpio(m.semana)
  const w = sem.match(/^(\d{4})-?W(\d{1,2})$/i)
  if (w) {
    const d = new Date(Number(w[1]), 0, 4 + (Number(w[2]) - 1) * 7)
    return claveMes(d)
  }
  return mesDe(sem) || mesDe(m.created_at)
}

// ── el armado ───────────────────────────────────────────────────────────────
export function armarDatosPanel(e: EntradaPanel): DatosPanel {
  const hoy = e.hoy ?? new Date()
  const precioBase = e.precioBase ?? 1500 // IA Partner PIF desde septiembre 2026
  const agendas = e.agendas.filter((a) => !archivada(a))

  // 12 meses terminando en el mes en curso
  const meses: string[] = []
  for (let i = 11; i >= 0; i--) meses.push(claveMes(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)))
  const idx = (k: string | null) => (k ? meses.indexOf(k) : -1)
  const ultimos3 = new Set(meses.slice(-3))
  const en3 = (k: string | null) => !!k && ultimos3.has(k)

  // ── meses ──
  const filas = meses.map((mes) => ({ mes, facturado: 0, cobrado: 0, leads: 0, agendas: 0, presentadas: 0, calificadas: 0, cierres: 0, ads: 0, alumnos: 0, vencidas: 0, pendientes: 0, noShow: 0, sinDato: 0 }))
  for (const f of filas) f.ads = Math.round(e.ads?.[f.mes] || 0)
  const fechaLlamada = (a: AgendaPanel) => fecha(a.fecha_closer) || fecha(a.fecha_agenda)
  const pagosPorMes = new Map<string, PagoPanel[]>()
  for (const p of e.pagos) {
    const k = mesDe(p.fecha)
    const i = idx(k)
    if (i < 0 || !k) continue
    if (isCashCollectedType(p.tipo)) filas[i].cobrado += Number(p.monto || 0)
    if (!pagosPorMes.has(k)) pagosPorMes.set(k, [])
    pagosPorMes.get(k)!.push(p)
  }
  for (const [k, lista] of pagosPorMes) {
    const i = idx(k)
    if (i >= 0) filas[i].facturado += newSalesRevenue(lista)
  }
  for (const a of agendas) {
    const d = fechaLlamada(a)
    const i = idx(d ? claveMes(d) : mesDe(a.fecha_agenda))
    if (i >= 0) {
      filas[i].agendas++
      const vencida = !d || d <= hoy
      if (!vencida) filas[i].pendientes++
      else {
        filas[i].vencidas++
        if (a.show === true) {
          filas[i].presentadas++
          if (esCalificada(a)) filas[i].calificadas++
        } else if (a.show === false) filas[i].noShow++
        else filas[i].sinDato++
      }
    }
    if (a.cerro) {
      const j = idx(mesDe(a.fecha_tc) || mesDe(a.fecha_agenda))
      if (j >= 0) filas[j].cierres++
    }
  }
  for (const m of e.metricas) {
    if (minus(m.tipo) !== "nuevos_leads") continue
    const i = idx(mesMetrica(m))
    if (i >= 0) filas[i].leads += Number(m.valor || 0)
  }
  // leads: si no hay carga manual de "nuevos_leads", se usan los leads que
  // entraron al CRM (fecha_lead) — es lo que el CRM sabe, ni más ni menos.
  if (!filas.some((f) => f.leads)) {
    for (const a of agendas) {
      const i = idx(mesDe(a.fecha_lead) || mesDe(a.created_at))
      if (i >= 0) filas[i].leads++
    }
  }
  // alumnos activos a fin de cada mes
  const activosA = (fin: Date) => e.clientes.filter((c) => {
    const ingreso = fecha(c.fecha_ingreso) || fecha(c.created_at)
    if (!ingreso || ingreso > fin) return false
    const baja = fecha(c.fecha_baja)
    if (baja && baja <= fin) return false
    return !/baja|inactiv|cancel/.test(minus(c.estado))
  }).length
  filas.forEach((f) => {
    const [y, mo] = f.mes.split("-").map(Number)
    f.alumnos = activosA(new Date(y, mo, 0, 23, 59))
    f.cobrado = Math.round(f.cobrado * 100) / 100
    f.facturado = Math.round(f.facturado * 100) / 100
  })
  const actual = filas[filas.length - 1] as DatosPanel["meses"][number]
  actual.dias = hoy.getDate()
  actual.diasTotal = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()

  // ── closers (últimos 3 meses) ──
  const closers = new Map<string, DatosPanel["closers"][number]>()
  const closerDe = (n: string | null | undefined) => limpio(n) || "Sin closer"
  const c = (n: string) => {
    if (!closers.has(n)) closers.set(n, { nombre: n, presentadas: 0, calificadas: 0, cierres: 0, cobrado: 0 })
    return closers.get(n)!
  }
  for (const a of agendas) {
    const enAgenda = en3(mesDe(a.fecha_agenda))
    if (enAgenda && a.show) {
      const x = c(closerDe(a.closer)); x.presentadas++
      if (esCalificada(a)) x.calificadas++
    }
    if (a.cerro && en3(mesDe(a.fecha_tc) || mesDe(a.fecha_agenda))) c(closerDe(a.closer)).cierres++
  }
  for (const p of e.pagos) {
    if (!en3(mesDe(p.fecha)) || !isCashCollectedType(p.tipo)) continue
    c(closerDe(p.closer)).cobrado += Number(p.monto || 0)
  }
  if (!closers.size) c("Sin closer")

  // ── setters (últimos 3 meses) ──
  const setters = new Map<string, DatosPanel["setters"][number]>()
  const s = (n: string) => {
    if (!setters.has(n)) setters.set(n, { nombre: n, inbound: 0, fups: 0, agendas: 0 })
    return setters.get(n)!
  }
  for (const a of agendas) if (en3(mesDe(a.fecha_agenda))) s(limpio(a.setter) || "Sin setter").agendas++
  for (const m of e.metricas) {
    if (minus(m.tipo) !== "conversaciones_asignadas" || !en3(mesMetrica(m))) continue
    s(limpio(m.persona) || "Sin setter").inbound += Number(m.valor || 0)
  }
  if (!setters.size) s("Sin setter")

  // ── fuentes (últimos 3 meses) ──
  // El CRM no registra conversaciones por fuente: "leads" es la cantidad de
  // leads que entraron (fecha_lead) por ese canal. Cuando ManyChat esté
  // conectado, este número pasa a ser el de conversaciones reales.
  const fuentes = new Map<string, DatosPanel["fuentes"][number]>()
  const f = (n: string) => {
    if (!fuentes.has(n)) fuentes.set(n, { nombre: n, leads: 0, agendas: 0, cierres: 0 })
    return fuentes.get(n)!
  }
  for (const a of agendas) {
    const canal = canalDe(a.fuente)
    if (en3(mesDe(a.fecha_lead) || mesDe(a.created_at) || mesDe(a.fecha_agenda))) f(canal).leads++
    if (en3(mesDe(a.fecha_agenda))) f(canal).agendas++
    if (a.cerro && en3(mesDe(a.fecha_tc) || mesDe(a.fecha_agenda))) f(canal).cierres++
  }
  for (const x of fuentes.values()) if (x.leads < x.agendas) x.leads = x.agendas
  if (!fuentes.size) f("Sin fuente")

  // ── pipeline: las oportunidades abiertas de hoy ──
  const pipelineEtapas = [
    { nombre: "Agendada", prob: 10 }, { nombre: "Presentada", prob: 25 }, { nombre: "Calificada", prob: 40 },
    { nombre: "Propuesta", prob: 60 }, { nombre: "Seguimiento", prob: 75 },
  ]
  const pipeline: DatosPanel["pipeline"] = []
  const limiteAtras = new Date(hoy); limiteAtras.setDate(limiteAtras.getDate() - 60)
  for (const a of agendas) {
    if (a.cerro) continue
    const seg = minus(a.seguimiento_estado)
    if (seg === "descartado" || seg === "cerrado") continue
    const cuando = fecha(a.fecha_agenda)
    if (!cuando || cuando < limiteAtras) continue
    const futura = cuando > hoy
    if (!futura && !a.show && seg !== "reagendado") continue // no se presentó y nadie la reagendó: no es oportunidad
    let etapa = "Agendada"
    if (!futura && a.show) {
      etapa = "Presentada"
      if (esCalificada(a)) etapa = "Calificada"
      if (limpio(a.operacion) || limpio(a.plan_de_pago)) etapa = "Propuesta"
      if (["pendiente", "contactado", "reagendado"].includes(seg)) etapa = "Seguimiento"
    }
    const referencia = fecha(a.seguimiento_actualizado_at) || cuando
    pipeline.push({
      lead: limpio(a.nombre) || "Sin nombre",
      closer: closerDe(a.closer),
      etapa,
      monto: contractValueFromOperation(a.operacion, precioBase),
      dias: futura ? 0 : diasEntre(referencia, hoy),
      fuente: canalDe(a.fuente),
      prox: limpio(a.seguimiento_nota) || limpio(a.motivo_urgencia) || (futura ? `Llamada el ${isoDia(cuando)}` : ""),
    })
  }

  // ── cuotas: estado de hoy ──
  const cuotas: DatosPanel["cuotas"] = []
  for (const q of e.cuotas) {
    const vence = fecha(q.fecha_vencimiento)
    if (!vence) continue
    // solo el mes en curso, igual que en el panel
    if (claveMes(vence) !== claveMes(hoy)) continue
    const est = minus(q.estado)
    const cobrada = /cobrad|pagad|paid/.test(est) || (Number(q.monto_cobrado || 0) >= Number(q.monto || 0) && Number(q.monto || 0) > 0)
    let estado: DatosPanel["cuotas"][number]["estado"] = "por-cobrar"
    if (cobrada) estado = "cobrado"
    else if (/protocolo|mora|reclamo/.test(est)) estado = "protocolo"
    else if (vence < new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) estado = "vencida"
    cuotas.push({ alumno: limpio(q.cliente) || "Sin nombre", monto: Number(q.monto || 0), vence: isoDia(vence), closer: closerDe(q.closer), estado })
  }

  // ── últimas llamadas ──
  const pasadas = agendas
    .map((a) => ({ a, d: fecha(a.fecha_agenda) }))
    .filter((x): x is { a: AgendaPanel; d: Date } => !!x.d && x.d <= hoy)
    .sort((x, y) => y.d.getTime() - x.d.getTime())
    .slice(0, 16)
  const llamadas: DatosPanel["llamadas"] = pasadas.map(({ a, d }) => {
    const seg = minus(a.seguimiento_estado)
    let situacion = "No cerró"
    if (a.cerro) situacion = /seguimiento|post/.test(minus(a.tipo_cierre)) || seg === "cerrado" ? "Adentro en seguimiento" : "Adentro en llamada"
    else if (!a.show) situacion = seg === "reagendado" ? "Reagendado" : minus(a.estado) === "no show" || diasEntre(d, hoy) >= 1 ? "No se presentó" : "Pendiente"
    else if (seg === "reagendado") situacion = "Reagendado"
    else if (seg === "pendiente" || seg === "contactado") situacion = "Pendiente"
    const monto = a.cerro ? Number(a.cc_dia_1 || 0) || contractValueFromOperation(a.operacion, 0) : 0
    return {
      fecha: isoDia(d),
      lead: limpio(a.nombre) || "Sin nombre",
      closer: closerDe(a.closer),
      fuente: canalDe(a.fuente),
      estrategia: limpio(a.recurso) || limpio(a.angulo_entrada) || "—",
      calificado: esCalificada(a),
      tipo: tipoDeLead(a),
      situacion,
      monto,
    }
  })

  const redondear = <T extends { cobrado: number }>(x: T) => ({ ...x, cobrado: Math.round(x.cobrado * 100) / 100 })

  // ── agendas del mes en curso (todas, con su estado de show) y corte por segmento ──
  const mesActual = claveMes(hoy)
  const agendasMes: DatosPanel["agendasMes"] = agendas
    .map((a) => ({ a, d: fechaLlamada(a) }))
    .filter(({ a, d }) => (d ? claveMes(d) : mesDe(a.fecha_agenda)) === mesActual)
    .sort((x, y) => (x.d?.getTime() || 0) - (y.d?.getTime() || 0))
    .map(({ a, d }) => ({
      fecha: d ? `${isoDia(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` : "",
      lead: limpio(a.nombre) || "Sin nombre",
      closer: closerDe(a.closer),
      setter: limpio(a.setter) || "—",
      fuente: limpio(a.fuente) || "Sin fuente",
      segmento: segmentoDe(a.fuente),
      estado: limpio(a.estado) || "",
      show: a.show === true ? true : a.show === false ? false : null,
      cerro: Boolean(a.cerro),
      pendiente: !!d && d > hoy,
      calificado: esCalificada(a),
      tipo: tipoDeLead(a),
    }))
  const tiposMap = new Map<string | null, DatosPanel["tiposMes"][number]>()
  for (const x of agendasMes) {
    if (!tiposMap.has(x.tipo)) tiposMap.set(x.tipo, { tipo: x.tipo, agendas: 0, vencidas: 0, pendientes: 0, presentadas: 0, noShow: 0, sinDato: 0, cierres: 0 })
    const t = tiposMap.get(x.tipo)!
    t.agendas++
    if (x.pendiente) t.pendientes++
    else { t.vencidas++; if (x.show === true) t.presentadas++; else if (x.show === false) t.noShow++; else t.sinDato++ }
    if (x.cerro) t.cierres++
  }
  const ORDEN_TIPOS = ["LEAD S", "LEAD A", "LEAD B", "LEAD C", "LEAD D", null]
  const tiposMes = [...tiposMap.values()].sort((a, b) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo))
  const segmentos = new Map<string, DatosPanel["segmentos"][number]>()
  for (const x of agendasMes) {
    if (!segmentos.has(x.segmento)) segmentos.set(x.segmento, { segmento: x.segmento, agendas: 0, vencidas: 0, pendientes: 0, presentadas: 0, noShow: 0, sinDato: 0, calificadas: 0, cierres: 0 })
    const sgm = segmentos.get(x.segmento)!
    sgm.agendas++
    if (x.pendiente) sgm.pendientes++
    else {
      sgm.vencidas++
      if (x.show === true) { sgm.presentadas++; if (x.calificado) sgm.calificadas++ }
      else if (x.show === false) sgm.noShow++
      else sgm.sinDato++
    }
    if (x.cerro) sgm.cierres++
  }

  return {
    marca: {
      nombre: e.marca?.nombre || "EXPOSURE",
      bajada: e.marca?.bajada || "Panel del negocio",
      moneda: e.marca?.moneda || "$",
      metaMensual: e.metaMensual ?? 50000,
    },
    meses: filas,
    closers: [...closers.values()].map(redondear),
    setters: [...setters.values()],
    setting: (e.setting ?? []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha)),
    fuentes: [...fuentes.values()],
    contenido: [], // el CRM todavía no mide piezas/views por formato: la página se esconde sola
    reels: [],     // ídem: sin atribución por reel no se inventa nada
    pipelineEtapas,
    pipeline,
    cuotas,
    llamadas,
    agendasMes,
    tiposMes,
    segmentos: [...segmentos.values()].sort((x, y) => y.agendas - x.agendas),
  }
}
