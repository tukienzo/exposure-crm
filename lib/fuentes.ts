// Lista única de Fuente de EXPOSURE, agrupada por canal, compartida por Centro
// de Agendas, Carga de Pagos y Todos los Pagos. Los VALORES son exactamente los
// que se guardan en agendas.fuente (no tocarlos: rompe el histórico); el
// "label" es solo lo que se muestra adentro del grupo, más corto.

export type FuenteItem = { value: string; label: string }
export type FuenteGroup = { label: string; items: FuenteItem[] }

export const FUENTE_GROUPS: FuenteGroup[] = [
  {
    label: "Instagram",
    items: [
      { value: "Instagram Reel", label: "Reel" },
      { value: "Instagram Carrusel", label: "Carrusel" },
      { value: "Instagram Story", label: "Historia" },
      { value: "Instagram", label: "Instagram (general)" },
    ],
  },
  {
    label: "Outbound / Manychat",
    items: [
      { value: "Outbound Seguidor", label: "Outbound a seguidor nuevo" },
      { value: "Outbound Story", label: "Outbound por historia" },
      { value: "Bienvenida Manychat", label: "Bienvenida Manychat" },
    ],
  },
  {
    label: "Anuncios",
    items: [
      { value: "DM-ADS", label: "DM-ADS" },
    ],
  },
]

export const FUENTE_STANDALONE = ["Webinar", "Referido", "YouTube", "WhatsApp", "Producto", "Demo app"]

// Muestra el label corto si la fuente está en la lista vigente; si es un
// valor histórico ya sacado de las opciones (ej. "Instagram Link in Bio"),
// muestra el valor tal cual — nunca lo deja en blanco.
export function fuenteLabel(value: string | null | undefined): string {
  if (!value) return ""
  for (const g of FUENTE_GROUPS) {
    const found = g.items.find((it) => it.value === value)
    if (found) return found.label
  }
  return value
}

// Origen que se muestra en la tarjeta de la agenda. Las que llegan de la demo de la app traen en utm_content el
// botón que tocaron ("boton-carruseles"): se muestra "Demo app · Carruseles".
export function origenAgenda(a: { fuente?: string | null; utm_source?: string | null; utm_content?: string | null }): string {
  const base = fuenteLabel(a.fuente)
  const esDemo = /demo.?app/i.test(a.fuente || "") || /^demo-?app$/i.test(a.utm_source || "")
  const lugar = String(a.utm_content || "").trim().replace(/^boton[-_ ]*/i, "").replace(/[-_]+/g, " ").trim()
  if (!esDemo || !lugar) return base
  return `${base || "Demo app"} · ${lugar.charAt(0).toUpperCase()}${lugar.slice(1)}`
}
