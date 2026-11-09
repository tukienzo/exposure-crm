"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { Loader2, MessageCircle, Search, Sparkles, Users } from "lucide-react"

// Pre-calls: los chats de precall de cada lead agendado (grupos y 1 a 1 que ve el número de la empresa en 2chat)
// y los resúmenes diarios, semanales y mensuales que arma el cron. Abrir la pantalla no gasta IA.
type Chat = { chat_id: string; chat_name: string | null; tipo: string; matcheo: string | null; mensajes: number; primer_msg_at: string | null; ultimo_msg_at: string | null; ultimo_texto: string | null; ultimo_autor: string | null }
type Agenda = { id: string; nombre: string | null; fecha_closer: string | null; estado: string | null; closer: string | null; setter: string | null }
type Tarjeta = { agenda: Agenda; chats: Chat[]; mensajes: number; ultimo_msg_at: string | null; ultimo_texto: string | null; ultimo_autor: string | null }
type Resumen = { periodo: "diario" | "semanal" | "mensual"; alcance: string; fecha_inicio: string; fecha_fin: string; texto: string; modelo: string | null; mensajes_usados: number; generado_at: string }
type Respuesta = { tarjetas: Tarjeta[]; sinVincular: Chat[]; resumenes: Resumen[]; sinTablas?: boolean; error?: string }
type Mensaje = { sender_name: string | null; sender: string | null; text: string | null; media_type: string | null; from_me: boolean; sent_at: string }

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const hoy = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
const sumar = (f: string, n: number) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const fechaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "sin datos")
const dm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

const COLOR_ESTADO: Record<string, string> = {
  "Grupo Precall Creado": "bg-sky-500/15 text-sky-300",
  "No Show": "bg-red-500/15 text-red-300",
  "Reprogramó": "bg-amber-500/15 text-amber-300",
  "Se presentó": "bg-emerald-500/15 text-emerald-300",
  "Cierre": "bg-emerald-500/25 text-emerald-200",
}

