// Bloque «SEGUIMIENTOS» del reporte de WhatsApp del Resumen de ventas (Nahuel, 27/11/2026).
// Sale de la sección Seguimientos: FUP hechos en el período (tabla `seguimientos`, columna `fups`) y la plata que
// entró por seguimiento = pagos del período de esos leads cargados DESPUÉS del día de su call.
// Si algo falla devuelve "" para no romper el reporte.
import { tel9 } from "@/lib/embudo-atribucion"

const usd = (n: number) => `USD ${Math.round(n).toLocaleString("es-AR")}`

export async function bloqueSeguimientos(sb: any, desde: string, hasta: string, closer: string, pagos: any[]): Promise<string> {
  try {
    let q = sb.from("seguimientos").select("id,agenda_id,nombre,telefono,closer,fecha_call,estado,proximo_fup,fups").limit(3000)
    if (closer && closer !== "todos") q = q.ilike("closer", `%${closer}%`)
    const { data: segs, error } = await q
    if (error || !segs) return ""
    const ids = segs.map((s: any) => s.agenda_id).filter(Boolean)
    const agendas = new Map<string, any>()
    for (let i = 0; i < ids.length; i += 150) {
      const { data } = await sb.from("agendas").select("id,person_id,telefono,fecha_closer").in("id", ids.slice(i, i + 150))
      for (const a of data || []) agendas.set(String(a.id), a)
    }
    const en = (f?: string | null) => !!f && f.slice(0, 10) >= desde && f.slice(0, 10) <= hasta
    let fups = 0, resp = 0, noResp = 0
    const tipos: Record<string, number> = {}
    const contactados = new Set<string>()
    const porPersona = new Map<string, any>(), porTel = new Map<string, any>()
    for (const s of segs) {
      for (const [k, e] of Object.entries((s.fups || {}) as Record<string, any>)) {
        if (!/^\d+$/.test(k) || !e?.hecho || !en(e.fecha)) continue
        fups++; contactados.add(s.id)
        if (e.respondio === true) resp++
        if (e.respondio === false) noResp++
        const t = e.tipo || "Sin tipo"; tipos[t] = (tipos[t] || 0) + 1
      }
      const a = s.agenda_id ? agendas.get(String(s.agenda_id)) : null
      const info = { s, call: String(a?.fecha_closer || s.fecha_call || "").slice(0, 10) }
      if (a?.person_id) porPersona.set(String(a.person_id), info)
      const t = tel9(a?.telefono || s.telefono); if (t) porTel.set(t, info)
    }
    const cierres: string[] = []
    let cash = 0, nFee = 0, nCuota = 0
    const leadsCierre = new Set<string>()
    for (const p of pagos) {
      const info = (p.person_id && porPersona.get(String(p.person_id))) || porTel.get(tel9(p.telefono))
      if (!info || (info.call && String(p.fecha).slice(0, 10) <= info.call)) continue
      const monto = Number(p.monto) || 0
      cash += monto; leadsCierre.add(info.s.id)
      if (/fee/i.test(p.tipo || "")) nFee++
      if (/^cuota/i.test(p.tipo || "")) nCuota++
      const nf = Object.entries(info.s.fups || {}).filter(([k, e]: any) => /^\d+$/.test(k) && e?.hecho).length
      cierres.push(`   ✅ ${info.s.nombre || p.cliente || "Sin nombre"} · ${p.tipo || "Pago"} · ${usd(monto)}${p.closer ? ` · ${p.closer}` : ""} · ${nf} FUP`)
    }
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
    const activos = segs.filter((s: any) => ["Activo", "Reagendó"].includes(s.estado || "Activo"))
    const vencidos = activos.filter((s: any) => s.proximo_fup && s.proximo_fup < hoy).length
    const tasa = resp + noResp ? `${Math.round((resp / (resp + noResp)) * 100)}%` : "—"
    return [
      "",
      "📲 *SEGUIMIENTOS*",
      `• FUP hechos: ${fups} · Leads contactados: ${contactados.size}`,
      `• Respondieron: ${resp} · No respondieron: ${noResp} · Tasa de respuesta: ${tasa}`,
      `• Por tipo: ${Object.entries(tipos).map(([t, n]) => `${t} ${n}`).join(" · ") || "—"}`,
      `• Cierres por seguimiento: ${leadsCierre.size} lead${leadsCierre.size === 1 ? "" : "s"} · ${cierres.length} pago${cierres.length === 1 ? "" : "s"} · ${usd(cash)}`,
      `• Fees: ${nFee} · Cuotas: ${nCuota}`,
      ...(cierres.length ? cierres : ["   Sin plata entrada por seguimiento en el período"]),
      `• En seguimiento hoy: ${activos.length} · Vencidos: ${vencidos}`,
    ].join("\n")
  } catch {
    return ""
  }
}
