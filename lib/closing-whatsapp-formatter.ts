import type { MacroArquetipo } from "./arquetipos-closing"

export type FathomResumenLead = {
  situacion_actual?: string
  calificacion?: string
  situacion_deseada?: string
  dolor_problema?: string
  objecion?: string
  porque_no_cerro?: string
  motivo_cierre?: string
  resumen_llamada?: string
  link_fathom?: string | null
}

export type FathomDiagnostico = {
  mencion_alex?: string
  contenido_recuerda?: string
  dolor_principal?: string
  deseo_principal?: string
  urgencia?: string
  porque_agendo?: string
  oferta_interes?: string
  objecion_real?: string
  motivo_cierre_no_cierre?: string
  mensaje_resono?: string
  insight_mensaje?: string
  siguiente_paso?: string
}

export type CallDetalle = {
  agenda_id?: number | string
  es_show?: boolean
  tipos_pago?: string[] // conceptos de los pagos del período cruzados con la agenda
  pago_enlazado_por?: string | null
  reprogramada_desde?: string | null // fecha de la llamada original, si esta agenda llegó a este día por una reprogramación
  etiqueta_reprogramada?: string | null // "Reprogramó y no se presentó" | "Reprogramó y no cerró" | "Reprogramó y cerró" | … // "agenda" | "persona" | "teléfono" | "nombre": cómo se encontró el pago
  nombre: string
  fecha?: string
  hora?: string
  closer: string
  arquetipo_macro: MacroArquetipo
  subarquetipo: string | null
  lead_score: string // "LEAD S", "LEAD A", ..., "SIN SCORING"
  es_calificado: boolean
  calificaba_realmente?: string | null // "Si", "No", null
  ingresos_declarados?: string
  origen: string
  pieza_entrada?: string
  keyword?: string
  angulo_adquisicion?: string
  porque_agendo?: string
  resultado: "CIERRE" | "FEE" | "NO CIERRE" | "NO SHOW" | "CANCELADA" | "SEGUIMIENTO"
  cash_d1: number
  ticket_total: number
  forma_pago?: string
  objecion_principal?: string
  motivo_real?: string
  motivo_no_show?: string | null
  siguiente_paso?: string
  fathom?: FathomDiagnostico
  fathom_lead?: FathomResumenLead
  link_fathom?: string | null
  ia_analisis?: string | null
  resumen_chat?: string | null
  calificacion?: string | null
  fathom_summary?: string | null
  transcript?: string | null
  trace_analysis?: any | null
  // Criterio vigente de calificada (08/10/2026): sale del resumen de setting clasificado
  presento?: boolean
  calificada_vigente?: boolean | null // null = sin resumen de setting
  arquetipo_setting?: string | null
  ingreso_setting?: string | null
}

// Tasa de cierre con el criterio de calificada vigente (08/10/2026): declaró en iClosed que gana
// USD 1.000-3.000 por mes + arquetipo foco (9 a 5, universitario, sabe IA o dueño de negocio).
export type TasaCierreVigente = {
  presentadas: number
  cierres: number
  tc_pct: number
  calificadas_presentadas: number
  cierres_calificados: number
  tc_calificadas_pct: number
  no_calificadas_presentadas: number
  cierres_no_calificados: number
  tc_no_calificadas_pct: number
  sin_resumen_presentadas: number
  cierres_sin_resumen: number
}

export type MetricasClosing = {
  programadas: number
  presentadas: number
  no_shows: number
  canceladas: number
  calificadas_programadas: number
  calificadas_presentadas: number
  no_shows_calificados: number
  calificados_no_cerrados: number
  cierres: number
  cierres_calificados: number
  no_cierres: number
  fees: number
  cash_d1: number
  // AOV Día 1 (Nahuel, 19/11/2026): lo que paga en promedio cada lead en la llamada = (cash D1 + fees) ÷ (cierres + fees).
  // Misma regla que Home, Métricas y Embudos. cash_d1 sigue siendo el total cobrado en llamada.
  aov_dia1?: number
  cash_fees: number
  cash_total?: number // todo lo cobrado en el período (ventas, fees, cuotas, back end) — regla única
  ticket_total: number
  show_rate_pct: number
  show_rate_calificados_pct: number
  tc_presentadas_pct: number
  tc_calificadas_pct: number
}

