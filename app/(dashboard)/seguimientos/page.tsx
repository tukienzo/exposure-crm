"use client"

import { useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { AlertTriangle, BellRing, CalendarClock, CheckCircle2, Clock, Download, ExternalLink, FileText, ImagePlus, Link2, ListChecks, Loader2, MessageSquareText, Paperclip, Phone, Plus, RefreshCw, Search, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CrmEmpty, CrmPageIntro, CrmStat } from "@/components/crm-ui"
import { cn } from "@/lib/utils"
import type { FupAdjunto, FupHecho, Seguimiento } from "@/lib/supabase"
import { SeguimientosFichas } from "@/components/ventas/seguimientos-fichas"

// Pantalla de seguimientos: la pestaña 🔂 SEGUIMIENTOS del sheet, pero por closer. Una fila por lead con
// los 10 FUP como casilleros. Cada casillero abre un editor: fecha (pasada, hoy o futura), hecho o preparado,
// nota, mensaje enviado, link (Loom, etc.) y capturas. Lo demás se guarda solo al cambiar.

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error || "Error"); return b })
const SITUACIONES = ["Lo tenía que pensar", "No tenia dinero para fee", "No llegaba a la Cuota 1", "No llegaba al PIF", "Le parecía caro", "Desconfianza", "Miedo", "Metodo de pago", "No tenia urgencia", "Los padres no lo dejaron", "Consultar con pareja/socio", "No respondió", "Reagendó", "Pagó fee", "Problemas de Luz"]
const TIPOS = ["LEAD S", "LEAD A", "LEAD B", "LEAD C", "LEAD D"]
const ESTADOS = ["Activo", "Reagendó", "Cerrado", "Descartado"] as const
const FUPS = Array.from({ length: 15 }, (_, i) => i + 1)   // orden de FUP: día 1 al 15 (Nahuel, 26/11/2026)
const NADA = "-"

type Respuesta = { yo: { nombre: string; rol: string; primerNombre: string; manager: boolean; soloPropios: boolean }; closers: string[]; hoy: string; filas: Seguimiento[] }
type Candidata = { id: string; nombre: string; telefono: string | null; instagram: string | null; fecha_closer: string | null; closer: string | null; calificacion: string | null; estado: string | null; motivo_no_cierre: string | null; en_fup: boolean }
type Patch = Record<string, unknown>

const fechaCorta = (v: string | null | undefined) => {
  if (!v) return "—"
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T") + (v.endsWith("Z") ? "" : "Z"))   // la base guarda UTC
  if (Number.isNaN(d.getTime())) return v.slice(0, 10)
  return d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}
