// Equipo comercial de EXPOSURE (Alex, 11/09/2026). Única fuente para los
// selectores fijos de la UI, los seeds del leaderboard y la normalización de
// apodos. Los accesos y roles siguen saliendo de `team_members`; esto solo
// alimenta listas de opciones y alias de nombres cargados a mano.
export const CEO = "Alex"
export const SALES_MANAGER = "Nahuel"

// Closers reales: Alex y Nahuel hasta junio 2026; desde julio 2026 también
// Cristian, Tobias y Bener.
export const CLOSERS_ACTIVOS = ["Alex", "Nahuel", "Cristian", "Tobias", "Bener", "Gino"]  // Alex (11/09): el closer es Bener (Benner), no Kenneth · Gino se suma el 09/11/2026

// Setters por período: Lukas (sep–nov 2025) · Cesar (nov–dic 2025) ·
// Santi (ene–jun 2026) · Andres (jul–ago 2026) · Maximo (desde ago 2026).
export const SETTERS_ACTIVOS = ["Maximo"]
export const SETTERS_HISTORICOS = ["Andres", "Santi", "Cesar", "Lukas"]
export const SETTERS_TODOS = [...SETTERS_ACTIVOS, ...SETTERS_HISTORICOS]
// Registros con fecha hasta este mes inclusive muestran también a los históricos.
export const SETTERS_HISTORICOS_HASTA = "2026-08"

export function settersPara(fecha?: string | null): string[] {
  return fecha && String(fecha).slice(0, 7) <= SETTERS_HISTORICOS_HASTA ? SETTERS_TODOS : SETTERS_ACTIVOS
}

// Apodos que aparecen en pagos/agendas cargados a mano → nombre canónico.
const ALIAS: Record<string, string> = {
  alex: "Alex",
  nahuel: "Nahuel", nawe: "Nahuel", exposure: "Nahuel",
  cristian: "Cristian", cris: "Cristian",
  tobias: "Tobias",
  bener: "Bener", benner: "Bener", "bener.salvod": "Bener",
  gino: "Gino",
  maximo: "Maximo", maxi: "Maximo", max: "Maximo",
  andres: "Andres",
  santi: "Santi",
  cesar: "Cesar",
  lukas: "Lukas",
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

// Primer nombre normalizado por alias. Nombres desconocidos vuelven tal cual
// (primer palabra), sin inventar.
export function nombreCanonico(value: unknown): string {
  const first = String(value || "").trim().split(/\s+/)[0] || ""
  if (!first) return ""
  return ALIAS[stripAccents(first).toLowerCase()] || first
}

// Nombres completos de closers conocidos, en minúsculas y sin tildes, para
// reconocer llamadas de venta en Fathom por el título o los participantes.
// Cristian Lescano y Bener Salvo salen de los títulos de Fathom (11/09). FALTA: apellido de Tobias.
export const CLOSERS_NOMBRE_COMPLETO = ["alex carrera", "nahuel carballo", "cristian lescano", "bener salvo", "exposure"]
