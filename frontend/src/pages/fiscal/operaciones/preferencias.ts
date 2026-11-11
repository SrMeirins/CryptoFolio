import { useState } from 'react'

// Columnas y densidad de la tabla de Operaciones (#543): se recuerdan en este
// equipo. Fecha, Par y Resultado son fijas; el resto se puede ocultar.

export type ColumnaOpcional = 'tipo' | 'cantidad' | 'clave' | 'transmision' | 'gastosTransmision' | 'adquisicion' | 'gastosAdquisicion' | 'renta'
export type Densidad = 'comoda' | 'compacta'

export const COLUMNAS_OPCIONALES: ReadonlyArray<{ value: ColumnaOpcional; label: string }> = [
  { value: 'tipo', label: 'Tipo (junto al par)' },
  { value: 'cantidad', label: 'Cantidad' },
  { value: 'clave', label: 'Clave 1800' },
  { value: 'transmision', label: 'Transmisión' },
  { value: 'gastosTransmision', label: 'Gastos de transmisión' },
  { value: 'adquisicion', label: 'Adquisición' },
  { value: 'gastosAdquisicion', label: 'Gastos de adquisición' },
  { value: 'renta', label: 'Renta' },
]
/** Relleno vertical de las celdas según la densidad. */
export const PADDING: Record<Densidad, string> = { comoda: 'py-2.5', compacta: 'py-1.5' }

const TODAS = COLUMNAS_OPCIONALES.map(c => c.value)
/** Por defecto, todas salvo Cantidad: así caben las cuatro cifras de la Renta. */
const POR_DEFECTO = TODAS.filter(c => c !== 'cantidad')

/** Hay algún gasto de cada tipo en lo que se ve: si no, su columna no aparece. */
export interface Presencia { gastosTransmision: boolean; gastosAdquisicion: boolean }

/** Columnas opcionales que se ven, en su orden: las elegidas y, las de gastos, solo si hay alguno. */
export function columnasVisibles(elegidas: readonly ColumnaOpcional[], presencia: Presencia): Set<ColumnaOpcional> {
  return new Set(TODAS.filter(c => elegidas.includes(c)
    && (c !== 'gastosTransmision' || presencia.gastosTransmision)
    && (c !== 'gastosAdquisicion' || presencia.gastosAdquisicion)))
}

/** Columnas de la tabla además de Fecha, Par, Resultado y Detalle (el tipo va dentro del par). */
export const columnasExtra = (vis: ReadonlySet<ColumnaOpcional>) => [...vis].filter(c => c !== 'tipo').length
const CLAVE = 'cflio_fiscal_operaciones'

interface Preferencias { columnas: ColumnaOpcional[]; densidad: Densidad }

/** Lee las preferencias guardadas; ante cualquier dato raro, las de por defecto. */
export function leerPreferencias(raw: string | null): Preferencias {
  const defecto: Preferencias = { columnas: [...POR_DEFECTO], densidad: 'comoda' }
  if (!raw) return defecto
  try {
    const p = JSON.parse(raw) as Partial<Preferencias>
    // La antigua columna «gastos» (una sola) se convierte en las dos de la Renta.
    const guardadas = Array.isArray(p.columnas)
      ? (p.columnas as string[]).flatMap(c => (c === 'gastos' ? ['gastosTransmision', 'gastosAdquisicion'] : [c]))
      : null
    const columnas = guardadas ? guardadas.filter((c): c is ColumnaOpcional => TODAS.includes(c as ColumnaOpcional)) : defecto.columnas
    const densidad = p.densidad === 'compacta' ? 'compacta' : 'comoda'
    return { columnas, densidad }
  } catch {
    return defecto
  }
}

export function useTablaPreferencias() {
  const [prefs, setPrefs] = useState<Preferencias>(() => {
    try { return leerPreferencias(localStorage.getItem(CLAVE)) } catch { return leerPreferencias(null) }
  })
  const guardar = (p: Preferencias) => {
    setPrefs(p)
    try { localStorage.setItem(CLAVE, JSON.stringify(p)) } catch { /* sin almacenamiento: solo en esta sesión */ }
  }
  return {
    ...prefs,
    setColumnas: (columnas: ColumnaOpcional[]) => guardar({ ...prefs, columnas }),
    setDensidad: (densidad: Densidad) => guardar({ ...prefs, densidad }),
  }
}
