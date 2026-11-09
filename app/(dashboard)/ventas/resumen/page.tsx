"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { mutate } from "swr"
import { Calendar as CalendarIcon,
  PhoneCall,
  CheckCircle2,
  Copy,
  Check,
  TrendingUp,
  AlertCircle,
  FileText,
  DollarSign,
  Users,
  ChevronDown,
  ChevronUp,
  Eye,
  History,
  RefreshCw,
  Award,
  Pencil,
  Loader2, ArrowUpRight, ExternalLink,
  Search,
  X,
  CalendarDays,
  Info,
  Sparkles,
  HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { CLOSERS_ACTIVOS, SETTERS_TODOS } from "@/lib/equipo"
import type { Agenda } from "@/lib/supabase"
import type { ResumenPayload, CallDetalle } from "@/lib/closing-whatsapp-formatter"
import { cn } from "@/lib/utils"
import { AuditoriaMensual } from "@/components/ventas/auditoria-mensual"
import { RevisionCruces } from "@/components/ventas/revision-cruces"


// Las objeciones se guardan juntas en motivo_no_cierre, separadas por " · ". Se suman, no se pisan.
const OBJ_SEP = " · "
function objecionesDe(texto: string | null | undefined): string[] {
  const out: string[] = []
  for (const parte of String(texto || "").split(/\s·\s|\n/)) {
    const t = parte.trim()
    if (t && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  return out
}

const MOTIVOS_NO_CIERRE_CRM = [
  "Le parecia caro",
  "No llego al PIF",
  "No llegaba a la Cuota 1",
  "Lo tenia que pensar",
  "Desconfianza",
  "Miedo",
  "Metodo de pago",
  "No Califica",
  "Era desempleado",
  "Necesitaba de un mayor para la decision",
  "No tenia dinero ni apoyo",
  "No tenia urgencia"
]


function hoyIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export default function ResumenVentasPage() {
  const [periodo, setPeriodo] = useState<"dia" | "semana" | "mes">("dia")
  const [fecha, setFecha] = useState<string>(hoyIso())
  const [closer, setCloser] = useState<string>("todos")
  const [modo, setModo] = useState<"detallado" | "corto">("detallado")

  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  // Estado para el modal de edición de lead comercial enriquecido
  const [modalLeadAbierto, setModalLeadAbierto] = useState(false)
  const [leadEditando, setLeadEditando] = useState<CallDetalle | null>(null)
  const [cargandoAgendaId, setCargandoAgendaId] = useState<string | number | null>(null)
  const [tabModal, setTabModal] = useState<"comercial" | "contacto" | "llamada" | "contexto">("comercial")
  const agendaOriginalRef = useRef<Agenda | null>(null)
  const [formEdit, setFormEdit] = useState<{
    lead_scoring: string
    macro_arquetipo: string
    subarquetipo: string
    calificaba_realmente: string
    objecion: string
    motivo_no_cierre: string
    motivo_no_show: string
    reprogramada_desde: string
    siguiente_paso: string
    closer: string
    setter: string
    telefono: string
    email: string
    instagram: string
    fecha_closer: string
    estado: string
    link_fathom: string
    problema_actual: string
    tiempo_problema: string
    intentos_previos: string
    motivo_urgencia: string
    ingresos: string
    inversion: string
  }>({
    lead_scoring: "LEAD D",
    macro_arquetipo: "SIN CLASIFICAR",
    subarquetipo: "",
    calificaba_realmente: "Sin definir",
    objecion: "",
    motivo_no_cierre: "",
    motivo_no_show: "",
    reprogramada_desde: "",
    siguiente_paso: "Seguimiento",
    closer: "Cristian",
    setter: "",
    telefono: "",
    email: "",
    instagram: "",
    fecha_closer: "",
    estado: "",
    link_fathom: "",
    problema_actual: "",
    tiempo_problema: "",
    intentos_previos: "",
    motivo_urgencia: "",
    ingresos: "",
    inversion: "",
  })
  const [guardandoLead, setGuardandoLead] = useState(false)
  const [nuevaObjecion, setNuevaObjecion] = useState("")

  // Buscador de leads para mover al reporte
  const [busquedaLead, setBusquedaLead] = useState("")
  const [resultadosBusqueda, setResultadosBusqueda] = useState<any[]>([])
  const [buscandoLead, setBuscandoLead] = useState(false)
  const [moviendoLeadId, setMoviendoLeadId] = useState<string | number | null>(null)

  // Auditoría interactiva de métricas
  const [globoBuscadorAbierto, setGloboBuscadorAbierto] = useState(false)
  const [metricaAuditoriaKey, setMetricaAuditoriaKey] = useState<string | null>(null)

  // Shortcut Ctrl+K / Cmd+K para abrir el Globo Buscador
  useEffect(() => {
    /* keydown-globo-shortcut */
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setGloboBuscadorAbierto((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])


  const abrirEdicionLead = async (c: any) => {
    const agendaId = c.agenda_id || c.id
    if (!agendaId) {
      toast.error("No se encontró el ID de la agenda para editar")
      return
    }
    setCargandoAgendaId(agendaId)
    const leadObj: CallDetalle = {
      agenda_id: agendaId,
      nombre: c.nombre || "Lead",
      closer: c.closer || "Nahuel",
      arquetipo_macro: c.arquetipo_macro || "SIN CLASIFICAR",
      subarquetipo: c.subarquetipo || null,
      lead_score: c.lead_score || c.calificacion || "SIN SCORING",
      es_calificado: Boolean(c.es_calificado || (c.calificacion && c.calificacion.startsWith("LEAD") && !c.calificacion.includes("D"))),
      origen: c.fuente || c.origen || "Instagram",
      resultado: c.resultado || (c.cerro ? "CIERRE" : c.show === false ? "NO SHOW" : "NO CIERRE"),
      cash_d1: Number(c.cc_dia_1) || 0,
      ticket_total: Number(c.cc_dia_1) || 0,
      ...c,
    }
    setLeadEditando(leadObj)
    setTabModal("comercial")
    setModalLeadAbierto(true)

    let scoringBase = "LEAD D"
    const scoreUpper = (c.lead_score || "").toUpperCase()
    if (scoreUpper.includes("LEAD S")) scoringBase = "LEAD S"
    else if (scoreUpper.includes("LEAD A")) scoringBase = "LEAD A"
    else if (scoreUpper.includes("LEAD B")) scoringBase = "LEAD B"
    else if (scoreUpper.includes("LEAD C")) scoringBase = "LEAD C"
    else if (scoreUpper.includes("LEAD D")) scoringBase = "LEAD D"

    const macroBase = c.arquetipo_macro || "SIN CLASIFICAR"
    const objBase = c.objecion_principal && c.objecion_principal !== "Sin motivo cargado" ? c.objecion_principal : ""

    const initial = {
      lead_scoring: scoringBase,
      macro_arquetipo: macroBase,
      subarquetipo: c.subarquetipo || "",
      calificaba_realmente: c.calificaba_realmente || "Sin definir",
      objecion: objBase,
      motivo_no_cierre: c.motivo_real && c.motivo_real !== "Propuesta y claridad en el modelo" ? c.motivo_real : "",
      motivo_no_show: c.motivo_no_show || "",
      siguiente_paso: c.siguiente_paso || "Seguimiento",
      closer: c.closer || "Cristian",
      setter: "",
      telefono: "",
      email: "",
      instagram: "",
      fecha_closer: "",
      estado: c.etiqueta_reprogramada === "Reprogramó y no se presentó" ? "Reprogramó y no se presentó"
        : c.etiqueta_reprogramada === "Reprogramó y no cerró" ? "Reprogramó y no cerró"
        : c.resultado === "CANCELADA" ? (c.estado === "Cancelado en precall" || c.siguiente_paso === "Cancelado en precall" ? "Canceló en precall" : "Cancelado") : (c.resultado === "NO SHOW" ? "No se presentó" : ""),
      reprogramada_desde: c.reprogramada_desde ? String(c.reprogramada_desde).slice(0, 10) : "",
      link_fathom: "",
      problema_actual: c.porque_agendo || "",
      tiempo_problema: "",
      intentos_previos: "",
      motivo_urgencia: "",
      ingresos: c.ingresos_declarados || "",
      inversion: "",
    }
    setFormEdit(initial)

    try {
      const res = await fetch(`/api/agendas?id=${c.agenda_id}`, { cache: "no-store" })
      if (res.ok) {
        const data: Agenda = await res.json()
        if (data) {
          agendaOriginalRef.current = data
          setFormEdit(prev => ({
            ...prev,
            closer: data.closer || prev.closer,
            setter: data.setter || prev.setter,
            telefono: data.telefono || prev.telefono,
            email: data.email || (data as any)?.crm_people?.primary_email || prev.email,
            instagram: data.instagram || prev.instagram,
            fecha_closer: data.fecha_closer ? data.fecha_closer.slice(0, 16) : prev.fecha_closer,
            estado: prev.estado.startsWith("Reprogramó y") ? prev.estado : data.estado === "No Show" ? "No se presentó" : data.estado === "Cancelado en precall" ? "Canceló en precall" : (data.estado || prev.estado),
            motivo_no_show: data.motivo_no_show || prev.motivo_no_show,
            link_fathom: data.link_fathom || prev.link_fathom,
            problema_actual: data.problema_actual || prev.problema_actual,
            tiempo_problema: data.tiempo_problema || prev.tiempo_problema,
            intentos_previos: data.intentos_previos || prev.intentos_previos,
            motivo_urgencia: data.motivo_urgencia || prev.motivo_urgencia,
            objecion: data.motivo_no_cierre ?? prev.objecion,
            motivo_no_cierre: data.motivo_no_cierre ?? prev.motivo_no_cierre,
            ingresos: data.ingresos || prev.ingresos,
            inversion: data.inversion || prev.inversion,
            lead_scoring: data.calificacion || prev.lead_scoring,
            calificaba_realmente: data.calificaba_realmente || prev.calificaba_realmente,
          }))
        }
      }
    } catch (err) {
      console.warn("No se pudo precargar agenda completa:", err)
    } finally {
      setCargandoAgendaId(null)
    }
  }

  const guardarEdicionLead = async () => {
    if (!leadEditando?.agenda_id) {
      toast.error("No se encontró el ID de la agenda para guardar")
      return
    }
    setGuardandoLead(true)
    try {
      let ocupacionFinal: string | null = null
      if (formEdit.macro_arquetipo === "DUEÑO DE NEGOCIO") {
        ocupacionFinal = formEdit.subarquetipo.trim() ? `Negocio - ${formEdit.subarquetipo.trim()}` : "Negocio"
      } else if (formEdit.macro_arquetipo === "EMPLEADO") {
        ocupacionFinal = formEdit.subarquetipo.trim() ? `Empleado - ${formEdit.subarquetipo.trim()}` : "Empleado"
      } else if (formEdit.macro_arquetipo === "ESTUDIANTE") {
        ocupacionFinal = formEdit.subarquetipo.trim() ? `Estudiante - ${formEdit.subarquetipo.trim()}` : "Estudiante"
      } else if (formEdit.subarquetipo.trim()) {
        ocupacionFinal = formEdit.subarquetipo.trim()
      }

      let estadoFinal = formEdit.estado || formEdit.siguiente_paso
      if (formEdit.estado === "Reprogramó") {
        estadoFinal = "Reprogramó"
      } else if (formEdit.siguiente_paso === "Onboarding") {
        estadoFinal = "Cierre"
      }

      const orig = agendaOriginalRef.current
      const pickVal = (newVal: string | null | undefined, origVal: string | null | undefined) => {
        if (newVal !== undefined && newVal !== null && newVal.trim() !== "") return newVal.trim()
        if (orig && newVal !== undefined && newVal !== null) return null
        return origVal || null
      }

      const updates: any = {
        id: leadEditando.agenda_id,
        closer: pickVal(formEdit.closer, orig?.closer),
        setter: pickVal(formEdit.setter, orig?.setter),
        telefono: pickVal(formEdit.telefono, orig?.telefono),
        email: pickVal(formEdit.email, orig?.email || (orig as any)?.crm_people?.primary_email),
        instagram: pickVal(formEdit.instagram, orig?.instagram),
        fecha_closer: formEdit.fecha_closer ? `${formEdit.fecha_closer}:00` : (orig?.fecha_closer || null),
        link_fathom: pickVal(formEdit.link_fathom, orig?.link_fathom),
        problema_actual: pickVal(formEdit.problema_actual, orig?.problema_actual),
        tiempo_problema: pickVal(formEdit.tiempo_problema, orig?.tiempo_problema),
        intentos_previos: pickVal(formEdit.intentos_previos, orig?.intentos_previos),
        motivo_urgencia: pickVal(formEdit.motivo_urgencia, orig?.motivo_urgencia),
        ingresos: pickVal(formEdit.ingresos, orig?.ingresos),
        inversion: pickVal(formEdit.inversion, orig?.inversion),
        calificacion: formEdit.lead_scoring,
        lead_score_grade: formEdit.lead_scoring,
        ocupacion: ocupacionFinal || orig?.ocupacion || null,
        calificaba_realmente: formEdit.calificaba_realmente === "Sin definir" ? (orig?.calificaba_realmente || null) : formEdit.calificaba_realmente,
        motivo_no_cierre: objecionesDe([formEdit.motivo_no_cierre, nuevaObjecion].join(OBJ_SEP)).join(OBJ_SEP) || null,
        estado: estadoFinal,
      }

      if (updates.fecha_closer) {
        updates.fecha_agenda = updates.fecha_closer
      }

      if (formEdit.estado === "Reprogramó") {
        updates.show = false
        updates.cerro = false
        updates.estado = "Reprogramó"
      } else if (formEdit.estado === "No se presentó") {
        updates.show = false
        updates.cerro = false
        updates.estado = "No Show"
        updates.motivo_no_show = formEdit.motivo_no_show.trim() || null
      } else if (formEdit.estado === "Se presentó") {
        updates.show = true
      } else if (formEdit.estado === "Canceló en precall") {
        // canceló antes de la llamada, en el grupo de precall: cuenta como cancelada (no como no show)
        if (!formEdit.motivo_no_show.trim()) throw new Error("Escribí el motivo de la cancelación")
        updates.show = null
        updates.cerro = false
        updates.estado = "Cancelado en precall"
        updates.motivo_no_show = formEdit.motivo_no_show.trim()
      } else if (formEdit.estado === "Reprogramó y no se presentó") {
        // segunda reunión de una reprogramación: no show, con la marca de reprogramada
        updates.show = false
        updates.cerro = false
        updates.estado = "No Show"
        updates.motivo_no_show = formEdit.motivo_no_show.trim() || null
        updates.reprogramada_desde = formEdit.reprogramada_desde || null
      } else if (formEdit.estado === "Reprogramó y no cerró") {
        // segunda reunión de una reprogramación: se presentó y no cerró
        updates.show = true
        updates.cerro = false
        updates.estado = null
        updates.reprogramada_desde = formEdit.reprogramada_desde || null
      }
      if (formEdit.estado.startsWith("Reprogramó y") && !formEdit.reprogramada_desde) {
        throw new Error("Indicá para qué fecha estaba agendada antes de reprogramar")
      }

      const res = await fetch("/api/agendas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || "Error al actualizar la agenda en Exposure OS")
      }

      toast.success("Lead actualizado exitosamente en Agendas de Exposure OS")
      setModalLeadAbierto(false)
      setLeadEditando(null)
      await mutate((key: string) => typeof key === "string" && key.startsWith("/api/agendas"))
      await cargarResumen(true)
    } catch (err: any) {
      toast.error(err.message || "Error al guardar cambios")
    } finally {
      setGuardandoLead(false)
    }
  }
  // Búsqueda global de leads en todo el CRM (debounce 300ms)
  useEffect(() => {
    const term = busquedaLead.trim()
    if (term.length < 2) {
      setResultadosBusqueda([])
      setBuscandoLead(false)
      return
    }
    const timer = setTimeout(async () => {
      try {
        setBuscandoLead(true)
        const res = await fetch(`/api/agendas?q=${encodeURIComponent(term)}&light=1`)
        if (res.ok) {
          const list = await res.json()
          setResultadosBusqueda(Array.isArray(list) ? list : [])
        }
      } catch (err) {
        console.error("Error buscando leads:", err)
      } finally {
        setBuscandoLead(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [busquedaLead])

  // Mover lead de otra fecha a la fecha seleccionada en el reporte
  const moverLeadAFecha = async (lead: any, fechaDestino: string) => {
    try {
      setMoviendoLeadId(lead.id)
      const horaOriginal = lead.fecha_closer
        ? lead.fecha_closer.slice(11, 16)
        : lead.fecha_agenda
        ? lead.fecha_agenda.slice(11, 16)
        : "10:00"
      const nuevaFecha = `${fechaDestino}T${horaOriginal || "10:00"}:00`

      const res = await fetch("/api/agendas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lead.id,
          fecha_closer: nuevaFecha,
          fecha_agenda: nuevaFecha,
        }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || "No se pudo mover el lead")
      }

      toast.success(`¡Lead ${lead.nombre || ""} movido al ${fechaDestino} (${horaOriginal})!`)
      setBusquedaLead("")
      setResultadosBusqueda([])
      await cargarResumen(true)
      void mutate((key: string) => typeof key === "string" && key.startsWith("/api/agendas"))
    } catch (err: any) {
      toast.error(err.message || "Error al mover el lead")
    } finally {
      setMoviendoLeadId(null)
    }
  }



  const [datos, setDatos] = useState<ResumenPayload | null>(null)
  const [textoWhatsapp, setTextoWhatsapp] = useState<string>("")
  const [filtroResultado, setFiltroResultado] = useState<string>("todos")
  const [callExpandida, setCallExpandida] = useState<number | string | null>(null)

  // Histórico
  const [tabActiva, setTabActiva] = useState<"generador" | "historico">("generador")
  const [historico, setHistorico] = useState<Array<any>>([])
  const [loadingHistorico, setLoadingHistorico] = useState(false)

  // Cargar datos
  const recargarResumen = async () => {
    toast.loading("Recargando datos de ventas...", { id: "recargar-resumen" })
    await cargarResumen(true)
    toast.success("¡Datos actualizados con éxito!", { id: "recargar-resumen" })
  }

  // Cargar datos
  const cargarResumen = async (forzar: boolean | any = false) => {
    const esForzado = typeof forzar === "boolean" ? forzar : false
    try {
      setLoading(true)
      const params = new URLSearchParams({
        periodo,
        fecha,
        closer,
        modo,
      })

      if (esForzado) params.append("_t", Date.now().toString())
      const res = await fetch(`/api/ventas/resumen?${params.toString()}`)
      const json = await res.json()

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Error al cargar resumen comercial")
      }

      setDatos(json.datos)
      setTextoWhatsapp(json.texto_whatsapp)
    } catch (err: any) {
      toast.error(err.message || "Error al generar resumen")
    } finally {
      setLoading(false)
    }
  }

  // Cargar lista de reportes históricos
  const cargarHistorico = async () => {
    try {
      setLoadingHistorico(true)
      const res = await fetch("/api/ventas/resumen?historico=1&limite=30")
      const json = await res.json()
      if (res.ok && json.ok) {
        setHistorico(json.reportes || [])
      }
    } catch (err: any) {
      toast.error("Error al cargar historial de cierres")
    } finally {
      setLoadingHistorico(false)
    }
  }

  useEffect(() => {
    cargarResumen()
  }, [periodo, fecha, closer, modo])

  useEffect(() => {
    if (tabActiva === "historico") {
      cargarHistorico()
    }
  }, [tabActiva])

  const copiarWhatsApp = () => {
    if (!textoWhatsapp) return
    navigator.clipboard.writeText(textoWhatsapp)
    setCopiado(true)
    toast.success("¡Resumen de WhatsApp copiado al portapapeles!")
    setTimeout(() => setCopiado(false), 2500)
  }

  const guardarReporteHistorico = async () => {
    if (!datos) return
    try {
      setGuardando(true)
      const res = await fetch("/api/ventas/resumen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "guardar",
          periodo,
          fecha_desde: datos.fecha_desde,
          fecha_hasta: datos.fecha_hasta,
          closer,
          datos,
          texto_whatsapp: textoWhatsapp,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || "No se pudo guardar")

      toast.success("Resumen guardado exitosamente en el historial del CRM")
    } catch (err: any) {
      toast.error(err.message || "Error al guardar el reporte")
    } finally {
      setGuardando(false)
    }
  }

  const verReporteGuardado = (rep: any) => {
    if (!rep.metadata) return
    setDatos(rep.metadata)
    setTextoWhatsapp(rep.metadata.texto_whatsapp || "")
    setTabActiva("generador")
    toast.info(`Viendo reporte histórico: ${rep.name}`)
  }

  const metricas = datos?.metricas
  const arq = datos?.arquetipos
  const calls = datos?.calls || []

  // Deduplicación defensiva en UI para garantizar llamadas únicas en cualquier período
  const callsUnicas = useMemo(() => {
    const seen = new Set<string>()
    return calls.filter((c) => {
      if (c.agenda_id && seen.has(`id:${c.agenda_id}`)) return false
      if (c.agenda_id) seen.add(`id:${c.agenda_id}`)

      const cleanNom = (c.nombre || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
      const horaStr = (c.hora || "").trim()
      const fechaStr = (c.fecha || "").trim()
      if (cleanNom && cleanNom.length >= 4) {
        const combo = `nhf:${cleanNom}_${fechaStr}_${horaStr}`
        if (seen.has(combo)) return false
        seen.add(combo)
      }
      return true
    })
  }, [calls])

  const callsFiltradas = callsUnicas.filter((c) => {
    if (filtroResultado === "todos") return true
    if (filtroResultado === "cierres") return c.resultado === "CIERRE" || c.resultado === "FEE"
    if (filtroResultado === "calificados") return c.es_calificado
    if (filtroResultado === "no_cierres") return c.resultado === "NO CIERRE"
    if (filtroResultado === "no_shows") return c.resultado === "NO SHOW" || c.resultado === "CANCELADA"
    return true
  })

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <PhoneCall className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Resumen de Ventas</h1>
              <p className="text-sm text-muted-foreground">
                Reporte operativo de closing basado exclusivamente en datos reales de Exposure OS.
              </p>
            </div>
          </div>
        </div>

        {/* Acciones principales */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setGloboBuscadorAbierto(true)}
            className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 flex items-center gap-1.5 shadow-sm font-semibold"
            title="Abrir Globo Buscador de Leads (Ctrl+K)"
          >
            <span className="text-base">🎈</span>
            <span>Globo Buscador</span>
            <kbd className="ml-1 hidden rounded bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/30 sm:inline-block">
              Ctrl K
            </kbd>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={copiarWhatsApp}
            disabled={!textoWhatsapp || loading}
            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
          >
            {copiado ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copiado ? "Copiado!" : "Copiar para WhatsApp"}
          </Button>
          <Button
            size="sm"
            onClick={guardarReporteHistorico}
            disabled={!datos || loading || guardando}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
          >
            {guardando ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <History className="mr-2 h-4 w-4" />}
            Guardar en Histórico
          </Button>
        </div>
      </div>

      {/* Tabs Generador / Histórico */}
      <Tabs value={tabActiva} onValueChange={(v: any) => setTabActiva(v)} className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <TabsList className="bg-zinc-900/80">
            <TabsTrigger value="generador" className="data-[state=active]:bg-zinc-800">
              <Eye className="mr-2 h-4 w-4" /> Generador de Resumen
            </TabsTrigger>
            <TabsTrigger value="historico" className="data-[state=active]:bg-zinc-800">
              <History className="mr-2 h-4 w-4" /> Historial de Cierres
            </TabsTrigger>
          </TabsList>

          {tabActiva === "generador" && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => recargarResumen()}
                disabled={loading}
                className="h-8 text-xs text-muted-foreground hover:text-white"
              >
                <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
                Actualizar datos
              </Button>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* TAB 1: GENERADOR OPERATIVO */}
        {/* ============================================================== */}
        <TabsContent value="generador" className="space-y-6">
          {/* Barra de Filtros */}
          <Card className="border-white/10 bg-zinc-900/50 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-5">
              {/* Selector de Período */}
              <div>
                <label className="text-xs font-medium text-zinc-400">Período</label>
                <Select value={periodo} onValueChange={(v: any) => setPeriodo(v)}>
                  <SelectTrigger className="mt-1 bg-zinc-900 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dia">Día (Diario)</SelectItem>
                    <SelectItem value="semana">Semana (Weekly)</SelectItem>
                    <SelectItem value="mes">Mes (Monthly)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Selector de Fecha */}
              <div>
                <label className="text-xs font-medium text-zinc-400">
                  {periodo === "dia" ? "Fecha del día" : periodo === "semana" ? "Semana de" : "Mes de"}
                </label>
                <input
                  type={periodo === "mes" ? "month" : "date"}
                  value={periodo === "mes" ? fecha.slice(0, 7) : fecha}
                  onChange={(e) => setFecha(e.target.value ? (periodo === "mes" ? `${e.target.value}-01` : e.target.value) : hoyIso())}
                  className="mt-1 flex h-10 w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Selector de Closer */}
              <div>
                <label className="text-xs font-medium text-zinc-400">Closer</label>
                <Select value={closer} onValueChange={setCloser}>
                  <SelectTrigger className="mt-1 bg-zinc-900 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los closers</SelectItem>
                    {CLOSERS_ACTIVOS.map((c) => (
                      <SelectItem key={c} value={c.toLowerCase()}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selector de Modo */}
              <div>
                <label className="text-xs font-medium text-zinc-400">Detalle WhatsApp</label>
                <Select value={modo} onValueChange={(v: any) => setModo(v)}>
                  <SelectTrigger className="mt-1 bg-zinc-900 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="detallado">Detallado (call por call)</SelectItem>
                    <SelectItem value="corto">Ejecutivo (sólo métricas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Botón de Copiado Rápido */}
              <div className="flex items-end">
                <Button
                  onClick={copiarWhatsApp}
                  disabled={!textoWhatsapp || loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                >
                  {copiado ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copiado ? "Copiado!" : "Copiar WhatsApp"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Scorecards Principales (Interactivos para auditar fórmula y leads) */}
          {metricas && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                <span className="text-xs text-zinc-300 font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                  Métricas Operativas del Período
                </span>
                <span className="text-[11px] text-emerald-300 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30 font-medium flex items-center gap-1.5 shadow-sm">
                  <span>💡</span>
                  <span>Cada métrica es un botón: pulsá <strong>&quot;Ver información&quot;</strong> para ver su fórmula y listado de leads reales</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                {/* Calls Programadas */}
                <Card
                  onClick={() => setMetricaAuditoriaKey("programadas")}
                  role="button"
                  tabIndex={0}
                  className="border-white/10 bg-zinc-900/50 p-4 cursor-pointer transition-all hover:scale-[1.02] hover:border-emerald-500/50 hover:bg-zinc-800/70 hover:shadow-lg hover:shadow-emerald-500/5 active:scale-[0.99] group flex flex-col justify-between"
                  title="Pulsá para ver información de Llamadas Programadas"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-300 group-hover:text-white transition-colors">Programadas</span>
                      <Info className="h-3.5 w-3.5 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                    </div>
                    <div className="mt-2 text-2xl font-black text-white">{metricas.programadas}</div>
                    <span className="text-[11px] text-zinc-400">
                      {metricas.calificadas_programadas} calificadas
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMetricaAuditoriaKey("programadas");
                    }}
                    className="w-full mt-3 h-7 text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 flex items-center justify-center gap-1 shadow-sm transition-all"
                  >
                    <Info className="h-3 w-3 text-emerald-400" />
                    <span>Ver información</span>
                  </Button>
                </Card>

                {/* Presentadas (Show Rate) */}
                <Card
                  onClick={() => setMetricaAuditoriaKey("presentadas")}
                  role="button"
                  tabIndex={0}
                  className="border-white/10 bg-zinc-900/50 p-4 cursor-pointer transition-all hover:scale-[1.02] hover:border-emerald-500/50 hover:bg-zinc-800/70 hover:shadow-lg hover:shadow-emerald-500/5 active:scale-[0.99] group flex flex-col justify-between"
                  title="Pulsá para ver información de Llamadas Presentadas"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-300 group-hover:text-white transition-colors">Presentadas</span>
                      <Info className="h-3.5 w-3.5 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                    </div>
                    <div className="mt-2 text-2xl font-black text-white">{metricas.presentadas}</div>
                    <span className="text-[11px] text-emerald-400 font-medium">
                      {metricas.show_rate_pct.toFixed(1).replace(".", ",")} % show rate
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMetricaAuditoriaKey("presentadas");
                    }}
                    className="w-full mt-3 h-7 text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 flex items-center justify-center gap-1 shadow-sm transition-all"
                  >
                    <Info className="h-3 w-3 text-emerald-400" />
                    <span>Ver información</span>
                  </Button>
                </Card>

                {/* Calificadas Presentadas */}
                <Card
                  onClick={() => setMetricaAuditoriaKey("calificadas_presentadas")}
                  role="button"
                  tabIndex={0}
                  className="border-blue-500/20 bg-zinc-900/50 p-4 cursor-pointer transition-all hover:scale-[1.02] hover:border-blue-500/50 hover:bg-zinc-800/70 hover:shadow-lg hover:shadow-blue-500/5 active:scale-[0.99] group flex flex-col justify-between"
                  title="Pulsá para ver información de Calificadas Presentadas"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-300 group-hover:text-white transition-colors">Calif. Presentadas</span>
                      <Info className="h-3.5 w-3.5 text-blue-400 group-hover:text-blue-300 transition-colors" />
                    </div>
                    <div className="mt-2 text-2xl font-black text-blue-400">{metricas.calificadas_presentadas}</div>
                    <span className="text-[11px] text-zinc-400">
                      {metricas.show_rate_calificados_pct.toFixed(1).replace(".", ",")} % show calif
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMetricaAuditoriaKey("calificadas_presentadas");
                    }}
                    className="w-full mt-3 h-7 text-[11px] font-semibold bg-blue-500/10 hover:bg-blue-500/25 text-blue-300 hover:text-blue-200 border border-blue-500/30 flex items-center justify-center gap-1 shadow-sm transition-all"
                  >
                    <Info className="h-3 w-3 text-blue-400" />
                    <span>Ver información</span>
                  </Button>
                </Card>

                {/* Cierres & TC */}
                <Card
                  onClick={() => setMetricaAuditoriaKey("cierres")}
                  role="button"
                  tabIndex={0}
                  className="border-emerald-500/30 bg-emerald-500/5 p-4 cursor-pointer transition-all hover:scale-[1.02] hover:border-emerald-400 hover:bg-emerald-500/10 hover:shadow-lg hover:shadow-emerald-500/10 active:scale-[0.99] group flex flex-col justify-between"
                  title="Pulsá para ver información de Cierres y Tasa de Conversión"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-400 group-hover:text-emerald-300 transition-colors">Cierres</span>
                      <Info className="h-3.5 w-3.5 text-emerald-500 group-hover:text-emerald-300 transition-colors" />
                    </div>
                    <div className="mt-2 text-2xl font-black text-emerald-400">{metricas.cierres}</div>
                    <span className="text-[11px] text-emerald-300 font-medium">
                      {metricas.tc_calificadas_pct.toFixed(1).replace(".", ",")} % s/calif
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMetricaAuditoriaKey("cierres");
                    }}
                    className="w-full mt-3 h-7 text-[11px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 hover:text-emerald-100 border border-emerald-500/40 flex items-center justify-center gap-1 shadow-sm transition-all"
                  >
                    <Info className="h-3 w-3 text-emerald-400" />
                    <span>Ver información</span>
                  </Button>
                </Card>

                {/* Cash D1 */}
                <Card
                  onClick={() => setMetricaAuditoriaKey("cash_d1")}
                  role="button"
                  tabIndex={0}
                  className="border-emerald-500/30 bg-emerald-500/5 p-4 cursor-pointer transition-all hover:scale-[1.02] hover:border-emerald-400 hover:bg-emerald-500/10 hover:shadow-lg hover:shadow-emerald-500/10 active:scale-[0.99] group flex flex-col justify-between"
                  title="Pulsá para ver información de Cash Recaudado Día 1"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-400 group-hover:text-emerald-300 transition-colors">Cash D1</span>
                      <Info className="h-3.5 w-3.5 text-emerald-500 group-hover:text-emerald-300 transition-colors" />
                    </div>
                    <div className="mt-2 text-2xl font-black text-emerald-400">
                      ${metricas.cash_d1.toLocaleString("es-AR")}
                    </div>
                    <span className="text-[11px] text-muted-foreground">USD directo</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMetricaAuditoriaKey("cash_d1");
                    }}
                    className="w-full mt-3 h-7 text-[11px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 hover:text-emerald-100 border border-emerald-500/40 flex items-center justify-center gap-1 shadow-sm transition-all"
                  >
                    <Info className="h-3 w-3 text-emerald-400" />
                    <span>Ver información</span>
                  </Button>
                </Card>

                {/* Ticket Contratado */}
                <Card
                  onClick={() => setMetricaAuditoriaKey("ticket_total")}
                  role="button"
                  tabIndex={0}
                  className="border-white/10 bg-zinc-900/50 p-4 cursor-pointer transition-all hover:scale-[1.02] hover:border-zinc-500/50 hover:bg-zinc-800/70 hover:shadow-lg hover:shadow-white/5 active:scale-[0.99] group flex flex-col justify-between"
                  title="Pulsá para ver información de Ticket Contratado Total"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-300 group-hover:text-white transition-colors">Ticket Contratado</span>
                      <Info className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                    </div>
                    <div className="mt-2 text-2xl font-black text-white">
                      ${metricas.ticket_total.toLocaleString("es-AR")}
                    </div>
                    <span className="text-[11px] text-zinc-400">USD total</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMetricaAuditoriaKey("ticket_total");
                    }}
                    className="w-full mt-3 h-7 text-[11px] font-semibold bg-white/5 hover:bg-white/15 text-zinc-200 hover:text-white border border-white/20 flex items-center justify-center gap-1 shadow-sm transition-all"
                  >
                    <Info className="h-3 w-3 text-zinc-300" />
                    <span>Ver información</span>
                  </Button>
                </Card>
              </div>
            </div>
          )}

          {/* Tasa de cierre con el criterio de calificada vigente (08/10/2026) */}
          {datos?.tasa_cierre_vigente && (() => {
            const t = datos.tasa_cierre_vigente
            const p = (n: number) => `${n.toFixed(1).replace(".", ",")} %`
            const bloques = [
              { key: "tc_vigente_todas", titulo: "Sobre todas las presentadas", tasa: t.tc_pct, cierres: t.cierres, base: t.presentadas, clase: "text-white", borde: "border-white/10 hover:border-emerald-500/50" },
              { key: "tc_vigente_calificadas", titulo: "Sobre calificadas", tasa: t.tc_calificadas_pct, cierres: t.cierres_calificados, base: t.calificadas_presentadas, clase: "text-blue-400", borde: "border-blue-500/20 hover:border-blue-500/50" },
              { key: "tc_vigente_no_calificadas", titulo: "Sobre no calificadas", tasa: t.tc_no_calificadas_pct, cierres: t.cierres_no_calificados, base: t.no_calificadas_presentadas, clase: "text-zinc-300", borde: "border-white/10 hover:border-zinc-500/50" },
            ]
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                  <span className="text-xs text-zinc-300 font-semibold flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                    Tasa de cierre · criterio de calificada vigente
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Calificada = declaró que gana USD 1.000 a 3.000 por mes + arquetipo foco (resumen del setter)
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {bloques.map((b) => (
                    <Card
                      key={b.key}
                      onClick={() => setMetricaAuditoriaKey(b.key)}
                      role="button"
                      tabIndex={0}
                      className={cn("bg-zinc-900/50 p-4 cursor-pointer transition-all hover:bg-zinc-800/70 group", b.borde)}
                      title="Pulsá para ver los leads que componen la tasa"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-300 group-hover:text-white transition-colors">{b.titulo}</span>
                        <Info className="h-3.5 w-3.5 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                      </div>
                      <div className={cn("mt-2 text-2xl font-black tabular-nums", b.clase)}>{p(b.tasa)}</div>
                      <span className="text-[11px] text-zinc-400 tabular-nums">
                        {b.cierres} {b.cierres === 1 ? "cierre" : "cierres"} de {b.base} {b.base === 1 ? "presentada" : "presentadas"}
                      </span>
                    </Card>
                  ))}
                </div>
                {t.sin_resumen_presentadas > 0 && (
                  <p className="px-1 text-[11px] text-zinc-500">
                    {t.sin_resumen_presentadas} {t.sin_resumen_presentadas === 1 ? "presentada no tiene" : "presentadas no tienen"} resumen del setter
                    {t.cierres_sin_resumen > 0 ? ` (${t.cierres_sin_resumen} con cierre)` : ""}: cuentan en el total, pero no se pueden clasificar como calificadas o no.
                  </p>
                )}
              </div>
            )
          })()}

          {/* Distribución por Arquetipos (Interactivos para auditar composición) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-zinc-300 font-semibold flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-blue-400" />
                Arquetipos de Leads del Período
              </span>
              <span className="text-[11px] text-zinc-400">
                Pulsá cualquier arquetipo para ver los leads específicos que lo integran
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              {/* Dueño de Negocio */}
              <Card
                onClick={() => setMetricaAuditoriaKey("dueno_negocio")}
                role="button"
                tabIndex={0}
                className="border-emerald-500/20 bg-emerald-500/[0.03] p-4 cursor-pointer transition-all hover:scale-[1.02] hover:border-emerald-500/50 hover:bg-emerald-500/[0.08] active:scale-[0.99] group shadow-sm flex flex-col justify-between"
                title="Pulsá para ver información de Dueño de Negocio"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide group-hover:text-emerald-300">Dueño de Negocio</span>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">Macro</Badge>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-black text-white">{arq?.dueno_negocio.total || 0}</span>
                      <span className="text-xs text-muted-foreground ml-1.5">calls</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-emerald-400">{arq?.dueno_negocio.cierres || 0} cierres</span>
                      <span className="block text-[11px] text-muted-foreground">${arq?.dueno_negocio.cash_d1 || 0} USD</span>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-emerald-500/10 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>${arq?.dueno_negocio.calificadas || 0} calif (${arq?.dueno_negocio.presentadas_calificadas || 0} pres)</span>
                    <span>${arq?.dueno_negocio.cierres_calificados || 0} calif / ${arq?.dueno_negocio.cierres_no_calificados || 0} no calif</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMetricaAuditoriaKey("dueno_negocio");
                  }}
                  className="w-full mt-3 h-7 text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 flex items-center justify-center gap-1 shadow-sm transition-all"
                >
                  <Info className="h-3 w-3 text-emerald-400" />
                  <span>Ver información y leads</span>
                </Button>
              </Card>

              {/* Empleado 9-5 */}
              <Card
                onClick={() => setMetricaAuditoriaKey("empleado")}
                role="button"
                tabIndex={0}
                className="border-blue-500/20 bg-blue-500/[0.03] p-4 cursor-pointer transition-all hover:scale-[1.02] hover:border-blue-500/50 hover:bg-blue-500/[0.08] active:scale-[0.99] group shadow-sm flex flex-col justify-between"
                title="Pulsá para ver información de Empleado"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wide group-hover:text-blue-300">Empleado (9 a 5)</span>
                    <Badge variant="outline" className="border-blue-500/30 text-blue-400 text-[10px]">Macro</Badge>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-black text-white">{arq?.empleado.total || 0}</span>
                      <span className="text-xs text-muted-foreground ml-1.5">calls</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-blue-400">{arq?.empleado.cierres || 0} cierres</span>
                      <span className="block text-[11px] text-muted-foreground">${arq?.empleado.cash_d1 || 0} USD</span>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-blue-500/10 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>${arq?.empleado.calificadas || 0} calif (${arq?.empleado.presentadas_calificadas || 0} pres)</span>
                    <span>${arq?.empleado.cierres_calificados || 0} calif / ${arq?.empleado.cierres_no_calificados || 0} no calif</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMetricaAuditoriaKey("empleado");
                  }}
                  className="w-full mt-3 h-7 text-[11px] font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 hover:text-blue-200 border border-blue-500/30 flex items-center justify-center gap-1 shadow-sm transition-all"
                >
                  <Info className="h-3 w-3 text-blue-400" />
                  <span>Ver información y leads</span>
                </Button>
              </Card>

              {/* Estudiante */}
              <Card
                onClick={() => setMetricaAuditoriaKey("estudiante")}
                role="button"
                tabIndex={0}
                className="border-white/10 bg-white/[0.02] p-4 cursor-pointer transition-all hover:scale-[1.02] hover:border-amber-500/50 hover:bg-amber-500/[0.05] active:scale-[0.99] group shadow-sm flex flex-col justify-between"
                title="Pulsá para ver información de Estudiante"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide group-hover:text-amber-300">Estudiante</span>
                    <Badge variant="outline" className="border-white/10 text-muted-foreground text-[10px]">Macro</Badge>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-black text-white">{arq?.estudiante.total || 0}</span>
                      <span className="text-xs text-muted-foreground ml-1.5">calls</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-zinc-300 group-hover:text-amber-300">{arq?.estudiante.cierres || 0} cierres</span>
                      <span className="block text-[11px] text-muted-foreground">${arq?.estudiante.cash_d1 || 0} USD</span>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>${arq?.estudiante.calificadas || 0} calif (${arq?.estudiante.presentadas_calificadas || 0} pres)</span>
                    <span>${arq?.estudiante.cierres_calificados || 0} calif / ${arq?.estudiante.cierres_no_calificados || 0} no calif</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMetricaAuditoriaKey("estudiante");
                  }}
                  className="w-full mt-3 h-7 text-[11px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border border-amber-500/30 flex items-center justify-center gap-1 shadow-sm transition-all"
                >
                  <Info className="h-3 w-3 text-amber-400" />
                  <span>Ver información y leads</span>
                </Button>
              </Card>

              {/* Sin Clasificar */}
              <Card
                onClick={() => setMetricaAuditoriaKey("sin_clasificar")}
                role="button"
                tabIndex={0}
                className="border-amber-500/20 bg-amber-500/[0.03] p-4 cursor-pointer transition-all hover:scale-[1.02] hover:border-zinc-500/50 hover:bg-zinc-800/60 active:scale-[0.99] group shadow-sm flex flex-col justify-between"
                title="Pulsá para ver información de leads Sin Clasificar"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wide group-hover:text-zinc-200">Sin Clasificar</span>
                    <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">Pendiente</Badge>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-black text-amber-300">{arq?.sin_clasificar.total || 0}</span>
                      <span className="text-xs text-muted-foreground ml-1.5">calls</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-amber-400 group-hover:text-zinc-200">{arq?.sin_clasificar.cierres || 0} cierres</span>
                      <span className="block text-[11px] text-muted-foreground">${arq?.sin_clasificar.cash_d1 || 0} USD</span>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-amber-500/10 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>${arq?.sin_clasificar.calificadas || 0} calif (${arq?.sin_clasificar.presentadas_calificadas || 0} pres)</span>
                    <span>${arq?.sin_clasificar.cierres_calificados || 0} calif / ${arq?.sin_clasificar.cierres_no_calificados || 0} no calif</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMetricaAuditoriaKey("sin_clasificar");
                  }}
                  className="w-full mt-3 h-7 text-[11px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border border-amber-500/30 flex items-center justify-center gap-1 shadow-sm transition-all"
                >
                  <Info className="h-3 w-3 text-amber-400" />
                  <span>Ver información y leads</span>
                </Button>
              </Card>
            </div>
          </div>

          {/* Barra de Búsqueda y Globo Buscador de Leads (Ancho Completo) */}
          <div id="globo-buscador-leads" className="rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-4 shadow-xl shadow-emerald-950/20 backdrop-blur space-y-3">
            <div className="flex items-center justify-between px-1 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 text-sm shadow-inner border border-emerald-500/40">
                  🎈
                </span>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                    <span>Barra de Búsqueda de Leads &amp; Globo Emergente</span>
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    Buscá cualquier lead por nombre, teléfono o @instagram para auditar sus datos o moverlo a la fecha activa: <strong className="text-emerald-300 font-semibold">{fecha}</strong>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGloboBuscadorAbierto(true)}
                  className="h-7 text-xs border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/25 flex items-center gap-1.5 shadow-sm font-semibold"
                  title="Abrir en ventana emergente (Ctrl+K)"
                >
                  <span className="text-sm">🎈</span>
                  <span>Abrir Globo Modal</span>
                  <kbd className="hidden sm:inline-block text-[10px] bg-emerald-950 px-1 py-0.5 rounded border border-emerald-500/30 font-mono text-emerald-400">Ctrl K</kbd>
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-zinc-950 px-3.5 py-2.5 text-xs focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/25 transition-all shadow-inner">
                <Search className="h-4 w-4 text-emerald-400 shrink-0" />
                <Input
                  id="input-globo-busqueda"
                  placeholder="Escribí el nombre, teléfono o @instagram para buscar en todo el CRM y mover a este día..."
                  value={busquedaLead}
                  onChange={(e) => setBusquedaLead(e.target.value)}
                  className="h-6 border-0 bg-transparent p-0 text-xs text-white placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                {busquedaLead && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-zinc-400 hover:text-white"
                    onClick={() => {
                      setBusquedaLead("")
                      setResultadosBusqueda([])
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
                {buscandoLead && <Loader2 className="h-4 w-4 animate-spin text-emerald-400 shrink-0" />}
              </div>

              {/* Resultados de Búsqueda Desplegables */}
              {busquedaLead.trim().length >= 2 && (
                <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-emerald-500/30 bg-zinc-950 p-2 text-xs shadow-2xl space-y-1.5">
                  <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-white/10">
                    <span>
                      {buscandoLead
                        ? "Buscando en la base de datos..."
                        : `Resultados encontrados (${resultadosBusqueda.length})`}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-normal">
                      Hacé clic en &quot;Mover a {fecha}&quot; para reubicar la llamada
                    </span>
                  </div>

                  {resultadosBusqueda.length === 0 && !buscandoLead ? (
                    <div className="p-4 text-center text-zinc-500 text-xs">
                      No se encontraron leads con &quot;{busquedaLead}&quot; en el CRM.
                    </div>
                  ) : (
                    <div className="space-y-1.5 pt-1">
                      {resultadosBusqueda.map((lead: any) => {
                        const fechaCorta = lead.fecha_closer ? lead.fecha_closer.slice(0, 10) : "Sin fecha"
                        const horaCorta = lead.fecha_closer ? lead.fecha_closer.slice(11, 16) : ""
                        const esMismoDia = fechaCorta === fecha
                        const moviendo = moviendoLeadId === lead.id

                        return (
                          <div
                            key={lead.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-zinc-900/70 p-2.5 hover:border-emerald-500/40 hover:bg-zinc-900 transition-all"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-white truncate">
                                  {lead.nombre || "Sin nombre"}
                                </span>
                                {lead.calificacion && (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px] px-1.5 py-0 h-4 border-white/10",
                                      lead.calificacion.includes("A") && "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
                                      lead.calificacion.includes("B") && "border-blue-500/40 text-blue-300 bg-blue-500/10",
                                      lead.calificacion.includes("C") && "border-amber-500/40 text-amber-300 bg-amber-500/10",
                                      lead.calificacion.includes("D") && "border-zinc-500/40 text-zinc-400 bg-zinc-500/10"
                                    )}
                                  >
                                    {lead.calificacion}
                                  </Badge>
                                )}
                                {lead.closer && (
                                  <span className="text-[10px] text-zinc-400">
                                    Closer: <strong className="text-zinc-300">{lead.closer}</strong>
                                  </span>
                                )}
                              </div>

                              <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-400 flex-wrap">
                                {lead.telefono && <span>📞 {lead.telefono}</span>}
                                {lead.instagram && <span>📸 @{lead.instagram.replace(/^@/, "")}</span>}
                                <span className={cn(
                                  "font-medium",
                                  esMismoDia ? "text-emerald-400" : "text-amber-400"
                                )}>
                                  📅 {esMismoDia ? `En este día (${horaCorta || "10:00"})` : `Agendado: ${fechaCorta} ${horaCorta}`}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={moviendo}
                                onClick={() => moverLeadAFecha(lead, fecha)}
                                className="h-7 text-[11px] px-2.5 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
                                title={`Mover lead al día del reporte (${fecha})`}
                              >
                                {moviendo ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                  <CalendarDays className="h-3 w-3 mr-1 text-emerald-400" />
                                )}
                                Mover a {fecha}
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => abrirEdicionLead(lead)}
                                className="h-7 text-[11px] px-2 text-zinc-300 hover:text-white hover:bg-white/5"
                                title="Abrir ficha completa del lead"
                              >
                                <Pencil className="h-3 w-3 mr-1 text-zinc-400" />
                                Ficha
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Split 2 Columnas: Detalle de Llamadas & Vista Previa WhatsApp */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Columna Izquierda: Detalle de Llamadas (7 Cols) */}
            <div className="space-y-4 lg:col-span-7">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                  Llamadas del período ({callsFiltradas.length})
                </h3>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-emerald-500/30 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 flex items-center gap-1 font-medium"
                    onClick={() => setGloboBuscadorAbierto(true)}
                    title="Abrir Globo Buscador de Leads"
                  >
                    <span>🎈</span>
                    <span>Globo Buscador</span>
                  </Button>
                  <Button
                    variant={filtroResultado === "todos" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setFiltroResultado("todos")}
                  >
                    Todas
                  </Button>
                  <Button
                    variant={filtroResultado === "cierres" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs text-emerald-400"
                    onClick={() => setFiltroResultado("cierres")}
                  >
                    Cierres
                  </Button>
                  <Button
                    variant={filtroResultado === "calificados" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs text-blue-400"
                    onClick={() => setFiltroResultado("calificados")}
                  >
                    Calificadas
                  </Button>
                  <Button
                    variant={filtroResultado === "no_cierres" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs text-zinc-400"
                    onClick={() => setFiltroResultado("no_cierres")}
                  >
                    No cierres
                  </Button>
                  <Button
                    variant={filtroResultado === "no_shows" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs text-rose-400"
                    onClick={() => setFiltroResultado("no_shows")}
                  >
                    No Shows
                  </Button>
                </div>
              </div>

              {callsFiltradas.length === 0 ? (
                <Card className="border-white/10 bg-zinc-900/30 p-8 text-center text-muted-foreground">
                  No se encontraron llamadas para los filtros seleccionados.
                </Card>
              ) : (
                <div className="space-y-2">
                  {callsFiltradas.map((c) => {
                    const expandida = callExpandida === c.agenda_id
                    const esCierre = c.resultado === "CIERRE"
                    const esFee = c.resultado === "FEE"
                    const esNS = c.resultado === "NO SHOW" || c.resultado === "CANCELADA"

                    return (
                      <Card
                        key={c.agenda_id || c.nombre}
                        className={cn(
                          "border-white/10 bg-zinc-900/40 transition-colors",
                          esCierre && "border-emerald-500/30 bg-emerald-500/[0.02]",
                          expandida && "border-white/20"
                        )}
                      >
                        <div className="p-3.5">
                          <div
                            className="flex cursor-pointer items-center justify-between"
                            onClick={() => setCallExpandida(expandida ? null : c.agenda_id || c.nombre)}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-white text-sm">{c.nombre}</span>
                              {c.hora && <span className="text-xs text-muted-foreground">({c.hora})</span>}
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  esCierre && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
                                  esFee && "border-blue-500/40 bg-blue-500/10 text-blue-400",
                                  esNS && "border-rose-500/40 bg-rose-500/10 text-rose-400",
                                  !esCierre && !esFee && !esNS && "border-amber-500/40 bg-amber-500/10 text-amber-400"
                                )}
                              >
                                {c.resultado}
                              </Badge>
                              {(c.resultado === "NO SHOW" || c.resultado === "CANCELADA") && c.motivo_no_show && (
                                <span className="text-xs text-rose-300/90">Motivo: {c.motivo_no_show}</span>
                              )}

                              {/* Botón visible de edición en la cabecera cerca de nombre / estado */}
                              <Button
                                type="button"
                                size="sm"
                                className="h-6 px-2.5 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  abrirEdicionLead(c)
                                }}
                              >
                                {cargandoAgendaId === c.agenda_id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Pencil className="mr-1 h-3 w-3" />}
                                Editar lead
                              </Button>

                              {/* Lead Score */}
                              <Badge variant="secondary" className="text-[10px]">
                                {c.lead_score}
                              </Badge>
                              {/* Calificada / No Calificada */}
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  c.es_calificado
                                    ? "border-blue-500/30 text-blue-400"
                                    : "border-zinc-700 text-zinc-400"
                                )}
                              >
                                {c.es_calificado ? "Calificada" : "No calificada"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs shrink-0">
                              {esCierre && (
                                <span className="font-black text-emerald-400">${c.cash_d1} USD D1</span>
                              )}
                              {c.etiqueta_reprogramada && (
                                <span
                                  className="rounded border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-purple-300"
                                  title={c.reprogramada_desde ? `Estaba agendada para el ${String(c.reprogramada_desde).slice(8, 10)}/${String(c.reprogramada_desde).slice(5, 7)}` : "Esta agenda se reprogramó"}
                                >
                                  {c.etiqueta_reprogramada}
                                </span>
                              )}
                              {c.pago_enlazado_por === "nombre" && (
                                <span
                                  className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300"
                                  title="El pago no está vinculado a esta agenda ni a la persona: se encontró por nombre y apellido. Vinculalo desde la ficha del pago."
                                >
                                  Pago por nombre
                                </span>
                              )}
                              {expandida ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                            </div>
                          </div>

                          {/* Fila secundaria: Macro Arquetipo y Subarquetipo leídos del CRM */}
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            <span className="font-medium text-zinc-300">Macro: {c.arquetipo_macro}</span>
                            {c.subarquetipo && <span> · Sub: {c.subarquetipo}</span>}
                            {c.ingresos_declarados && <span> · {c.ingresos_declarados}</span>}
                            {c.calificaba_realmente && (
                              <span className="text-blue-300 font-medium"> · Real: {c.calificaba_realmente}</span>
                            )}
                          </p>

                          {/* Detalle Expandido */}
                          {expandida && (
                            <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-xs">
                              <div className="flex items-center justify-between pb-1">
                                <span className="font-bold text-zinc-400 text-[11px] uppercase tracking-wider">Detalle de la agenda</span>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-6 px-2.5 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    abrirEdicionLead(c)
                                  }}
                                >
                                  <Pencil className="mr-1 h-3 w-3" />
                                  Editar lead
                                </Button>
                              </div>
                              {/* Grid de Atribución Separada de ESA Agenda */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded bg-zinc-950/60 p-2.5 border border-white/5">
                                <div>
                                  <span className="font-semibold text-zinc-400 block text-[11px]">Origen</span>
                                  <span className="text-zinc-200">{c.origen || "—"}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-zinc-400 block text-[11px]">Pieza de entrada</span>
                                  <span className="text-zinc-200">{c.pieza_entrada || "—"}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-zinc-400 block text-[11px]">Keyword</span>
                                  <span className="text-zinc-200">{c.keyword || "—"}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-zinc-400 block text-[11px]">Ángulo de adquisición</span>
                                  <span className="text-zinc-200">{c.angulo_adquisicion || "—"}</span>
                                </div>
                              </div>

                              {c.porque_agendo && (
                                <div>
                                  <span className="font-semibold text-zinc-400">Por qué agendó: </span>
                                  <span>{c.porque_agendo}</span>
                                </div>
                              )}
                              {c.objecion_principal && (
                                <div>
                                  <span className="font-semibold text-amber-400/90">Objeción: </span>
                                  <span>{c.objecion_principal}</span>
                                </div>
                              )}
                              {c.motivo_real && (
                                <div>
                                  <span className="font-semibold text-zinc-400">
                                    {esCierre ? "Qué lo hizo cerrar: " : "Motivo no cierre: "}
                                  </span>
                                  <span>{c.motivo_real}</span>
                                </div>
                              )}
                              {c.siguiente_paso && (
                                <div>
                                  <span className="font-semibold text-zinc-400">Siguiente paso: </span>
                                  <span>{c.siguiente_paso}</span>
                                </div>
                              )}
                              {c.fathom?.dolor_principal && (
                                <div>
                                  <span className="font-semibold text-purple-400">Fathom · Dolor: </span>
                                  <span>{c.fathom.dolor_principal}</span>
                                </div>
                              )}
                              {c.fathom?.deseo_principal && (
                                <div>
                                  <span className="font-semibold text-purple-400">Fathom · Deseo: </span>
                                  <span>{c.fathom.deseo_principal}</span>
                                </div>
                              )}
                              {c.fathom?.mencion_alex && (
                                <div>
                                  <span className="font-semibold text-purple-400">Fathom · Mención Alex: </span>
                                  <span>{c.fathom.mencion_alex}</span>
                                </div>
                              )}
                              {c.fathom?.contenido_recuerda && (
                                <div>
                                  <span className="font-semibold text-purple-400">Fathom · Contenido recordado: </span>
                                  <span>{c.fathom.contenido_recuerda}</span>
                                </div>
                              )}
                              {c.fathom?.insight_mensaje && (
                                <div className="rounded bg-purple-500/10 p-2 text-purple-300">
                                  <span className="font-bold">Insight Fathom: </span>
                                  <span>"{c.fathom.insight_mensaje}"</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Columna Derecha: Preview de WhatsApp y Copiado (5 Cols) */}
            <div className="space-y-4 lg:col-span-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400">
                  Preview para WhatsApp
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <RevisionCruces />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={recargarResumen}
                    disabled={loading}
                    className="h-8 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs flex items-center gap-1.5"
                    title="Recargar datos del reporte WhatsApp"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                    <span>Recargar</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copiarWhatsApp}
                  disabled={!textoWhatsapp || loading}
                  className="h-8 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs"
                >
                  {copiado ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                  {copiado ? "Copiado!" : "Copiar"}
                </Button>
              </div>
            </div>

            <Card className="border-white/10 bg-zinc-950 p-4 font-mono text-xs">
                <textarea
                  readOnly
                  value={textoWhatsapp}
                  rows={26}
                  className="w-full resize-none bg-transparent font-mono text-xs text-zinc-200 outline-none"
                />
              </Card>
              {/* Auditoría de cierres: mes en curso contra el mes anterior */}
              <AuditoriaMensual onAbrirFicha={abrirEdicionLead} />
            </div>
          </div>
        </TabsContent>

        {/* ============================================================== */}
        {/* TAB 2: HISTÓRICO DE REPORTES GUARDADOS */}
        {/* ============================================================== */}
        <TabsContent value="historico" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Historial de Cierres Guardados ({historico.length})
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={cargarHistorico}
              disabled={loadingHistorico}
              className="text-xs"
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loadingHistorico && "animate-spin")} />
              Recargar historial
            </Button>
          </div>

          {historico.length === 0 ? (
            <Card className="border-white/10 bg-zinc-900/30 p-8 text-center text-muted-foreground">
              Aún no hay reportes comerciales guardados en el historial. Podés guardar uno usando el botón
              "Guardar en Histórico".
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {historico.map((rep) => {
                const meta = rep.metadata || {}
                const m = meta.metricas || {}

                return (
                  <Card key={rep.id} className="border-white/10 bg-zinc-900/40 p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm">{rep.name}</h4>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(rep.fecha_guardado).toLocaleString("es-AR")}
                        </span>
                      </div>
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">
                        {rep.asset_type.replace("resumen_", "").toUpperCase()}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-y border-white/5 py-2 text-center text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Cierres</span>
                        <span className="font-bold text-emerald-400">{m.cierres || 0}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Cash D1</span>
                        <span className="font-bold text-emerald-400">
                          ${(m.cash_d1 || 0).toLocaleString("es-AR")}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Presentadas</span>
                        <span className="font-bold text-white">{m.presentadas || 0}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => verReporteGuardado(rep)}
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        Ver en Generador
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal / Dialog Completo de Edición de Lead */}
      <Dialog open={modalLeadAbierto} onOpenChange={setModalLeadAbierto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col bg-zinc-950 border-white/10 text-white p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2 text-white">
                  <Pencil className="h-4 w-4 text-emerald-400" />
                  Editar Lead: {leadEditando?.nombre}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-400 mt-1">
                  Modificá los datos comerciales, asignación de closer, llamada y contexto del lead en Agendas.
                </DialogDescription>
              </div>
            </div>

            {/* Pestañas de navegación rápida dentro de la ficha */}
            <div className="flex gap-2 pt-3">
              <button
                type="button"
                onClick={() => setTabModal("comercial")}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition", tabModal === "comercial" ? "bg-emerald-600 text-white" : "bg-white/5 text-zinc-400 hover:text-white")}
              >
                Comercial y Cierre
              </button>
              <button
                type="button"
                onClick={() => setTabModal("contacto")}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition", tabModal === "contacto" ? "bg-emerald-600 text-white" : "bg-white/5 text-zinc-400 hover:text-white")}
              >
                Contacto y Responsables
              </button>
              <button
                type="button"
                onClick={() => setTabModal("llamada")}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition", tabModal === "llamada" ? "bg-emerald-600 text-white" : "bg-white/5 text-zinc-400 hover:text-white")}
              >
                Agenda y Llamada
              </button>
              <button
                type="button"
                onClick={() => setTabModal("contexto")}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition", tabModal === "contexto" ? "bg-emerald-600 text-white" : "bg-white/5 text-zinc-400 hover:text-white")}
              >
                Contexto del Lead
              </button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-xs">
            {/* PESTAÑA 1: COMERCIAL Y CIERRE */}
            {tabModal === "comercial" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300 text-xs">Lead Scoring</Label>
                    <Select value={formEdit.lead_scoring} onValueChange={v => setFormEdit(prev => ({ ...prev, lead_scoring: v }))}>
                      <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10 text-white">
                        <SelectItem value="LEAD S">LEAD S (Calificado)</SelectItem>
                        <SelectItem value="LEAD A">LEAD A (Calificado)</SelectItem>
                        <SelectItem value="LEAD B">LEAD B (Calificado)</SelectItem>
                        <SelectItem value="LEAD C">LEAD C (Calificado)</SelectItem>
                        <SelectItem value="LEAD D">LEAD D (No calificado)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-zinc-300 text-xs">Calificaba realmente (post-call)</Label>
                    <Select value={formEdit.calificaba_realmente} onValueChange={v => setFormEdit(prev => ({ ...prev, calificaba_realmente: v }))}>
                      <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10 text-white">
                        <SelectItem value="Sin definir">Sin definir</SelectItem>
                        <SelectItem value="Si">Si</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300 text-xs">Macro Arquetipo</Label>
                    <Select value={formEdit.macro_arquetipo} onValueChange={v => setFormEdit(prev => ({ ...prev, macro_arquetipo: v }))}>
                      <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10 text-white">
                        <SelectItem value="DUEÑO DE NEGOCIO">DUEÑO DE NEGOCIO</SelectItem>
                        <SelectItem value="EMPLEADO">EMPLEADO</SelectItem>
                        <SelectItem value="ESTUDIANTE">ESTUDIANTE</SelectItem>
                        <SelectItem value="SIN CLASIFICAR">SIN CLASIFICAR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-zinc-300 text-xs">Subarquetipo</Label>
                    <Input
                      className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs placeholder:text-zinc-500 text-white"
                      placeholder="Ej. Ingeniero, Dev freelance, Editor..."
                      value={formEdit.subarquetipo}
                      onChange={e => setFormEdit(prev => ({ ...prev, subarquetipo: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300 text-xs">Objeción</Label>
                    <Select value="none" onValueChange={v => { if (v !== "none") setFormEdit(prev => ({ ...prev, objecion: v, motivo_no_cierre: objecionesDe([prev.motivo_no_cierre, v].join(OBJ_SEP)).join(OBJ_SEP) })) }}>
                      <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white">
                        <SelectValue placeholder="Agregar objeción..." />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10 text-white">
                        <SelectItem value="none">Agregar objeción…</SelectItem>
                        {MOTIVOS_NO_CIERRE_CRM.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-zinc-300 text-xs">Siguiente paso</Label>
                    <Select value={formEdit.siguiente_paso} onValueChange={v => setFormEdit(prev => ({ ...prev, siguiente_paso: v }))}>
                      <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10 text-white">
                        <SelectItem value="Seguimiento">Seguimiento</SelectItem>
                        <SelectItem value="Onboarding">Onboarding</SelectItem>
                        <SelectItem value="Volver a llamar">Volver a llamar</SelectItem>
                        <SelectItem value="Descartado">Descartado</SelectItem>
                        <SelectItem value="Esperando pago">Esperando pago</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-zinc-300 text-xs">Objeciones cargadas</Label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {objecionesDe(formEdit.motivo_no_cierre).length === 0 && <span className="text-[11px] text-zinc-500">Todavía no hay objeciones. Elegí una arriba o escribila acá abajo.</span>}
                    {objecionesDe(formEdit.motivo_no_cierre).map(o => (
                      <span key={o} className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                        {o}
                        <button type="button" aria-label={`Borrar objeción ${o}`} className="text-amber-300 hover:text-white"
                          onClick={() => setFormEdit(prev => ({ ...prev, motivo_no_cierre: objecionesDe(prev.motivo_no_cierre).filter(x => x !== o).join(OBJ_SEP) }))}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Input
                      className="h-8 flex-1 bg-zinc-900 border-white/10 text-xs placeholder:text-zinc-500 text-white"
                      placeholder="Escribí otra objeción o un detalle y tocá Agregar"
                      value={nuevaObjecion}
                      onChange={e => setNuevaObjecion(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && nuevaObjecion.trim()) {
                          e.preventDefault()
                          setFormEdit(prev => ({ ...prev, motivo_no_cierre: objecionesDe([prev.motivo_no_cierre, nuevaObjecion].join(OBJ_SEP)).join(OBJ_SEP) }))
                          setNuevaObjecion("")
                        }
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" className="h-8 border-white/10 text-xs" disabled={!nuevaObjecion.trim()}
                      onClick={() => { setFormEdit(prev => ({ ...prev, motivo_no_cierre: objecionesDe([prev.motivo_no_cierre, nuevaObjecion].join(OBJ_SEP)).join(OBJ_SEP) })); setNuevaObjecion("") }}>
                      Agregar
                    </Button>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">Se suman todas. Para sacar una, tocá la ✕.</p>
                </div>
              </div>
            )}

            {/* PESTAÑA 2: CONTACTO Y RESPONSABLES */}
            {tabModal === "contacto" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-emerald-400 font-bold text-xs flex items-center gap-1">
                      Closer que tomó la llamada
                    </Label>
                    <Select value={formEdit.closer} onValueChange={v => setFormEdit(prev => ({ ...prev, closer: v }))}>
                      <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-emerald-500/30 text-xs font-semibold text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10 text-white">
                        {["Nahuel", "Cristian", "Alex", "Tobias", "Bener", "Gino", "Libre / Recontacto", "Sin Closer"].map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-zinc-300 text-xs">Setter asignado</Label>
                    <Select value={formEdit.setter || "none"} onValueChange={v => setFormEdit(prev => ({ ...prev, setter: v === "none" ? "" : v }))}>
                      <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white">
                        <SelectValue placeholder="Sin setter" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10 text-white">
                        <SelectItem value="none">Sin Setter</SelectItem>
                        {["Maximo", "Andres", "Santi", "Cesar", "Lukas"].map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-zinc-300 text-xs">WhatsApp / Teléfono</Label>
                    <Input
                      className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white"
                      value={formEdit.telefono}
                      onChange={e => setFormEdit(prev => ({ ...prev, telefono: e.target.value }))}
                      placeholder="+54 9 11..."
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-300 text-xs">Email</Label>
                    <Input
                      className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white"
                      value={formEdit.email}
                      onChange={e => setFormEdit(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="email@..."
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-300 text-xs">Instagram</Label>
                    <Input
                      className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white"
                      value={formEdit.instagram}
                      onChange={e => setFormEdit(prev => ({ ...prev, instagram: e.target.value }))}
                      placeholder="@usuario"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA 3: AGENDA Y LLAMADA */}
            {tabModal === "llamada" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-purple-300 font-bold text-xs">
                      Estado de la llamada
                    </Label>
                    <Select value={formEdit.estado || "none"} onValueChange={v => setFormEdit(prev => ({ ...prev, estado: v === "none" ? "" : v }))}>
                      <SelectTrigger className="mt-1 h-8 bg-zinc-900 border-purple-500/30 text-xs font-semibold text-white">
                        <SelectValue placeholder="Seleccionar estado..." />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10 text-white">
                        <SelectItem value="Reprogramó">🟣 Reprogramó</SelectItem>
                        <SelectItem value="Reprogramó y no se presentó">🟣🔴 Reprogramó y no se presentó</SelectItem>
                        <SelectItem value="Reprogramó y no cerró">🟣🟡 Reprogramó y no cerró</SelectItem>
                        <SelectItem value="Se presentó">🟢 Se presentó</SelectItem>
                        <SelectItem value="No se presentó">🔴 No se presentó (No Show)</SelectItem>
                        <SelectItem value="Canceló en precall">⛔ Canceló en precall</SelectItem>
                        <SelectItem value="Adentro en Call">🏆 Adentro en Call (Cierre)</SelectItem>
                        <SelectItem value="Adentro en FUP">🔄 Adentro en FUP</SelectItem>
                        <SelectItem value="Fee">💳 Fee pagado</SelectItem>
                        <SelectItem value="Grupo Precall Creado">🔷 Grupo Precall Creado</SelectItem>
                        <SelectItem value="Pendiente">⏳ Pendiente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-zinc-300 text-xs">
                        Fecha y hora de llamada {formEdit.estado === "Reprogramó" ? "(Reprogramar)" : ""}
                      </Label>
                      <button
                        type="button"
                        onClick={() => {
                          const horaActual = formEdit.fecha_closer && formEdit.fecha_closer.length >= 16 ? formEdit.fecha_closer.slice(11, 16) : "10:00"
                          setFormEdit(prev => ({ ...prev, fecha_closer: `${fecha}T${horaActual || "10:00"}` }))
                          toast.info(`Fecha ajustada al día del reporte (${fecha})`)
                        }}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-medium cursor-pointer"
                      >
                        Mover a fecha del reporte ({fecha})
                      </button>
                    </div>
                    <Input
                      type="datetime-local"
                      className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white"
                      value={formEdit.fecha_closer}
                      onChange={e => setFormEdit(prev => ({ ...prev, fecha_closer: e.target.value }))}
                    />
                  </div>
                </div>

                {formEdit.estado.startsWith("Reprogramó y") && (
                  <div>
                    <Label className="text-purple-300 font-bold text-xs">¿Para qué fecha estaba agendada antes de reprogramar?</Label>
                    <Input
                      type="date"
                      className="mt-1 h-8 bg-zinc-900 border-purple-500/30 text-xs text-white"
                      value={formEdit.reprogramada_desde}
                      onChange={e => setFormEdit(prev => ({ ...prev, reprogramada_desde: e.target.value }))}
                    />
                    <p className="mt-1 text-[11px] text-zinc-500">Con esto el lead aparece en las dos fechas del Resumen y queda marcado como reprogramado. Si ya venía de una reprogramación, la fecha está cargada.</p>
                  </div>
                )}

                {formEdit.estado === "Canceló en precall" && (
                  <div>
                    <Label className="text-orange-300 font-bold text-xs">Motivo de la cancelación en precall</Label>
                    <textarea
                      className="mt-1 min-h-[64px] w-full rounded-md border border-orange-500/30 bg-zinc-900 px-3 py-2 text-xs text-white"
                      placeholder="Ej.: avisó en el grupo que no tiene la plata, se le complicó el horario, ya no le interesa…"
                      value={formEdit.motivo_no_show}
                      onChange={e => setFormEdit(prev => ({ ...prev, motivo_no_show: e.target.value }))}
                    />
                    <p className="mt-1 text-[11px] text-zinc-500">Sale al lado del lead en el resumen diario y mensual, en No shows / Canceladas.</p>
                  </div>
                )}

                {(formEdit.estado === "No se presentó" || formEdit.estado === "Reprogramó y no se presentó") && (
                  <div>
                    <Label className="text-rose-300 font-bold text-xs">Motivo del no show</Label>
                    <textarea
                      className="mt-1 min-h-[64px] w-full rounded-md border border-rose-500/30 bg-zinc-900 px-3 py-2 text-xs text-white"
                      placeholder="Ej.: no contestó el WhatsApp de confirmación, avisó que estaba trabajando, se le cortó internet…"
                      value={formEdit.motivo_no_show}
                      onChange={e => setFormEdit(prev => ({ ...prev, motivo_no_show: e.target.value }))}
                    />
                    <p className="mt-1 text-[11px] text-zinc-500">Sale al lado del lead en el reporte diario de llamadas.</p>
                  </div>
                )}

                <div>
                  <Label className="text-zinc-300 text-xs">Link grabación Fathom</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      className="h-8 bg-zinc-900 border-white/10 text-xs text-white flex-1"
                      placeholder="https://fathom.video/..."
                      value={formEdit.link_fathom}
                      onChange={e => setFormEdit(prev => ({ ...prev, link_fathom: e.target.value }))}
                    />
                    {formEdit.link_fathom && (
                      <a href={formEdit.link_fathom} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded text-xs flex items-center gap-1 font-semibold">
                        Ver <ArrowUpRight className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA 4: CONTEXTO DEL LEAD */}
            {tabModal === "contexto" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300 text-xs">Problema actual</Label>
                    <Input
                      className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white"
                      value={formEdit.problema_actual}
                      onChange={e => setFormEdit(prev => ({ ...prev, problema_actual: e.target.value }))}
                      placeholder="Ej: No sé cómo vender IA"
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-300 text-xs">Hace cuánto arrastra el problema</Label>
                    <Input
                      className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white"
                      value={formEdit.tiempo_problema}
                      onChange={e => setFormEdit(prev => ({ ...prev, tiempo_problema: e.target.value }))}
                      placeholder="Ej: Hace meses"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300 text-xs">Intentos previos</Label>
                    <Input
                      className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white"
                      value={formEdit.intentos_previos}
                      onChange={e => setFormEdit(prev => ({ ...prev, intentos_previos: e.target.value }))}
                      placeholder="Ej: Intentó vender de forma autodidacta"
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-300 text-xs">Motivo de urgencia</Label>
                    <Input
                      className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white"
                      value={formEdit.motivo_urgencia}
                      onChange={e => setFormEdit(prev => ({ ...prev, motivo_urgencia: e.target.value }))}
                      placeholder="Ej: Quiere ganar más / aprovechar IA"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300 text-xs">Ingreso mensual</Label>
                    <Input
                      className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white"
                      value={formEdit.ingresos}
                      onChange={e => setFormEdit(prev => ({ ...prev, ingresos: e.target.value }))}
                      placeholder="Ej: +$3.000 /MES"
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-300 text-xs">Capacidad de inversión</Label>
                    <Input
                      className="mt-1 h-8 bg-zinc-900 border-white/10 text-xs text-white"
                      value={formEdit.inversion}
                      onChange={e => setFormEdit(prev => ({ ...prev, inversion: e.target.value }))}
                      placeholder="Ej: +$500 / -$500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-white/10 flex justify-between items-center bg-zinc-950">
            <span className="text-[11px] text-zinc-500">
              Al guardar se actualiza agendas y se sincroniza la atribución al closer real.
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/10 hover:bg-white/10 text-xs text-white"
                onClick={() => setModalLeadAbierto(false)}
                disabled={guardandoLead}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                onClick={guardarEdicionLead}
                disabled={guardandoLead}
              >
                {guardandoLead && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {guardandoLead ? "Guardando en Agendas..." : "Guardar cambios"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Botón Globo Flotante en la esquina inferior */}
      <button
        type="button"
        onClick={() => setGloboBuscadorAbierto(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 shadow-2xl shadow-emerald-500/40 border-2 border-emerald-400/50 text-xs font-bold transition-all hover:scale-105 active:scale-95 group"
        title="Abrir Globo Buscador de Leads (Ctrl+K)"
      >
        <span className="text-base group-hover:rotate-12 transition-transform">🎈</span>
        <span>Globo Buscador</span>
        <Search className="h-3.5 w-3.5 ml-0.5 text-emerald-200" />
      </button>

      {/* Dialog Emergente del Globo Buscador de Leads */}
      <Dialog open={globoBuscadorAbierto} onOpenChange={setGloboBuscadorAbierto}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-zinc-950 border-emerald-500/30 text-white shadow-2xl">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-white/10">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 bg-emerald-500/10 text-xs">
                🎈 Globo Buscador de Leads
              </Badge>
              <span className="text-xs text-zinc-400">
                Fecha activa: <strong className="text-emerald-300 font-semibold">{fecha}</strong>
              </span>
            </div>
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2 mt-2">
              <span>🎈 Buscador Universal de Leads</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 mt-1">
              Buscá cualquier lead en Exposure OS por nombre, teléfono o @instagram para auditar sus agendas, moverlo a la fecha de este reporte ({fecha}) o abrir su ficha comercial.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pt-4">
            <div className="relative">
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-zinc-900/90 px-3.5 py-2.5 text-sm focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/25 transition-all shadow-inner">
                <Search className="h-4 w-4 text-emerald-400 shrink-0" />
                <Input
                  autoFocus
                  placeholder="Escribí el nombre, teléfono o @instagram del lead..."
                  value={busquedaLead}
                  onChange={(e) => setBusquedaLead(e.target.value)}
                  className="h-7 border-0 bg-transparent p-0 text-sm text-white placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                {busquedaLead && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-zinc-400 hover:text-white"
                    onClick={() => {
                      setBusquedaLead("")
                      setResultadosBusqueda([])
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
                {buscandoLead && <Loader2 className="h-4 w-4 animate-spin text-emerald-400 shrink-0" />}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            {busquedaLead.trim().length < 2 ? (
              <div className="p-8 text-center text-xs text-zinc-500 space-y-2">
                <span className="text-3xl block">🎈</span>
                <p className="text-zinc-400 font-medium">Globo Buscador Activo</p>
                <p className="text-zinc-500">Escribí al menos 2 caracteres para buscar leads en toda la base de datos del CRM.</p>
              </div>
            ) : buscandoLead ? (
              <div className="p-8 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                <span>Buscando leads en el CRM...</span>
              </div>
            ) : resultadosBusqueda.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No se encontraron leads con &quot;{busquedaLead}&quot; en el CRM.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider pb-1">
                  Resultados encontrados ({resultadosBusqueda.length})
                </div>
                {resultadosBusqueda.map((lead: any) => {
                  const fechaCorta = lead.fecha_closer ? lead.fecha_closer.slice(0, 10) : "Sin fecha"
                  const horaCorta = lead.fecha_closer ? lead.fecha_closer.slice(11, 16) : ""
                  const esMismoDia = fechaCorta === fecha
                  const moviendo = moviendoLeadId === lead.id

                  return (
                    <div
                      key={lead.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-zinc-900/60 p-3 hover:border-emerald-500/40 hover:bg-zinc-900 transition-all text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white truncate">
                            {lead.nombre || "Sin nombre"}
                          </span>
                          {lead.calificacion && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] px-1.5 py-0 h-4 border-white/10",
                                lead.calificacion.includes("A") && "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
                                lead.calificacion.includes("B") && "border-blue-500/40 text-blue-300 bg-blue-500/10",
                                lead.calificacion.includes("C") && "border-amber-500/40 text-amber-300 bg-amber-500/10",
                                lead.calificacion.includes("D") && "border-zinc-500/40 text-zinc-400 bg-zinc-500/10"
                              )}
                            >
                              {lead.calificacion}
                            </Badge>
                          )}
                          {lead.closer && (
                            <span className="text-[10px] text-zinc-400">
                              Closer: <strong className="text-zinc-300">{lead.closer}</strong>
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-400 flex-wrap">
                          {lead.telefono && <span>📞 {lead.telefono}</span>}
                          {lead.instagram && <span>📸 @{lead.instagram.replace(/^@/, "")}</span>}
                          <span className={cn(
                            "font-medium",
                            esMismoDia ? "text-emerald-400" : "text-amber-400"
                          )}>
                            📅 {esMismoDia ? `En este día (${horaCorta || "10:00"})` : `Agendado: ${fechaCorta} ${horaCorta}`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={moviendo}
                          onClick={() => moverLeadAFecha(lead, fecha)}
                          className="h-7 text-[11px] px-2.5 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
                          title={`Mover lead al día del reporte (${fecha})`}
                        >
                          {moviendo ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <CalendarDays className="h-3 w-3 mr-1 text-emerald-400" />
                          )}
                          Mover a {fecha}
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setGloboBuscadorAbierto(false);
                            abrirEdicionLead(lead);
                          }}
                          className="h-7 text-[11px] px-2 text-zinc-300 hover:text-white hover:bg-white/5"
                          title="Abrir ficha completa del lead"
                        >
                          <Pencil className="h-3 w-3 mr-1 text-zinc-400" />
                          Ficha
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-[11px] text-zinc-500">
              Tip: También podés abrir este globo pulsando <strong>Ctrl + K</strong>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGloboBuscadorAbierto(false)}
              className="text-xs border-white/10"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal / Dialog de Auditoría Interactiva de Métricas */}
      <Dialog open={Boolean(metricaAuditoriaKey)} onOpenChange={(open) => !open && setMetricaAuditoriaKey(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-zinc-950 border-white/10 text-white">
          {(() => {
            if (!metricaAuditoriaKey || !metricas) return null
            const tcv = datos?.tasa_cierre_vigente

            // Definición canónica de cada métrica
            const defs: Record<string, {
              titulo: string
              categoria: string
              valor: string | number
              color: string
              definicion: string
              formula: string
              fuente: string
              criterio: (c: CallDetalle) => boolean
            }> = {
              programadas: {
                titulo: "Llamadas Programadas",
                categoria: "Volumen Total",
                valor: `${metricas.programadas} calls`,
                color: "emerald",
                definicion: "Total de llamadas únicas agendadas en el CRM cuya fecha cae en el período seleccionado. Ningún lead repetido computa doble.",
                formula: "Conteo de agendas únicas por persona con fecha_closer en el período",
                fuente: "CRM Agendas (iClosed + Agendas manuales). Excluye archivadas manualmente.",
                criterio: () => true,
              },
              presentadas: {
                titulo: "Llamadas Presentadas (Show Rate)",
                categoria: "Asistencia Comercial",
                valor: `${metricas.presentadas} calls (${metricas.show_rate_pct.toFixed(1).replace(".", ",")} %)`,
                color: "emerald",
                definicion: "Llamadas donde el lead asistió efectivamente a la sesión con el closer. Se consideran asistidas aquellas con show=true o resultado Adentro, Fee o Cierre.",
                formula: "(Llamadas Presentadas ÷ Llamadas Programadas) × 100",
                fuente: "CRM Agendas + Reconciliación con grabaciones de Fathom. Excluye No Shows y Canceladas.",
                criterio: (c) => c.resultado !== "NO SHOW" && c.resultado !== "CANCELADA",
              },
              calificadas_presentadas: {
                titulo: "Calificadas Presentadas",
                categoria: "Calidad Comercial",
                valor: `${metricas.calificadas_presentadas} calls (${metricas.show_rate_calificados_pct.toFixed(1).replace(".", ",")} %)`,
                color: "blue",
                definicion: "Leads calificados (LEAD S, A o B, o calificación confirmada) que además asistieron a la llamada con el closer.",
                formula: "(Calificadas Presentadas ÷ Calificadas Programadas) × 100",
                fuente: "Lead Scoring de Exposure OS + Validación del Closer.",
                criterio: (c) => Boolean(c.es_calificado && c.resultado !== "NO SHOW" && c.resultado !== "CANCELADA"),
              },
              cierres: {
                titulo: "Cierres & Tasa de Cierre (TC)",
                categoria: "Conversión",
                valor: `${metricas.cierres} cierres (${metricas.tc_calificadas_pct.toFixed(1).replace(".", ",")} %)`,
                color: "emerald",
                definicion: "Ventas concretadas de clientes que ingresaron formalmente al programa Exposure. Se valida por pago confirmado en el CRM o registro de cierre del closer.",
                formula: "(Cierres ÷ Calificadas Presentadas) × 100",
                fuente: "CRM Pagos + Estados de Cierre en Agendas.",
                criterio: (c) => c.resultado === "CIERRE" || c.resultado === "FEE",
              },
              cash_d1: {
                titulo: "Cash Recaudado Día 1 (Cash D1)",
                categoria: "Finanzas",
                valor: `${metricas.cash_d1.toLocaleString("es-AR")} USD`,
                color: "emerald",
                definicion: "Dinero cobrado inmediatamente en la primera llamada de cierre o durante el mismo día del evento comercial (Stripe, USDT, transferencias).",
                formula: "Suma de pagos confirmados vinculados a la llamada / persona en el período",
                fuente: "CRM Pagos (operaciones aprobadas y libres de duplicados).",
                criterio: (c) => c.cash_d1 > 0,
              },
              ticket_total: {
                titulo: "Ticket Contratado",
                categoria: "Facturación",
                valor: `${metricas.ticket_total.toLocaleString("es-AR")} USD`,
                color: "zinc",
                definicion: "Valor contractual total pactado por los cierres del período (ticket base estándar de $1.500 USD por programa cerrado).",
                formula: "Cierres × $1.500 USD (o suma de acuerdos contractuales)",
                fuente: "Contratos de Venta del CRM.",
                criterio: (c) => c.resultado === "CIERRE",
              },
              tc_vigente_todas: {
                titulo: "Tasa de cierre sobre todas las presentadas",
                categoria: "Conversión · criterio vigente",
                valor: `${tcv?.cierres || 0}/${tcv?.presentadas || 0} (${(tcv?.tc_pct || 0).toFixed(1).replace(".", ",")} %)`,
                color: "emerald",
                definicion: "Cierres sobre todas las llamadas en las que el lead se presentó, califique o no. Un cierre cuenta como presentada aunque al lead le falte la marca de show.",
                formula: "(Cierres ÷ Presentadas) × 100",
                fuente: "CRM Agendas + CRM Pagos.",
                criterio: (c) => Boolean(c.presento),
              },
              tc_vigente_calificadas: {
                titulo: "Tasa de cierre sobre calificadas",
                categoria: "Conversión · criterio vigente",
                valor: `${tcv?.cierres_calificados || 0}/${tcv?.calificadas_presentadas || 0} (${(tcv?.tc_calificadas_pct || 0).toFixed(1).replace(".", ",")} %)`,
                color: "blue",
                definicion: "Criterio vigente desde el 08/10/2026: el lead declaró en iClosed que gana USD 1.000 a 3.000 por mes y encaja en un arquetipo foco (9 a 5, universitario, sabe IA pero no cómo venderla o dueño de negocio tradicional). No usa el Lead S/A/B/C.",
                formula: "(Cierres calificados ÷ Calificadas presentadas) × 100",
                fuente: "Resúmenes de setting del grupo de ventas, clasificados en Marketing → Tipos de agenda.",
                criterio: (c) => Boolean(c.presento && c.calificada_vigente === true),
              },
              tc_vigente_no_calificadas: {
                titulo: "Tasa de cierre sobre no calificadas",
                categoria: "Conversión · criterio vigente",
                valor: `${tcv?.cierres_no_calificados || 0}/${tcv?.no_calificadas_presentadas || 0} (${(tcv?.tc_no_calificadas_pct || 0).toFixed(1).replace(".", ",")} %)`,
                color: "zinc",
                definicion: "Presentadas cuyo resumen de setting dice que no califica con el criterio vigente. Las que no tienen resumen no entran acá ni en calificadas.",
                formula: "(Cierres no calificados ÷ No calificadas presentadas) × 100",
                fuente: "Resúmenes de setting del grupo de ventas, clasificados en Marketing → Tipos de agenda.",
                criterio: (c) => Boolean(c.presento && c.calificada_vigente === false),
              },
              dueno_negocio: {
                titulo: "Arquetipo: Dueño de Negocio",
                categoria: "Segmentación",
                valor: `${arq?.dueno_negocio.total || 0} calls | ${arq?.dueno_negocio.calificadas || 0} calif | ${arq?.dueno_negocio.presentadas_calificadas || 0} pres calif | ${arq?.dueno_negocio.cierres || 0} cierres (${arq?.dueno_negocio.cierres_calificados || 0} calif, ${arq?.dueno_negocio.cierres_no_calificados || 0} no calif)`,
                color: "emerald",
                definicion: "Dueños de agencias, ecommerce o negocios de servicios que buscan escalar integrando soluciones de IA.",
                formula: "Ocupación catalogada bajo el macro DUEÑO DE NEGOCIO",
                fuente: "Triage iClosed + Entrevista de Triage.",
                criterio: (c) => c.arquetipo_macro === "DUEÑO DE NEGOCIO",
              },
              empleado: {
                titulo: "Arquetipo: Empleado (9 a 5)",
                categoria: "Segmentación",
                valor: `${arq?.empleado.total || 0} calls | ${arq?.empleado.calificadas || 0} calif | ${arq?.empleado.presentadas_calificadas || 0} pres calif | ${arq?.empleado.cierres || 0} cierres (${arq?.empleado.cierres_calificados || 0} calif, ${arq?.empleado.cierres_no_calificados} no calif)`,
                color: "blue",
                definicion: "Personas en relación de dependencia que buscan una vía de salida o ingresos extra superiores a su sueldo vendiendo IA.",
                formula: "Ocupación catalogada bajo el macro EMPLEADO",
                fuente: "Triage iClosed + Entrevista de Triage.",
                criterio: (c) => c.arquetipo_macro === "EMPLEADO",
              },
              estudiante: {
                titulo: "Arquetipo: Estudiante",
                categoria: "Segmentación",
                valor: `${arq?.estudiante.total || 0} calls | ${arq?.estudiante.calificadas || 0} calif | ${arq?.estudiante.presentadas_calificadas || 0} pres calif | ${arq?.estudiante.cierres || 0} cierres (${arq?.estudiante.cierres_calificados || 0} calif, ${arq?.estudiante.cierres_no_calificados || 0} no calif)`,
                color: "amber",
                definicion: "Jóvenes universitarios o autodidactas con hambre de emprender y adquirir habilidades técnicas de alto valor.",
                formula: "Ocupación catalogada bajo el macro ESTUDIANTE",
                fuente: "Triage iClosed + Entrevista de Triage.",
                criterio: (c) => c.arquetipo_macro === "ESTUDIANTE",
              },
              sin_clasificar: {
                titulo: "Arquetipo: Sin Clasificar",
                categoria: "Segmentación",
                valor: `${arq?.sin_clasificar.total || 0} calls | ${arq?.sin_clasificar.calificadas || 0} calif | ${arq?.sin_clasificar.presentadas_calificadas || 0} pres calif | ${arq?.sin_clasificar.cierres || 0} cierres (${arq?.sin_clasificar.cierres_calificados || 0} calif, ${arq?.sin_clasificar.cierres_no_calificados || 0} no calif)`,
                color: "zinc",
                definicion: "Leads cuya ocupación o arquetipo aún no fue completado en el formulario o durante la llamada.",
                formula: "Leads con ocupación pendiente o no mapeada",
                fuente: "Formulario de agenda.",
                criterio: (c) => c.arquetipo_macro === "SIN CLASIFICAR" || !c.arquetipo_macro,
              },
            }

            const info = defs[metricaAuditoriaKey]
            if (!info) return null

            const leadsAsociados = callsUnicas.filter(info.criterio)

            return (
              <>
                <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs">
                      {info.categoria}
                    </Badge>
                    <span className="text-xs text-zinc-400 font-mono">
                      Período: <strong className="text-white">{periodo.toUpperCase()} ({fecha})</strong>
                    </span>
                  </div>
                  <DialogTitle className="text-xl font-bold text-white flex items-center justify-between mt-2">
                    <span>{info.titulo}</span>
                    <span className="text-emerald-400 font-mono text-2xl font-black">{info.valor}</span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-zinc-400 mt-1">
                    {info.definicion}
                  </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {/* Cajas de fórmula y fuente */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg border border-white/10 bg-zinc-900/60 space-y-1">
                      <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                        Fórmula de cálculo
                      </div>
                      <p className="text-zinc-200 font-mono text-[11px]">{info.formula}</p>
                    </div>

                    <div className="p-3 rounded-lg border border-white/10 bg-zinc-900/60 space-y-1">
                      <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                        <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
                        Fuente de datos
                      </div>
                      <p className="text-zinc-300 text-[11px]">{info.fuente}</p>
                    </div>
                  </div>

                  {/* Listado de leads componentes */}
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <span className="text-xs font-bold uppercase tracking-wider text-white">
                        Leads que componen esta métrica ({leadsAsociados.length})
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        100% libres de duplicados
                      </span>
                    </div>

                    {leadsAsociados.length === 0 ? (
                      <div className="p-6 text-center text-xs text-zinc-500">
                        No hay leads registrados para este criterio en el período seleccionado.
                      </div>
                    ) : (
                      <div className="divide-y divide-white/5 max-h-60 overflow-y-auto pr-1 mt-2">
                        {leadsAsociados.map((c) => (
                          <div key={c.agenda_id || c.nombre} className="py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white truncate">{c.nombre}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-white/10 text-zinc-300">
                                  {c.lead_score || "SIN SCORE"}
                                </Badge>
                                {metricaAuditoriaKey.startsWith("tc_vigente") && (
                                  <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4", c.calificada_vigente ? "border-blue-500/40 text-blue-300" : "border-white/10 text-zinc-400")}>
                                    {c.calificada_vigente === null || c.calificada_vigente === undefined ? "Sin resumen" : `${c.calificada_vigente ? "Calificada" : "No calificada"}${c.ingreso_setting ? ` · ${c.ingreso_setting}` : ""}`}
                                  </Badge>
                                )}
                                {!metricaAuditoriaKey.startsWith("tc_vigente") && c.es_calificado && (
                                  <Badge className="bg-blue-500/20 text-blue-300 text-[9px] px-1 py-0 h-3.5 border-0">
                                    Calificada
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-0.5">
                                <span>Closer: <strong className="text-zinc-300">{c.closer}</strong></span>
                                {c.hora && <span>⏰ {c.hora}</span>}
                                {c.resultado && (
                                  <span className={cn(
                                    "font-semibold",
                                    c.resultado === "CIERRE" && "text-emerald-400",
                                    c.resultado === "FEE" && "text-purple-400",
                                    c.resultado === "NO SHOW" && "text-rose-400",
                                    c.resultado === "NO CIERRE" && "text-zinc-400"
                                  )}>
                                    {c.resultado}
                                  </span>
                                )}
                                {c.cash_d1 > 0 && <span className="text-emerald-400 font-bold">${c.cash_d1} USD</span>}
                              </div>
                            </div>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setMetricaAuditoriaKey(null)
                                abrirEdicionLead(c)
                              }}
                              className="h-7 text-xs px-2.5 text-zinc-300 hover:text-white hover:bg-white/10 shrink-0"
                            >
                              <Pencil className="h-3 w-3 mr-1 text-zinc-400" />
                              Ver ficha
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className="px-6 py-3 border-t border-white/10 flex justify-end bg-zinc-900/50">
                  <Button variant="outline" size="sm" onClick={() => setMetricaAuditoriaKey(null)} className="h-8 text-xs border-white/10 text-white">
                    Cerrar Auditoría
                  </Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
