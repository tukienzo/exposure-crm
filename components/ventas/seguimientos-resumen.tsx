"use client"

// Resumen de Seguimientos (Nahuel, 27/11/2026): la columna derecha de la vista Fichas, con el mismo diseño que el
// «Preview para WhatsApp» del Resumen de ventas. Texto copiable con las métricas del período y abajo la comparativa
// por días, semanas y meses. Se calcula en el navegador con los mismos leads de la lista (sin consultas nuevas).
// FUP del período = entradas `fups` marcadas como hechas con fecha en el período.
// Cierre por seguimiento = pago cargado DESPUÉS del día de la call (lo pagado en la llamada no cuenta).

import { useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { LeadSeguimiento as Lead } from "@/components/ventas/seguimientos-fichas"

type Periodo = "dia" | "semana" | "mes"
type Rango = { desde: string; hasta: string; label: string }
const TIPOS = ["Texto", "Audio", "Foto 1 VW", "Video 1 VW", "Llamada"]

const iso = (d: Date) => d.toISOString().slice(0, 10)
const mas = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const corto = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
function rango(p: Periodo, f: string): Rango {
  if (p === "dia") return { desde: f, hasta: f, label: corto(f) }
  if (p === "semana") {
    const dow = (new Date(`${f}T12:00:00Z`).getUTCDay() + 6) % 7
    const desde = mas(f, -dow)
    return { desde, hasta: mas(desde, 6), label: `semana ${corto(desde)} al ${corto(mas(desde, 6))}` }
  }
  const desde = `${f.slice(0, 7)}-01`
  const d = new Date(`${desde}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0)
  return { desde, hasta: iso(d), label: new Date(`${desde}T12:00:00Z`).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }) }
}
const anterior = (p: Periodo, r: Rango) => rango(p, p === "mes" ? mas(r.desde, -1) : mas(r.desde, p === "dia" ? -1 : -7))
const usd = (n: number) => `USD ${n.toLocaleString("es-AR")}`
const pct = (a: number, b: number) => b ? `${Math.round((a / b) * 100)}%` : "—"

function metricas(leads: Lead[], r: Rango) {
  const en = (f?: string | null) => !!f && f.slice(0, 10) >= r.desde && f.slice(0, 10) <= r.hasta
  let fups = 0, resp = 0, noResp = 0
  const tipos: Record<string, number> = {}
  const contactados = new Set<string>()
  const cierres: { nombre: string; tipo: string; monto: number; closer: string | null; fups: number }[] = []
  for (const l of leads) {
    const f = (l.seguimiento?.fups || {}) as Record<string, any>
    for (const [k, e] of Object.entries(f)) {
      if (!/^\d+$/.test(k) || !e?.hecho || !en(e.fecha)) continue
      fups++; contactados.add(l.key)
      if (e.respondio === true) resp++
      if (e.respondio === false) noResp++
      const t = e.tipo || "Sin tipo"; tipos[t] = (tipos[t] || 0) + 1
    }
    const call = String(l.fecha_call || "").slice(0, 10)
    for (const p of l.pagos) if (en(p.fecha) && (!call || p.fecha.slice(0, 10) > call)) cierres.push({ nombre: l.nombre, tipo: p.tipo, monto: p.monto, closer: p.closer || l.closer, fups: l.fups_hechos })
  }
  const cash = cierres.reduce((s, c) => s + c.monto, 0)
  const leadsCierre = new Set(cierres.map(c => c.nombre)).size
  return { fups, resp, noResp, tipos, contactados: contactados.size, cierres, cash, leadsCierre,
    fees: cierres.filter(c => /fee/i.test(c.tipo)).length, cuotas: cierres.filter(c => /^cuota/i.test(c.tipo)).length }
}
const flecha = (a: number, b: number) => a > b ? `▲ +${a - b}` : a < b ? `▼ ${a - b}` : "="

export function ResumenSeguimientos({ leads, hoy, closer }: { leads: Lead[]; hoy: string; closer: string }) {
  const [periodo, setPeriodo] = useState<Periodo>("dia")
  const [fecha, setFecha] = useState(hoy)
  const [comp, setComp] = useState<Periodo>("dia")
  const [copiado, setCopiado] = useState(false)

  const r = rango(periodo, fecha), ra = anterior(periodo, r)
  const m = useMemo(() => metricas(leads, r), [leads, r.desde, r.hasta])
  const ma = useMemo(() => metricas(leads, ra), [leads, ra.desde, ra.hasta])
  const activos = leads.filter(l => ["Activo", "Reagendó"].includes(l.seguimiento?.estado || "Activo"))
  const vencidos = activos.filter(l => l.seguimiento?.proximo_fup && l.seguimiento.proximo_fup < hoy).length
  const paraHoy = activos.filter(l => l.seguimiento?.proximo_fup === hoy).length
  const cuenta = (e: string) => activos.filter(l => l.etiquetas.includes(e)).length

  const texto = [
    `📲 *REPORTE DE SEGUIMIENTOS · ${r.label.toUpperCase()}*`,
    closer !== "todos" ? `Closer: ${closer}` : "Equipo completo",
    "",
    "*ACTIVIDAD*",
    `• Seguimientos hechos: ${m.fups} (${flecha(m.fups, ma.fups)} vs anterior)`,
    `• Leads contactados: ${m.contactados}`,
    `• Respondieron: ${m.resp} · No respondieron: ${m.noResp} · Tasa de respuesta: ${pct(m.resp, m.resp + m.noResp)}`,
    `• Por tipo: ${TIPOS.concat("Sin tipo").filter(t => m.tipos[t]).map(t => `${t} ${m.tipos[t]}`).join(" · ") || "—"}`,
    "",
    "*RESULTADOS POR SEGUIMIENTO*",
    `• Pagos después de la call: ${m.cierres.length} (${m.leadsCierre} lead${m.leadsCierre === 1 ? "" : "s"})`,
    `• Cash por seguimiento: ${usd(m.cash)} (anterior ${usd(ma.cash)})`,
    `• Fees: ${m.fees} · Cuotas: ${m.cuotas}`,
    ...(m.cierres.length ? m.cierres.map(c => `   ✅ ${c.nombre} · ${c.tipo} · ${usd(c.monto)}${c.closer ? ` · ${c.closer}` : ""} · ${c.fups} FUP`) : ["   Sin cierres por seguimiento en el período"]),
    "",
    "*CARTERA ACTIVA (hoy)*",
    `• Leads en seguimiento: ${activos.length}`,
    `• Calificados ${cuenta("calificado")} · Presentados ${cuenta("presentado")} · No show ${cuenta("no_show")} · Fee ${cuenta("fee")} · Cuota ${cuenta("cuota")}`,
    `• Para hoy: ${paraHoy} · Vencidos: ${vencidos}`,
  ].join("\n")

  const filas = useMemo(() => {
    const out: { label: string; m: ReturnType<typeof metricas> }[] = []
    let x = rango(comp, hoy)
    for (let i = 0; i < (comp === "dia" ? 7 : comp === "semana" ? 6 : 4); i++) { out.push({ label: comp === "semana" ? `${corto(x.desde)}–${corto(x.hasta)}` : x.label, m: metricas(leads, x) }); x = anterior(comp, x) }
    return out
  }, [leads, comp, hoy])

  const copiar = () => { navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500) }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-500">Resumen de seguimientos</h3>
      <Button variant="outline" size="sm" onClick={copiar} className="h-8 border-emerald-500/30 text-xs text-emerald-500 hover:bg-emerald-500/10">
        {copiado ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}{copiado ? "Copiado!" : "Copiar"}
      </Button>
    </div>
    <div className="flex flex-wrap items-center gap-1">
      {(["dia", "semana", "mes"] as const).map(p => <Button key={p} size="sm" className="h-7" variant={periodo === p ? "default" : "outline"} onClick={() => setPeriodo(p)}>{p === "dia" ? "Día" : p === "semana" ? "Semana" : "Mes"}</Button>)}
      <Input type="date" className="h-7 w-36 text-xs" value={fecha} onChange={e => setFecha(e.target.value || hoy)} />
    </div>
    <Card className="border-white/10 bg-zinc-950 p-4 font-mono text-xs">
      <textarea readOnly value={texto} rows={22} onClick={copiar} title="Tocá para copiar" className="w-full cursor-pointer resize-none bg-transparent font-mono text-xs text-zinc-200 outline-none" />
    </Card>

    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider">Comparativa</p>
        <div className="flex gap-1">{(["dia", "semana", "mes"] as const).map(p => <Button key={p} size="sm" className="h-6 px-2 text-[11px]" variant={comp === p ? "default" : "ghost"} onClick={() => setComp(p)}>{p === "dia" ? "Días" : p === "semana" ? "Semanas" : "Meses"}</Button>)}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1">Período</th><th className="text-right">FUP</th><th className="text-right">Leads</th><th className="text-right">Resp.</th><th className="text-right">Cierres</th><th className="text-right">Cash</th></tr></thead>
          <tbody>{filas.map((f, i) => <tr key={f.label} className={cn("border-b last:border-0", i === 0 && "font-semibold")}>
            <td className="py-1 capitalize">{f.label}</td><td className="text-right">{f.m.fups}</td><td className="text-right">{f.m.contactados}</td>
            <td className="text-right">{pct(f.m.resp, f.m.resp + f.m.noResp)}</td><td className="text-right">{f.m.cierres.length}</td><td className="text-right">{f.m.cash ? usd(f.m.cash) : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Cierre por seguimiento = pago cargado después del día de la call. Resp. = respondió sobre los FUP con efectividad cargada.</p>
    </Card>
  </div>
}
