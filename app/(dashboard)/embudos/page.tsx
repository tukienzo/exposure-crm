"use client"

import { useState } from "react"
import useSWR from "swr"
import { Filter, Info, Loader2, Megaphone, RefreshCw, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CrmPageIntro } from "@/components/crm-ui"
import { cn } from "@/lib/utils"

// Métricas por embudo: Webinar / Orgánico (incluye Ads) / Outbound, en formato de tabla, con el criterio de Alex:
// cierre = cliente que entró (los fees van aparte); AOV Trato Cerrado = lo que pagó cada cliente el día que entró;
// AOV Día 1 = lo recibido el día del cierre sobre todos los compromisos (ventas + fees); cash desde la tabla pagos.

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error || "Error"); return b })
const EMBUDOS = ["Webinar", "Orgánico", "Outbound", "YouTube", "Demo app", "Sin fuente", "Total"] as const
type Detalle = { cierres: Array<{ cliente: string; dia: string; cobrado: number; pagos_del_dia: string; fuente: string | null; via: string }>; fees: Array<{ cliente: string; dia: string; monto: number; pagos_del_dia: string; fuente: string | null }>; fees_sin_pago: Array<{ nombre: string; closer: string | null; fecha: string | null }> }
type Bloque = { agendas: number; presentadas: number; no_show: number; sin_resultado: number; futuras: number; show_up: number | null; calificadas: number; calif_presentadas: number; show_up_calif: number | null; cierres: number; tc_calif_presentadas: number | null; tc_presentadas: number | null; fees: number; fees_usd: number; fees_sin_pago: number; aov_trato_cerrado: number | null; aov_dia_1: number | null; cash_total: number; cash_leads_mes: number; cuotas: number; back_end: number; detalle: Detalle }
type Campana = { campaign_id: string; campaign_name: string | null; objetivo: string | null; embudo: string; embudo_manual: boolean; spend: number; impresiones: number | null; clics: number | null }
type Ads = { total: number; por_embudo: Record<string, number>; campanas: Campana[]; actualizado: string | null; error?: string }
type Seguidores = { nuevos?: number; neto?: number | null; gasto?: number; costo_por_seguidor?: number | null; costo_por_seguidor_neto?: number | null; seguidores_hoy?: number | null; diario?: Array<{ dia: string; nuevos: number | null; neto: number | null; gasto: number; costo: number | null }>; error?: string }
type Respuesta = { mes: string; corte: string; ads?: Ads; seguidores?: Seguidores; embudos: Record<string, Bloque>; origenes: Array<{ origen: string; embudo: string; agendas: number; presentadas: number; calificadas: number; cierres: number; fees: number; cash_leads_mes: number }>; outbound: { leads: Array<{ id: string; nombre: string; fecha: string | null; origen: string | null; setter: string | null; closer: string | null; calificacion: string | null; show: boolean | null; estado: string | null; motivo: string | null; recurso: string | null; pagos: string; cash: number }>; por_setter: Array<{ setter: string; agendas: number; presentadas: number; calificadas: number; cierres: number; cash: number }> }; pagos_sin_fuente: Array<{ cliente: string; via: string; pagos: string; cash: number }>; ventas_internas: { pagos: Array<{ cliente: string; fecha: string; tipo: string | null; monto: number }>; total: number }; pagos_del_mes: number; cash_del_mes: number; cash_front_end: number }