export default function PrecallsPage() {
  const [desde, setDesde] = useState(sumar(hoy(), -30))
  const [hasta, setHasta] = useState(sumar(hoy(), 7))
  const [estado, setEstado] = useState("todos")
  const [busca, setBusca] = useState("")
  const [abierta, setAbierta] = useState<Tarjeta | null>(null)
  const [tabResumen, setTabResumen] = useState<"diario" | "semanal" | "mensual">("diario")
  const [generando, setGenerando] = useState(false)
  const [msgMensual, setMsgMensual] = useState<string | null>(null)
  const { data, isLoading, mutate } = useSWR<Respuesta>(`/api/precalls?desde=${desde}&hasta=${hasta}`, fetcher)

  const estados = useMemo(() => [...new Set((data?.tarjetas || []).map((t) => t.agenda.estado || "Sin estado"))].sort(), [data])
  const visibles = useMemo(() => (data?.tarjetas || []).filter((t) =>
    (estado === "todos" || (t.agenda.estado || "Sin estado") === estado)
    && (!busca.trim() || `${t.agenda.nombre} ${t.agenda.closer} ${t.agenda.setter}`.toLowerCase().includes(busca.trim().toLowerCase()))), [data, estado, busca])
  const resumenesGlobales = (data?.resumenes || []).filter((r) => r.alcance === "global" && r.periodo === tabResumen)

  async function generarMensual() {
    const mes = hasta.slice(0, 7)
    if (!confirm(`Generar el resumen mensual de ${mes} con Claude Sonnet (usa los resúmenes diarios ya guardados). ¿Seguimos?`)) return
    setGenerando(true); setMsgMensual(null)
    try {
      const r = await fetch("/api/precalls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mes }) })
      const j = await r.json()
      setMsgMensual(r.ok ? (j.dias ? `Listo: ${j.dias} días con mensajes.` : "No hay días con mensajes ese mes.") : j.error || "No se pudo generar.")
      await mutate(); setTabResumen("mensual")
    } finally { setGenerando(false) }
  }

  return <div className="mx-auto w-full max-w-[1800px] space-y-6 px-4 py-5 sm:px-6 lg:px-[1.5cm]">
    <div>
      <h1 className="text-2xl font-black">Pre-calls</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">Los chats de precall de cada lead agendado (grupos y chats 1 a 1 del número de la empresa en 2chat), cruzados con su agenda por teléfono o, si no, por nombre. Tocá una tarjeta para leer el chat. Los resúmenes se generan una vez por día y quedan guardados.</p>
    </div>

    {data?.sinTablas && <Card className="border-amber-500/40 bg-amber-500/10"><CardContent className="py-4 text-sm">Falta aplicar la migración <code>20261109000001_precalls.sql</code> en Supabase. Hasta entonces la pantalla no tiene datos.</CardContent></Card>}
    {data?.error && <Card className="border-red-500/40 bg-red-500/10"><CardContent className="py-4 text-sm">{data.error}</CardContent></Card>}

    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs text-muted-foreground">Llamada desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground" /></label>
      <label className="text-xs text-muted-foreground">hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground" /></label>
      <label className="text-xs text-muted-foreground">Estado
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
          <option value="todos">Todos</option>
          {estados.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </label>
      <label className="relative text-xs text-muted-foreground">Buscar
        <Search className="pointer-events-none absolute bottom-2.5 left-2 h-4 w-4" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Lead, closer o setter" className="mt-1 block h-9 w-56 rounded-md border border-input bg-background pl-8 pr-2 text-sm text-foreground" />
      </label>
      <div className="ml-auto text-sm text-muted-foreground">{visibles.length} leads con chat · {(data?.sinVincular || []).length} chats sin agenda</div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)]">
      <div>
        {isLoading ? <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</div>
          : !visibles.length ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin datos: no hay chats de precall vinculados a agendas en este rango.</CardContent></Card>
          : <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {visibles.map((t) => <button key={t.agenda.id} onClick={() => setAbierta(t)} className="rounded-xl border border-white/10 bg-white/[.035] p-4 text-left transition hover:border-white/25 hover:bg-white/[.06]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="truncate font-bold">{t.agenda.nombre || "Sin nombre"}</div><div className="text-xs text-muted-foreground">Call: {fechaHora(t.agenda.fecha_closer)} · {t.agenda.closer || "sin closer"}</div></div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", COLOR_ESTADO[t.agenda.estado || ""] || "bg-white/10 text-muted-foreground")}>{t.agenda.estado || "Sin estado"}</span>
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{t.mensajes} mensajes</span>
                <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t.chats.map((c) => c.tipo === "grupo" ? "grupo" : "1 a 1").join(" + ")}</span>
                {t.chats.some((c) => c.matcheo === "nombre") && <span title="Vinculado por nombre, no por teléfono">· por nombre</span>}
              </div>
              <p className="mt-2 line-clamp-2 text-sm"><span className="text-muted-foreground">{t.ultimo_autor || "?"} · {fechaHora(t.ultimo_msg_at)}:</span> {t.ultimo_texto || "sin datos"}</p>
            </button>)}
          </div>}
        {!!(data?.sinVincular || []).length && <details className="mt-6 rounded-xl border border-white/10 p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Chats sin agenda vinculada ({data!.sinVincular.length})</summary>
          <p className="mt-2 text-xs text-muted-foreground">No se encontró una agenda con el teléfono de quien escribe ni con el nombre del grupo. Se vuelven a intentar cada 15 minutos.</p>
          <ul className="mt-2 space-y-1">{data!.sinVincular.map((c) => <li key={c.chat_id} className="flex justify-between gap-3"><span className="truncate">{c.chat_name || c.chat_id}</span><span className="shrink-0 text-muted-foreground">{c.mensajes} msj · {fechaHora(c.ultimo_msg_at)}</span></li>)}</ul>
        </details>}
      </div>

      <Card className="border-white/10 bg-white/[.035] xl:sticky xl:top-4 xl:self-start">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />Resúmenes</CardTitle>
          <div className="flex gap-1 pt-1">{(["diario", "semanal", "mensual"] as const).map((p) => <button key={p} onClick={() => setTabResumen(p)} className={cn("rounded-md px-3 py-1 text-xs font-semibold capitalize", tabResumen === p ? "bg-white/15" : "text-muted-foreground hover:bg-white/5")}>{p}</button>)}</div>
        </CardHeader>
        <CardContent className="max-h-[70vh] space-y-4 overflow-y-auto pt-2 text-sm">
          {tabResumen === "mensual" && <div className="space-y-1">
            <Button size="sm" variant="outline" disabled={generando} onClick={generarMensual}>{generando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Generar mensual de {hasta.slice(0, 7)} (Sonnet)</Button>
            {msgMensual && <p className="text-xs text-muted-foreground">{msgMensual}</p>}
          </div>}
          {!resumenesGlobales.length ? <p className="text-muted-foreground">Sin datos: todavía no hay resúmenes {tabResumen === "diario" ? "diarios (se generan cada madrugada con los mensajes del día anterior)" : tabResumen === "semanal" ? "semanales (se arman los lunes con los diarios de la semana)" : "mensuales (se generan solo cuando los pedís)"}.</p>
            : resumenesGlobales.map((r) => <div key={`${r.periodo}-${r.fecha_inicio}`} className="rounded-lg border border-white/10 p-3">
              <div className="mb-1 text-xs font-semibold text-muted-foreground">{r.periodo === "diario" ? dm(r.fecha_inicio) : `${dm(r.fecha_inicio)} al ${dm(r.fecha_fin)}`} · {r.mensajes_usados} mensajes{r.modelo ? ` · ${r.modelo}` : ""}</div>
              <div className="whitespace-pre-wrap leading-relaxed">{r.texto}</div>
            </div>)}
        </CardContent>
      </Card>
    </div>

    <Sheet open={!!abierta} onOpenChange={(o) => !o && setAbierta(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {abierta && <PanelChat t={abierta} resumenes={(data?.resumenes || []).filter((r) => abierta.chats.some((c) => r.alcance === `chat:${c.chat_id}`))} />}
      </SheetContent>
    </Sheet>
  </div>
}

function PanelChat({ t, resumenes }: { t: Tarjeta; resumenes: Resumen[] }) {
  const [chatId, setChatId] = useState(t.chats[0]?.chat_id)
  const chat = t.chats.find((c) => c.chat_id === chatId) || t.chats[0]
  const desde = chat?.primer_msg_at ? new Date(Date.parse(chat.primer_msg_at) - 86400000).toISOString() : undefined
  const { data, isLoading } = useSWR<{ mensajes?: Mensaje[]; error?: string }>(chat ? `/api/whatsapp?chat=${encodeURIComponent(chat.chat_id)}${desde ? `&desde=${encodeURIComponent(desde)}` : ""}` : null, fetcher)
  const [pregunta, setPregunta] = useState("")
  const [respuesta, setRespuesta] = useState<string | null>(null)
  const [preguntando, setPreguntando] = useState(false)

  async function preguntar(e: React.FormEvent) {
    e.preventDefault()
    if (!pregunta.trim() || !chat) return
    setPreguntando(true); setRespuesta(null)
    try {
      const r = await fetch("/api/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat: chat.chat_id, desde, pregunta }) })
      const j = await r.json()
      setRespuesta(r.ok ? j.resumen : j.error || "No se pudo responder.")
    } finally { setPreguntando(false) }
  }

  return <div className="space-y-4">
    <SheetHeader>
      <SheetTitle>{t.agenda.nombre || "Sin nombre"}</SheetTitle>
      <SheetDescription>Call: {fechaHora(t.agenda.fecha_closer)} · {t.agenda.estado || "Sin estado"} · closer {t.agenda.closer || "sin datos"} · setter {t.agenda.setter || "sin datos"}</SheetDescription>
    </SheetHeader>
    {t.chats.length > 1 && <div className="flex flex-wrap gap-1 px-4">{t.chats.map((c) => <button key={c.chat_id} onClick={() => setChatId(c.chat_id)} className={cn("rounded-md px-3 py-1 text-xs", c.chat_id === chat?.chat_id ? "bg-white/15 font-semibold" : "text-muted-foreground hover:bg-white/5")}>{c.tipo === "grupo" ? c.chat_name || "Grupo" : "1 a 1"} ({c.mensajes})</button>)}</div>}

    {!!resumenes.length && <details className="mx-4 rounded-lg border border-white/10 p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Resúmenes por día ({resumenes.length})</summary>
      <div className="mt-2 space-y-3">{resumenes.map((r) => <div key={`${r.alcance}-${r.fecha_inicio}`}><div className="text-xs font-semibold text-muted-foreground">{dm(r.fecha_inicio)}</div><div className="whitespace-pre-wrap">{r.texto}</div></div>)}</div>
    </details>}

    <div className="space-y-2 px-4">
      {isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando mensajes…</div>
        : data?.error ? <p className="text-sm text-red-400">{data.error}</p>
        : !(data?.mensajes || []).length ? <p className="text-sm text-muted-foreground">Sin datos: no hay mensajes guardados de este chat.</p>
        : data!.mensajes!.map((m, i) => <div key={i} className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", m.from_me ? "ml-auto bg-emerald-500/15" : "bg-white/[.06]")}>
          <div className="mb-0.5 text-[11px] text-muted-foreground">{m.from_me ? "Equipo" : m.sender_name || m.sender || "?"} · {fechaHora(m.sent_at)}</div>
          <div className="whitespace-pre-wrap break-words">{m.text || (m.media_type ? <i className="text-muted-foreground">&lt;{m.media_type}&gt;</i> : "")}</div>
        </div>)}
    </div>

    <form onSubmit={preguntar} className="space-y-2 border-t border-white/10 px-4 pt-4">
      <label className="text-xs text-muted-foreground">Pregunta puntual sobre este chat (usa la IA una vez, solo cuando la mandás)</label>
      <div className="flex gap-2">
        <input value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="¿Qué objeción apareció? ¿Por qué no se presentó?" className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
        <Button size="sm" type="submit" disabled={preguntando || !pregunta.trim()}>{preguntando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Preguntar"}</Button>
      </div>
      {respuesta && <div className="whitespace-pre-wrap rounded-lg border border-white/10 p-3 text-sm">{respuesta}</div>}
    </form>
  </div>
}
