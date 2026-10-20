import { esCabeceraRetiradas } from './direcciones'
import { firmaArchivo } from './wizard'
import type { ArchivoLote } from './types'

// Lote de varios archivos (#326): selección en el paso Subir. Lógica pura salvo la lectura de la cabecera.

export type ExchangeId = 'binance' | 'bitvavo'
export const MAX_POR_TIPO = 5

export interface ArchivoSel {
  id: string
  file: File
  tipo: 'transacciones' | 'retiradas'
  /** Exchange detectado en el navegador por la cabecera (orientativo: manda el servidor). */
  exchange: ExchangeId | null
  /** Exchange elegido con «Leer como…»; null = detectar. */
  forzado: ExchangeId | null
}

/** Exchange de un historial de transacciones por su primera línea; null si no se reconoce. */
export function exchangeDeCabecera(primeraLinea: string): ExchangeId | null {
  const cols = new Set(primeraLinea.replace(/^\uFEFF/, '').split(',').map(c => c.trim().replace(/^"|"$/g, '').toLowerCase()))
  if (cols.has('timezone') && cols.has('currency') && cols.has('type')) return 'bitvavo'
  if ((cols.has('operation') || cols.has('operación')) && (cols.has('coin') || cols.has('moneda'))) return 'binance'
  return null
}

export async function clasificarArchivo(file: File): Promise<ArchivoSel> {
  const primera = (await file.slice(0, 4096).text()).split(/\r?\n/)[0] ?? ''
  const retiradas = esCabeceraRetiradas(primera)
  return { id: firmaArchivo(file), file, tipo: retiradas ? 'retiradas' : 'transacciones', exchange: retiradas ? 'binance' : exchangeDeCabecera(primera), forzado: null }
}

/** Añade sin repetir el mismo archivo; error si se supera el máximo por tipo. */
export function anadirASeleccion(actual: readonly ArchivoSel[], nuevos: readonly ArchivoSel[]): { seleccion: ArchivoSel[]; error: string | null } {
  const seleccion = [...actual]
  for (const n of nuevos) if (!seleccion.some(s => s.id === n.id)) seleccion.push(n)
  const tx = seleccion.filter(s => s.tipo === 'transacciones').length
  const ret = seleccion.length - tx
  if (tx > MAX_POR_TIPO || ret > MAX_POR_TIPO) {
    return { seleccion: [...actual], error: `Como máximo ${MAX_POR_TIPO} historiales de transacciones y ${MAX_POR_TIPO} de retiradas por lote` }
  }
  return { seleccion, error: null }
}

/** Firma del lote: la misma selección conserva lo asignado en la revisión. */
export function firmaLote(seleccion: readonly ArchivoSel[]): string {
  return seleccion.map(s => s.id).sort().join('||')
}

/**
 * Archivos que se envían a importar: los que traen algo nuevo. Si ninguno lo trae
 * (solo hay costes de depósitos que guardar), el primero reconocido, como con un solo archivo.
 */
export function indicesAConfirmar(archivos: readonly ArchivoLote[]): number[] {
  const listos = archivos.filter(a => a.estado === 'listo').map(a => a.indice)
  if (listos.length > 0) return listos
  const reconocido = archivos.find(a => a.estado !== 'no_reconocido')
  return reconocido ? [reconocido.indice] : []
}
