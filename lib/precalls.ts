// Pre-calls (09/11/2026): chats de precall de cada lead agendado y sus resúmenes.
//   1) /api/webhooks/2chat-precall guarda cada mensaje que ve el número de la empresa en crm_whatsapp_messages.
//   2) /api/precalls-sync?paso=vincular arma precall_chats leyendo solo los mensajes nuevos (cursor) y cruza
//      cada chat con su agenda: por teléfono (últimos 10 dígitos) y, si no hay, por nombre en el nombre del grupo.
//   3) /api/precalls-sync?paso=resumen genera el resumen del día (Haiku) solo con los mensajes de ese día, y el
//      semanal a partir de los diarios ya guardados. El mensual (Sonnet) se genera solo cuando alguien lo pide.
// Solo lectura: nada de esto manda mensajes a leads ni a grupos.
import type { SupabaseClient } from "@supabase/supabase-js"

export const GRUPO_VENTAS_JID = "120363419196264573@g.us"   // grupo del equipo: no es un precall
export const MODELO_DIARIO = "claude-haiku-5-5"
export const MODELO_MENSUAL = "claude-sonnet-5-5"
const CURSOR = { source: "precalls", asset_type: "cursor", source_id: "mensajes" }

export const ultimos10 = (v: unknown) => String(v ?? "").replace(/@.*$/, "").replace(/\D/g, "").slice(-10)
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()

// ── 1. Payload de 2chat → fila de crm_whatsapp_messages ────────────────────────────────────────────────
type Payload = Record<string, unknown> & {
  id?: string; uuid?: string; sent_by?: string; created_at?: string; remote_phone_number?: string | null; channel_phone_number?: string | null
  group?: { wa_group_id?: string; wa_group_name?: string } | null
  participant?: { phone_number?: string; pushname?: string } | null
  contact?: { friendly_name?: string; first_name?: string; last_name?: string } | null
  message?: { text?: string; media?: { type?: string } | null; media_url?: string; type?: string } | null
}

export function filaDesde2chat(p: Payload) {
  const msgId = String(p.uuid || p.id || "")
  if (!msgId) return null
  const grupo = p.group?.wa_group_id ? p.group : null
  const remoto = p.remote_phone_number ? String(p.remote_phone_number) : null
  const chatId = grupo ? String(grupo.wa_group_id) : remoto ? `${remoto.replace(/\D/g, "")}@c.us` : null
  if (!chatId) return null
  // "user" = escribió el contacto; "api"/"agent"/otros = salió del número de la empresa.
  const fromMe = String(p.sent_by || "") !== "user"
  const sender = fromMe ? p.channel_phone_number ?? null : grupo ? p.participant?.phone_number ?? null : remoto
  const contacto = [p.contact?.first_name, p.contact?.last_name].filter(Boolean).join(" ") || p.contact?.friendly_name || null
  const senderName = fromMe ? "EXPOSURE" : grupo ? p.participant?.pushname ?? null : contacto
  const m = p.message || {}
  const media = m.media?.type || m.type || (m.media_url ? "media" : null)
  const creado = p.created_at ? String(p.created_at) : null
  const sentAt = creado ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(creado) ? creado : `${creado}Z`) : new Date()
  return {
    chat_id: chatId,
    chat_name: (grupo ? grupo.wa_group_name : contacto) ? String(grupo ? grupo.wa_group_name : contacto).slice(0, 200) : null,
    msg_id: msgId,
    sender: sender ? String(sender).slice(0, 120) : null,
    sender_name: senderName ? String(senderName).slice(0, 120) : null,
    text: m.text ? String(m.text).slice(0, 20000) : null,
    media_type: media && media !== "text" ? String(media).slice(0, 40) : null,
    is_group: !!grupo,
    from_me: fromMe,
    sent_at: isNaN(sentAt.getTime()) ? new Date().toISOString() : sentAt.toISOString(),
    raw: null,
  }
}

