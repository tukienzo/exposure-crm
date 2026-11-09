import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { filaDesde2chat } from "@/lib/precalls"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// Webhook de 2chat SOLO DE LECTURA para Pre-calls (09/11/2026): guarda cada mensaje que ve el número de la empresa
// (grupos de precall y chats 1 a 1) en crm_whatsapp_messages. No responde ni manda nada a WhatsApp.
// Se suscribe en app.2chat.io → Developers → Webhooks con la URL
//   https://exposure-crm-nu.vercel.app/api/webhooks/2chat-precall?token=<TWOTCHAT_WEBHOOK_SECRET>
// a los eventos de mensajes de grupo y de chat 1 a 1 (recibidos y enviados). 2chat no firma: el secreto va en la URL.
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || request.headers.get("x-webhook-secret")
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