// AOV Día 1 = (cash D1 + fees) ÷ (cierres + fees). Los reportes viejos guardados no traen aov_dia1: se calcula.
export function aovDia1(m: { cash_d1?: number; cash_fees?: number; cierres?: number; fees?: number; aov_dia1?: number }): number {
  if (typeof m.aov_dia1 === "number") return m.aov_dia1
  const n = (Number(m.cierres) || 0) + (Number(m.fees) || 0)
  return n > 0 ? Math.round(((Number(m.cash_d1) || 0) + (Number(m.cash_fees) || 0)) / n) : 0
}

export type ArquetiposMetricas = {
  dueno_negocio: { total: number; calificadas: number; presentadas_calificadas: number; cierres_calificados: number; cierres_no_calificados: number; cierres: number; cash_d1: number }
  empleado: { total: number; calificadas: number; presentadas_calificadas: number; cierres_calificados: number; cierres_no_calificados: number; cierres: number; cash_d1: number }
  estudiante: { total: number; calificadas: number; presentadas_calificadas: number; cierres_calificados: number; cierres_no_calificados: number; cierres: number; cash_d1: number }
  sin_clasificar: { total: number; calificadas: number; presentadas_calificadas: number; cierres_calificados: number; cierres_no_calificados: number; cierres: number; cash_d1: number }
}

export type ResumenPayload = {
  periodo: "dia" | "semana" | "mes"
  fecha_desde: string
  fecha_hasta: string
  closer: string
  modo: "detallado" | "corto"
  metricas: MetricasClosing
  arquetipos: ArquetiposMetricas
  tasa_cierre_vigente?: TasaCierreVigente
  calls: CallDetalle[]
  patrones?: {
    motivos_no_cierre?: Record<string, number>
    angulos_calificados?: Record<string, number>
  }
}

function fmtFecha(iso?: string) {
  if (!iso) return ""
  const partes = iso.slice(0, 10).split("-")
  if (partes.length !== 3) return iso
  return `${partes[2]}/${partes[1]}/${partes[0]}`
}

// ── Objeciones y ángulos (16/10/2026) ──
// Objeciones de cada llamada: las que cargó el closer en la ficha (motivo_no_cierre, varias separadas por " · ")
// y las que detectó el análisis de Fathom (trace_analysis.objections). Se agrupan por tipo para contarlas.
const TIPOS_OBJECION: Array<[RegExp, string]> = [
  [/caro|precio|cuesta mucho|muy alto/i, "Precio (le parece caro)"],
  [/\bpif\b|cuota|financ|pagar en partes/i, "No llega al pago o a la cuota"],
  [/dinero|plata|fondos|recursos|ahorro|no tiene|no ten[ií]a|presupuesto|econ[oó]m/i, "Dinero"],
  [/desconf|estaf|confian|garant|humo/i, "Confianza"],
  [/miedo|riesgo|insegur/i, "Miedo / riesgo"],
  [/padre|madre|pareja|espos|socio|familia|mayor|consultar/i, "Decide otra persona"],
  [/tiempo|horario|ocupad/i, "Tiempo"],
  [/pensar|pensarlo|analizar|decidir/i, "Lo tiene que pensar"],
  [/m[eé]todo de pago|tarjeta|banco|transferencia/i, "Método de pago"],
  [/urgencia|m[aá]s adelante/i, "No tiene urgencia"],
  [/capaz|impostor|no s[eé] si puedo|experiencia/i, "Duda de su capacidad"],
  [/no califica|desemple|menor/i, "No califica"],
]
const tipoObjecion = (t: string) => TIPOS_OBJECION.find(([re]) => re.test(t))?.[1] || "Otra"