const usd = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("es-AR", { maximumFractionDigits: 0 }))
const pc = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`)
const fecha = (v: string | null | undefined) => (v ? new Date(v.includes("T") ? v : v.replace(" ", "T") + "Z").toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" }) : "—")
const usd2 = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const OBJETIVOS: Record<string, string> = { OUTCOME_SALES: "Ventas", OUTCOME_LEADS: "Clientes potenciales", OUTCOME_AWARENESS: "Reconocimiento", OUTCOME_TRAFFIC: "Tráfico", LINK_CLICKS: "Tráfico", OUTCOME_ENGAGEMENT: "Interacción", VIDEO_VIEWS: "Reproducciones" }
const EMBUDOS_ADS = ["Webinar", "Orgánico", "Outbound"]
const meses = () => { const out: Array<{ v: string; l: string }> = []; const d = new Date(); for (let i = 0; i < 8; i++) { const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; out.push({ v, l: d.toLocaleDateString("es-AR", { month: "long", year: "numeric" }) }); d.setMonth(d.getMonth() - 1) } return out }

type Fila = { label: string; get: (b: Bloque) => string; bold?: boolean; sub?: boolean; detalle?: keyof Detalle; nota?: string }
const FILAS: Fila[] = [
  { label: "Agendas (calls del mes)", get: (b) => String(b.agendas) },
  { label: "Se presentaron", get: (b) => String(b.presentadas) },
  { label: "No show", get: (b) => String(b.no_show) },
  { label: "Sin resultado cargado", get: (b) => String(b.sin_resultado), sub: true, nota: "calls que ya pasaron y nadie marcó show / no show" },
  { label: "Calls futuras", get: (b) => String(b.futuras), sub: true },
  { label: "Show up", get: (b) => pc(b.show_up), bold: true, nota: "presentadas sobre calls con resultado" },
  { label: "Calificadas (A/B/C)", get: (b) => String(b.calificadas) },
  { label: "Calificadas presentadas", get: (b) => String(b.calif_presentadas) },
  { label: "Show up calificado", get: (b) => pc(b.show_up_calif) },
  { label: "Cierres (entraron al programa)", get: (b) => String(b.cierres), bold: true, detalle: "cierres", nota: "clientes con Venta Nueva / Adentro en Seguimiento en el mes; un fee no es cierre" },
  { label: "Tasa de cierre s/ calificadas presentadas", get: (b) => pc(b.tc_calif_presentadas), bold: true },
  { label: "Tasa de cierre s/ presentadas", get: (b) => pc(b.tc_presentadas) },
  { label: "Fees cobrados (personas · USD)", get: (b) => `${b.fees} · ${usd(b.fees_usd)}`, detalle: "fees" },
  { label: "Fees marcados en la agenda sin pago cargado", get: (b) => String(b.fees_sin_pago), sub: true, detalle: "fees_sin_pago" },
  { label: "AOV Trato Cerrado", get: (b) => usd(b.aov_trato_cerrado), bold: true, detalle: "cierres", nota: "promedio de lo que pagó cada cliente el día que entró (los pagos de ese día; nunca el plan de pagos) · sano: 33 a 50 % del ticket" },
  { label: "AOV Día 1", get: (b) => usd(b.aov_dia_1), bold: true, nota: "lo recibido el día del cierre, promediado sobre todos los compromisos: los que entraron + los que dejaron fee · mínimo: 10 % del ticket" },
  { label: "Cash collected total (front end)", get: (b) => usd(b.cash_total), bold: true, nota: "todo lo cobrado en el mes a clientes de este embudo; las ventas internas no entran" },
  { label: "De leads con call en el mes", get: (b) => usd(b.cash_leads_mes), sub: true },
  { label: "Cuotas de clientes anteriores", get: (b) => usd(b.cuotas), sub: true },
]

// filas de Meta Ads: se calculan con la inversión del embudo y los números del mismo bloque
type FilaAds = { label: string; get: (b: Bloque, inv: number | null) => string; bold?: boolean; nota?: string }
const costo = (inv: number | null, n: number) => (inv && n > 0 ? usd(inv / n) : "—")
const FILAS_ADS: FilaAds[] = [
  { label: "Inversión en Meta Ads", get: (_b, inv) => (inv ? usd(inv) : "—"), bold: true, nota: "lo gastado en Meta en el mes, campaña por campaña, imputado al embudo de cada campaña (abajo se puede cambiar)" },
  { label: "Costo por agenda", get: (b, inv) => costo(inv, b.agendas) },
  { label: "Costo por presentada", get: (b, inv) => costo(inv, b.presentadas) },
  { label: "Costo por cierre (CAC)", get: (b, inv) => costo(inv, b.cierres), bold: true, nota: "inversión del embudo dividida por los clientes que entraron por ese embudo en el mes" },
  { label: "Retorno (cash ÷ inversión)", get: (b, inv) => (inv ? `${(b.cash_total / inv).toLocaleString("es-AR", { maximumFractionDigits: 1 })}x` : "—"), bold: true, nota: "cash collected front end del embudo dividido por lo invertido en Meta para ese embudo" },
]

export default function EmbudosPage() {
  const [mes, setMes] = useState(meses()[0].v)
  const [abierto, setAbierto] = useState<string | null>(null)
  const { data, error, isLoading, mutate } = useSWR<Respuesta>(`/api/embudos?mes=${mes}`, fetcher)
  const E = data?.embudos
  const ads = data?.ads
  const invDe = (e: string) => (!ads ? null : e === "Total" ? ads.total : e === "Sin fuente" ? null : ads.por_embudo[e] || null)
  const [trayendo, setTrayendo] = useState(false)
  const [errAds, setErrAds] = useState<string | null>(null)
  const traerMeta = async () => {
    setTrayendo(true); setErrAds(null)
    const r = await fetch("/api/embudos/ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mes }) })
    const b = await r.json().catch(() => ({}))
    if (!r.ok) setErrAds(b.error || "No se pudo leer Meta")
    await mutate(); setTrayendo(false)
  }
  const cambiarEmbudo = async (c: Campana, embudo: string) => {
    setErrAds(null)
    const r = await fetch("/api/embudos/ads", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_id: c.campaign_id, embudo }) })
    if (!r.ok) setErrAds((await r.json().catch(() => ({}))).error || "No se pudo cambiar")
    await mutate()
  }
  const detalle = abierto && E ? (() => { const [emb, key] = abierto.split("|") as [string, keyof Detalle]; return { emb, key, items: E[emb]?.detalle?.[key] || [] } })() : null

  return <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-7">
    <CrmPageIntro eyebrow="Ventas · Métricas por embudo" title="Embudos" tone="violet" icon={<Filter className="h-5 w-5" />}
      description="Webinar, orgánico (incluye Ads: es el mismo embudo potenciado con Meta Ads) y outbound, con el mismo criterio: cierre = cliente que entró, fees aparte, AOV desde los pagos. Abajo de la tabla, lo invertido en Meta Ads separado por embudo. Tocá un número de cierres o fees para ver quiénes son."
      actions={<Button variant="outline" size="sm" onClick={() => mutate()}><RefreshCw className={cn("mr-1 h-4 w-4", isLoading && "animate-spin")} />Actualizar</Button>} />

    <div className="flex flex-wrap gap-1">{meses().map((m) => <Button key={m.v} size="sm" variant={mes === m.v ? "default" : "outline"} onClick={() => { setMes(m.v); setAbierto(null) }} className="capitalize">{m.l}</Button>)}</div>

    {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-500">{error.message}</p>}
    {isLoading && !data && <p className="py-16 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />Calculando…</p>}

    {E && <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-muted/70 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr><th className="px-3 py-2 text-left">{data?.mes}</th>{EMBUDOS.map((e) => <th key={e} className={cn("px-3 py-2 text-right", e === "Total" && "border-l")}>{e}</th>)}</tr>
        </thead>
        <tbody>
          {FILAS.map((f) => <tr key={f.label} className={cn("border-t", f.bold && "bg-muted/30")}>
            <td className={cn("px-3 py-1.5", f.sub ? "pl-7 text-xs text-muted-foreground" : "font-medium", f.bold && "font-bold")}>
              {f.label}{f.nota && <span title={f.nota} className="ml-1 inline-flex align-middle text-muted-foreground"><Info className="h-3 w-3" /></span>}
            </td>
            {EMBUDOS.map((e) => {
              const b = E[e]; const v = f.get(b); const k = `${e}|${f.detalle}`
              const puede = f.detalle && b.detalle[f.detalle].length > 0
              return <td key={e} className={cn("px-3 py-1.5 text-right tabular-nums", f.bold && "font-bold", e === "Total" && "border-l", f.sub && "text-xs text-muted-foreground")}>
                {puede ? <button className={cn("underline decoration-dotted underline-offset-4 hover:text-blue-500", abierto === k && "text-blue-500")} onClick={() => setAbierto(abierto === k ? null : k)}>{v}</button> : v}
              </td>
            })}
          </tr>)}
          <tr className="border-t-2"><td colSpan={EMBUDOS.length + 1} className="bg-muted/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Meta Ads{ads?.error ? ` · no se pudo leer Meta: ${ads.error}` : ""}</td></tr>
          {FILAS_ADS.map((f) => <tr key={f.label} className={cn("border-t", f.bold && "bg-muted/30")}>
            <td className={cn("px-3 py-1.5 font-medium", f.bold && "font-bold")}>{f.label}{f.nota && <span title={f.nota} className="ml-1 inline-flex align-middle text-muted-foreground"><Info className="h-3 w-3" /></span>}</td>
            {EMBUDOS.map((e) => <td key={e} className={cn("px-3 py-1.5 text-right tabular-nums", f.bold && "font-bold", e === "Total" && "border-l")}>{f.get(E[e], invDe(e))}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>}

    {ads && <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-black"><Megaphone className="h-4 w-4" />Inversión en Meta Ads · USD {usd2(ads.total)}</h2>
          <p className="text-xs text-muted-foreground">{EMBUDOS_ADS.map((e) => `${e} USD ${usd2(ads.por_embudo[e] || 0)}`).join(" · ")}. Las campañas «exp-…» son del webinar; el resto potencia el orgánico. Si una está mal imputada, cambiale el embudo: queda fijo para esa campaña.</p>
        </div>
        <Button variant="outline" size="sm" onClick={traerMeta} disabled={trayendo}><RefreshCw className={cn("mr-1 h-4 w-4", trayendo && "animate-spin")} />Traer de Meta</Button>
      </div>
      {errAds && <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-sm text-red-500">{errAds}</p>}
      {!ads.campanas.length && <p className="mt-3 text-sm text-muted-foreground">No hubo gasto en Meta Ads en este mes.</p>}
      {ads.campanas.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
        <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="py-1 text-left">Campaña</th><th className="text-left">Objetivo</th><th className="text-left">Embudo</th><th className="text-right">Invertido USD</th><th className="text-right">% del mes</th><th className="text-right">Impresiones</th><th className="text-right">Clics</th><th className="text-right">Costo por clic</th></tr></thead>
        <tbody>{ads.campanas.map((c) => <tr key={c.campaign_id} className="border-t">
          <td className="py-1.5 font-medium">{c.campaign_name || c.campaign_id}</td>
          <td className="text-muted-foreground">{OBJETIVOS[c.objetivo || ""] || c.objetivo || "—"}</td>
          <td><select aria-label={`Embudo de ${c.campaign_name || c.campaign_id}`} value={c.embudo} onChange={(ev) => cambiarEmbudo(c, ev.target.value)} className="rounded-md border bg-background px-2 py-0.5 text-sm">{EMBUDOS_ADS.map((e) => <option key={e} value={e}>{e}</option>)}</select>{c.embudo_manual && <span className="ml-1 text-[10px] text-muted-foreground">a mano</span>}</td>
          <td className="text-right font-bold tabular-nums">{usd2(c.spend)}</td>
          <td className="text-right tabular-nums">{ads.total ? `${Math.round((c.spend / ads.total) * 100)} %` : "—"}</td>
          <td className="text-right tabular-nums">{c.impresiones?.toLocaleString("es-AR") ?? "—"}</td>
          <td className="text-right tabular-nums">{c.clics?.toLocaleString("es-AR") ?? "—"}</td>
          <td className="text-right tabular-nums">{c.clics ? usd2(c.spend / c.clics) : "—"}</td>
        </tr>)}</tbody>
      </table></div>}
      {data?.seguidores && <div className="mt-4 rounded-xl border bg-muted/30 p-3">
        <h3 className="flex items-center gap-2 text-sm font-black"><UserPlus className="h-4 w-4" />Costo por seguidor · Follow Me Ads</h3>
        {data.seguidores.error && !data.seguidores.diario && <p className="mt-1 text-sm text-red-500">No se pudo calcular: {data.seguidores.error}</p>}
        {data.seguidores.diario && <>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Costo por seguidor", data.seguidores.costo_por_seguidor != null ? `USD ${usd2(data.seguidores.costo_por_seguidor)}` : "—", "gasto orgánico ÷ seguidores nuevos"],
              ["Seguidores nuevos", (data.seguidores.nuevos ?? 0).toLocaleString("es-AR"), "ManyChat · Nuevo Seguidor"],
              ["Gasto Follow Me Ads", `USD ${usd2(data.seguidores.gasto ?? 0)}`, "campañas del embudo orgánico"],
              ["Crecimiento neto", data.seguidores.neto != null ? `${data.seguidores.neto > 0 ? "+" : ""}${data.seguidores.neto.toLocaleString("es-AR")}` : "—", data.seguidores.costo_por_seguidor_neto != null ? `USD ${usd2(data.seguidores.costo_por_seguidor_neto)} por seguidor neto` : "con la foto diaria desde el 02/10"],
            ].map(([l, v, s]) => <div key={l} className="rounded-lg border bg-card px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</p><p className="text-lg font-black tabular-nums">{v}</p><p className="text-[11px] text-muted-foreground">{s}</p></div>)}
          </div>
          <details className="mt-2"><summary className="cursor-pointer text-xs text-muted-foreground">Día por día</summary>
            <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="py-1 text-left">Día</th><th className="text-right">Seguidores nuevos</th><th className="text-right">Neto</th><th className="text-right">Gasto USD</th><th className="text-right">Costo por seguidor</th></tr></thead>
              <tbody>{data.seguidores.diario.map((d) => <tr key={d.dia} className="border-t"><td className="py-1">{fecha(d.dia)}</td><td className="text-right tabular-nums">{d.nuevos ?? "—"}</td><td className="text-right tabular-nums">{d.neto ?? "—"}</td><td className="text-right tabular-nums">{usd2(d.gasto)}</td><td className="text-right font-bold tabular-nums">{d.costo != null ? usd2(d.costo) : "—"}</td></tr>)}</tbody></table></div>
          </details>
          <p className="mt-2 text-[11px] text-muted-foreground">Costo mezclado: Meta no informa seguidores en esta campaña (es de tráfico), así que se divide lo pautado por todos los seguidores nuevos, también los que llegaron por orgánico. El seguidor pagado sale más caro. Seguidores nuevos = contactos que ManyChat etiquetó "Nuevo Seguidor", por día de alta. Crecimiento neto = foto diaria del total de la cuenta (descuenta a los que dejan de seguir).</p>
        </>}
      </div>}
      {ads.actualizado && <p className="mt-2 text-[11px] text-muted-foreground">Leído de Meta el {new Date(ads.actualizado).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}. El mes en curso se vuelve a leer cada 3 horas; los meses cerrados quedan guardados.</p>}
    </section>}

    {detalle && <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="font-black">{detalle.emb} · {detalle.key === "cierres" ? "cierres" : detalle.key === "fees" ? "fees cobrados" : "fees marcados sin pago cargado"} ({detalle.items.length})</h2>
      <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {detalle.items.map((it, i) => {
          if (detalle.key === "cierres") { const x = it as Detalle["cierres"][number]; return <li key={i} className="rounded-lg border px-3 py-1.5"><strong>{x.cliente}</strong> · {fecha(x.dia)} · pagó al entrar USD {usd(x.cobrado)}<span className="block text-xs text-muted-foreground">{x.pagos_del_dia} · {x.fuente || "sin fuente"} · enlazado por {x.via}</span></li> }
          if (detalle.key === "fees") { const x = it as Detalle["fees"][number]; return <li key={i} className="rounded-lg border px-3 py-1.5"><strong>{x.cliente}</strong> · {fecha(x.dia)} · USD {usd(x.monto)}<span className="block text-xs text-muted-foreground">{x.pagos_del_dia} · {x.fuente || "sin fuente"}</span></li> }
          const x = it as Detalle["fees_sin_pago"][number]; return <li key={i} className="rounded-lg border px-3 py-1.5"><strong>{x.nombre}</strong> · call {fecha(x.fecha)} · {x.closer || "sin closer"}<span className="block text-xs text-muted-foreground">estado Fee en la agenda, sin pago en Cargar pago</span></li>
        })}
      </ul>
    </section>}

    {data && <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="font-black">Orgánico por origen</h2>
        <p className="text-xs text-muted-foreground">Cómo se reparte el embudo orgánico entre reels, historias, carruseles, Ads, referidos…</p>
        <table className="mt-3 w-full text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="py-1 text-left">Origen</th><th className="text-right">Agendas</th><th className="text-right">Present.</th><th className="text-right">Calif.</th><th className="text-right">Cierres</th><th className="text-right">Fees</th><th className="text-right">Cash leads del mes</th></tr></thead>
          <tbody>{data.origenes.filter((o) => o.embudo === "Orgánico").map((o) => <tr key={o.origen} className="border-t"><td className="py-1">{o.origen}</td><td className="text-right">{o.agendas}</td><td className="text-right">{o.presentadas}</td><td className="text-right">{o.calificadas}</td><td className="text-right font-bold">{o.cierres}</td><td className="text-right">{o.fees}</td><td className="text-right">{usd(o.cash_leads_mes)}</td></tr>)}</tbody></table>
      </section>
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="font-black">Outbound · por setter</h2>
        <p className="text-xs text-muted-foreground">Quién prospectó cada agenda de outbound y qué salió de ahí.</p>
        {!data.outbound.por_setter.length && <p className="mt-3 text-sm text-muted-foreground">No hubo agendas de outbound con call en este mes.</p>}
        {data.outbound.por_setter.length > 0 && <table className="mt-3 w-full text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="py-1 text-left">Setter</th><th className="text-right">Agendas</th><th className="text-right">Present.</th><th className="text-right">Calif.</th><th className="text-right">Cierres</th><th className="text-right">Cash</th></tr></thead>
          <tbody>{data.outbound.por_setter.map((s) => <tr key={s.setter} className="border-t"><td className="py-1">{s.setter}</td><td className="text-right">{s.agendas}</td><td className="text-right">{s.presentadas}</td><td className="text-right">{s.calificadas}</td><td className="text-right font-bold">{s.cierres}</td><td className="text-right">{usd(s.cash)}</td></tr>)}</tbody></table>}
      </section>
    </div>}

    {data && data.outbound.leads.length > 0 && <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="font-black">Outbound · trazabilidad lead por lead</h2>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="py-1 text-left">Lead</th><th className="text-left">Call</th><th className="text-left">Origen</th><th className="text-left">Setter</th><th className="text-left">Closer</th><th className="text-left">Calif.</th><th className="text-left">Show</th><th className="text-left">Estado</th><th className="text-left">Motivo</th><th className="text-left">Pagos</th></tr></thead>
        <tbody>{data.outbound.leads.map((l) => <tr key={l.id} className="border-t"><td className="py-1 font-medium">{l.nombre}</td><td>{fecha(l.fecha)}</td><td>{l.origen}</td><td>{l.setter || "—"}</td><td>{l.closer || "—"}</td><td>{l.calificacion || "—"}</td><td>{l.show === true ? "Sí" : l.show === false ? "No" : "—"}</td><td>{l.estado || "—"}</td><td className="text-xs text-muted-foreground">{l.motivo || ""}</td><td className={cn(l.pagos && "font-bold")}>{l.pagos || "—"}</td></tr>)}</tbody></table></div>
    </section>}

    {data && data.pagos_sin_fuente.length > 0 && <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <h2 className="font-black">Pagos del mes sin embudo asignado</h2>
      <p className="text-xs text-muted-foreground">Clientes con pago que no tienen agenda enlazada ni fuente cargada en el pago. Se cuentan en "Sin fuente". Para atribuirlos, cargá la fuente en el pago o enlazá la agenda.</p>
      <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">{data.pagos_sin_fuente.map((p, i) => <li key={i} className="rounded-lg border px-3 py-1.5"><strong>{p.cliente}</strong> · {p.pagos} · USD {usd(p.cash)}</li>)}</ul>
    </section>}

    {data && data.ventas_internas.pagos.length > 0 && <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="font-black">Ventas internas / back end · USD {usd(data.ventas_internas.total)} (fuera de los embudos)</h2>
      <p className="text-xs text-muted-foreground">Cobros a clientes que ya estaban adentro. No entran en ningún embudo ni en los AOV.</p>
      <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">{data.ventas_internas.pagos.map((p, i) => <li key={i} className="rounded-lg border px-3 py-1.5"><strong>{p.cliente}</strong> · {fecha(p.fecha)} · {p.tipo} · USD {usd(p.monto)}</li>)}</ul>
    </section>}
    {data && <p className="text-xs text-muted-foreground">Corte {data.corte} · {data.pagos_del_mes} pagos activos en el mes por USD {usd(data.cash_del_mes)}, de los cuales USD {usd(data.cash_front_end)} son front end (tabla pagos, nunca el plan de pagos). Las agendas cuentan por la fecha de la call; los pagos por su fecha, atribuidos al embudo de la agenda del cliente aunque la call haya sido en otro mes.</p>}
  </div>
}
