// Exportación fiscal (#547): formatos, secciones, preferencias guardadas y
// la ruta de descarga. Funciones puras.

export const EXPORT_PREFS_KEY = 'export_preferencias'

export type FormatoExport = 'csv' | 'rentaweb' | 'excel' | 'pdf'
export type SeccionExport = 'resumen' | 'compensacion' | 'activos' | 'operaciones' | 'rendimientos' | 'lotes'

export const FORMATOS: readonly { clave: FormatoExport; titulo: string; uso: string; conSecciones: boolean }[] = [
  { clave: 'excel', titulo: 'Excel', uso: 'Para tu asesor: una hoja por sección, con fechas reales y filtros.', conSecciones: true },
  { clave: 'pdf', titulo: 'PDF', uso: 'Informe para imprimir o guardar, con cabecera y páginas numeradas.', conSecciones: true },
  { clave: 'csv', titulo: 'CSV', uso: 'Una sola tabla para cualquier hoja de cálculo: operaciones y rendimientos.', conSecciones: false },
  { clave: 'rentaweb', titulo: 'Renta Web', uso: 'Los datos de la casilla 1800, en el formato que importa la AEAT.', conSecciones: false },
]

export const SECCIONES: readonly { clave: SeccionExport; titulo: string }[] = [
  { clave: 'resumen', titulo: 'Resumen' },
  { clave: 'compensacion', titulo: 'Compensación de pérdidas' },
  { clave: 'activos', titulo: 'Por activo' },
  { clave: 'operaciones', titulo: 'Operaciones' },
  { clave: 'rendimientos', titulo: 'Rendimientos' },
  { clave: 'lotes', titulo: 'Lotes FIFO consumidos' },
]

export interface PrefsExport { formato: FormatoExport; secciones: SeccionExport[] }

export const PREFS_POR_DEFECTO: PrefsExport = { formato: 'excel', secciones: ['resumen', 'compensacion', 'activos', 'operaciones', 'rendimientos'] }

/** Preferencias guardadas (JSON en la configuración); las de por defecto si faltan o no valen. */
export function leerPrefs(raw: string | undefined): PrefsExport {
  if (!raw) return PREFS_POR_DEFECTO
  try {
    const p = JSON.parse(raw) as Partial<PrefsExport>
    const formato = FORMATOS.find(f => f.clave === p.formato)?.clave
    const secciones = SECCIONES.map(s => s.clave).filter(s => p.secciones?.includes(s))
    return formato && secciones.length > 0 ? { formato, secciones } : PREFS_POR_DEFECTO
  } catch {
    return PREFS_POR_DEFECTO
  }
}

/** Ruta de la exportación; las secciones solo van en los formatos que las usan, y en su orden. */
export function rutaExport(year: number, p: PrefsExport): string {
  const f = FORMATOS.find(x => x.clave === p.formato)!
  const secciones = SECCIONES.map(s => s.clave).filter(s => p.secciones.includes(s))
  return `/fiscal/${year}/export?format=${p.formato}${f.conSecciones ? `&secciones=${secciones.join(',')}` : ''}`
}

export function nombrePorDefecto(year: number, formato: FormatoExport): string {
  return { csv: `fiscal_${year}.csv`, rentaweb: `fiscal_${year}_rentaweb.csv`, excel: `fiscal_${year}.xlsx`, pdf: `fiscal_${year}.pdf` }[formato]
}
