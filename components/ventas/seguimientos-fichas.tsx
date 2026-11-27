"use client"

// Vista «Fichas» de Seguimientos (Nahuel, 26/11/2026). A la izquierda la lista de leads a seguir con su calificación y
// etiquetas (calificado · fee · cuota · presentado · no show · reprogramó), filtros y orden por prioridad; a la derecha la
// ficha del lead con 4 pestañas: Estado · Seguimientos · Calificación · Diagnóstico.
// Todo lo de la agenda (calificación, arquetipo, calificaba realmente, respuestas de iClosed) se lee y se guarda en la
// tabla `agendas` (PATCH /api/agendas), la misma que edita el Resumen de ventas: cambiar en un lado se ve en el otro.
// Lo propio del seguimiento (FUP, estado, próximo contacto, diagnóstico) se guarda en `seguimientos` (PATCH /api/seguimientos).

import { useMemo, useState } from "react"
import useSWR from "swr"
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, ExternalLink, Loader2, Phone, RefreshCw, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ResumenSeguimientos } from "@/components/ventas/seguimientos-resumen"
export type { Lead as LeadSeguimiento }

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error || "Error"); return b })
const NADA = "-"
const FUPS = Array.from({ length: 15 }, (_, i) => i + 1)
const TIPOS_FUP = ["Texto", "Audio", "Foto 1 VW", "Video 1 VW", "Llamada"]
const CALIFS = ["LEAD S", "LEAD A", "LEAD B", "LEAD C", "LEAD D"]
const MACROS = ["DUEÑO DE NEGOCIO", "EMPLEADO", "ESTUDIANTE", "SIN CLASIFICAR"]
const ESTADOS_SEG = ["Activo", "Reagendó", "Cerrado", "Descartado"]
const SITUACIONES = ["Lo tenía que pensar", "No tenia dinero para fee", "No llegaba a la Cuota 1", "No llegaba al PIF", "Le parecía caro", "Desconfianza", "Miedo", "Metodo de pago", "No tenia urgencia", "Los padres no lo dejaron", "Consultar con pareja/socio", "No respondió", "Reagendó", "Pagó fee", "Problemas de Luz"]
const ARQ_COMERCIAL = ["Principiante sin experiencia", "Laburante digital", "Empleado 9 a 5", "Universitario", "Sabe IA pero no cómo venderla", "Dueño de negocio tradicional", "Otro"]
const TEMPERATURAS = ["Frío", "Tibio", "Caliente"]
const OBJECIONES = ["Dinero", "Tiempo", "Confianza", "Experiencia / no sé si voy a poder", "Consultar con otra persona", "Riesgo", "Urgencia", "Otra"]
const NIVELES = ["Bajo", "Medio", "Alto"]
const CAPACIDAD = ["Disponible", "Limitada", "Sin capacidad actual"]
const DECIDE = ["Decide solo", "Consulta con otra persona"]
const MOVIMIENTOS = ["Reconectar con su objetivo económico", "Resolver dudas de adquisición de clientes", "Bajar la incertidumbre de cómo empezar", "Trabajar el riesgo de la inversión", "Involucrar al decisor", "Mostrar un caso de éxito parecido", "Trabajar la falta de tiempo", "Pedir una respuesta definitiva", "Reactivar con una perspectiva nueva"]
// Guía de la propuesta comercial: qué busca cada FUP (orientativa, no mecánica)
const OBJETIVO_FUP: Record<number, string> = { 1: "Retomar y detectar qué quedó pendiente", 2: "Trabajar la objeción principal", 3: "Darle una nueva perspectiva", 4: "Evidencia o caso de éxito", 5: "Costo de postergar la decisión", 6: "Pedir una definición clara" }

