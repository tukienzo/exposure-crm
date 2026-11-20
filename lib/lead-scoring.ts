// Lead scoring automático de EXPOSURE (12/09/2026).
// Fuente exclusiva: las respuestas del formulario de agenda de iClosed que quedan en `agendas`:
//   inversion        → capital disponible para invertir ("-$500 USD", "$500 a $1.300", "Más de $3.000 USD"…)
//   ingresos         → ingresos actuales por mes ("Menos de $1000 USD/mes", "Entre $2000 - $4000/mes"…)
//   intentos_previos → etapa del negocio ("No, sería mi primera vez", "Sí, facturo pero no paso de $1.000/mes"…)
//   motivo_urgencia  → objetivo de ingresos ("Entre $3000 a $5000 USD al mes", "+$20.000 USD al mes"…)
//   ocupacion        → situación ("No estoy cobrando lo que quiero", "Estoy dependiendo 100% de referidos", "Estudiante"…)
//   edad             → solo bloquea menores de 18
// Puntaje 0–100. Nada se inventa: si no hay capital y tampoco ingresos ni etapa, no hay scoring (null).
// Pesos y cortes calibrados el 12/09/2026 con los cierres reales de julio a septiembre (403 agendas):
// el público es joven y con poco capital, así que los umbrales son más bajos que en un scoring genérico.
// Lo que más cierra: capital "$500 a $1.300" (1 de 2), etapa "facturo pero no paso de $1.000" (2 de 5),
// ingresos "$500 a $1.000" (1 de 3) y objetivos realistas (1k a 10k). "+$20.000 al mes" no cerró ninguna.

export type ScoreInput = {
  edad?: unknown
  problema_actual?: unknown
  tiempo_problema?: unknown
  intentos_previos?: unknown
  motivo_urgencia?: unknown
  ocupacion?: unknown
  ingresos?: unknown
  inversion?: unknown
}

export type LeadGrade = "LEAD S" | "LEAD A" | "LEAD B" | "LEAD C" | "LEAD D"
export type ScoreResult = {
  calificacion: LeadGrade
  motivo: string
  puntos: number
  desglose: Record<string, number | null>
} | null

export const PESOS = { capital: 35, ingresos: 20, etapa: 20, objetivo: 15, situacion: 10 } as const
export const CORTES = { S: 66, A: 54, B: 42, C: 30 } as const

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[’‘]/g, "'").replace(/\s+/g, " ")
  // El formulario de la cuenta nueva de iClosed (16/11/2026) escribe "- $500 USD" y "+ $500 USD" con espacio:
  // sin esto "- $500" no coincidía con "-$500" y el monto 500 se tomaba como "500 o más" (30 puntos).
  .replace(/([+-]) (?=\$|\d)/g, "$1")
const has = (v: string, terms: string[]) => terms.some((t) => v.includes(norm(t)))
// primer monto en USD que aparece en el texto ("$3.000", "3k", "10.000 USD") → número
function monto(v: string): number | null {
  const k = v.match(/(\d+(?:[.,]\d+)?)\s*k\b/)
  if (k) return Math.round(Number(k[1].replace(",", ".")) * 1000)
  const m = v.match(/\d{1,3}(?:[.,]\d{3})+|\d{3,6}/)
  if (!m) return null
  return Number(m[0].replace(/[.,]/g, ""))
}

// capital disponible para invertir (0–35)
export function capitalPoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["no tengo", "sin capital", "no puedo"])) return 2
  if (has(v, ["mas de $3.000", "mas de 3.000", "+$3.000", "+3.000", "mas de $3000"])) return 35
  if (has(v, ["$1.300 a $3.000", "1.300 a 3.000", "1300 a 3000"])) return 32
  if (has(v, ["$800 a $1.500", "800 a 1.500", "800 a 1500"])) return 30
  if (has(v, ["$500 a $1.300", "500 a 1.300", "500 a 1300"])) return 30
  if (has(v, ["+500", "+$500", "mas de $500", "mas de 500"])) return 24
  if (has(v, ["menos de $800", "menos de 800", "-$800", "-800"])) return 14
  if (has(v, ["menos de $500", "menos de 500", "-$500", "-500"])) return 6
  const n = monto(v)
  if (n === null) return null
  return n >= 3000 ? 35 : n >= 1300 ? 32 : n >= 500 ? 30 : n >= 300 ? 14 : 6
}

// ingresos actuales por mes (0–20): capacidad de pago
export function incomePoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["mas de $4000", "mas de 4000", "+4000", "mas de $5000"])) return 20
  if (has(v, ["mas de $3000", "mas de 3000", "+3000", "mas de $3.000"])) return 18
  if (has(v, ["$2000 - $4000", "2000 - 4000", "2000 a 4000", "$2.000 a $4.000"])) return 16
  if (has(v, ["$1.000 a $3.000", "1.000 a 3.000", "1000 a 3000"])) return 14
  if (has(v, ["$1000 - $2000", "1000 - 2000", "1000 a 2000", "$1.000 a $2.000"])) return 14
  if (has(v, ["$500 a $1.000", "500 a 1.000", "500 a 1000"])) return 14
  if (has(v, ["menos de $1000", "menos de 1000", "-$1000", "menos de $1.000"])) return 10
  if (has(v, ["menos de $500", "menos de 500", "-$500", "-500", "sin ingresos", "no tengo ingresos"])) return 6
  const n = monto(v)
  if (n === null) return null
  return n >= 4000 ? 20 : n >= 3000 ? 18 : n >= 2000 ? 16 : n >= 500 ? 14 : 6
}