const fechaDia = (v: string | null | undefined) => v ? new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : ""
const meses = () => { const out: string[] = []; const d = new Date(); for (let i = 0; i < 8; i++) { out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); d.setMonth(d.getMonth() - 1) } return out }
const nombreMes = (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" })
// Estado visual de un FUP: hecho · preparado para una fecha futura · preparado con fecha pasada (no se envió) · vacío
const estadoFup = (h: FupHecho | undefined, hoy: string) => !h ? "vacio" : h.hecho ? "hecho" : h.fecha < hoy ? "vencido" : "preparado"

export default function SeguimientosPage() {
  // Vista Fichas (lista + ficha, 26/11/2026) por defecto; la tabla original sigue igual en «Tabla».
  const [vista, setVista] = useState<"fichas" | "tabla">("fichas")
  const [closer, setCloser] = useState("todos")
  const [estado, setEstado] = useState("activos")
  const [mes, setMes] = useState("")
  const [busqueda, setBusqueda] = useState("")
  const [abrirAlta, setAbrirAlta] = useState(false)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const clave = `/api/seguimientos?estado=${estado}&closer=${encodeURIComponent(closer)}${mes ? `&mes=${mes}` : ""}`
  const { data, isLoading, mutate } = useSWR<Respuesta>(clave, fetcher, { onError: e => setError(e.message) })
  const yo = data?.yo
  const hoy = data?.hoy || new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (data?.filas || []).filter(f => !q || [f.nombre, f.telefono, f.instagram, f.situacion, f.notas, f.problema_dolor].some(x => String(x || "").toLowerCase().includes(q)))
  }, [data, busqueda])
  const activos = (data?.filas || []).filter(f => f.estado === "Activo" || f.estado === "Reagendó")
  const vencidos = activos.filter(f => f.proximo_fup && f.proximo_fup < hoy)
  const paraHoy = activos.filter(f => f.proximo_fup === hoy)
  const sinFup = activos.filter(f => !f.etapa)
  const preparados = activos.reduce((s, f) => s + Object.values(f.fups || {}).filter(h => h && !h.hecho && h.fecha >= hoy).length, 0)
  const porEtapa = FUPS.map(n => activos.filter(f => f.etapa === n).length)

  async function guardar(id: string, patch: Patch): Promise<Seguimiento | null> {
    setGuardando(id); setError(null)
    try {
      const r = await fetch("/api/seguimientos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error || "No se pudo guardar")
      await mutate(d => d ? { ...d, filas: d.filas.map(f => f.id === id ? b.fila : f) } : d, { revalidate: false })
      return b.fila as Seguimiento
    } catch (e) { setError((e as Error).message); return null } finally { setGuardando(null) }
  }
  async function borrar(f: Seguimiento) {
    if (!confirm(`¿Borrar el seguimiento de ${f.nombre}? Si solo terminó, pasalo a Descartado o Cerrado.`)) return
    const r = await fetch("/api/seguimientos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.id }) })
    if (r.ok) mutate(); else setError((await r.json()).error || "No se pudo borrar")
  }

  return <div className="mx-auto max-w-[1700px] space-y-5 p-4 md:p-7">
    <CrmPageIntro eyebrow="Ventas · Seguimientos" title={yo?.soloPropios ? `Mis seguimientos` : "Seguimientos"} tone="blue" icon={<BellRing className="h-5 w-5" />}
      description={yo?.soloPropios ? "Tus leads después de la call: tocá cada FUP para registrarlo (con fecha, mensaje y captura) o dejarlo preparado para más adelante. Todo se guarda solo." : "Los leads en seguimiento de cada closer, con sus FUP, situación y próximo contacto. Filtrá por closer para ver la cartera de cada uno."}
      actions={<>
        <div className="flex rounded-md border p-0.5">{([["fichas", "Fichas"], ["tabla", "Tabla"]] as const).map(([v, t]) => <Button key={v} size="sm" variant={vista === v ? "default" : "ghost"} className="h-7" onClick={() => setVista(v)}>{t}</Button>)}</div>
        <Button variant="outline" size="sm" onClick={() => mutate()}><RefreshCw className={cn("mr-1 h-4 w-4", isLoading && "animate-spin")} />Actualizar</Button>
        <Button size="sm" onClick={() => setAbrirAlta(true)}><Plus className="mr-1 h-4 w-4" />Agregar lead</Button>
      </>} />

    {vista === "fichas" ? <SeguimientosFichas /> : <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <CrmStat label="En seguimiento" value={activos.length} detail={`${sinFup.length} todavía sin ningún FUP · ${preparados} FUP preparados a futuro`} icon={<ListChecks className="h-5 w-5" />} tone="blue" />
      <CrmStat label="Para hoy" value={paraHoy.length} detail="con próximo contacto hoy" icon={<CalendarClock className="h-5 w-5" />} tone="amber" />
      <CrmStat label="Vencidos" value={vencidos.length} detail="el próximo contacto ya pasó" icon={<AlertTriangle className="h-5 w-5" />} tone={vencidos.length ? "red" : "neutral"} />
      <div className="crm-stat">
        <p className="crm-stat-label">Por etapa (último FUP hecho)</p>
        <div className="mt-2 flex items-end gap-1">
          {porEtapa.map((n, i) => <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`FUP ${i + 1}: ${n} leads`}>
            <div className="w-full rounded-t bg-blue-500/70" style={{ height: `${Math.max(3, activos.length ? (n / Math.max(1, ...porEtapa)) * 36 : 3)}px` }} />
            <span className="text-[10px] text-muted-foreground">{i + 1}</span>
          </div>)}
        </div>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {!yo?.soloPropios && <Select value={closer} onValueChange={setCloser}><SelectTrigger className="w-40"><SelectValue placeholder="Closer" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos los closers</SelectItem>{(data?.closers || []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>}
      <div className="flex flex-wrap gap-1">{[["activos", "Activos"], ["Reagendó", "Reagendaron"], ["Cerrado", "Cerrados"], ["Descartado", "Descartados"], ["todos", "Todos"]].map(([v, l]) => <Button key={v} size="sm" variant={estado === v ? "default" : "outline"} onClick={() => setEstado(v)}>{l}</Button>)}</div>
      <Select value={mes || NADA} onValueChange={v => setMes(v === NADA ? "" : v)}><SelectTrigger className="w-44"><SelectValue placeholder="Mes de la call" /></SelectTrigger><SelectContent><SelectItem value={NADA}>Todos los meses</SelectItem>{meses().map(m => <SelectItem key={m} value={m}>{nombreMes(m)}</SelectItem>)}</SelectContent></Select>
      <div className="relative min-w-52 flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar por nombre, teléfono, situación o nota" value={busqueda} onChange={e => setBusqueda(e.target.value)} /></div>
    </div>

    {error && <p className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}<button onClick={() => setError(null)}><X className="h-4 w-4" /></button></p>}
    {isLoading && !data && <p className="py-16 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />Cargando seguimientos…</p>}
    {data && !filas.length && <CrmEmpty icon={<CheckCircle2 className="h-6 w-6" />} title="No hay leads en esta vista" detail={yo?.soloPropios ? "Agregá tus leads desde «Agregar lead»: podés traer las agendas que quedaron en seguimiento con un clic." : "Probá otro filtro o agregá leads desde «Agregar lead»."} />}

    {filas.length > 0 && <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <table className="w-full min-w-[1750px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted/80 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
          <tr>
            <th className="sticky left-0 z-20 bg-muted/95 px-3 py-2 text-left">Lead</th>
            <th className="px-2 py-2 text-left">Tuvo call</th>
            <th className="px-2 py-2 text-left">Situación</th>
            <th className="px-2 py-2 text-center">Audio</th>
            <th className="px-2 py-2 text-left">Tipo</th>
            <th className="px-2 py-2 text-left">Problema / dolor</th>
            <th className="min-w-[620px] px-2 py-2 text-left">FUP 1 → 15 (tocá uno: fecha, mensaje, captura · amarillo = preparado)</th>
            <th className="px-2 py-2 text-left">Próximo</th>
            <th className="px-2 py-2 text-left">Razón para la call</th>
            <th className="px-2 py-2 text-left">Fathom</th>
            <th className="px-2 py-2 text-left">Notas</th>
            <th className="px-2 py-2 text-left">Estado</th>
            {yo?.manager && <th className="px-2 py-2" />}
          </tr>
        </thead>
        <tbody>
          {filas.map(f => <Fila key={f.id} f={f} hoy={hoy} manager={Boolean(yo?.manager)} closers={data?.closers || []} guardando={guardando === f.id} onGuardar={patch => guardar(f.id, patch)} onBorrar={() => borrar(f)} />)}
        </tbody>
      </table>
    </div>}
    </>}

    <Alta abierto={abrirAlta} onCerrar={() => setAbrirAlta(false)} closer={closer} yo={yo} closers={data?.closers || []} onCreado={() => { setAbrirAlta(false); mutate() }} />
  </div>
}

function Fila({ f, hoy, manager, closers, guardando, onGuardar, onBorrar }: { f: Seguimiento; hoy: string; manager: boolean; closers: string[]; guardando: boolean; onGuardar: (patch: Patch) => Promise<Seguimiento | null>; onBorrar: () => void }) {
  const [fupAbierto, setFupAbierto] = useState<number | null>(null)
  const activo = f.estado === "Activo" || f.estado === "Reagendó"
  const vencido = activo && Boolean(f.proximo_fup && f.proximo_fup < hoy)
  const esHoy = activo && f.proximo_fup === hoy
  const tel = (f.telefono || "").replace(/\D/g, "")
  const situaciones = f.situacion && !SITUACIONES.includes(f.situacion) ? [f.situacion, ...SITUACIONES] : SITUACIONES
  return <tr className={cn("border-t align-top", vencido && "bg-red-500/5", esHoy && "bg-amber-500/5", !activo && "opacity-70")}>
    <td className="sticky left-0 z-10 min-w-[230px] bg-card px-3 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{f.nombre}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{fechaCorta(f.fecha_call)}{f.closer ? ` · ${f.closer}` : ""}</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            {tel && <a className="flex items-center gap-1 text-emerald-600 hover:underline" href={`https://wa.me/${tel}`} target="_blank" rel="noreferrer"><Phone className="h-3 w-3" />{f.telefono}</a>}
            {f.instagram && <a className="text-blue-500 hover:underline" href={`https://instagram.com/${f.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">@{f.instagram.replace(/^@/, "")}</a>}
          </div>
          {manager && <Select value={f.closer || NADA} onValueChange={v => onGuardar({ closer: v === NADA ? null : v })}><SelectTrigger className="mt-1 h-7 w-32 text-xs"><SelectValue placeholder="Closer" /></SelectTrigger><SelectContent><SelectItem value={NADA}>Sin closer</SelectItem>{closers.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>}
        </div>
        {guardando && <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>
    </td>
    <td className="px-2 py-2">
      <Select value={f.tuvo_call === null ? NADA : f.tuvo_call ? "si" : "no"} onValueChange={v => onGuardar({ tuvo_call: v === NADA ? null : v === "si" })}>
        <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NADA}>—</SelectItem><SelectItem value="si">Sí</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
      </Select>
    </td>
    <td className="px-2 py-2">
      <Select value={f.situacion || NADA} onValueChange={v => onGuardar({ situacion: v === NADA ? null : v })}>
        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Situación" /></SelectTrigger><SelectContent><SelectItem value={NADA}>Sin situación</SelectItem>{situaciones.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
      </Select>
    </td>
    <td className="px-2 py-2 text-center"><Checkbox className="mt-2" checked={f.enviado_audio} onCheckedChange={v => onGuardar({ enviado_audio: Boolean(v) })} title="Se le envió audio" /></td>
    <td className="px-2 py-2">
      <Select value={f.tipo_lead || NADA} onValueChange={v => onGuardar({ tipo_lead: v === NADA ? null : v })}>
        <SelectTrigger className="h-8 w-24 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger><SelectContent><SelectItem value={NADA}>—</SelectItem>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
      </Select>
    </td>
    <td className="px-2 py-2"><Texto valor={f.problema_dolor} ancho="w-52" alto onGuardar={v => onGuardar({ problema_dolor: v })} placeholder="Qué le duele / qué quiere" /></td>
    <td className="min-w-[620px] px-2 py-2">
      <div className="flex flex-nowrap gap-1">
        {FUPS.map(n => {
          const h = f.fups?.[String(n)]
          const st = estadoFup(h, hoy)
          const extras = h ? [h.mensaje ? "mensaje" : "", h.link ? "link" : "", h.adjuntos?.length ? `${h.adjuntos.length} adjunto${h.adjuntos.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") : ""
          const title = h ? `FUP ${n} · ${st === "hecho" ? "hecho" : st === "preparado" ? "preparado para" : "preparado, no enviado"} ${fechaDia(h.fecha)}${h.por ? ` · ${h.por}` : ""}${h.nota ? ` · ${h.nota}` : ""}${extras ? ` · ${extras}` : ""}` : `FUP ${n}: registrar o dejar preparado`
          return <button key={n} type="button" title={title} onClick={() => setFupAbierto(n)}
            className={cn("relative flex h-8 w-8 flex-col items-center justify-center rounded-md border text-[10px] font-bold",
              st === "hecho" && "border-blue-500 bg-blue-500 text-white",
              st === "preparado" && "border-dashed border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400",
              st === "vencido" && "border-dashed border-red-500 bg-red-500/10 text-red-600",
              st === "vacio" && "text-muted-foreground hover:border-blue-400")}>
            <span>{n}</span>
            {h && <span className="text-[8px] leading-none opacity-90">{h.fecha.slice(8, 10)}/{h.fecha.slice(5, 7)}</span>}
            {h && (h.adjuntos?.length || h.mensaje || h.link) ? <span className={cn("absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-card", st === "hecho" ? "bg-white" : "bg-current")} /> : null}
          </button>
        })}
      </div>
      {fupAbierto !== null && <FupEditor f={f} n={fupAbierto} hoy={hoy} onGuardar={onGuardar} onCerrar={() => setFupAbierto(null)} />}
    </td>
    <td className="px-2 py-2">
      <Input type="date" className={cn("h-8 w-36 text-xs", vencido && "border-red-500 text-red-600", esHoy && "border-amber-500")} value={f.proximo_fup || ""} onChange={e => onGuardar({ proximo_fup: e.target.value || null })} />
      {vencido && <p className="mt-1 text-[10px] font-bold text-red-500">Vencido</p>}{esHoy && <p className="mt-1 text-[10px] font-bold text-amber-600">Hoy</p>}
    </td>
    <td className="px-2 py-2"><Texto valor={f.razon_call} ancho="w-44" onGuardar={v => onGuardar({ razon_call: v })} placeholder="Por qué agendó" /></td>
    <td className="px-2 py-2">
      <div className="flex items-center gap-1">
        <Texto valor={f.transcripcion_fathom} ancho="w-40" onGuardar={v => onGuardar({ transcripcion_fathom: v })} placeholder="Link de Fathom" />
        {f.transcripcion_fathom && /^https?:/.test(f.transcripcion_fathom) && <a href={f.transcripcion_fathom} target="_blank" rel="noreferrer" className="text-blue-500"><ExternalLink className="h-4 w-4" /></a>}
      </div>
    </td>
    <td className="px-2 py-2"><Texto valor={f.notas} ancho="w-60" alto onGuardar={v => onGuardar({ notas: v })} placeholder="Qué pasó y qué decirle la próxima" /></td>
    <td className="px-2 py-2">
      <Select value={f.estado} onValueChange={v => onGuardar({ estado: v })}>
        <SelectTrigger className={cn("h-8 w-32 text-xs", f.estado === "Cerrado" && "border-emerald-500 text-emerald-600", f.estado === "Descartado" && "text-muted-foreground")}><SelectValue /></SelectTrigger>
        <SelectContent>{ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
      </Select>
    </td>
    {manager && <td className="px-2 py-2"><button className="mt-1 text-muted-foreground hover:text-red-500" title="Borrar" onClick={onBorrar}><Trash2 className="h-4 w-4" /></button></td>}
  </tr>
}

// Editor de un FUP: fecha (pasada para dejar registro, futura para dejarlo preparado), hecho o preparado, nota,
// mensaje enviado o a enviar, link y capturas. Las capturas se suben y guardan al instante; el resto con "Guardar".
function FupEditor({ f, n, hoy, onGuardar, onCerrar }: { f: Seguimiento; n: number; hoy: string; onGuardar: (patch: Patch) => Promise<Seguimiento | null>; onCerrar: () => void }) {
  const h = f.fups?.[String(n)]
  const [fecha, setFecha] = useState(h?.fecha || hoy)
  const [hecho, setHecho] = useState<boolean>(h ? h.hecho : true)
  const [nota, setNota] = useState(h?.nota || "")
  const [mensaje, setMensaje] = useState(h?.mensaje || "")
  const [link, setLink] = useState(h?.link || "")
  const [adjuntos, setAdjuntos] = useState<FupAdjunto[]>(h?.adjuntos || [])
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const archivoRef = useRef<HTMLInputElement>(null)
  const futura = fecha > hoy
  const base = () => ({ fup: n, hecho, fecha, nota, mensaje, link })

  async function guardar(extra: Patch = {}) {
    setGuardando(true); setMsg(null)
    const ok = await onGuardar({ ...base(), adjuntos, ...extra })
    setGuardando(false)
    if (ok) onCerrar()
  }
  async function subir(files: FileList | File[]) {
    const lista = Array.from(files).filter(a => a.size)
    if (!lista.length) return
    setSubiendo(true); setMsg(null)
    const nuevos: FupAdjunto[] = []
    for (const a of lista) {
      const form = new FormData(); form.append("file", a); form.append("id", f.id); form.append("fup", String(n))
      try {
        const r = await fetch("/api/seguimientos/adjunto", { method: "POST", body: form })
        const b = await r.json()
        if (!r.ok) throw new Error(b.error || "No se pudo subir")
        nuevos.push({ url: b.url, nombre: b.nombre, tipo: b.tipo })
      } catch (e) { setMsg((e as Error).message) }
    }
    if (nuevos.length) {
      const lista2 = [...adjuntos, ...nuevos]
      setAdjuntos(lista2)
      const ok = await onGuardar({ ...base(), adjuntos: lista2 })   // la captura queda guardada aunque después no toque "Guardar"
      if (ok) setMsg(`${nuevos.length} archivo${nuevos.length === 1 ? "" : "s"} guardado${nuevos.length === 1 ? "" : "s"}`)
    }
    setSubiendo(false)
  }
  async function quitarAdjunto(url: string) {
    const lista2 = adjuntos.filter(a => a.url !== url)
    setAdjuntos(lista2)
    await onGuardar({ ...base(), adjuntos: lista2 })
  }

  return <Dialog open onOpenChange={o => { if (!o) onCerrar() }}>
    <DialogContent className="max-w-xl" onPaste={e => { const fs = Array.from(e.clipboardData?.files || []).filter(a => /^image\//.test(a.type)); if (fs.length) { e.preventDefault(); subir(fs) } }}>
      <DialogHeader><DialogTitle>FUP {n} · {f.nombre}</DialogTitle></DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Fecha del seguimiento
            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            <span className="font-normal">{futura ? "Es a futuro: quedará preparado y se toma como próximo contacto." : fecha < hoy ? "Es anterior a hoy: queda como registro de ese día." : "Hoy."}</span>
          </label>
          <div className="grid gap-1 text-xs font-semibold text-muted-foreground">Estado
            <div className="grid gap-1">
              <label className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium", hecho && "border-blue-500 bg-blue-500/10")}><input type="radio" name={`fup-${n}`} checked={hecho} onChange={() => setHecho(true)} /><CheckCircle2 className="h-4 w-4 text-blue-500" />Hecho (ya se envió)</label>
              <label className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium", !hecho && "border-amber-500 bg-amber-500/10")}><input type="radio" name={`fup-${n}`} checked={!hecho} onChange={() => setHecho(false)} /><Clock className="h-4 w-4 text-amber-500" />Preparado para esa fecha</label>
            </div>
          </div>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Nota corta
          <Input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: le mandé el caso de Toto, quedó en contestar el lunes" maxLength={500} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground"><span className="flex items-center gap-1"><MessageSquareText className="h-3.5 w-3.5" />Mensaje enviado o preparado (pegalo acá)</span>
          <Textarea className="min-h-24 text-sm" value={mensaje} onChange={e => setMensaje(e.target.value)} placeholder="El texto del DM, WhatsApp o audio transcripto" maxLength={4000} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground"><span className="flex items-center gap-1"><Link2 className="h-3.5 w-3.5" />Link (Loom, Drive, video)</span>
          <Input value={link} onChange={e => setLink(e.target.value)} placeholder="https://www.loom.com/share/…" />
        </label>
        <div className="grid gap-2 text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />Capturas y archivos (JPG, PNG, WEBP, GIF o PDF, hasta 8 MB; también podés pegar una captura con Ctrl+V)</span>
          {adjuntos.length > 0 && <div className="flex flex-wrap gap-2">
            {adjuntos.map(a => <div key={a.url} className="group relative">
              {/^image\//.test(a.tipo)
                ? <a href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.nombre} className="h-20 w-20 rounded-md border object-cover" /></a>
                : <a href={a.url} target="_blank" rel="noreferrer" className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border p-1 text-center text-[10px] font-normal"><FileText className="h-6 w-6" /><span className="line-clamp-2 break-all">{a.nombre}</span></a>}
              <button type="button" title="Quitar" onClick={() => quitarAdjunto(a.url)} className="absolute -right-1.5 -top-1.5 rounded-full border bg-card p-0.5 text-muted-foreground shadow hover:text-red-500"><X className="h-3 w-3" /></button>
            </div>)}
          </div>}
          <div>
            <input ref={archivoRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => { if (e.target.files) subir(e.target.files); e.target.value = "" }} />
            <Button type="button" size="sm" variant="outline" disabled={subiendo} onClick={() => archivoRef.current?.click()}>{subiendo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}Subir captura</Button>
          </div>
        </div>
        {h?.por && <p className="text-xs text-muted-foreground">Cargado por {h.por}.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">{msg}</p>
          <div className="flex flex-wrap gap-2">
            {h && <Button type="button" variant="ghost" size="sm" className="text-red-500" disabled={guardando} onClick={() => guardar({ borrar: true })}><Trash2 className="mr-1 h-4 w-4" />Quitar FUP</Button>}
            {!h && <Button type="button" variant="outline" size="sm" disabled={guardando} onClick={() => { setHecho(true); setFecha(hoy); guardar({ hecho: true, fecha: hoy }) }}>Marcar hecho hoy</Button>}
            <Button type="button" size="sm" disabled={guardando || subiendo} onClick={() => guardar()}>{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}</Button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
}

// Texto que se guarda al salir del campo (solo si cambió).
function Texto({ valor, onGuardar, placeholder, ancho, alto }: { valor: string | null; onGuardar: (v: string) => void; placeholder?: string; ancho: string; alto?: boolean }) {
  const [v, setV] = useState(valor || "")
  const [previo, setPrevio] = useState(valor)
  if (valor !== previo) { setPrevio(valor); setV(valor || "") }   // el valor guardado cambió (otro dispositivo, recarga): se toma el nuevo
  const blur = () => { if (v !== (valor || "")) onGuardar(v) }
  return alto
    ? <Textarea className={cn("min-h-16 text-xs", ancho)} value={v} placeholder={placeholder} onChange={e => setV(e.target.value)} onBlur={blur} />
    : <Input className={cn("h-8 text-xs", ancho)} value={v} placeholder={placeholder} onChange={e => setV(e.target.value)} onBlur={blur} />
}

// Alta: desde las agendas (con un clic para traer las que quedaron en seguimiento) o a mano.
function Alta({ abierto, onCerrar, closer, yo, closers, onCreado }: { abierto: boolean; onCerrar: () => void; closer: string; yo?: Respuesta["yo"]; closers: string[]; onCreado: () => void }) {
  const [modo, setModo] = useState<"agendas" | "mano">("agendas")
  const [q, setQ] = useState("")
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ nombre: "", telefono: "", instagram: "", fecha_call: "", tipo_lead: "", situacion: "", closer: "", notas: "" })
  const { data, mutate } = useSWR<{ candidatas: Candidata[] }>(abierto ? `/api/seguimientos?candidatas=1&closer=${encodeURIComponent(closer)}` : null, fetcher)
  // primero las agendas que quedaron en estado de seguimiento, después el resto por fecha de call
  const lista = useMemo(() => { const t = q.trim().toLowerCase(); return (data?.candidatas || []).filter(c => !t || [c.nombre, c.telefono, c.instagram].some(x => String(x || "").toLowerCase().includes(t))).sort((a, b) => Number(b.en_fup) - Number(a.en_fup)) }, [data, q])
  const enFup = (data?.candidatas || []).filter(c => c.en_fup)

  async function crear(body: Record<string, unknown>) {
    setEnviando(true); setMsg(null)
    try {
      const r = await fetch("/api/seguimientos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error || "No se pudo crear")
      setMsg(`${b.creados} lead${b.creados === 1 ? "" : "s"} agregado${b.creados === 1 ? "" : "s"}`)
      setSel(new Set()); mutate(); onCreado()
    } catch (e) { setMsg((e as Error).message) } finally { setEnviando(false) }
  }

  return <Dialog open={abierto} onOpenChange={o => { if (!o) onCerrar() }}>
    <DialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle>Agregar lead al seguimiento</DialogTitle></DialogHeader>
      <div className="flex gap-1">{[["agendas", "Desde mis agendas"], ["mano", "A mano"]].map(([v, l]) => <Button key={v} size="sm" variant={modo === v ? "default" : "outline"} onClick={() => setModo(v as "agendas" | "mano")}>{l}</Button>)}</div>
      {modo === "agendas" && <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar agenda de los últimos 90 días" value={q} onChange={e => setQ(e.target.value)} /></div>
          <Button size="sm" variant="outline" disabled={!enFup.length || enviando} onClick={() => crear({ importar: true, closer })} title="Agendas cuyo estado quedó en Hacer Seguimiento, Seguimiento por wpp, Adentro en FUP, Agendó 2da call o Fee"><Download className="mr-1 h-4 w-4" />Traer las que quedaron en seguimiento ({enFup.length})</Button>
        </div>
        <div className="max-h-80 overflow-y-auto rounded-xl border">
          {!data && <p className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-1 h-5 w-5 animate-spin" />Buscando agendas…</p>}
          {data && !lista.length && <p className="p-6 text-center text-sm text-muted-foreground">No hay agendas sin seguimiento con ese filtro.</p>}
          {lista.map(c => <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/50">
            <Checkbox checked={sel.has(c.id)} onCheckedChange={v => setSel(s => { const n = new Set(s); if (v) n.add(c.id); else n.delete(c.id); return n })} />
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{c.nombre} <span className="font-normal text-muted-foreground">· {fechaCorta(c.fecha_closer)}{c.closer ? ` · ${c.closer}` : ""}</span></p><p className="truncate text-xs text-muted-foreground">{[c.calificacion, c.estado, c.motivo_no_cierre].filter(Boolean).join(" · ") || "Sin estado cargado"}</p></div>
            {c.en_fup && <Badge variant="secondary">en seguimiento</Badge>}
          </label>)}
        </div>
        <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{msg || `${sel.size} seleccionada${sel.size === 1 ? "" : "s"}`}</p><Button disabled={!sel.size || enviando} onClick={() => crear({ agenda_ids: [...sel] })}>{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : `Agregar ${sel.size || ""}`}</Button></div>
      </div>}
      {modo === "mano" && <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Nombre y apellido *" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
        <Input placeholder="Teléfono con código de país" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
        <Input placeholder="Instagram" value={form.instagram} onChange={e => setForm({ ...form, instagram: e.target.value })} />
        <Input type="datetime-local" value={form.fecha_call} onChange={e => setForm({ ...form, fecha_call: e.target.value })} title="Fecha de la call" />
        <Select value={form.tipo_lead || NADA} onValueChange={v => setForm({ ...form, tipo_lead: v === NADA ? "" : v })}><SelectTrigger><SelectValue placeholder="Tipo de lead" /></SelectTrigger><SelectContent><SelectItem value={NADA}>Tipo de lead</SelectItem>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
        <Select value={form.situacion || NADA} onValueChange={v => setForm({ ...form, situacion: v === NADA ? "" : v })}><SelectTrigger><SelectValue placeholder="Situación" /></SelectTrigger><SelectContent><SelectItem value={NADA}>Situación</SelectItem>{SITUACIONES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        {!yo?.soloPropios && <Select value={form.closer || NADA} onValueChange={v => setForm({ ...form, closer: v === NADA ? "" : v })}><SelectTrigger><SelectValue placeholder="Closer" /></SelectTrigger><SelectContent><SelectItem value={NADA}>Closer</SelectItem>{closers.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>}
        <Textarea className="sm:col-span-2" placeholder="Notas" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
        <div className="flex items-center justify-between gap-3 sm:col-span-2"><p className="text-xs text-muted-foreground">{msg}</p><Button disabled={!form.nombre.trim() || enviando} onClick={() => crear({ ...form, fecha_call: form.fecha_call ? form.fecha_call.replace("T", " ") : null })}>{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear seguimiento"}</Button></div>
      </div>}
    </DialogContent>
  </Dialog>
}
