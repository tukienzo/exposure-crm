import { NextResponse } from "next/server"
import { recibir } from "@/lib/precalls-webhook"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// Webhook de 2chat SOLO DE LECTURA para Pre-calls (09/11/2026): guarda cada mensaje que ve el número de la empresa
// (grupos de precall y chats 1 a 1) en crm_whatsapp_messages. No responde ni manda nada a WhatsApp.
// Se suscribe en app.2chat.io → Developers → Webhooks con la URL
//   https://exposure-crm-nu.vercel.app/api/webhooks/2chat-precall/<TWOTCHAT_WEBHOOK_SECRET>
// (el token va en el camino porque 2chat descarta el ?token=; también se acepta ?token= o el header x-webhook-secret).
export async function POST(request: Request) {
  return recibir(request)
}

// 2chat prueba la URL con HEAD/GET al guardar el webhook: se responde 200 sin hacer nada.
export async function GET() { return NextResponse.json({ ok: true }) }
export async function HEAD() { return new NextResponse(null, { status: 200 }) }
