"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { colorAngulo } from "@/lib/colores-angulo"
import { useAngulos } from "@/lib/use-angulos"
import { useFormatos } from "@/lib/use-formatos"
import { SIN_ASIGNAR, claveNombre, responsableDe as nombreResponsable, unificarResponsables } from "@/lib/responsables"
import { Plus } from "lucide-react"
import { toast } from "sonner"

// Las dos vistas de la semana de Contenido:
//  · TableroSemana: una columna por día, y adentro un bloquecito por pieza. Se ve la semana entera
//    de un vistazo, que era el problema del diseño anterior (un bloque gigante por día).
//  · CalendarioSemana: grilla tipo Google Calendar, con las horas en vertical y los días en
//    horizontal, para ver el orden real de publicación del día.
// Las dos usan los tokens del tema (bg-card, border-border, text-foreground…) para que se lean
// igual en modo claro y en modo oscuro.

export type PiezaSemana = {
  id: string
  title: string
  angle: string | null
  format: string | null
  planned_at: string | null
  status: string
  platform: string | null
  assigned_to: string | null
  metadata?: Record<string, unknown> | null
}

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

// `planned_at` se guarda con la hora tal cual en UTC (12:00 guardado = 12:00 mostrado), y el resto
// del CRM lee la fecha cortando el ISO. Se usa el mismo criterio acá para que nada cambie de día.
const diaDe = (p: PiezaSemana) => String(p.planned_at || "").slice(0, 10)
const horaDe = (p: PiezaSemana) => {
  const m = String(p.planned_at || "").match(/T(\d{2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  // Medianoche exacta es "sin hora": así se guardan las piezas cargadas con el campo de solo fecha.
  return h === 0 && m[2] === "00" ? null : { h, m: Number(m[2]), texto: `${m[1]}:${m[2]}` }
}
function fechaLegible(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`)
  return { dia: DIAS_CORTOS[d.getUTCDay()], numero: d.getUTCDate(), mes: MESES_CORTOS[d.getUTCMonth()] }
}
const HOY = () => new Date().toISOString().slice(0, 10)

const ESTADOS: Record<string, string> = {
  idea: "Idea", guion_listo: "Guion", para_grabar: "Grabar", grabado: "Grabado",
  en_produccion: "En producción", en_revision: "En revisión",
  edicion: "Edición", completo: "Completo", publicado: "Publicado", historical: "Histórico",
}
const LISTO = new Set(["completo", "publicado"])

// Los días de la semana que arranca en `start` (lunes a domingo), aunque no tengan piezas.
function diasDeLaSemana(start: string) {
  const base = new Date(`${start}T12:00:00Z`)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setUTCDate(base.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function agrupar(rows: PiezaSemana[]) {
  const porDia = new Map<string, PiezaSemana[]>()
  for (const row of rows) {
    const k = diaDe(row) || "sin-fecha"
    if (!porDia.has(k)) porDia.set(k, [])
    porDia.get(k)!.push(row)
  }
  for (const lista of porDia.values()) {
    lista.sort((a, b) => (horaDe(a)?.h ?? 99) - (horaDe(b)?.h ?? 99) || a.title.localeCompare(b.title, "es"))
  }
  return porDia
}

// ───────────────────────────── el bloquecito de una pieza ─────────────────────────────

function Pieza({ row, categoria, onOpen, compacta = false, dosLineas = false, onPointerDown, enVuelo = false }: { row: PiezaSemana; categoria: string | null; onOpen: () => void; compacta?: boolean; dosLineas?: boolean; onPointerDown?: (e: React.PointerEvent) => void; enVuelo?: boolean }) {
  const color = colorAngulo(categoria)
  const hora = horaDe(row)
  const listo = LISTO.has(row.status)
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={onPointerDown}
      title={`${row.title}${row.angle ? ` · ${row.angle}` : ""}`}
      className={cn(
        "group relative w-full overflow-hidden rounded-lg border bg-card p-2 pl-3 text-left transition",
        "hover:border-foreground/25 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        listo ? "border-border/60" : "border-border",
        onPointerDown && "cursor-grab active:cursor-grabbing",
        enVuelo && "opacity-30",
      )}
    >
      {/* barra lateral del color de la categoría del ángulo */}
      <span className={cn("absolute inset-y-0 left-0 w-1.5", color.punto)} aria-hidden />
      <div className="flex items-baseline gap-1.5">
        {hora && <span className="shrink-0 font-mono text-[11px] font-bold text-muted-foreground">{hora.texto}</span>}
        <span className={cn("min-w-0 flex-1 text-[13px] font-semibold leading-tight", dosLineas ? "line-clamp-2" : "truncate", listo && "text-muted-foreground line-through decoration-1")}>
          {row.title}
        </span>
      </div>
      {!compacta && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {row.format && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{row.format}</span>}
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", listo ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
            {ESTADOS[row.status] || row.status}
          </span>
        </div>
      )}
    </button>
  )
}

// ───────────────────────────── mover piezas de día (arrastrar) ─────────────────────────────

// Fecha nueva conservando la hora: si se suelta en una franja horaria del calendario, toma esa hora.
function fechaMovida(original: string | null, dia: string, hora: number | null) {
  if (hora !== null) return `${dia}T${String(hora).padStart(2, "0")}:00:00+00:00`
  const o = String(original || "")
  return o.length > 10 ? `${dia}${o.slice(10)}` : dia
}

// Mismo arrastre propio del pipeline (eventos de puntero, no el drag nativo, que se traba en un
// botón). Las celdas destino llevan data-dia y, en el calendario, data-hora.
function useArrastreDia(rows: PiezaSemana[], onMoverDia?: (row: PiezaSemana, plannedAt: string) => Promise<void>) {
  const [movidas, setMovidas] = useState<Record<string, string>>({})
  const [arrastre, setArrastre] = useState<{ id: string; x: number; y: number; ancho: number } | null>(null)
  const [destino, setDestino] = useState<string | null>(null)
  const pendiente = useRef<{ id: string; x: number; y: number; ancho: number; dx: number; dy: number } | null>(null)
  const arrastro = useRef(false)

  // Cuando llegan los datos nuevos del servidor, lo movido en pantalla ya no hace falta.
  useEffect(() => {
    setMovidas((previas) => {
      const quedan = Object.entries(previas).filter(([id, fecha]) => {
        const row = rows.find((r) => r.id === id)
        return row ? new Date(String(row.planned_at)).getTime() !== new Date(fecha).getTime() : false
      })
      return quedan.length === Object.keys(previas).length ? previas : Object.fromEntries(quedan)
    })
  }, [rows])

  const vistas = useMemo(
    () => rows.map((r) => (movidas[r.id] !== undefined ? { ...r, planned_at: movidas[r.id] } : r)),
    [rows, movidas],
  )

  const celdaEn = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest("[data-dia]")
    if (!el) return null
    const hora = el.getAttribute("data-hora")
    return { dia: el.getAttribute("data-dia") as string, hora: hora === null ? null : Number(hora) }
  }

  useEffect(() => {
    if (!onMoverDia) return
    const mover_ = (e: PointerEvent) => {
      const p = pendiente.current
      if (!p) return
      if (!arrastro.current && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return
      if (!arrastro.current) { arrastro.current = true; document.body.style.userSelect = "none" }
      e.preventDefault()
      setArrastre({ id: p.id, x: e.clientX - p.dx, y: e.clientY - p.dy, ancho: p.ancho })
      const c = celdaEn(e.clientX, e.clientY)
      setDestino(c ? `${c.dia}|${c.hora ?? ""}` : null)
    }
    const soltar = async (e: PointerEvent) => {
      const p = pendiente.current
      pendiente.current = null
      document.body.style.userSelect = ""
      setArrastre(null); setDestino(null)
      if (!p || !arrastro.current) { arrastro.current = false; return }
      setTimeout(() => { arrastro.current = false }, 0)
      const row = vistas.find((r) => r.id === p.id)
      const c = celdaEn(e.clientX, e.clientY)
      if (!row || !c) return
      if (c.hora === null && diaDe(row) === c.dia) return
      const nueva = fechaMovida(row.planned_at, c.dia, c.hora)
      if (nueva === row.planned_at) return
      setMovidas((m) => ({ ...m, [row.id]: nueva }))
      try {
        await onMoverDia(row, nueva)
      } catch (err) {
        setMovidas((m) => { const copia = { ...m }; delete copia[row.id]; return copia })
        toast.error(err instanceof Error ? err.message : "No se pudo mover la pieza")
      }
    }
    window.addEventListener("pointermove", mover_, { passive: false })
    window.addEventListener("pointerup", soltar)
    window.addEventListener("pointercancel", soltar)
    return () => {
      window.removeEventListener("pointermove", mover_)
      window.removeEventListener("pointerup", soltar)
      window.removeEventListener("pointercancel", soltar)
    }
  })

  // Con el dedo no se arrastra (el tablero tiene que poder scrollear): en el celular se cambia la fecha en la ficha.
  const empezar = onMoverDia ? (e: React.PointerEvent, row: PiezaSemana) => {
    if (e.button !== 0 || e.pointerType === "touch") return
    const caja = (e.currentTarget as HTMLElement).getBoundingClientRect()
    pendiente.current = { id: row.id, x: e.clientX, y: e.clientY, ancho: caja.width, dx: e.clientX - caja.left, dy: e.clientY - caja.top }
  } : null
  // El click que llega al soltar no tiene que abrir la ficha.
  const abrir = (fn: () => void) => () => { if (!arrastro.current) fn() }
  const enVuelo = vistas.find((r) => r.id === arrastre?.id) || null
  return { vistas, empezar, abrir, arrastre, destino, enVuelo }
}

function Fantasma({ arrastre, row, categoria }: { arrastre: { x: number; y: number; ancho: number } | null; row: PiezaSemana | null; categoria: string | null }) {
  if (!arrastre || !row) return null
  return (
    <div className="pointer-events-none fixed z-50 rotate-1 shadow-xl" style={{ left: arrastre.x, top: arrastre.y, width: arrastre.ancho }}>
      <Pieza row={row} categoria={categoria} onOpen={() => {}} />
    </div>
  )
}

// ───────────────────────────── vista 1: tablero por día ─────────────────────────────

export function TableroSemana({ start, rows: rowsServidor, onOpen, onNueva, onMoverDia }: {
  start: string
  rows: PiezaSemana[]
  onOpen: (row: PiezaSemana) => void
  onNueva?: (fecha: string) => void
  onMoverDia?: (row: PiezaSemana, plannedAt: string) => Promise<void>
}) {
  const { categoriaDe } = useAngulos()
  const { vistas: rows, empezar, abrir, arrastre, destino, enVuelo } = useArrastreDia(rowsServidor, onMoverDia)
  const dias = useMemo(() => diasDeLaSemana(start), [start])
  const porDia = useMemo(() => agrupar(rows), [rows])
  const sinFecha = porDia.get("sin-fecha") || []
  const hoy = HOY()

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {dias.map((dia) => {
          const piezas = porDia.get(dia) || []
          const esHoy = dia === hoy
          const f = fechaLegible(dia)
          return (
            <section
              key={dia}
              data-dia={dia}
              className={cn(
                "flex min-h-[132px] flex-col rounded-xl border bg-muted/30 p-2 transition-colors",
                esHoy ? "border-primary/50 bg-primary/[.06]" : "border-border",
                destino === `${dia}|` && "border-primary bg-primary/10 ring-2 ring-primary/40",
              )}
            >
              <header className="mb-2 flex items-baseline justify-between px-1">
                <div className="flex items-baseline gap-1.5">
                  <span className={cn("text-[11px] font-black uppercase tracking-wider", esHoy ? "text-primary" : "text-muted-foreground")}>{f.dia}</span>
                  <span className={cn("text-sm font-black tabular-nums", esHoy && "text-primary")}>{f.numero}</span>
                  <span className="text-[10px] text-muted-foreground">{f.mes}</span>
                </div>
                <span className="text-[10px] font-bold text-muted-foreground">{piezas.length || ""}</span>
              </header>
              <div className="flex flex-1 flex-col gap-1.5">
                {piezas.map((row) => (
                  <Pieza key={row.id} row={row} categoria={categoriaDe(row.angle)} onOpen={abrir(() => onOpen(row))}
                    onPointerDown={empezar ? (e) => empezar(e, row) : undefined} enVuelo={arrastre?.id === row.id} />
                ))}
                {!piezas.length && <p className="px-1 py-3 text-center text-[11px] text-muted-foreground/70">Sin piezas</p>}
              </div>
              {onNueva && (
                <button
                  type="button"
                  onClick={() => onNueva(dia)}
                  className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />Agregar
                </button>
              )}
            </section>
          )
        })}
      </div>
      {sinFecha.length > 0 && (
        <section className="rounded-xl border border-dashed border-border bg-muted/30 p-3">
          <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground">Sin fecha ({sinFecha.length})</p>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {sinFecha.map((row) => <Pieza key={row.id} row={row} categoria={categoriaDe(row.angle)} onOpen={abrir(() => onOpen(row))}
              onPointerDown={empezar ? (e) => empezar(e, row) : undefined} enVuelo={arrastre?.id === row.id} />)}
          </div>
        </section>
      )}
      <Fantasma arrastre={arrastre} row={enVuelo} categoria={enVuelo ? categoriaDe(enVuelo.angle) : null} />
    </div>
  )
}

// ───────────────────────────── vista 2: calendario por hora ─────────────────────────────

export function CalendarioSemana({ start, rows: rowsServidor, onOpen, onMoverDia }: {
  start: string
  rows: PiezaSemana[]
  onOpen: (row: PiezaSemana) => void
  onMoverDia?: (row: PiezaSemana, plannedAt: string) => Promise<void>
}) {
  const { categoriaDe } = useAngulos()
  const { vistas: rows, empezar, abrir, arrastre, destino, enVuelo } = useArrastreDia(rowsServidor, onMoverDia)
  const dias = useMemo(() => diasDeLaSemana(start), [start])
  const porDia = useMemo(() => agrupar(rows), [rows])
  const hoy = HOY()

  // La franja de horas se ajusta a lo que hay, con un mínimo de 9 a 21 para que no quede raquítica.
  const horas = useMemo(() => {
    const conHora = rows.map(horaDe).filter((h): h is { h: number; m: number; texto: string } => !!h).map((h) => h.h)
    const desde = Math.max(0, Math.min(9, ...conHora))
    const hasta = Math.min(23, Math.max(21, ...conHora))
    return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i)
  }, [rows])

  const sinHora = useMemo(() => {
    const m = new Map<string, PiezaSemana[]>()
    for (const [dia, lista] of porDia) {
      const libres = lista.filter((row) => !horaDe(row))
      if (libres.length) m.set(dia, libres)
    }
    return m
  }, [porDia])
  const haySinHora = sinHora.size > 0

  const celda = (dia: string, hora: number) => (porDia.get(dia) || []).filter((row) => horaDe(row)?.h === hora)

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="min-w-[860px]">
        {/* encabezado con los días */}
        <div className="sticky top-0 z-10 grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border bg-card">
          <div />
          {dias.map((dia) => {
            const f = fechaLegible(dia)
            const esHoy = dia === hoy
            return (
              <div key={dia} className={cn("border-l border-border px-2 py-2 text-center", esHoy && "bg-primary/[.07]")}>
                <p className={cn("text-[10px] font-black uppercase tracking-wider", esHoy ? "text-primary" : "text-muted-foreground")}>{f.dia}</p>
                <p className={cn("text-base font-black tabular-nums leading-tight", esHoy && "text-primary")}>{f.numero}</p>
              </div>
            )
          })}
        </div>

        {haySinHora && (
          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border bg-muted/30">
            <div className="px-2 py-2 text-right text-[10px] font-bold uppercase text-muted-foreground">Sin hora</div>
            {dias.map((dia) => (
              <div key={dia} data-dia={dia} className={cn("space-y-1 border-l border-border p-1.5", destino === `${dia}|` && "bg-primary/15")}>
                {(sinHora.get(dia) || []).map((row) => (
                  <Pieza key={row.id} row={row} categoria={categoriaDe(row.angle)} onOpen={abrir(() => onOpen(row))} compacta
                    onPointerDown={empezar ? (e) => empezar(e, row) : undefined} enVuelo={arrastre?.id === row.id} />
                ))}
              </div>
            ))}
          </div>
        )}

        {horas.map((hora) => (
          <div key={hora} className="grid min-h-[58px] grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border/60 last:border-b-0">
            <div className="px-2 pt-1.5 text-right font-mono text-[11px] text-muted-foreground">{String(hora).padStart(2, "0")}:00</div>
            {dias.map((dia) => {
              const piezas = celda(dia, hora)
              const esHoy = dia === hoy
              return (
                <div key={dia} data-dia={dia} data-hora={hora} className={cn("space-y-1 border-l border-border p-1.5", esHoy && "bg-primary/[.04]", destino === `${dia}|${hora}` && "bg-primary/15")}>
                  {piezas.map((row) => (
                    <Pieza key={row.id} row={row} categoria={categoriaDe(row.angle)} onOpen={abrir(() => onOpen(row))} compacta
                      onPointerDown={empezar ? (e) => empezar(e, row) : undefined} enVuelo={arrastre?.id === row.id} />
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <Fantasma arrastre={arrastre} row={enVuelo} categoria={enVuelo ? categoriaDe(enVuelo.angle) : null} />
    </div>
  )
}


// ───────────────────────────── vista 3: pipeline de producción ─────────────────────────────

// Las columnas del recorrido. "En producción" es el editor trabajando; "En revisión" es lo que el
// editor ya entregó con el link del video final y está esperando el ok.
const COLUMNAS: Array<{ id: string; label: string; estados: string[]; acento: string }> = [
  { id: "idea", label: "Idea", estados: ["idea"], acento: "bg-zinc-400" },
  { id: "guion", label: "Guion listo", estados: ["guion_listo"], acento: "bg-blue-500" },
  { id: "grabar", label: "Para grabar", estados: ["para_grabar"], acento: "bg-amber-500" },
  { id: "grabado", label: "Grabado", estados: ["grabado"], acento: "bg-violet-500" },
  { id: "produccion", label: "En producción", estados: ["en_produccion", "edicion"], acento: "bg-sky-500" },
  { id: "revision", label: "En revisión", estados: ["en_revision"], acento: "bg-fuchsia-500" },
  { id: "listo", label: "Listo", estados: ["completo", "publicado"], acento: "bg-emerald-500" },
]

// El nombre del responsable se normaliza en lib/responsables: "Ian Algué", "IAN ALGUE" e
// "Ian Algue" son la misma persona y tienen que dar un solo chip en el filtro.
const responsableDe = (p: PiezaSemana) => nombreResponsable(p.assigned_to)

// El tipo de contenido de cada pieza (pedido de Alex, 11/10): si ya se publicó, manda lo que dice Instagram;
// si no, el tipo de su formato en el banco (Contenido → Formatos). Las historias se marcan en metadata.
const COLOR_TIPO: Record<string, string> = {
  Reel: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  Carrusel: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Historia: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
}
const instagramDe = (p: PiezaSemana) => {
  const ig = p.metadata?.instagram
  return ig && typeof ig === "object" ? ig as { tipo?: string; url?: string } : null
}

export function PipelineContenido({ rows, onOpen, editor, responsables = [], onMover }: {
  rows: PiezaSemana[]
  onOpen: (row: PiezaSemana) => void
  editor?: string | null
  responsables?: string[]
  // Arrastrar una pieza a otra columna le cambia el estado. Sin esta prop el tablero es de lectura.
  onMover?: (row: PiezaSemana, estado: string) => Promise<void> | void
}) {
  const { categoriaDe } = useAngulos()
  const { formatos } = useFormatos()
  const tipoDe = useCallback((p: PiezaSemana) => {
    if (p.metadata?.content_type === "stories") return "Historia"
    const formato = String(p.format || "").trim().toLocaleUpperCase("es")
    return instagramDe(p)?.tipo
      || formatos.find((f) => f.nombre.toLocaleUpperCase("es") === formato)?.tipo
      || (/CARRUSEL/.test(formato) ? "Carrusel" : "Reel")
  }, [formatos])
  // Un editor entra viendo lo suyo; el resto del equipo entra viendo todo.
  const [filtro, setFiltro] = useState<string | null>(editor || null)
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null)

  // Mientras se guarda el cambio, la pieza ya se dibuja en la columna nueva. Si el guardado falla,
  // se borra el provisorio y vuelve sola a donde estaba.
  const [movidas, setMovidas] = useState<Record<string, string>>({})
  const estadoDe = (row: PiezaSemana) => movidas[row.id] || row.status
  useEffect(() => {
    // Cuando el servidor ya devuelve la pieza con el estado nuevo, se suelta el provisorio.
    setMovidas((previas) => {
      const quedan = Object.entries(previas).filter(([id, estado]) => {
        const row = rows.find((r) => r.id === id)
        return row ? row.status !== estado : true
      })
      return quedan.length === Object.keys(previas).length ? previas : Object.fromEntries(quedan)
    })
  }, [rows])

  // El arrastre es propio, con eventos de puntero, y no el del navegador: la tarjeta es un botón y
  // el arrastre nativo se traba adentro de un botón. Además así funciona igual con el dedo.
  const [arrastre, setArrastre] = useState<{ id: string; x: number; y: number; ancho: number } | null>(null)
  const [destino, setDestino] = useState<string | null>(null)
  const pendiente = useRef<{ id: string; x: number; y: number; ancho: number; dx: number; dy: number } | null>(null)
  const arrastro = useRef(false)

  async function mover(row: PiezaSemana, col: (typeof COLUMNAS)[number] | undefined) {
    if (!onMover || !col || col.estados.includes(estadoDe(row))) return
    const nuevo = col.estados[0]
    setMovidas((p) => ({ ...p, [row.id]: nuevo }))
    try {
      await onMover(row, nuevo)
    } catch (e) {
      setMovidas((p) => { const copia = { ...p }; delete copia[row.id]; return copia })
      toast.error(e instanceof Error ? e.message : "No se pudo mover la pieza")
    }
  }

  // Qué columna hay debajo del dedo. El fantasma no intercepta porque tiene pointer-events: none.
  const columnaEn = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest("[data-columna]")
    const id = el?.getAttribute("data-columna")
    return id ? COLUMNAS.find((c) => c.id === id) : undefined
  }

  useEffect(() => {
    if (!onMover) return
    const mover_ = (e: PointerEvent) => {
      const p = pendiente.current
      if (!p) return
      // Recién se considera arrastre a partir de unos pixeles: si no, cada click arrastraría.
      if (!arrastro.current && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return
      if (!arrastro.current) {
        arrastro.current = true
        document.body.style.userSelect = "none"
      }
      e.preventDefault()
      setArrastre({ id: p.id, x: e.clientX - p.dx, y: e.clientY - p.dy, ancho: p.ancho })
      setDestino(columnaEn(e.clientX, e.clientY)?.id ?? null)
    }
    const soltar = (e: PointerEvent) => {
      const p = pendiente.current
      pendiente.current = null
      document.body.style.userSelect = ""
      setArrastre(null); setDestino(null)
      if (!p || !arrastro.current) { arrastro.current = false; return }
      const row = rows.find((r) => r.id === p.id)
      const col = columnaEn(e.clientX, e.clientY)
      if (row) void mover(row, col)
      // El click que viene después de soltar no tiene que abrir la pieza.
      setTimeout(() => { arrastro.current = false }, 0)
    }
    window.addEventListener("pointermove", mover_, { passive: false })
    window.addEventListener("pointerup", soltar)
    window.addEventListener("pointercancel", soltar)
    return () => {
      window.removeEventListener("pointermove", mover_)
      window.removeEventListener("pointerup", soltar)
      window.removeEventListener("pointercancel", soltar)
    }
  })

  function empezar(e: React.PointerEvent, row: PiezaSemana) {
    // Con el dedo no se arrastra: si la tarjeta se queda con el gesto, el tablero deja de scrollear.
    // En celular se mueve con las flechitas de cada tarjeta.
    if (!onMover || e.button !== 0 || e.pointerType === "touch") return
    const caja = (e.currentTarget as HTMLElement).getBoundingClientRect()
    pendiente.current = {
      id: row.id, x: e.clientX, y: e.clientY, ancho: caja.width,
      dx: e.clientX - caja.left, dy: e.clientY - caja.top,
    }
  }

  // Los chips del filtro: quien tenga piezas, más los editores del equipo aunque no tengan nada
  // asignado todavía (así se ve de un vistazo quién está libre).
  const gente = useMemo(() => {
    // Se cuenta por clave normalizada y se muestra el nombre de la cuenta del equipo, que va
    // primero en unificarResponsables y por eso gana sobre lo escrito a mano en una pieza.
    const canonico = new Map<string, string>()
    for (const nombre of unificarResponsables(responsables, rows.map((r) => r.assigned_to))) {
      canonico.set(claveNombre(nombre), nombre)
    }
    const cuenta = new Map<string, number>()
    for (const nombre of canonico.values()) cuenta.set(nombre, 0)
    for (const row of rows) {
      const r = canonico.get(claveNombre(responsableDe(row))) || responsableDe(row)
      cuenta.set(r, (cuenta.get(r) || 0) + 1)
    }
    const sin = cuenta.get(SIN_ASIGNAR) || 0
    cuenta.delete(SIN_ASIGNAR)
    const lista = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    return sin ? [...lista, [SIN_ASIGNAR, sin] as [string, number]] : lista
  }, [rows, responsables])

  const delResponsable = useMemo(
    () => (filtro ? rows.filter((r) => claveNombre(responsableDe(r)) === claveNombre(filtro)) : rows),
    [rows, filtro],
  )
  // Los chips de tipo cuentan sobre lo que deja el filtro de responsable, así los dos filtros se combinan.
  const tipos = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const row of delResponsable) cuenta.set(tipoDe(row), (cuenta.get(tipoDe(row)) || 0) + 1)
    const orden = ["Reel", "Carrusel", "Historia"]
    return [...cuenta.entries()].sort((a, b) => (orden.indexOf(a[0]) + 1 || 9) - (orden.indexOf(b[0]) + 1 || 9) || a[0].localeCompare(b[0], "es"))
  }, [delResponsable, tipoDe])
  const visibles = useMemo(
    () => (filtroTipo ? delResponsable.filter((r) => tipoDe(r) === filtroTipo) : delResponsable),
    [delResponsable, filtroTipo, tipoDe],
  )

  // Si quien mira es un editor, sus piezas van primero: es lo que tiene que hacer hoy.
  const orden = (a: PiezaSemana, b: PiezaSemana) => {
    const mia = (p: PiezaSemana) => (editor && claveNombre(p.assigned_to) === claveNombre(editor) ? 0 : 1)
    return mia(a) - mia(b) || String(a.planned_at || "").localeCompare(String(b.planned_at || ""))
  }

  const enVuelo = rows.find((r) => r.id === arrastre?.id)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setFiltro(null)}
          className={cn("rounded-full border px-3 py-1 text-xs font-bold transition",
            filtro === null ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted")}
        >
          Todos <span className="opacity-70">{rows.length}</span>
        </button>
        {gente.map(([nombre, n]) => (
          <button
            key={nombre}
            type="button"
            onClick={() => setFiltro(filtro === nombre ? null : nombre)}
            className={cn("rounded-full border px-3 py-1 text-xs font-bold transition",
              filtro === nombre ? "border-foreground bg-foreground text-background"
                : n === 0 ? "border-dashed border-border text-muted-foreground/70 hover:bg-muted"
                : "border-border text-muted-foreground hover:bg-muted",
              nombre === editor && filtro !== nombre && "border-primary/50 text-primary")}
            title={n === 0 ? `${nombre} no tiene piezas asignadas` : `${n} piezas de ${nombre}`}
          >
            {nombre === SIN_ASIGNAR ? "Sin asignar" : nombre}{nombre === editor ? " (vos)" : ""} <span className="opacity-70">{n}</span>
          </button>
        ))}
        {onMover && <span className="ml-auto hidden text-[11px] text-muted-foreground lg:block">Arrastrá una pieza a otra columna para cambiarle el estado, o usá las flechas de la tarjeta</span>}
      </div>

      {tipos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-black uppercase tracking-wider text-muted-foreground">Tipo</span>
          <button
            type="button"
            onClick={() => setFiltroTipo(null)}
            className={cn("rounded-full border px-3 py-1 text-xs font-bold transition",
              filtroTipo === null ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted")}
          >
            Todos <span className="opacity-70">{delResponsable.length}</span>
          </button>
          {tipos.map(([tipo, n]) => (
            <button
              key={tipo}
              type="button"
              onClick={() => setFiltroTipo(filtroTipo === tipo ? null : tipo)}
              className={cn("rounded-full border px-3 py-1 text-xs font-bold transition",
                filtroTipo === tipo ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted")}
            >
              {tipo} <span className="opacity-70">{n}</span>
            </button>
          ))}
        </div>
      )}

      {filtro && !delResponsable.length && (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          {filtro === SIN_ASIGNAR ? "No hay piezas sin asignar." : `${filtro} no tiene piezas asignadas todavía.`}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {COLUMNAS.map((col) => {
          const piezas = visibles.filter((r) => col.estados.includes(estadoDe(r))).sort(orden)
          const recibiendo = Boolean(arrastre)
          const suya = enVuelo ? col.estados.includes(estadoDe(enVuelo)) : false
          return (
            <section
              key={col.id}
              data-columna={col.id}
              className={cn("flex min-h-[140px] flex-col rounded-xl border border-border bg-muted/30 p-2 transition",
                recibiendo && !suya && "border-dashed",
                recibiendo && destino === col.id && !suya && "border-primary bg-primary/10 ring-2 ring-primary/40")}
            >
              <header className="mb-2 flex items-center gap-1.5 px-1">
                <span className={cn("h-2 w-2 rounded-full", col.acento)} />
                <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{col.label}</span>
                <span className="ml-auto text-[11px] font-bold text-muted-foreground">{piezas.length || ""}</span>
              </header>
              <div className="flex flex-1 flex-col gap-1.5">
                {piezas.map((row) => {
                  const mia = Boolean(editor) && claveNombre(row.assigned_to) === claveNombre(editor)
                  const guardando = Boolean(movidas[row.id])
                  const indice = COLUMNAS.findIndex((c) => c.estados.includes(estadoDe(row)))
                  return (
                    <div
                      key={row.id}
                      onPointerDown={(e) => empezar(e, row)}
                      onClickCapture={(e) => { if (arrastro.current) { e.preventDefault(); e.stopPropagation() } }}
                      className={cn("group/pieza relative rounded-lg transition", mia && "ring-1 ring-primary/50",
                        onMover && "cursor-grab select-none active:cursor-grabbing",
                        arrastre?.id === row.id && "opacity-30",
                        guardando && !arrastre && "animate-pulse")}
                    >
                      <Pieza row={row} categoria={categoriaDe(row.angle)} onOpen={() => onOpen(row)} compacta dosLineas />
                      <div className="flex flex-wrap items-center gap-1 px-2 pt-1">
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", COLOR_TIPO[tipoDe(row)] || "bg-muted text-muted-foreground")}>{tipoDe(row)}</span>
                        {row.format && row.format.toLocaleUpperCase("es") !== tipoDe(row).toLocaleUpperCase("es") && (
                          <span className="min-w-0 truncate rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{row.format}</span>
                        )}
                        {instagramDe(row)?.url && (
                          <a href={instagramDe(row)!.url} target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()}
                            className="rounded px-1 text-[10px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                            Ver post ↗
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-1 px-2 pb-1 pt-0.5">
                        {responsableDe(row) !== SIN_ASIGNAR && (
                          <p className={cn("min-w-0 flex-1 truncate text-[10px] font-semibold", mia ? "text-primary" : "text-muted-foreground")}>
                            {mia ? "Tuya · " : ""}{row.assigned_to}
                          </p>
                        )}
                        {/* Las flechas hacen lo mismo que arrastrar, para quien prefiera un click. */}
                        {onMover && (
                          <span className="ml-auto flex shrink-0 gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover/pieza:opacity-100">
                            <button type="button" aria-label="Mover a la etapa anterior" disabled={indice <= 0}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => void mover(row, COLUMNAS[indice - 1])}
                              className="rounded px-1 text-xs font-black text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-25">‹</button>
                            <button type="button" aria-label="Mover a la etapa siguiente" disabled={indice < 0 || indice >= COLUMNAS.length - 1}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => void mover(row, COLUMNAS[indice + 1])}
                              className="rounded px-1 text-xs font-black text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-25">›</button>
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {!piezas.length && (
                  <p className="px-1 py-3 text-center text-[11px] text-muted-foreground/70">
                    {recibiendo && !suya ? "Soltá acá" : "Vacío"}
                  </p>
                )}
              </div>
            </section>
          )
        })}
      </div>

      {/* El fantasma que sigue al dedo. No recibe eventos, así se puede saber qué columna hay debajo. */}
      {arrastre && enVuelo && (
        <div
          className="pointer-events-none fixed z-50 rotate-1 rounded-lg opacity-95 shadow-2xl shadow-black/30"
          style={{ left: arrastre.x, top: arrastre.y, width: arrastre.ancho }}
        >
          <Pieza row={enVuelo} categoria={categoriaDe(enVuelo.angle)} onOpen={() => undefined} compacta dosLineas />
        </div>
      )}
    </div>
  )
}
