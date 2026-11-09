export const CRM_ROLES = ["CEO", "Sales Manager", "Manager MKT", "Contaduria", "Setter", "Closer", "Cobranzas", "CSM", "Editor"] as const

export type CRMRole = (typeof CRM_ROLES)[number]

// El rol efectivo sale de team_members tal cual. La plantilla original
// degradaba a "Sales Manager" a cualquier CEO que no figurara como dueño en
// la plantilla original; en esta operación el CEO es quien figure con ese rol en team_members.
// Si se quiere limitar el CEO a nombres concretos, cargarlos en CRM_CEO_NAMES
// (separados por coma) y el resto de los CEO pasa a Sales Manager.
export function effectiveCRMRole(role: string | null | undefined, name?: string | null) {
  const owners = String(process.env.CRM_CEO_NAMES || "").split(",").map((n) => n.trim().toLowerCase()).filter(Boolean)
  if (role === "CEO" && owners.length) {
    const normalizedName = String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()
    if (!owners.some((n) => normalizedName === n || normalizedName.startsWith(`${n} `))) return "Sales Manager"
  }
  return role ?? null
}

// Quiénes pueden gestionar los accesos del equipo (agregar, aprobar, cambiar rol, suspender y eliminar
// miembros) además del CEO. Por nombre completo en team_members. Nahuel Carballo: pedido de Alex del 02/11/2026.
const GESTORES_DE_ACCESOS = ["nahuel carballo"]
const RUTAS_DE_ACCESOS = ["/accesos", "/api/team", "/api/security/activity"]

export function puedeGestionarAccesos(role: string | null | undefined, name?: string | null) {
  if (effectiveCRMRole(role, name) === "CEO") return true
  const normalizedName = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ")
  return GESTORES_DE_ACCESOS.some((n) => normalizedName === n || normalizedName.startsWith(`${n} `))
}

