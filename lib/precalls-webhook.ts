// Entrada del webhook de 2chat para Pre-calls (la usan /api/webhooks/2chat-precall y /api/webhooks/2chat-precall/<token>).
import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { filaDesde2chat } from "@/lib/precalls"

export async function recibir(request: Request, tokenCamino?: string) {
  const token = tokenCamino || new URL(request.url).searchParams.get("token") || request.headers.get("x-webhook-secret")
  if (!process.env.TWOTCHAT_WEBHOOK_SECRET || token !== process.env.TWOTCHAT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const payload = await request.json().catch(() => null)
  const fila = payload && typeof payload === "object" ? filaDesde2chat(payload) : null
  if (!fila) return NextResponse.json({ ignored: "sin chat o sin id" })
  const { error } = await createSupabaseAdmin().from("crm_whatsapp_messages").upsert(fila, { onConflict: "chat_id,msg_id", ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