const ETIQUETAS: Record<string, { label: string; cls: string }> = {
  calificado: { label: "Calificado", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  fee: { label: "Fee", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  cuota: { label: "Cuota", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  presentado: { label: "Presentado", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  no_show: { label: "No show", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  reprogramo: { label: "Reprogramó", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  cerrado: { label: "Cerró", cls: "bg-emerald-600/20 text-emerald-700 dark:text-emerald-300" },
  sin_seguimiento: { label: "Sin seguimiento", cls: "bg-muted text-muted-foreground" },
}
const CATEGORIAS = [["todos", "Todos"], ["calificado", "Calificados"], ["fee", "Fee's"], ["presentado", "Presentados"], ["no_show", "No show's"], ["cuota", "Cuota"]] as const
const ORDENES = [["prioridad", "Prioridad"], ["calificacion", "Más calificados"], ["fecha_desc", "Call más reciente"], ["fecha_asc", "Call más vieja"], ["mas_fups", "Más seguimientos"], ["menos_fups", "Menos seguimientos"], ["ultimo_viejo", "Último FUP más viejo"], ["ultimo_nuevo", "Último FUP más nuevo"], ["proximo", "Próximo contacto"]] as const

type Fup = { hecho: boolean; fecha: string; por?: string; nota?: string; mensaje?: string; tipo?: string; respondio?: boolean }
type Seg = { id: string; estado: string; proximo_fup: string | null; situacion: string | null; problema_dolor: string | null; notas: string | null; razon_call: string | null; fups: Record<string, any>; closer: string | null }
type Lead = {
  key: string; seguimiento: Seg | null; agenda_id: string | null; nombre: string; telefono: string | null; instagram: string | null; closer: string | null; setter: string | null
  fecha_call: string | null; calificacion: string | null; calificaba_realmente: string | null; arquetipo: string; subarquetipo: string | null; ocupacion: string | null
  agenda: null | Record<string, any>; pagos: { fecha: string; tipo: string; monto: number; closer: string | null }[]; pagado: number
  etiquetas: string[]; fups_hechos: number; ultimo_fup: string | null; respondidos: number; sin_respuesta: number
}
type Resp = { yo: { primerNombre: string; manager: boolean; soloPropios: boolean }; closers: string[]; hoy: string; leads: Lead[] }

const PESO_CALIF: Record<string, number> = { "LEAD S": 5, "LEAD A": 4, "LEAD B": 3, "LEAD C": 2, "LEAD D": 1, S: 5, A: 4, B: 3, C: 2, D: 1 }
const peso = (c: string | null) => PESO_CALIF[String(c || "").toUpperCase().trim()] || 0
const dia = (v: string | null | undefined) => v ? new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : "—"
const fechaHora = (v: string | null | undefined) => {
  if (!v) return "—"
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T") + (v.endsWith("Z") ? "" : "Z"))
  return Number.isNaN(d.getTime()) ? v.slice(0, 10) : d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}
const diasDesde = (v: string | null, hoy: string) => v ? Math.round((new Date(`${hoy}T12:00:00`).getTime() - new Date(`${v.slice(0, 10)}T12:00:00`).getTime()) / 86400000) : null
function prioridad(l: Lead, hoy: string) {
  let p = peso(l.calificacion) * 10
  const prox = l.seguimiento?.proximo_fup
  if (prox && prox < hoy) p += 100; else if (prox === hoy) p += 80
  if (l.etiquetas.includes("cuota")) p += 35
  if (l.etiquetas.includes("fee")) p += 30
  if (l.etiquetas.includes("presentado")) p += 15
  const sin = diasDesde(l.ultimo_fup || l.fecha_call, hoy)
  if (sin !== null) p += Math.min(sin, 20)
  if (l.seguimiento && !["Activo", "Reagendó"].includes(l.seguimiento.estado)) p -= 200
  return p
}

export function SeguimientosFichas() {
  const [closer, setCloser] = useState("todos")
  const [cat, setCat] = useState("todos")
  const [orden, setOrden] = useState("prioridad")
  const [estadoSeg, setEstadoSeg] = useState("activos")
  const [mes, setMes] = useState("")
  const [q, setQ] = useState("")
  const [sel, setSel] = useState<string | null>(null)
  const { data, error, isLoading, mutate } = useSWR<Resp>(`/api/seguimientos/fichas?closer=${encodeURIComponent(closer)}`, fetcher, { revalidateOnFocus: true })
  const hoy = data?.hoy || new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })

  const base = useMemo(() => (data?.leads || []).filter(l => {
    const est = l.seguimiento?.estado || "Activo"
    if (estadoSeg === "activos" && !["Activo", "Reagendó"].includes(est)) return false
    if (estadoSeg !== "activos" && estadoSeg !== "todos" && est !== estadoSeg) return false
    if (mes && !String(l.fecha_call || "").startsWith(mes)) return false
    const t = q.trim().toLowerCase()
    return !t || [l.nombre, l.telefono, l.instagram, l.closer].some(x => String(x || "").toLowerCase().includes(t))
  }), [data, estadoSeg, mes, q])
  const conteo = (c: string) => c === "todos" ? base.length : base.filter(l => l.etiquetas.includes(c)).length
  const lista = useMemo(() => {
    const out = base.filter(l => cat === "todos" || l.etiquetas.includes(cat))
    const s = (a: string | null) => a || ""
    const cmp: Record<string, (a: Lead, b: Lead) => number> = {
      prioridad: (a, b) => prioridad(b, hoy) - prioridad(a, hoy),
      calificacion: (a, b) => peso(b.calificacion) - peso(a.calificacion) || prioridad(b, hoy) - prioridad(a, hoy),
      fecha_desc: (a, b) => s(b.fecha_call).localeCompare(s(a.fecha_call)),
      fecha_asc: (a, b) => s(a.fecha_call).localeCompare(s(b.fecha_call)),
      mas_fups: (a, b) => b.fups_hechos - a.fups_hechos,
      menos_fups: (a, b) => a.fups_hechos - b.fups_hechos,
      ultimo_viejo: (a, b) => s(a.ultimo_fup || a.fecha_call).localeCompare(s(b.ultimo_fup || b.fecha_call)),
      ultimo_nuevo: (a, b) => s(b.ultimo_fup).localeCompare(s(a.ultimo_fup)),
      proximo: (a, b) => (s(a.seguimiento?.proximo_fup || null) || "9999").localeCompare(s(b.seguimiento?.proximo_fup || null) || "9999"),
    }
    return out.sort(cmp[orden] || cmp.prioridad)
  }, [base, cat, orden, hoy])
  const actual = (data?.leads || []).find(l => l.key === sel) || null
  const meses = useMemo(() => [...new Set((data?.leads || []).map(l => String(l.fecha_call || "").slice(0, 7)).filter(Boolean))].sort().reverse(), [data])

  return <div className="space-y-3">
    <div className="flex flex-wrap gap-1">
      {CATEGORIAS.map(([v, l]) => <Button key={v} size="sm" variant={cat === v ? "default" : "outline"} onClick={() => setCat(v)}>{l} <span className="ml-1 rounded bg-black/10 px-1 text-[10px] dark:bg-white/10">{conteo(v)}</span></Button>)}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {!data?.yo.soloPropios && <Select value={closer} onValueChange={setCloser}><SelectTrigger className="w-40"><SelectValue placeholder="Closer" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos los closers</SelectItem>{(data?.closers || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>}
      <Select value={orden} onValueChange={setOrden}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>{ORDENES.map(([v, l]) => <SelectItem key={v} value={v}>Ordenar: {l}</SelectItem>)}</SelectContent></Select>
      <Select value={estadoSeg} onValueChange={setEstadoSeg}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="activos">Activos</SelectItem>{ESTADOS_SEG.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}<SelectItem value="todos">Todos</SelectItem></SelectContent></Select>
      <Select value={mes || NADA} onValueChange={v => setMes(v === NADA ? "" : v)}><SelectTrigger className="w-40"><SelectValue placeholder="Mes de la call" /></SelectTrigger><SelectContent><SelectItem value={NADA}>Todos los meses</SelectItem>{meses.map(m => <SelectItem key={m} value={m}>{new Date(`${m}-15T12:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</SelectItem>)}</SelectContent></Select>
      <div className="relative min-w-48 flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar lead" value={q} onChange={e => setQ(e.target.value)} /></div>
      <Button variant="outline" size="sm" onClick={() => mutate()}><RefreshCw className={cn("mr-1 h-4 w-4", isLoading && "animate-spin")} />Actualizar</Button>
    </div>
    {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-500">{error.message}</p>}
    {isLoading && !data && <p className="py-16 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />Cargando leads…</p>}

    {data && <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="max-h-[80vh] overflow-y-auto rounded-2xl border bg-card lg:col-span-7">
        {!lista.length && <p className="p-8 text-center text-sm text-muted-foreground">No hay leads con estos filtros.</p>}
        {lista.map(l => {
          const prox = l.seguimiento?.proximo_fup
          const venc = prox && prox < hoy, esHoy = prox === hoy
          return <button key={l.key} onClick={() => setSel(l.key)} className={cn("block w-full border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/50", sel === l.key && "bg-blue-500/10")}>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-semibold">{l.nombre}</p>
              {l.calificacion && <span className="shrink-0 rounded-md border px-1.5 text-[10px] font-bold">{l.calificacion.replace("LEAD ", "")}</span>}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{fechaHora(l.fecha_call)}{l.closer ? ` · ${l.closer}` : ""} · {l.fups_hechos} FUP{l.ultimo_fup ? ` · último ${dia(l.ultimo_fup)}` : ""}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {l.etiquetas.map(e => ETIQUETAS[e] && <span key={e} className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", ETIQUETAS[e].cls)}>{ETIQUETAS[e].label}</span>)}
              {l.arquetipo !== "SIN CLASIFICAR" && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{l.arquetipo}</span>}
              {venc && <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-500"><AlertTriangle className="h-3 w-3" />vencido {dia(prox)}</span>}
              {esHoy && <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600"><CalendarClock className="h-3 w-3" />hoy</span>}
            </div>
          </button>
        })}
      </div>
      <div className="lg:col-span-5"><ResumenSeguimientos leads={data.leads}hoy={hoy} closer={closer} /></div>
    </div>}
    <Dialog open={!!actual} onOpenChange={o => { if (!o) setSel(null) }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogTitle className="sr-only">Ficha del lead</DialogTitle>
        {actual && <Ficha key={actual.key} l={actual} hoy={hoy} onCambio={() => mutate()} onAlta={k => setSel(k)} />}
      </DialogContent>
    </Dialog>
  </div>
}

async function pedir(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const b = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(b.error || "No se pudo guardar")
  return b
}

function Ficha({ l, hoy, onCambio, onAlta }: { l: Lead; hoy: string; onCambio: () => void; onAlta: (key: string) => void }) {
  const [tab, setTab] = useState<"estado" | "seguimientos" | "calificacion" | "diagnostico">("seguimientos")
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const seg = l.seguimiento
  const tel = (l.telefono || "").replace(/\D/g, "")

  // Si el lead todavía no tiene fila de seguimiento, se crea desde su agenda antes del primer cambio.
  async function asegurarSeg(): Promise<string> {
    if (seg) return seg.id
    if (!l.agenda_id) throw new Error("Este lead no tiene agenda")
    await pedir("/api/seguimientos", "POST", { agenda_ids: [l.agenda_id] })
    const d = await fetch(`/api/seguimientos?estado=todos`, { cache: "no-store" }).then(r => r.json())
    const fila = (d.filas || []).find((f: { agenda_id: string }) => f.agenda_id === l.agenda_id)
    if (!fila) throw new Error("No se pudo crear el seguimiento")
    return fila.id
  }
  async function guardarSeg(patch: Record<string, unknown>) {
    setGuardando(true); setMsg(null)
    try {
      const nuevo = !seg
      const id = await asegurarSeg()
      await pedir("/api/seguimientos", "PATCH", { id, ...patch })
      setMsg("Guardado"); onCambio()
      if (nuevo) onAlta(`s:${id}`)
    } catch (e) { setMsg((e as Error).message) } finally { setGuardando(false) }
  }
  async function guardarAgenda(patch: Record<string, unknown>) {
    if (!l.agenda_id) { setMsg("Este lead no tiene agenda para guardar"); return }
    setGuardando(true); setMsg(null)
    try { await pedir("/api/agendas", "PATCH", { id: l.agenda_id, ...patch }); setMsg("Guardado en la agenda (se ve también en Resumen de ventas)"); onCambio() }
    catch (e) { setMsg((e as Error).message) } finally { setGuardando(false) }
  }

  const tabs = [["estado", "Estado"], ["seguimientos", `Seguimientos (${l.fups_hechos})`], ["calificacion", "Calificación de lead"], ["diagnostico", "Diagnóstico y próximo paso"]] as const
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold">{l.nombre}</h2>
        <p className="text-xs text-muted-foreground">Call {fechaHora(l.fecha_call)}{l.closer ? ` · closer ${l.closer}` : ""}{l.setter ? ` · setter ${l.setter}` : ""}</p>
        <div className="mt-1 flex flex-wrap gap-3 text-xs">
          {tel && <a className="flex items-center gap-1 text-emerald-600 hover:underline" href={`https://wa.me/${tel}`} target="_blank" rel="noreferrer"><Phone className="h-3 w-3" />{l.telefono}</a>}
          {l.instagram && <a className="text-blue-500 hover:underline" href={`https://instagram.com/${l.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">@{l.instagram.replace(/^@/, "")}</a>}
          {l.agenda?.link_fathom && <a className="flex items-center gap-1 text-blue-500 hover:underline" href={l.agenda.link_fathom} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Fathom</a>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">{l.etiquetas.map(e => ETIQUETAS[e] && <span key={e} className={cn("rounded px-2 py-0.5 text-xs font-semibold", ETIQUETAS[e].cls)}>{ETIQUETAS[e].label}</span>)}</div>
    </div>
    <div className="flex flex-wrap gap-1 border-b pb-2">{tabs.map(([v, t]) => <Button key={v} size="sm" variant={tab === v ? "default" : "ghost"} onClick={() => setTab(v)}>{t}</Button>)}</div>
    {msg && <p className="flex items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-xs">{msg}<button onClick={() => setMsg(null)}><X className="h-3 w-3" /></button></p>}
    {guardando && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Guardando…</p>}

    {tab === "estado" && <div className="grid gap-4 md:grid-cols-2">
      <Campo label="Estado del seguimiento">
        <Select value={seg?.estado || "Activo"} onValueChange={v => guardarSeg({ estado: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ESTADOS_SEG.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select>
      </Campo>
      <Campo label="Próximo contacto">
        <Input type="date" value={seg?.proximo_fup || ""} onChange={e => guardarSeg({ proximo_fup: e.target.value || null })} />
      </Campo>
      <Campo label="Situación del lead">
        <Select value={seg?.situacion || NADA} onValueChange={v => guardarSeg({ situacion: v === NADA ? null : v })}><SelectTrigger><SelectValue placeholder="Situación" /></SelectTrigger><SelectContent><SelectItem value={NADA}>Sin situación</SelectItem>{[...(seg?.situacion && !SITUACIONES.includes(seg.situacion) ? [seg.situacion] : []), ...SITUACIONES].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      </Campo>
      <Campo label="Resultado de la llamada (de la agenda)">
        <p className="text-sm">{l.agenda ? [l.agenda.estado || "Sin estado", l.agenda.show === true ? "se presentó" : l.agenda.show === false ? "no se presentó" : "sin show cargado", l.agenda.cerro ? "cerró" : "no cerró"].join(" · ") : "Sin agenda vinculada"}</p>
        <p className="text-[11px] text-muted-foreground">Se cambia desde la ficha del Resumen de ventas.</p>
      </Campo>
      <div className="md:col-span-2">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Pagos registrados</p>
        {l.pagos.length ? <div className="rounded-xl border text-sm">{l.pagos.map((p, i) => <div key={i} className="flex justify-between border-b px-3 py-1.5 last:border-0"><span>{dia(p.fecha)} · {p.tipo}</span><span className="font-semibold">USD {p.monto.toLocaleString("es-AR")}</span></div>)}
          <div className="flex justify-between bg-muted/50 px-3 py-1.5 text-xs font-bold"><span>Total pagado</span><span>USD {l.pagado.toLocaleString("es-AR")}</span></div></div>
          : <p className="text-sm text-muted-foreground">Sin pagos.</p>}
      </div>
    </div>}

    {tab === "seguimientos" && <Seguimientos l={l} hoy={hoy} onGuardar={guardarSeg} />}

    {tab === "calificacion" && <div className="grid gap-4 md:grid-cols-2">
      <Campo label="Lead scoring">
        <Select value={CALIFS.includes(String(l.calificacion || "").toUpperCase()) ? String(l.calificacion).toUpperCase() : NADA} onValueChange={v => { if (v !== NADA) { guardarAgenda({ calificacion: v, lead_score_grade: v }); if (seg) pedir("/api/seguimientos", "PATCH", { id: seg.id, tipo_lead: v }).catch(() => {}) } }}>
          <SelectTrigger><SelectValue placeholder="Sin scoring" /></SelectTrigger><SelectContent><SelectItem value={NADA}>Sin scoring</SelectItem>{CALIFS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        {l.agenda?.lead_score != null && <p className="text-[11px] text-muted-foreground">Puntaje automático: {String(l.agenda.lead_score)}</p>}
      </Campo>
      <Campo label="Calificaba realmente (post-call)">
        <Select value={l.calificaba_realmente || "Sin definir"} onValueChange={v => { if (v !== "Sin definir") guardarAgenda({ calificaba_realmente: v }) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Sin definir", "Si", "No"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
      </Campo>
      <Arquetipo l={l} onGuardar={ocupacion => guardarAgenda({ ocupacion })} />
      <div className="md:col-span-2 grid gap-2 rounded-xl border p-3 text-sm">
        <p className="text-xs font-semibold text-muted-foreground">Lo que respondió en iClosed</p>
        {[["Cuánto genera por mes", l.agenda?.ingresos], ["Inversión", l.agenda?.inversion], ["Problema actual", l.agenda?.problema_actual], ["Hace cuánto", l.agenda?.tiempo_problema], ["Intentos previos", l.agenda?.intentos_previos], ["Por qué ahora", l.agenda?.motivo_urgencia], ["A qué se dedica", l.ocupacion], ["Fuente", l.agenda?.fuente]].map(([k, v]) => <p key={k as string}><span className="text-muted-foreground">{k}:</span> {v ? String(v) : "—"}</p>)}
      </div>
    </div>}

    {tab === "diagnostico" && <Diagnostico l={l} onGuardar={guardarSeg} />}
  </div>
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1"><span className="text-xs font-semibold text-muted-foreground">{label}</span>{children}</div>
}

function Arquetipo({ l, onGuardar }: { l: Lead; onGuardar: (ocupacion: string | null) => void }) {
  const [macro, setMacro] = useState(l.arquetipo || "SIN CLASIFICAR")
  const [sub, setSub] = useState(l.subarquetipo || "")
  // mismo formato que guarda el Resumen de ventas en agendas.ocupacion
  const armar = (m: string, s: string) => {
    const pref = m === "DUEÑO DE NEGOCIO" ? "Negocio" : m === "EMPLEADO" ? "Empleado" : m === "ESTUDIANTE" ? "Estudiante" : ""
    return pref ? (s.trim() ? `${pref} - ${s.trim()}` : pref) : (s.trim() || null)
  }
  return <>
    <Campo label="Macro arquetipo (el mismo del Resumen)">
      <Select value={macro} onValueChange={v => { setMacro(v); onGuardar(armar(v, sub)) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MACROS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
    </Campo>
    <Campo label="Subarquetipo">
      <Input value={sub} placeholder="Ej: Ingeniero, Editor, Ecommerce" onChange={e => setSub(e.target.value)} onBlur={() => { if (sub !== (l.subarquetipo || "")) onGuardar(armar(macro, sub)) }} />
    </Campo>
  </>
}

function Seguimientos({ l, hoy, onGuardar }: { l: Lead; hoy: string; onGuardar: (p: Record<string, unknown>) => Promise<void> }) {
  const fups = (l.seguimiento?.fups || {}) as Record<string, Fup>
  const siguiente = FUPS.find(n => !fups[String(n)]?.hecho) || 15
  const [abierto, setAbierto] = useState<number | null>(null)
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span>{l.fups_hechos} hechos</span><span className="text-emerald-600">{l.respondidos} respondió</span><span className="text-red-500">{l.sin_respuesta} sin respuesta</span>
      {l.ultimo_fup && <span>último {dia(l.ultimo_fup)} (hace {diasDesde(l.ultimo_fup, hoy)} días)</span>}
    </div>
    <div className="grid gap-1.5">
      {FUPS.map(n => {
        const h = fups[String(n)]
        const est = !h ? "vacio" : h.hecho ? "hecho" : h.fecha < hoy ? "vencido" : "preparado"
        if (!h && n > siguiente + 1 && abierto !== n) return null
        return <div key={n} className={cn("rounded-xl border", est === "hecho" && "border-blue-500/40", est === "preparado" && "border-dashed border-amber-500", est === "vencido" && "border-dashed border-red-500")}>
          <button className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm" onClick={() => setAbierto(abierto === n ? null : n)}>
            <span className={cn("flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold", est === "hecho" ? "bg-blue-500 text-white" : "border")}>{n}</span>
            {h ? <>
              <span className="text-xs">{dia(h.fecha)}</span>
              {h.tipo && <span className="rounded bg-muted px-1.5 text-[11px]">{h.tipo}</span>}
              {h.respondio === true && <span className="text-[11px] font-semibold text-emerald-600">respondió</span>}
              {h.respondio === false && <span className="text-[11px] font-semibold text-red-500">no respondió</span>}
              {!h.hecho && <span className="flex items-center gap-0.5 text-[11px] text-amber-600"><Clock className="h-3 w-3" />preparado</span>}
              {h.nota && <span className="truncate text-xs text-muted-foreground">· {h.nota}</span>}
            </> : <span className="text-xs text-muted-foreground">{n === siguiente ? "Registrar este seguimiento" : "Vacío"}{OBJETIVO_FUP[n] ? ` · objetivo: ${OBJETIVO_FUP[n]}` : ""}</span>}
          </button>
          {abierto === n && <EditorFup n={n} h={h} hoy={hoy} onGuardar={async p => { await onGuardar({ fup: n, ...p }); setAbierto(null) }} />}
        </div>
      })}
    </div>
    <p className="text-[11px] text-muted-foreground">Las capturas y links de cada FUP se siguen cargando desde la vista Tabla.</p>
  </div>
}

function EditorFup({ n, h, hoy, onGuardar }: { n: number; h?: Fup; hoy: string; onGuardar: (p: Record<string, unknown>) => Promise<void> }) {
  const [fecha, setFecha] = useState(h?.fecha || hoy)
  const [hecho, setHecho] = useState(h ? h.hecho : true)
  const [tipo, setTipo] = useState(h?.tipo || "")
  const [resp, setResp] = useState<string>(h?.respondio === true ? "si" : h?.respondio === false ? "no" : NADA)
  const [nota, setNota] = useState(h?.nota || "")
  const [mensaje, setMensaje] = useState(h?.mensaje || "")
  return <div className="grid gap-3 border-t p-3 md:grid-cols-2">
    <Campo label="Fecha"><Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></Campo>
    <Campo label="Estado">
      <div className="flex gap-1"><Button size="sm" variant={hecho ? "default" : "outline"} onClick={() => setHecho(true)}><CheckCircle2 className="mr-1 h-4 w-4" />Hecho</Button><Button size="sm" variant={!hecho ? "default" : "outline"} onClick={() => setHecho(false)}><Clock className="mr-1 h-4 w-4" />Preparado</Button></div>
    </Campo>
    <Campo label="Tipo de seguimiento">
      <Select value={tipo || NADA} onValueChange={v => setTipo(v === NADA ? "" : v)}><SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger><SelectContent><SelectItem value={NADA}>Sin tipo</SelectItem>{TIPOS_FUP.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
    </Campo>
    <Campo label="Efectividad">
      <Select value={resp} onValueChange={setResp}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NADA}>Sin dato</SelectItem><SelectItem value="si">Respondió</SelectItem><SelectItem value="no">No respondió</SelectItem></SelectContent></Select>
    </Campo>
    <div className="md:col-span-2"><Campo label="Nota corta"><Input value={nota} maxLength={500} onChange={e => setNota(e.target.value)} placeholder={OBJETIVO_FUP[n] ? `Objetivo sugerido: ${OBJETIVO_FUP[n]}` : "Qué le mandaste y qué contestó"} /></Campo></div>
    <div className="md:col-span-2"><Campo label="Mensaje enviado o preparado"><Textarea className="min-h-20 text-sm" value={mensaje} maxLength={4000} onChange={e => setMensaje(e.target.value)} /></Campo></div>
    <div className="flex justify-end gap-2 md:col-span-2">
      {h && <Button size="sm" variant="ghost" className="text-red-500" onClick={() => onGuardar({ borrar: true })}>Quitar FUP</Button>}
      <Button size="sm" onClick={() => onGuardar({ fecha, hecho, tipo: tipo || null, respondio: resp === NADA ? null : resp === "si", nota, mensaje })}>Guardar FUP {n}</Button>
    </div>
  </div>
}

function Diagnostico({ l, onGuardar }: { l: Lead; onGuardar: (p: Record<string, unknown>) => Promise<void> }) {
  const f = (l.seguimiento?.fups?._ficha || {}) as Record<string, string>
  const sel = (campo: string, label: string, opciones: string[]) => <Campo label={label}>
    <Select value={f[campo] || NADA} onValueChange={v => onGuardar({ ficha: { [campo]: v === NADA ? null : v } })}><SelectTrigger><SelectValue placeholder="Sin definir" /></SelectTrigger><SelectContent><SelectItem value={NADA}>Sin definir</SelectItem>{[...(f[campo] && !opciones.includes(f[campo]) ? [f[campo]] : []), ...opciones].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>
  </Campo>
  return <div className="grid gap-4 md:grid-cols-2">
    {sel("arquetipo_comercial", "Arquetipo de lead (comercial)", ARQ_COMERCIAL)}
    {sel("temperatura", "Temperatura", TEMPERATURAS)}
    {sel("objecion_principal", "Objeción principal", OBJECIONES)}
    {sel("objecion_secundaria", "Objeción secundaria", OBJECIONES)}
    {sel("capacidad_inversion", "Capacidad de inversión", CAPACIDAD)}
    {sel("decide", "Toma de decisión", DECIDE)}
    {sel("compromiso", "Nivel de compromiso", NIVELES)}
    {sel("proximo_movimiento", "Próximo movimiento estratégico", MOVIMIENTOS)}
    {l.agenda?.motivo_no_cierre && <p className="md:col-span-2 text-xs text-muted-foreground">Objeciones cargadas en la agenda (Resumen): {l.agenda.motivo_no_cierre}</p>}
    <div className="md:col-span-2"><TextoCampo label="Próxima acción acordada" valor={f.proxima_accion || ""} onGuardar={v => onGuardar({ ficha: { proxima_accion: v } })} /></div>
    <div className="md:col-span-2"><TextoCampo label="Problema / dolor" valor={l.seguimiento?.problema_dolor || ""} onGuardar={v => onGuardar({ problema_dolor: v })} /></div>
    <div className="md:col-span-2"><TextoCampo label="Notas" valor={l.seguimiento?.notas || ""} onGuardar={v => onGuardar({ notas: v })} /></div>
    {f.por && <p className="md:col-span-2 text-[11px] text-muted-foreground">Último cambio del diagnóstico: {f.por}.</p>}
  </div>
}

function TextoCampo({ label, valor, onGuardar }: { label: string; valor: string; onGuardar: (v: string) => void }) {
  const [v, setV] = useState(valor)
  return <Campo label={label}><Textarea className="min-h-16 text-sm" value={v} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== valor) onGuardar(v) }} /></Campo>
}