// ── 2. Vínculo chat ↔ agenda ─────────────────────────────────────────────────────────────────────────
type Agenda = { id: string; nombre: string | null; telefono: string | null; fecha_closer: string | null; estado: string | null }
type Chat = { chat_id: string; agenda_id: string | null; chat_name: string | null; tipo: string; matcheo: string | null; mensajes: number; primer_msg_at: string | null; ultimo_msg_at: string | null; ultimo_texto: string | null; ultimo_autor: string | null; telefonos: string[] }

const dias = (a: string | null, b: string | null) => (a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / 86400000 : 9999)

// La agenda más cercana a la fecha en que arrancó el chat (un lead puede tener varias agendas con el mismo teléfono).
function masCercana(cands: Agenda[], primer: string | null) {
  return [...cands].sort((x, y) => dias(x.fecha_closer, primer) - dias(y.fecha_closer, primer))[0]
}

export function vincular(chat: Chat, agendas: Agenda[], porTel: Map<string, Agenda[]>): { agenda_id: string | null; matcheo: "telefono" | "nombre" | null } {
  const porTelefono = chat.telefonos.flatMap((t) => porTel.get(t) || [])
  if (porTelefono.length) return { agenda_id: masCercana(porTelefono, chat.primer_msg_at).id, matcheo: "telefono" }
  // Plan B: nombre y apellido del lead dentro del nombre del grupo, con la call a ±10 días del chat. Solo si es único.
  const nombreChat = ` ${norm(chat.chat_name)} `
  if (nombreChat.trim().length < 3) return { agenda_id: null, matcheo: null }
  const cand = agendas.filter((a) => {
    const partes = norm(a.nombre).split(" ").filter((p) => p.length >= 3)
    if (partes.length < 2 || dias(a.fecha_closer, chat.primer_msg_at) > 10) return false
    return nombreChat.includes(` ${partes[0]} `) && nombreChat.includes(` ${partes[partes.length - 1]} `)
  })
  const unicos = new Set(cand.map((a) => norm(a.nombre)))
  if (cand.length && unicos.size === 1) return { agenda_id: masCercana(cand, chat.primer_msg_at).id, matcheo: "nombre" }
  return { agenda_id: null, matcheo: null }
}