function objecionesDeLlamada(c: CallDetalle): Array<{ texto: string; fuente: "ficha" | "Fathom" }> {
  const out: Array<{ texto: string; fuente: "ficha" | "Fathom" }> = []
  const vistos = new Set<string>()
  const add = (texto: unknown, fuente: "ficha" | "Fathom") => {
    const t = String(texto || "").trim()
    if (!t || /^sin (motivo|objeci)/i.test(t) || /^propuesta y claridad/i.test(t)) return
    const k = t.toLowerCase().slice(0, 60)
    if (vistos.has(k)) return
    vistos.add(k)
    out.push({ texto: t.length > 140 ? `${t.slice(0, 140)}…` : t, fuente })
  }
  for (const o of String(c.objecion_principal || "").split(/\s·\s|\n/)) add(o, "ficha")
  const trace = (c.trace_analysis || {}) as { objections?: unknown[] }
  if (Array.isArray(trace.objections) && trace.objections.length) {
    for (const o of trace.objections) add(o, "Fathom")
  } else {
    const f = String(c.fathom_lead?.objecion || "")
    const i = f.indexOf("Fathom:")
    if (i >= 0) for (const o of f.slice(i + 7).split(";")) add(o, "Fathom")
  }
  return out
}
const presento = (c: CallDetalle) => c.resultado !== "NO SHOW" && c.resultado !== "CANCELADA"
const cerroLlamada = (c: CallDetalle) => c.resultado === "CIERRE" || c.resultado === "FEE"
const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t)

