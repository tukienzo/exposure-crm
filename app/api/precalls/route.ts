import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { MODELO_MENSUAL, resumirPeriodo, sumarDias } from "@/lib/precalls"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// Pantalla /precalls. GET no llama nunca a la IA: lee chats, agendas y resúmenes ya guardados.
// Los mensajes de cada chat se leen con GET /api/whatsapp?chat=… y las preguntas puntuales van por POST /api/whatsapp.
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const desde = sp.get("desde") || sumarDias(new Date().toISOString().slice(0, 10), -30)
    const hasta = sp.get("hasta") || sumarDias(new Date().toISOString().slice(0, 10), 7)
    const sb = createSupabaseAdmin()
    const { data: chats, error } = await sb.from("precall_chats").select("*").order("ultimo_msg_at", { ascending: false }).limit(2000)
    if (error) {
      if (/precall_chats/.test(error.message)) return NextResponse.json({ sinTablas: true, tarjetas: [], sinVincular: [], resumenes: [] })
      throw new Error(error.message)
    }
    const ids = [...new Set((chats || []).map((c) => c.agenda_id).filter(Boolean))] as string[]
    const agendas: Array<{ id: string; nombre: string | null; fecha_closer: string | null; estado: string | null; closer: string | null; setter: string | null; telefono: string | null }> = []
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await sb.from("agendas").select("id,nombre,fecha_closer,estado,closer,setter,telefono").in("id", ids.slice(i, i + 300))
      agendas.push(...(data || []))
    }
    const porId = new Map(agendas.map((a) => [a.id, a]))
    const enRango = (f: string | null) => !!f && f.slice(0, 10) >= desde && f.slice(0, 10) <= hasta
    // Una tarjeta por agenda (puede tener grupo y 1 a 1).
    const tarjetas = new Map<string, { agenda: (typeof agendas)[number]; chats: typeof chats; mensajes: number; ultimo_msg_at: string | null; ultimo_texto: string | null; ultimo_autor: string | null }>()
    for (const c of chats || []) {
      const a = c.agenda_id ? porId.get(c.agenda_id) : null
      if (!a || !enRango(a.fecha_closer || c.ultimo_msg_at)) continue
      const t = tarjetas.get(a.id) || { agenda: a, chats: [], mensajes: 0, ultimo_msg_at: null, ultimo_texto: null, ultimo_autor: null }
      t.chats!.push(c)
      t.mensajes += c.mensajes || 0
      if (!t.ultimo_msg_at || (c.ultimo_msg_at && c.ultimo_msg_at > t.ultimo_msg_at)) { t.ultimo_msg_at = c.ultimo_msg_at; t.ultimo_texto = c.ultimo_texto; t.ultimo_autor = c.ultimo_autor }
      tarjetas.set(a.id, t)
    }
    const sinVincular = (chats || []).filter((c) => !c.agenda_id && enRango(c.ultimo_msg_at))
    const { data: resumenes } = await sb.from("precall_resumenes").select("periodo,alcance,fecha_inicio,fecha_fin,texto,modelo,mensajes_usados,generado_at")
      .gte("fecha_fin", sumarDias(desde, -31)).lte("fecha_inicio", hasta).order("fecha_inicio", { ascending: false }).limit(1000)
    return NextResponse.json({
      tarjetas: [...tarjetas.values()].sort((x, y) => String(y.agenda.fecha_closer || "").localeCompare(String(x.agenda.fecha_closer || ""))),
      sinVincular,
      resumenes: resumenes || [],
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST { mes: "AAAA-MM" } → resumen mensual con Sonnet, solo cuando alguien lo pide. Se arma con los diarios guardados.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const mes = String(body.mes || "")
    if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: "Falta el mes (AAAA-MM)" }, { status: 400 })
    const inicio = `${mes}-01`
    const [y, m] = mes.split("-").map(Number)
    const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    const r = await resumirPeriodo(createSupabaseAdmin(), "mensual", inicio, fin, MODELO_MENSUAL)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