export async function sincronizarChats(sb: SupabaseClient) {
  const { data: cur } = await sb.from("crm_integration_assets").select("metadata").match(CURSOR).maybeSingle()
  const desde = String((cur?.metadata as { hasta?: string } | null)?.hasta || "1970-01-01T00:00:00Z")
  const nuevos: Array<{ chat_id: string; chat_name: string | null; sender: string | null; sender_name: string | null; text: string | null; media_type: string | null; is_group: boolean; from_me: boolean; sent_at: string; created_at: string }> = []
  for (let i = 0; i < 20; i++) {
    const { data, error } = await sb.from("crm_whatsapp_messages").select("chat_id,chat_name,sender,sender_name,text,media_type,is_group,from_me,sent_at,created_at")
      .gt("created_at", desde).order("created_at", { ascending: true }).range(i * 1000, i * 1000 + 999)
    if (error) throw new Error(error.message)
    nuevos.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  const { data: existentes, error: e1 } = await sb.from("precall_chats").select("*")
  if (e1) throw new Error(e1.message)
  const chats = new Map<string, Chat>((existentes || []).map((c) => [c.chat_id, c as Chat]))
  const tocados = new Set<string>()
  for (const m of nuevos) {
    if (m.chat_id === GRUPO_VENTAS_JID) continue
    const c = chats.get(m.chat_id) || { chat_id: m.chat_id, agenda_id: null, chat_name: null, tipo: m.is_group ? "grupo" : "1a1", matcheo: null, mensajes: 0, primer_msg_at: null, ultimo_msg_at: null, ultimo_texto: null, ultimo_autor: null, telefonos: [] }
    c.mensajes++
    if (m.chat_name) c.chat_name = m.chat_name
    if (!c.primer_msg_at || m.sent_at < c.primer_msg_at) c.primer_msg_at = m.sent_at
    if (!c.ultimo_msg_at || m.sent_at >= c.ultimo_msg_at) {
      c.ultimo_msg_at = m.sent_at
      c.ultimo_texto = (m.text || (m.media_type ? `<${m.media_type}>` : "")).slice(0, 300)
      c.ultimo_autor = m.sender_name || m.sender
    }
    const tel = ultimos10(m.from_me ? "" : m.sender || (m.is_group ? "" : m.chat_id))
    if (tel.length === 10 && !c.telefonos.includes(tel)) c.telefonos = [...c.telefonos, tel]
    chats.set(m.chat_id, c)
    tocados.add(m.chat_id)
  }
  // Se vuelve a intentar el vínculo de los chats sin agenda (la agenda puede haberse cargado después).
  const sinVincular = [...chats.values()].filter((c) => !c.agenda_id)
  let vinculados = 0
  if (sinVincular.length) {
    const agendas: Agenda[] = []
    for (let i = 0; i < 10; i++) {
      const { data, error } = await sb.from("agendas").select("id,nombre,telefono,fecha_closer,estado").gte("fecha_closer", "2026-09-01").range(i * 1000, i * 1000 + 999)
      if (error) throw new Error(error.message)
      agendas.push(...((data || []) as Agenda[]))
      if ((data || []).length < 1000) break
    }
    const porTel = new Map<string, Agenda[]>()
    for (const a of agendas) { const t = ultimos10(a.telefono); if (t.length === 10) porTel.set(t, [...(porTel.get(t) || []), a]) }
    for (const c of sinVincular) {
      const v = vincular(c, agendas, porTel)
      if (v.agenda_id) { c.agenda_id = v.agenda_id; c.matcheo = v.matcheo; tocados.add(c.chat_id); vinculados++ }
    }
  }
  const filas = [...tocados].map((id) => ({ ...chats.get(id)!, actualizado_at: new Date().toISOString() }))
  for (let i = 0; i < filas.length; i += 200) {
    const { error } = await sb.from("precall_chats").upsert(filas.slice(i, i + 200), { onConflict: "chat_id" })
    if (error) throw new Error(error.message)
  }
  const hasta = nuevos.length ? nuevos[nuevos.length - 1].created_at : desde
  await sb.from("crm_integration_assets").upsert({ ...CURSOR, name: "Cursor de pre-calls", metadata: { hasta }, last_seen_at: new Date().toISOString() }, { onConflict: "source,asset_type,source_id" })
  return { mensajes_nuevos: nuevos.length, chats_actualizados: filas.length, vinculados_ahora: vinculados, chats_sin_agenda: [...chats.values()].filter((c) => !c.agenda_id).length }
}

// ── 3. Resúmenes ─────────────────────────────────────────────────────────────────────────────────────
// Día argentino (UTC-3) → rango UTC.
export const rangoDia = (fecha: string) => ({ desde: `${fecha}T03:00:00.000Z`, hasta: new Date(Date.parse(`${fecha}T03:00:00.000Z`) + 86400000).toISOString() })
export const sumarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
export const hoyArgentina = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
export const lunesDe = (fecha: string) => sumarDias(fecha, -((new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7))

async function claude(modelo: string, system: string, user: string, maxTokens: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta configurar ANTHROPIC_API_KEY")
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: modelo, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  })
  if (!r.ok) throw new Error(`Claude ${modelo} HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`)
  const j = await r.json()
  const texto = (j.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n").trim()
  return { texto, entrada: Number(j.usage?.input_tokens || 0), salida: Number(j.usage?.output_tokens || 0) }
}

const REGLAS = `Escribís en español rioplatense, directo y sin relleno. No inventes: si algo no está en el texto que te paso, escribí "sin datos". Nunca supongas el motivo de un no show ni de una cancelación: solo lo decís si alguien lo escribió. Citá entre comillas las frases textuales del lead que valgan (objeciones, dudas, excusas).`

// Recorte para la IA: hora, quién, texto. Sin media ni stickers; cada mensaje a 500 caracteres.
function recortar(ms: Array<{ sender_name: string | null; text: string | null; from_me: boolean; sent_at: string }>, tope = 12000) {
  let out = ""
  for (const m of ms) {
    if (!m.text?.trim()) continue
    const hora = new Date(Date.parse(m.sent_at) - 3 * 3600000).toISOString().slice(11, 16)
    const linea = `[${hora}] ${m.from_me ? "Equipo" : m.sender_name || "Lead"}: ${m.text.replace(/\s+/g, " ").slice(0, 500)}\n`
    if (out.length + linea.length > tope) { out += "[…recortado]\n"; break }
    out += linea
  }
  return out
}

async function guardar(sb: SupabaseClient, fila: { periodo: string; alcance: string; fecha_inicio: string; fecha_fin: string; texto: string; modelo: string | null; mensajes_usados: number; tokens_entrada: number; tokens_salida: number }) {
  const { error } = await sb.from("precall_resumenes").upsert({ ...fila, generado_at: new Date().toISOString() }, { onConflict: "periodo,alcance,fecha_inicio" })
  if (error) throw new Error(error.message)
}

// Resumen de un día: uno por chat que tuvo mensajes ese día (solo esos mensajes) + uno global armado con esos.
export async function resumirDia(sb: SupabaseClient, fecha: string) {
  const { data: ya } = await sb.from("precall_resumenes").select("id").eq("periodo", "diario").eq("alcance", "global").eq("fecha_inicio", fecha).maybeSingle()
  if (ya) return { fecha, salteado: "ya estaba" }
  const { desde, hasta } = rangoDia(fecha)
  const { data: msgs, error } = await sb.from("crm_whatsapp_messages").select("chat_id,sender_name,text,from_me,sent_at")
    .neq("chat_id", GRUPO_VENTAS_JID).gte("sent_at", desde).lt("sent_at", hasta).order("sent_at", { ascending: true }).limit(20000)
  if (error) throw new Error(error.message)
  const porChat = new Map<string, NonNullable<typeof msgs>>()
  for (const m of msgs || []) porChat.set(m.chat_id, [...(porChat.get(m.chat_id) || []), m])
  const { data: chats } = await sb.from("precall_chats").select("chat_id,chat_name,agenda_id").in("chat_id", [...porChat.keys()].length ? [...porChat.keys()] : ["-"])
  const agendaIds = (chats || []).map((c) => c.agenda_id).filter(Boolean) as string[]
  const { data: agendas } = agendaIds.length ? await sb.from("agendas").select("id,nombre,fecha_closer,estado,closer,setter").in("id", agendaIds) : { data: [] as Array<{ id: string; nombre: string | null; fecha_closer: string | null; estado: string | null; closer: string | null; setter: string | null }> }
  const agendaPorId = new Map((agendas || []).map((a) => [a.id, a]))
  const piezas: string[] = []
  let entrada = 0, salida = 0
  for (const [chatId, ms] of porChat) {
    const texto = recortar(ms)
    if (!texto) continue
    const chat = (chats || []).find((c) => c.chat_id === chatId)
    const a = chat?.agenda_id ? agendaPorId.get(chat.agenda_id) : null
    const ficha = a ? `Lead: ${a.nombre || "sin datos"} · call: ${a.fecha_closer?.slice(0, 16).replace("T", " ") || "sin datos"} · estado en el CRM: ${a.estado || "sin datos"} · closer: ${a.closer || "sin datos"} · setter: ${a.setter || "sin datos"}` : `Chat sin agenda vinculada: ${chat?.chat_name || chatId}`
    const r = await claude(MODELO_DIARIO,
      `Sos analista de ventas de EXPOSURE. Leés los mensajes de UN día de un chat de precall (el grupo o chat que se arma con el lead antes de la llamada de venta). ${REGLAS}
Devolvé máximo 90 palabras en este formato:
**Qué pasó:** … · **Señales de show / no show:** … · **Objeciones o dudas:** … · **Próximo paso:** …`,
      `${ficha}\nDía: ${fecha}\n\nMENSAJES:\n${texto}`, 350)
    entrada += r.entrada; salida += r.salida
    await guardar(sb, { periodo: "diario", alcance: `chat:${chatId}`, fecha_inicio: fecha, fecha_fin: fecha, texto: r.texto, modelo: MODELO_DIARIO, mensajes_usados: ms.length, tokens_entrada: r.entrada, tokens_salida: r.salida })
    piezas.push(`### ${a?.nombre || chat?.chat_name || chatId} (${a?.estado || "sin estado"})\n${r.texto}`)
  }
  let global = "Sin mensajes de precall este día."
  if (piezas.length) {
    const r = await claude(MODELO_DIARIO,
      `Sos analista de ventas de EXPOSURE. Te paso los resúmenes de cada chat de precall de un día. ${REGLAS}
Armá el resumen del día en máximo 220 palabras: **Panorama** (cuántos chats tuvieron movimiento y cómo vienen) · **Objeciones que se repiten** (con cuántos chats) · **Riesgo de no show** (nombres y por qué, solo si está escrito) · **Pendientes del equipo**.`,
      `Día: ${fecha}\n\n${piezas.join("\n\n")}`, 700)
    global = r.texto; entrada += r.entrada; salida += r.salida
  }
  await guardar(sb, { periodo: "diario", alcance: "global", fecha_inicio: fecha, fecha_fin: fecha, texto: global, modelo: piezas.length ? MODELO_DIARIO : null, mensajes_usados: (msgs || []).length, tokens_entrada: entrada, tokens_salida: salida })
  return { fecha, chats: piezas.length, mensajes: (msgs || []).length, tokens_entrada: entrada, tokens_salida: salida }
}

// Semanal (lunes a domingo) y mensual: se arman con los resúmenes diarios globales ya guardados, sin releer mensajes.
export async function resumirPeriodo(sb: SupabaseClient, periodo: "semanal" | "mensual", inicio: string, fin: string, modelo: string) {
  const { data: diarios, error } = await sb.from("precall_resumenes").select("fecha_inicio,texto,mensajes_usados")
    .eq("periodo", "diario").eq("alcance", "global").gte("fecha_inicio", inicio).lte("fecha_inicio", fin).order("fecha_inicio", { ascending: true })
  if (error) throw new Error(error.message)
  const conDatos = (diarios || []).filter((d) => d.mensajes_usados > 0)
  const mensajes = (diarios || []).reduce((s, d) => s + (d.mensajes_usados || 0), 0)
  if (!conDatos.length) {
    await guardar(sb, { periodo, alcance: "global", fecha_inicio: inicio, fecha_fin: fin, texto: "Sin mensajes de precall en este período.", modelo: null, mensajes_usados: 0, tokens_entrada: 0, tokens_salida: 0 })
    return { periodo, inicio, dias: 0 }
  }
  const r = await claude(modelo,
    `Sos analista de ventas de EXPOSURE. Te paso los resúmenes diarios de los chats de precall de ${periodo === "semanal" ? "una semana" : "un mes"}. ${REGLAS}
Armá el resumen ${periodo} en máximo ${periodo === "semanal" ? 300 : 500} palabras: **Qué pasó** · **Objeciones y dudas que más se repiten** (con en cuántos días aparecieron) · **Patrones de no show y cancelación** (solo lo que está escrito) · **Qué funcionó del equipo** · **Qué ajustar la próxima ${periodo === "semanal" ? "semana" : "mes"}**.`,
    conDatos.map((d) => `## ${d.fecha_inicio}\n${d.texto}`).join("\n\n"), periodo === "semanal" ? 900 : 1500)
  await guardar(sb, { periodo, alcance: "global", fecha_inicio: inicio, fecha_fin: fin, texto: r.texto, modelo, mensajes_usados: mensajes, tokens_entrada: r.entrada, tokens_salida: r.salida })
  return { periodo, inicio, dias: conDatos.length, tokens_entrada: r.entrada, tokens_salida: r.salida }
}
