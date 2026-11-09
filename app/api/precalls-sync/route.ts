import { NextResponse } from "next/server"
import { authorizePreviewSync } from "@/lib/integration-auth"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { hoyArgentina, lunesDe, MODELO_DIARIO, resumirDia, resumirPeriodo, sincronizarChats, sumarDias } from "@/lib/precalls"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Cron de Pre-calls (Bearer CRON_SECRET, como los demás crons).
//   ?paso=vincular  → cada 15 min: lee solo los mensajes nuevos y actualiza precall_chats + el vínculo con la agenda.
//   ?paso=resumen   → una vez por día: resumen de ayer (y de los 2 días anteriores si faltan) con Haiku; los lunes,
//                     el semanal de la semana que terminó, armado con los diarios. Nunca relee días ya resumidos.
//   &fecha=AAAA-MM-DD fuerza un día puntual (sin backfill masivo: un día por llamada).
export async function GET(request: Request) {
  const auth = authorizePreviewSync(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const url = new URL(request.url)
  const paso = url.searchParams.get("paso") || "vincular"
  const sb = createSupabaseAdmin()
  try {
    if (paso === "vincular") return NextResponse.json({ ok: true, ...(await sincronizarChats(sb)) })
    if (paso === "resumen") {
      await sincronizarChats(sb)
      const fecha = url.searchParams.get("fecha")
      const ayer = sumarDias(hoyArgentina(), -1)
      const dias = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? [fecha] : [sumarDias(ayer, -2), sumarDias(ayer, -1), ayer]
      const resultados: unknown[] = []
      for (const d of dias) resultados.push(await resumirDia(sb, d))
      // Ayer fue domingo → semanal de lunes a domingo.
      if (!fecha && new Date(`${ayer}T12:00:00Z`).getUTCDay() === 0) {
        const lunes = lunesDe(ayer)
        resultados.push(await resumirPeriodo(sb, "semanal", lunes, ayer, MODELO_DIARIO))
      }
      return NextResponse.json({ ok: true, resultados })
    }
    return NextResponse.json({ error: "paso desconocido" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