export function esRutaDeAccesos(pathname: string) {
  return RUTAS_DE_ACCESOS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

const OPERATIONS = ["CEO", "Sales Manager", "Manager MKT"] as CRMRole[]
const SALES_OPERATIONS = ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer"] as CRMRole[]

const pageRules: Array<[string, CRMRole[]]> = [
  ["/sistema", CRM_ROLES as unknown as CRMRole[]],
  ["/panel/equipo", CRM_ROLES as unknown as CRMRole[]],   // tareas del equipo: cada uno ve las suyas (filtra /api/tareas)
  ["/panel", [...OPERATIONS, "Contaduria"]],   // Panel del negocio (páginas y su index.html)
  ["/sales-game-preview", ["CEO"]],
  ["/accesos", ["CEO"]],
  ["/operaciones-tecnicas", ["CEO"]],
  ["/analisis-ia", OPERATIONS],
  ["/asistente", OPERATIONS],
  ["/finanzas", ["CEO", "Contaduria"]],
  ["/gastos", ["CEO", "Contaduria"]],
  ["/payroll", ["CEO", "Contaduria"]],
  ["/reglas", ["CEO"]],
  ["/contenido/formatos", [...OPERATIONS, "Editor"]],   // el editor entra al catalogo de referencias; la pestana de rendimiento no se le muestra
  ["/contenido/angulos", OPERATIONS],      // medidor de ángulos de comunicación (etiquetas de ManyChat)
  ["/contenido/tipos-agenda", OPERATIONS], // tipo de lead que trae cada pieza (resúmenes del setter)
  ["/setting-resumen", SALES_OPERATIONS],  // generador de resúmenes del setter
  ["/whatsapp", OPERATIONS],               // grupos de WhatsApp del equipo
  ["/precalls", OPERATIONS],               // chats de precall por lead + resúmenes (09/11/2026)
  ["/testimonios", [...OPERATIONS, "CSM", "Editor"]],
  ["/youtube", [...OPERATIONS, "Editor"]],   // videos largos del canal + los clips de cada uno
  ["/ciudad", OPERATIONS],                   // Exposure OS · vista ciudad (todo el negocio en 3D, solo lectura)
  ["/radar", [...OPERATIONS, "Editor"]],     // radar de contenido: cuentas seguidas, piezas, historias (página y su index.html)
  ["/contenido", [...OPERATIONS, "Editor"]],
  ["/contenido-angulos", [...OPERATIONS, "Editor"]],
  ["/calidad-datos", [...OPERATIONS, "CSM"]],
  ["/agendas-incompletas", ["CEO", "Sales Manager"]],   // Home · CRM por completar: causa y completado desde Fathom, pagos e iClosed
  ["/rendimiento", [...OPERATIONS, "Contaduria"]],
  ["/metricas", [...OPERATIONS, "Contaduria"]],
  ["/embudos", [...OPERATIONS, "Contaduria"]],     // métricas por embudo (webinar / orgánico / outbound)
  ["/evolucion-diaria", [...OPERATIONS, "Contaduria"]],
  ["/reporte-llamadas", [...OPERATIONS, "Setter", "Closer"]],
  ["/tablero-semanal", OPERATIONS],
  ["/prospeccion-ig", OPERATIONS],
  ["/pagos", [...OPERATIONS, "Setter", "Closer", "Contaduria", "CSM"]],
  ["/carga-pagos", [...OPERATIONS, "Setter", "Closer", "Contaduria", "CSM"]],
  ["/todos-pagos", [...OPERATIONS, "Setter", "Closer", "Contaduria", "CSM"]],
  ["/recordatorios", [...OPERATIONS, "Setter", "Closer", "Cobranzas", "Contaduria"]],
  ["/cobros", [...OPERATIONS, "Setter", "Closer", "Contaduria"]],
  ["/cuotas", [...OPERATIONS, "Contaduria"]],
  ["/planes-pago", [...OPERATIONS, "Setter", "Closer", "Contaduria"]],
  ["/clientes", [...SALES_OPERATIONS, "Contaduria", "CSM"]],
  ["/clientes-hub", [...SALES_OPERATIONS, "Contaduria", "CSM"]],
  ["/historia-leads", [...SALES_OPERATIONS, "Contaduria", "CSM"]],
  ["/ventas", [...SALES_OPERATIONS, "Contaduria"]],
  ["/pipeline", [...SALES_OPERATIONS, "Contaduria"]],
  ["/centro-agendas", [...SALES_OPERATIONS, "Contaduria"]],
  ["/seguimientos", SALES_OPERATIONS],
  ["/equipo", [...SALES_OPERATIONS, "Contaduria"]],
  ["/esquema-comisiones", [...SALES_OPERATIONS, "Contaduria"]],
]

const apiRules: Array<[string, CRMRole[]]> = [
  ["/api/panel", [...OPERATIONS, "Contaduria"]],  // datos del Panel del negocio
  ["/api/tareas", CRM_ROLES as unknown as CRMRole[]],  // tareas del equipo: el filtro por persona y los permisos de CEO están en la ruta
  ["/api/formatos", OPERATIONS],                 // rendimiento por pieza: tiene cash y cierres, no es para el editor
  ["/api/angulos", [...OPERATIONS, "Editor"]],    // banco de ángulos editable
  ["/api/youtube", [...OPERATIONS, "Editor"]],   // videos de YouTube y sus clips
  ["/api/radar", [...OPERATIONS, "Editor"]],     // lectura del radar; las acciones validan dirección/marketing adentro
  ["/api/imagen", [...OPERATIONS, "Editor"]],   // subir miniaturas y portadas desde la compu
  ["/api/banco-formatos", [...OPERATIONS, "Editor"]],  // catálogo de formatos (escritura solo CEO, se valida en la ruta)
  ["/api/angulos-manychat", OPERATIONS],
  ["/api/tipos-agenda", OPERATIONS],
  ["/api/ciudad", OPERATIONS],
  ["/api/setting-resumen", SALES_OPERATIONS],
  ["/api/ventas/resumen", SALES_OPERATIONS],
  ["/api/agendas-incompletas", ["CEO", "Sales Manager"]],
  ["/api/whatsapp", OPERATIONS],
  ["/api/precalls", OPERATIONS],
  ["/api/security/activity", CRM_ROLES as unknown as CRMRole[]],
  ["/api/push", CRM_ROLES as unknown as CRMRole[]],   // suscripción a avisos push de este dispositivo (quién recibe qué se decide en lib/push.ts)
  ["/api/operations-health", ["CEO"]],
  ["/api/growth-command", OPERATIONS],
  ["/api/home-exceptions", CRM_ROLES as unknown as CRMRole[]],
  ["/api/team", ["CEO"]],
  ["/api/asistente", OPERATIONS],
  ["/api/export-all", ["CEO"]],
  ["/api/export-xlsx", ["CEO"]],
  ["/api/home-ceo-reconciliacion", ["CEO", "Contaduria"]],
  ["/api/home-ceo-profit", ["CEO", "Contaduria"]],
  ["/api/preview-audit", ["CEO"]],
  ["/api/identity-conflicts", ["CEO"]],
  ["/api/identity-sweep", ["CEO"]],
  ["/api/finanzas", ["CEO", "Contaduria"]],
  ["/api/gastos", ["CEO", "Contaduria"]],
  ["/api/payroll", ["CEO", "Contaduria"]],
  ["/api/content-workspace", [...OPERATIONS, "Editor"]],
  ["/api/testimonios", [...OPERATIONS, "CSM", "Editor"]],
  ["/api/content-script-generator", OPERATIONS],
  ["/api/content-insights", OPERATIONS],
  ["/api/trace-intelligence", OPERATIONS],
  ["/api/trace-review", OPERATIONS],
  ["/api/data-quality", [...OPERATIONS, "CSM"]],
  ["/api/metricas", [...OPERATIONS, "Contaduria"]],
  ["/api/embudos", [...OPERATIONS, "Contaduria"]],
  ["/api/tablero-semanal", OPERATIONS],
  ["/api/fathom-sync", [...OPERATIONS, "Closer"]],
  ["/api/fathom-show-reconcile", ["CEO"]],
  ["/api/llamadas", [...OPERATIONS, "Setter", "Closer"]],
  ["/api/leaderboard", [...SALES_OPERATIONS, "Contaduria"]],
  ["/api/agendas", [...SALES_OPERATIONS, "Contaduria"]],
  ["/api/seguimientos", SALES_OPERATIONS],
  ["/api/leads", [...SALES_OPERATIONS, "CSM"]],
  ["/api/clientes", [...SALES_OPERATIONS, "Contaduria", "CSM"]],
  ["/api/pagos", [...OPERATIONS, "Setter", "Closer", "Contaduria", "CSM"]],
  ["/api/payment-client-suggestions", [...OPERATIONS, "Setter", "Closer", "Contaduria", "CSM"]],
  ["/api/planes-pago", [...OPERATIONS, "Setter", "Closer", "Contaduria"]],
  ["/api/cuotas", [...OPERATIONS, "Setter", "Closer", "Contaduria"]],
  ["/api/upload-comprobante", [...OPERATIONS, "Setter", "Closer", "Contaduria", "CSM"]],
  ["/api/cobranza", [...OPERATIONS, "Setter", "Closer", "Contaduria"]],
  ["/api/strikes", SALES_OPERATIONS],
]

function allowed(pathname: string, role: string | null | undefined, rules: Array<[string, CRMRole[]]>, defaultAllowed = false) {
  if (pathname === "/") return CRM_ROLES.includes(role as CRMRole) && !["Editor", "Cobranzas"].includes(role || "")
  if (pathname === "/sop-crm") return role !== "Cobranzas"
  const rule = rules.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return rule ? rule[1].includes(role as CRMRole) : defaultAllowed
}

export function canAccessPage(pathname: string, role: string | null | undefined) {
  return allowed(pathname, role, pageRules)
}

export function canAccessApi(pathname: string, role: string | null | undefined, method = "GET") {
  if (role === "Editor" && pathname === "/api/content-workspace") {
    return ["GET", "PATCH"].includes(method.toUpperCase())
  }
  // Cobranzas es un rol deliberadamente mínimo. Solo puede leer su cartera,
  // registrar/consultar pagos, subir comprobantes y conciliar cuotas. No puede
  // crear ni editar planes, navegar clientes, agendas o métricas.
  if (role === "Cobranzas") {
    const verb = method.toUpperCase()
    if (pathname === "/api/security/activity") return verb === "POST"
    if (pathname === "/api/planes-pago") return verb === "GET"
    if (pathname === "/api/pagos" || pathname === "/api/pagos/vinculo") return ["GET", "POST"].includes(verb)
    if (pathname === "/api/upload-comprobante") return ["GET", "POST"].includes(verb)
    if (pathname === "/api/cobranza" || pathname === "/api/cobranza/resolver") return verb === "POST"
    if (pathname === "/api/tareas") return ["GET", "PATCH"].includes(verb)   // sus tareas: verlas y tildarlas
    return false
  }
  // Borrados permanentes y administración de identidad quedan reservados al
  // CEO (rol canónico), aunque un manager tenga acceso operativo.
  // DELETE /api/pagos es una excepción semántica: nunca borra la fila, solo la
  // archiva con actor, fecha y motivo para conservar la trazabilidad.
  if (method.toUpperCase() === "DELETE") {
    if (pathname === "/api/pagos") return ["CEO", "Sales Manager", "Manager MKT", "Contaduria", "Setter", "Closer"].includes(role || "")
    return role === "CEO"
  }
  return allowed(pathname, role, apiRules)
}

export function homeForRole(role: string | null | undefined) {
  if (role === "Manager MKT" || role === "Editor") return "/contenido-angulos"
  if (role === "Sales Manager") return "/"
  if (role === "Contaduria") return "/recordatorios"
  if (role === "Cobranzas") return "/recordatorios"
  if (role === "CSM") return "/clientes-hub"
  return "/"
}