// etapa del negocio (0–20)
export function stagePoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["no paso de $1.000", "no paso de 1.000", "no paso de 1000", "facturo pero"])) return 20
  if (has(v, ["negocio andando", "tengo clientes", "con clientes", "ya facturo mas"])) return 18
  if (has(v, ["probe algo", "no llegue a facturar", "intente"])) return 12
  if (has(v, ["primera vez", "nunca", "no, seria", "no probe"])) return 8
  return null
}

// objetivo de ingresos por mes (0–15): la ambición realista es la que compra
export function goalPoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["+$20.000", "+20.000", "mas de $20.000", "mas de 20.000", "+$20000"])) return 8
  if (has(v, ["$10.000 usd - $20.000", "10.000 usd - 20.000", "10.000 - 20.000", "10.000 a 20.000", "10k a 20k", "10k-20k"])) return 10
  if (has(v, ["$5000 - 10.000", "5000 - 10.000", "5000 a 10.000", "5.000 a 10.000", "5k a 10k", "5k-10k", "5k–10k"])) return 15
  if (has(v, ["$3000 a $5000", "3000 a 5000", "3.000 a 5.000", "3k a 5k", "3k-5k", "3k–5k"])) return 12
  if (has(v, ["$1000 a $3000", "1000 a 3000", "1.000 a 3.000", "1k a 3k", "1k-3k"])) return 14
  const n = monto(v)
  if (n !== null) return n >= 20000 ? 8 : n >= 10000 ? 10 : n >= 5000 ? 15 : n >= 3000 ? 12 : n >= 1000 ? 14 : 8
  return 8  // objetivo escrito en palabras ("libertad financiera", "escalar la agencia"): hay ambición, sin cifra
}

// situación laboral / del negocio (0–10)
export function situationPoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["predectibilidad", "predictibilidad", "en la agencia", "mi agencia"])) return 10
  if (has(v, ["referidos", "dependiendo 100%"])) return 9
  if (has(v, ["no estoy cobrando lo que quiero", "cobrando lo que quiero", "cobro poco"])) return 7
  if (has(v, ["negocio propio", "dueno de negocio", "marca personal", "emprendedor", "consultor"])) return 8
  if (has(v, ["desempleado", "sin trabajo", "sin empleo", "no trabajo"])) return 1
  if (has(v, ["estudiante", "estudio", "estudiar", "universidad", "facultad", "colegio", "secundario"])) return 3
  if (has(v, ["empleado", "relacion de dependencia", "trabajo en", "oficina", "9 a 5", "9-5"])) return 6
  if (has(v, ["freelance", "independiente", "editor", "disenador", "community", "trafficker", "closer", "setter", "programador", "developer"])) return 6
  return 5
}

function agePoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["-18", "menor de 18"])) return -100
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n)) return null
  return n < 18 ? -100 : 0
}

export function autoScoreLead(row: ScoreInput): ScoreResult {
  const capital = capitalPoints(row.inversion)
  const ingresos = incomePoints(row.ingresos)
  const etapa = stagePoints(row.intentos_previos)
  const objetivo = goalPoints(row.motivo_urgencia)
  const situacion = situationPoints(row.ocupacion)
  const edad = agePoints(row.edad)
  const desglose = { capital, ingresos, etapa, objetivo, situacion }
  const reconocidos = Object.values(desglose).filter((v) => v !== null).length
  if (!reconocidos) return null
  if (edad === -100) return { calificacion: "LEAD D", motivo: "menor de 18: bloqueado", puntos: 0, desglose }
  // Sin capital declarado y sin ingresos ni etapa no hay evidencia suficiente para calificar.
  if (capital === null && ingresos === null && etapa === null) return null
  if (capital === null && reconocidos < 2) return null
  const puntos = (capital ?? 0) + (ingresos ?? 0) + (etapa ?? 0) + (objetivo ?? 0) + (situacion ?? 0)
  let grade: LeadGrade = puntos >= CORTES.S ? "LEAD S" : puntos >= CORTES.A ? "LEAD A" : puntos >= CORTES.B ? "LEAD B" : puntos >= CORTES.C ? "LEAD C" : "LEAD D"
  const ORDEN: LeadGrade[] = ["LEAD S", "LEAD A", "LEAD B", "LEAD C", "LEAD D"]
  const tope = (g: LeadGrade, max: LeadGrade) => (ORDEN.indexOf(g) < ORDEN.indexOf(max) ? max : g)
  if (grade === "LEAD S" && (capital ?? 0) < 30) grade = "LEAD A"  // S exige capital para el programa completo
  if ((capital ?? 0) <= 6 && (ingresos ?? 0) <= 6) grade = tope(grade, "LEAD C")  // sin capital y ganando menos de USD 500: no pasa de C
  const faltan = Object.entries(desglose).filter(([, v]) => v === null).map(([k]) => k)
  return { calificacion: grade, motivo: `${puntos}/100 · capital ${capital ?? "?"} · ingresos ${ingresos ?? "?"} · etapa ${etapa ?? "?"} · objetivo ${objetivo ?? "?"} · situación ${situacion ?? "?"}${faltan.length ? ` · sin dato: ${faltan.join(", ")}` : ""}`, puntos, desglose }
}
