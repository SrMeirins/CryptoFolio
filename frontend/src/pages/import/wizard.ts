import { formatNumber } from '../../utils/format'

// Asistente de importación (#318): pasos, firma del archivo para conservar el
// trabajo al volver, última importación por exchange y texto de lo que falta.
// Funciones puras.

export type Stage = 'upload' | 'preview' | 'catalog' | 'progress' | 'done'
export type Paso = 'subir' | 'revisar' | 'importar' | 'listo'

export const PASOS: { id: Paso; label: string }[] = [
  { id: 'subir', label: 'Subir' },
  { id: 'revisar', label: 'Revisar' },
  { id: 'importar', label: 'Importar' },
  { id: 'listo', label: 'Listo' },
]

export function pasoDeStage(stage: Stage): Paso {
  return stage === 'upload' ? 'subir' : stage === 'preview' || stage === 'catalog' ? 'revisar' : stage === 'progress' ? 'importar' : 'listo'
}

/** Se puede volver a un paso anterior mientras no se esté importando (y desde Listo, solo a Subir). */
export function puedeIrA(destino: Paso, actual: Paso): boolean {
  const i = PASOS.findIndex(p => p.id === destino), j = PASOS.findIndex(p => p.id === actual)
  if (i >= j || actual === 'importar') return false
  return actual === 'listo' ? destino === 'subir' : true
}

/** Identifica un archivo para saber si se vuelve a subir el mismo. */
export function firmaArchivo(f: { name: string; size: number; lastModified: number }): string {
  return `${f.name}|${f.size}|${f.lastModified}`
}

export const EXCHANGE_LABEL: Record<string, string> = { binance: 'Binance', bitvavo: 'Bitvavo' }


const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** «Faltan 3 retiros por asignar y 1 depósito por valorar»; null si no falta nada. */
export function textoPendiente(p: { retiros: number; depositos: number; operaciones: number }): string | null {
  const partes = [
    p.retiros > 0 && `${plural(p.retiros, 'retiro', 'retiros')} por asignar`,
    p.depositos > 0 && `${plural(p.depositos, 'depósito', 'depósitos')} por valorar`,
    p.operaciones > 0 && `${plural(p.operaciones, 'operación desconocida', 'operaciones desconocidas')} por catalogar`,
  ].filter(Boolean) as string[]
  if (partes.length === 0) return null
  const total = p.retiros + p.depositos + p.operaciones
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`
  return `${total === 1 ? 'Falta' : 'Faltan'} ${lista}`
}

// Mismos límites que el backend: feedback instantáneo antes de subir.
const MAX_FILE_SIZE = 10 * 1024 * 1024

export function validateFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.csv')) return 'Solo se aceptan archivos .csv'
  if (file.size > MAX_FILE_SIZE) return `El archivo supera el máximo de 10 MB (${formatNumber(file.size / 1024 / 1024, 1, 1)} MB)`
  return null
}
