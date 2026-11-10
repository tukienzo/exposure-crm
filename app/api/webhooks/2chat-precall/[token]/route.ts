import { NextResponse } from "next/server"
import { recibir } from "@/lib/precalls-webhook"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// Misma entrada que /api/webhooks/2chat-precall, con el token en el camino: /api/webhooks/2chat-precall/<token>.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return recibir(request, decodeURIComponent(token))
}
export async function GET() { return NextResponse.json({ ok: true }) }
export async function HEAD() { return new NextResponse(null, { status: 200 }) }