function seccionObjecionesYAngulos(calls: CallDetalle[], etiqueta: string, detalleCompleto: boolean): string[] {
  const L: string[] = []
  const linea = "━━━━━━━━━━━━━━━━━━━━━━━━━━"
  const noCerradas = calls.filter((c) => presento(c) && !cerroLlamada(c))
  const cerradas = calls.filter(cerroLlamada)
  const conteo = (lista: CallDetalle[]) => {
    const m = new Map<string, Set<string>>()
    for (const c of lista) for (const o of objecionesDeLlamada(c)) {
      const t = tipoObjecion(o.texto)
      if (!m.has(t)) m.set(t, new Set())
      m.get(t)!.add(c.nombre)
    }
    return [...m.entries()].sort((a, b) => b[1].size - a[1].size)
  }
  const nombres = (set: Set<string>) => `${[...set].slice(0, 6).join(", ")}${set.size > 6 ? "…" : ""}`

  // Objeciones que no permitieron cerrar
  L.push(linea, `🛑 OBJECIONES NO RESUELTAS ${etiqueta}`, linea)
  const nr = conteo(noCerradas)
  if (!noCerradas.length) L.push("• No hubo llamadas presentadas sin cerrar.")
  else if (!nr.length) L.push(`• ${noCerradas.length} llamadas sin cerrar, pero ninguna tiene la objeción cargada en la ficha ni en Fathom.`)
  else {
    for (const [t, set] of nr) L.push(`• ${t}: ${set.size} (${nombres(set)})`)
    const sinDato = noCerradas.filter((c) => !objecionesDeLlamada(c).length).length
    if (sinDato) L.push(`• Sin objeción cargada (ni ficha ni Fathom): ${sinDato}`)
    if (detalleCompleto) {
      L.push("")
      for (const c of noCerradas) {
        const obs = objecionesDeLlamada(c)
        L.push(`• ${c.nombre} (${c.closer}) — ${obs.length ? obs.map((o) => `${o.texto} [${o.fuente}]`).join(" · ") : "sin objeción cargada"}`)
      }
    }
  }
  L.push("")

  // Objeciones resueltas en las ventas
  L.push(linea, `✅ OBJECIONES RESUELTAS ${etiqueta}`, linea)
  if (!cerradas.length) L.push("• No hubo ventas ni fees.")
  else {
    const res = conteo(cerradas)
    if (!res.length) L.push(`• ${cerradas.length} ventas/fees sin objeciones registradas en Fathom ni en la ficha.`)
    for (const [t, set] of res) L.push(`• ${t}: ${set.size} (${nombres(set)})`)
    if (detalleCompleto) {
      L.push("")
      for (const c of cerradas) {
        const obs = objecionesDeLlamada(c)
        const como = String(((c.trace_analysis || {}) as { why_bought?: string }).why_bought || "").trim()
        L.push(`• ${c.nombre} (${c.closer}, ${c.resultado}) — ${obs.length ? obs.map((o) => o.texto).join(" · ") : "sin objeciones registradas"}${como ? ` → cómo se resolvió: ${recortar(como, 160)}` : ""}`)
      }
    }
  }
  L.push("")

  // Calificadas que no cerraron
  const califNoCerradas = noCerradas.filter((c) => c.es_calificado)
  L.push(linea, `🎯 CALIFICADAS QUE NO CERRARON ${etiqueta} (${califNoCerradas.length})`, linea)
  if (!califNoCerradas.length) L.push("• Ninguna: todas las calificadas presentadas cerraron (o no hubo).")
  for (const c of califNoCerradas) {
    const obs = objecionesDeLlamada(c)
    L.push(`• ${c.nombre} (${c.closer}) · ${c.lead_score} · ${c.resultado} — ${obs.length ? obs.map((o) => o.texto).join(" · ") : "sin objeción cargada"}${c.siguiente_paso ? ` · Siguiente paso: ${c.siguiente_paso}` : ""}${c.link_fathom ? ` · ${c.link_fathom}` : ""}`)
  }
  L.push("")

  // Ángulos que destacaron
  const angulos = (lista: CallDetalle[]) => {
    const m = new Map<string, number>()
    for (const c of lista) {
      const a = String(c.angulo_adquisicion || "").trim() || "Sin ángulo cargado"
      m.set(a, (m.get(a) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }
  const calificadas = calls.filter((c) => c.es_calificado)
  L.push(linea, `📣 ÁNGULOS QUE DESTACARON ${etiqueta}`, linea)
  const enVentas = angulos(cerradas)
  const enCalif = angulos(calificadas)
  L.push(`• En ventas (${cerradas.length}): ${enVentas.length ? enVentas.map(([a, n]) => `${a} ${n}`).join(" · ") : "sin ventas"}`)
  L.push(`• En agendas calificadas (${calificadas.length}): ${enCalif.length ? enCalif.map(([a, n]) => `${a} ${n}`).join(" · ") : "sin calificadas"}`)
  L.push("")
  return L
}

export function generarTextoWhatsApp(data: ResumenPayload): string {
  const { periodo, fecha_desde, fecha_hasta, closer, metricas: m, arquetipos: arq, calls } = data
  const lines: string[] = []
  const closerStr = closer === "todos" ? "Equipo Completo" : closer.toUpperCase()

  // ==========================================
  // MODO DÍA
  // ==========================================
  if (periodo === "dia") {
    lines.push("📞 RESUMEN DIARIO DE CLOSING")
    lines.push(`Fecha: ${fmtFecha(fecha_desde)}`)
    lines.push(`Closer: ${closerStr}`)
    lines.push("")
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.push("📊 MÉTRICAS DEL DÍA")
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.push(`• Calls programadas: ${m.programadas}`)
    lines.push(`• Presentadas: ${m.presentadas} (Show rate: ${m.show_rate_pct.toFixed(1).replace(".", ",")} %)`)
    lines.push(`• Calificadas programadas: ${m.calificadas_programadas}`)
    lines.push(`• Calificadas presentadas: ${m.calificadas_presentadas} (Show rate calif: ${m.show_rate_calificados_pct.toFixed(1).replace(".", ",")} %)`)
    lines.push(`• No Shows: ${m.no_shows} (Calificados NS: ${m.no_shows_calificados})`)
    lines.push(`• Canceladas: ${m.canceladas}`)
    lines.push(`• Cierres: ${m.cierres} (Cierres calificados: ${m.cierres_calificados})`)
    lines.push(`• No cierres: ${m.no_cierres} (Calificados no cerrados: ${m.calificados_no_cerrados})`)
    lines.push(`• Fees: ${m.fees}`)
    lines.push(`• AOV Día 1: ${aovDia1(m).toLocaleString("es-AR")} USD (promedio pagado en llamada · total cobrado en llamada ${m.cash_d1.toLocaleString("es-AR")})`)
    lines.push(`• Cash Fees: $${m.cash_fees.toLocaleString("es-AR")} USD`)
    lines.push(`• Ticket total contratado: $${m.ticket_total.toLocaleString("es-AR")} USD`)
    lines.push(`• Tasa Cierre s/Presentadas: ${m.tc_presentadas_pct.toFixed(1).replace(".", ",")} %`)
    lines.push(`• Tasa Cierre s/Calificadas: ${m.tc_calificadas_pct.toFixed(1).replace(".", ",")} %`)
    lines.push("")

    const presentadasCalls = calls.filter((c) => c.resultado !== "NO SHOW" && c.resultado !== "CANCELADA")
    const noShows = calls.filter((c) => c.resultado === "NO SHOW" || c.resultado === "CANCELADA")

    // En el reporte diario: sólo leads calificados presentados del día.
    // Si no hay ninguno calificado, se colocan hasta 3 aleatorios del día (que se presentaron).
    const calificadasPresentadas = presentadasCalls.filter((c) => c.es_calificado)
    let llamadasParaDetalle: CallDetalle[] = []

    if (calificadasPresentadas.length > 0) {
      llamadasParaDetalle = calificadasPresentadas
    } else if (presentadasCalls.length <= 3) {
      llamadasParaDetalle = presentadasCalls
    } else {
      llamadasParaDetalle = [...presentadasCalls].sort(() => 0.5 - Math.random()).slice(0, 3)
    }

    if (llamadasParaDetalle.length > 0) {
      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      lines.push("📋 DETALLE DE LLAMADAS TOMADAS")
      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      llamadasParaDetalle.forEach((c, idx) => {
        lines.push(`\nCALL ${idx + 1} — ${c.nombre.toUpperCase()} ${c.hora ? "(" + c.hora + ")" : ""}`)
        lines.push(`Closer: ${c.closer}`)
        
        // Macro y subarquetipo
        if (c.arquetipo_macro === "SIN CLASIFICAR") {
          lines.push(`Macro: SIN CLASIFICAR`)
        } else {
          lines.push(`Macro: ${c.arquetipo_macro}`)
        }
        if (c.subarquetipo) {
          lines.push(`Subarquetipo: ${c.subarquetipo}`)
        }

        // Lead Scoring y Calificación
        const califLabel = c.es_calificado ? "CALIFICADO" : "NO CALIFICADO"
        lines.push(`Lead Scoring: ${c.lead_score} · ${califLabel}`)
        if (c.calificaba_realmente) {
          lines.push(`Calificaba realmente (post-call): ${c.calificaba_realmente}`)
        }

        if (c.ingresos_declarados) {
          lines.push(`Ingresos declarados: ${c.ingresos_declarados}`)
        }

        // Atribución de agenda por separado (sin concatenar todo el historial)
        lines.push(`Origen: ${c.origen || "Instagram"}`)
        if (c.pieza_entrada) {
          lines.push(`Pieza de entrada: ${c.pieza_entrada}`)
        }
        if (c.keyword) {
          lines.push(`Keyword: ${c.keyword}`)
        }
        if (c.angulo_adquisicion) {
          lines.push(`Ángulo de adquisición: ${c.angulo_adquisicion}`)
        }

        if (c.porque_agendo) {
          lines.push(`Agendó porque: ${c.porque_agendo}`)
        }
        lines.push(`Resultado: ${c.resultado}`)
        if (c.resultado === "CIERRE" || c.resultado === "FEE") {
          lines.push(`Pagó en llamada: ${c.cash_d1.toLocaleString("es-AR")} | Ticket: $${c.ticket_total.toLocaleString("es-AR")}`)
          if (c.motivo_real) {
            lines.push(`Qué lo hizo avanzar: ${c.motivo_real}`)
          }
        } else {
          if (c.objecion_principal) {
            lines.push(`Objeción: ${c.objecion_principal}`)
          }
          if (c.motivo_real) {
            lines.push(`Motivo real no cierre: ${c.motivo_real}`)
          }
        }
        if (c.siguiente_paso) {
          lines.push(`Siguiente paso: ${c.siguiente_paso}`)
        }
        if (c.fathom?.mencion_alex || c.fathom?.contenido_recuerda) {
          const det = [c.fathom.mencion_alex, c.fathom.contenido_recuerda].filter(Boolean).join(" — ")
          lines.push(`Mención Alex: ${det}`)
        }
        if (c.fathom?.insight_mensaje) {
          lines.push("💬 Insight de mensaje:")
          lines.push(`"${c.fathom.insight_mensaje}"`)
        }
      })
      lines.push("")
    }

    lines.push(...seccionObjecionesYAngulos(calls, "DEL DÍA", true))

    if (noShows.length > 0) {
      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      lines.push("❌ NO SHOWS / CANCELADAS")
      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      noShows.forEach((ns) => {
        const motivo = ns.resultado === "NO SHOW" || ns.resultado === "CANCELADA" ? ` · Motivo: ${ns.motivo_no_show?.trim() || "sin cargar"}` : ""
        lines.push(`• ${ns.nombre} ${ns.hora ? "(" + ns.hora + ")" : ""} — ${ns.resultado} | ${ns.lead_score} (${ns.ingresos_declarados || "Sin datos"})${motivo}`)
      })
      lines.push("")
    }

    // Patrones
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.push("🧠 PATRONES DEL DÍA")
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.push(`• Dueños de negocio: ${arq.dueno_negocio.total} calls | ${arq.dueno_negocio.calificadas || 0} calif (${arq.dueno_negocio.presentadas_calificadas || 0} pres) | ${arq.dueno_negocio.cierres || 0} cierres (${arq.dueno_negocio.cierres_calificados || 0} calif, ${arq.dueno_negocio.cierres_no_calificados || 0} no calif)`)
    lines.push(`• Empleados 9-5: ${arq.empleado.total} calls | ${arq.empleado.calificadas || 0} calif (${arq.empleado.presentadas_calificadas || 0} pres) | ${arq.empleado.cierres || 0} cierres (${arq.empleado.cierres_calificados || 0} calif, ${arq.empleado.cierres_no_calificados} no calif)`)
    lines.push(`• Estudiantes: ${arq.estudiante.total} calls | ${arq.estudiante.calificadas || 0} calif (${arq.estudiante.presentadas_calificadas || 0} pres) | ${arq.estudiante.cierres || 0} cierres (${arq.estudiante.cierres_calificados || 0} calif, ${arq.estudiante.cierres_no_calificados} no calif)`)
    if (arq.sin_clasificar.total > 0) {
      lines.push(`• Sin clasificar: ${arq.sin_clasificar.total} calls | ${arq.sin_clasificar.calificadas || 0} calif (${arq.sin_clasificar.presentadas_calificadas || 0} pres) | ${arq.sin_clasificar.cierres || 0} cierres (${arq.sin_clasificar.cierres_calificados || 0} calif, ${arq.sin_clasificar.cierres_no_calificados} no calif)`)
    }

    if (data.patrones?.motivos_no_cierre && Object.keys(data.patrones.motivos_no_cierre).length > 0) {
      lines.push("")
      lines.push("Motivos de no cierre:")
      Object.entries(data.patrones.motivos_no_cierre).forEach(([motivo, count]) => {
        lines.push(`• ${motivo}: ${count}`)
      })
    }
    if (data.patrones?.angulos_calificados && Object.keys(data.patrones.angulos_calificados).length > 0) {
      lines.push("")
      lines.push("Ángulos entre calificados:")
      Object.entries(data.patrones.angulos_calificados).forEach(([angulo, count]) => {
        lines.push(`• ${angulo}: ${count}`)
      })
    }
  }

  // ==========================================
  // MODO SEMANA
  // ==========================================
  else if (periodo === "semana") {
    lines.push("📊 RESUMEN SEMANAL DE CLOSING")
    lines.push(`Período: ${fmtFecha(fecha_desde)} al ${fmtFecha(fecha_hasta)}`)
    lines.push(`Closer: ${closerStr}`)
    lines.push("")
    lines.push(`📅 Calls programadas: ${m.programadas}`)
    lines.push(`👥 Presentadas: ${m.presentadas} (Show rate: ${m.show_rate_pct.toFixed(1).replace(".", ",")} %) | Calificadas: ${m.calificadas_presentadas}`)
    lines.push(`❌ No Shows: ${m.no_shows} | NS Calificados: ${m.no_shows_calificados}`)
    lines.push(`💰 Cierres: ${m.cierres} | Cierres calificados: ${m.cierres_calificados}`)
    lines.push(`🔻 No cierres: ${m.no_cierres} | Calificados no cerrados: ${m.calificados_no_cerrados}`)
    lines.push("")
    lines.push(`💵 AOV Día 1: ${aovDia1(m).toLocaleString("es-AR")} USD (promedio pagado en llamada · total ${m.cash_d1.toLocaleString("es-AR")})`)
    lines.push(`🎟️ Fees: $${m.cash_fees.toLocaleString("es-AR")} USD`)
    lines.push(`📈 Ticket total contratado: $${m.ticket_total.toLocaleString("es-AR")} USD`)
    lines.push("")
    lines.push(`🎯 TC s/Presentadas: ${m.tc_presentadas_pct.toFixed(1).replace(".", ",")} %`)
    lines.push(`🔥 TC s/Calificadas: ${m.tc_calificadas_pct.toFixed(1).replace(".", ",")} %`)
    lines.push("")
        lines.push("👤 Conversión por Arquetipo (Datos CRM):")
    lines.push(`• Dueño de negocio: ${arq.dueno_negocio.total} calls | ${arq.dueno_negocio.calificadas || 0} calificadas | ${arq.dueno_negocio.presentadas_calificadas || 0} presentadas calif | ${arq.dueno_negocio.cierres || 0} cierres (${arq.dueno_negocio.cierres_calificados || 0} calificados, ${arq.dueno_negocio.cierres_no_calificados || 0} no calificados) | ${"$"}${arq.dueno_negocio.cash_d1 || 0} USD D1`)
    lines.push(`• Empleado 9-5: ${arq.empleado.total} calls | ${arq.empleado.calificadas || 0} calificadas | ${arq.empleado.presentadas_calificadas || 0} presentadas calif | ${arq.empleado.cierres || 0} cierres (${arq.empleado.cierres_calificados || 0} calificados, ${arq.empleado.cierres_no_calificados} no calificados) | ${"$"}${arq.empleado.cash_d1 || 0} USD D1`)
    lines.push(`• Estudiante: ${arq.estudiante.total} calls | ${arq.estudiante.calificadas || 0} calificadas | ${arq.estudiante.presentadas_calificadas || 0} presentadas calif | ${arq.estudiante.cierres || 0} cierres (${arq.estudiante.cierres_calificados || 0} calificados, ${arq.estudiante.cierres_no_calificados} no calificados) | ${"$"}${arq.estudiante.cash_d1 || 0} USD D1`)
    if (arq.sin_clasificar.total > 0) {
      lines.push(`• Sin clasificar: ${arq.sin_clasificar.total} calls | ${arq.sin_clasificar.calificadas || 0} calificadas | ${arq.sin_clasificar.presentadas_calificadas || 0} presentadas calif | ${arq.sin_clasificar.cierres || 0} cierres (${arq.sin_clasificar.cierres_calificados || 0} calificados, ${arq.sin_clasificar.cierres_no_calificados} no calificados) | ${"$"}${arq.sin_clasificar.cash_d1 || 0} USD D1`)
    }
    lines.push("")

    const cierresYFup = calls.filter((c) => c.resultado === "CIERRE" || c.resultado === "FEE" || (c.es_calificado && c.resultado === "SEGUIMIENTO"))
    if (cierresYFup.length > 0) {
      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      lines.push("🌟 CIERRES Y FUPS CALIFICADOS DE LA SEMANA")
      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      cierresYFup.forEach((c) => {
        lines.push(`• ${c.nombre} (${c.resultado}) — ${c.arquetipo_macro} | Pagó en llamada: ${c.cash_d1} | Ticket: $${c.ticket_total}`)
        if (c.motivo_real) lines.push(`  Clave: ${c.motivo_real}`)
        if (c.siguiente_paso) lines.push(`  Siguiente paso: ${c.siguiente_paso}`)
      })
      lines.push("")
    }

    lines.push(...seccionObjecionesYAngulos(calls, "DE LA SEMANA", false))

    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.push("🧠 PATRONES DE LA SEMANA")
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    if (data.patrones?.motivos_no_cierre) {
      lines.push("Motivos de no cierre más frecuentes:")
      Object.entries(data.patrones.motivos_no_cierre).forEach(([motivo, count]) => {
        lines.push(`• ${motivo}: ${count}`)
      })
    }
  }

  // ==========================================
  // MODO MES
  // ==========================================
  else if (periodo === "mes") {
    lines.push(`📊 BALANCE MENSUAL DE CLOSING — ${fecha_desde.slice(0, 7)}`)
    lines.push(`Closer: ${closerStr}`)
    lines.push("")
    lines.push("🎯 Meta del mes: $30.000 USD")
    lines.push(`💵 Cash D1 Nuevas Ventas: ${m.cash_d1.toLocaleString("es-AR")} USD`)
    lines.push(`📊 AOV Día 1: ${aovDia1(m).toLocaleString("es-AR")} USD (promedio pagado en llamada)`)
    lines.push(`🎟️ Fees recaudados: $${m.cash_fees.toLocaleString("es-AR")} USD`)
    lines.push(`💰 Total Recaudado MTD: $${(m.cash_d1 + m.cash_fees).toLocaleString("es-AR")} USD`)
    lines.push(`📈 Contratos firmados: $${m.ticket_total.toLocaleString("es-AR")} USD`)
    lines.push("")
    lines.push("📅 Funnel acumulado:")
    lines.push(`• Calls programadas: ${m.programadas}`)
    lines.push(`• Presentadas: ${m.presentadas} (Show rate: ${m.show_rate_pct.toFixed(1).replace(".", ",")} %) | Calificadas: ${m.calificadas_presentadas}`)
    lines.push(`• No shows: ${m.no_shows} (Calificados NS: ${m.no_shows_calificados})`)
    lines.push(`• Cierres totales: ${m.cierres} (TC s/Shows: ${m.tc_presentadas_pct.toFixed(1).replace(".", ",")} %, TC s/Calif: ${m.tc_calificadas_pct.toFixed(1).replace(".", ",")} %)`)
    lines.push("")
        lines.push("👥 Radiografía por Arquetipo (CRM):")
    lines.push(`• Dueño de negocio: ${arq.dueno_negocio.total} calls | ${arq.dueno_negocio.calificadas || 0} calificadas | ${arq.dueno_negocio.presentadas_calificadas || 0} presentadas calif | ${arq.dueno_negocio.cierres || 0} cierres (${arq.dueno_negocio.cierres_calificados || 0} calificados, ${arq.dueno_negocio.cierres_no_calificados || 0} no calificados) | ${"$"}${arq.dueno_negocio.cash_d1 || 0} USD D1`)
    lines.push(`• Empleado 9-5: ${arq.empleado.total} calls | ${arq.empleado.calificadas || 0} calificadas | ${arq.empleado.presentadas_calificadas || 0} presentadas calif | ${arq.empleado.cierres || 0} cierres (${arq.empleado.cierres_calificados || 0} calificados, ${arq.empleado.cierres_no_calificados || 0} no calificados) | ${"$"}${arq.empleado.cash_d1 || 0} USD D1`)
    lines.push(`• Estudiante: ${arq.estudiante.total} calls | ${arq.estudiante.calificadas || 0} calificadas | ${arq.estudiante.presentadas_calificadas || 0} presentadas calif | ${arq.estudiante.cierres || 0} cierres (${arq.estudiante.cierres_calificados || 0} calificados, ${arq.estudiante.cierres_no_calificados || 0} no calificados) | ${"$"}${arq.estudiante.cash_d1 || 0} USD D1`)
    if (arq.sin_clasificar.total > 0) {
      lines.push(`• Sin clasificar: ${arq.sin_clasificar.total} calls | ${arq.sin_clasificar.calificadas || 0} calificadas | ${arq.sin_clasificar.presentadas_calificadas || 0} presentadas calif | ${arq.sin_clasificar.cierres || 0} cierres (${arq.sin_clasificar.cierres_calificados || 0} calificados, ${arq.sin_clasificar.cierres_no_calificados || 0} no calificados) | ${"$"}${arq.sin_clasificar.cash_d1 || 0} USD D1`)
    }
    lines.push("")
    lines.push(...seccionObjecionesYAngulos(calls, "DEL MES", false))
  }

  return lines.join("\n")
}
