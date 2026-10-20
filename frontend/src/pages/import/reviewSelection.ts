import type { PreviewResult, PreviewTransaction } from './types'

// Qué hay que revisar antes de importar (#316): solo lo nuevo. Las filas ya
// importadas no se vuelven a pedir, porque el backend descarta sus destinos y
// costes. Funciones puras.

export const txKey = (tx: PreviewTransaction) => tx.rawRowHashes?.[0] ?? `${tx.timestamp}|${tx.asset}|${tx.amount}`

/** Transacciones nuevas del archivo (marca `isNew` del backend). */
export function newTransactions(preview: PreviewResult): PreviewTransaction[] {
  return preview.transactions.filter(tx => tx.isNew === true)
}

/** Retiros nuevos, en orden cronológico. */
export function newWithdrawals(preview: PreviewResult): PreviewTransaction[] {
  return newTransactions(preview)
    .filter(tx => tx.operationType === 'WITHDRAW')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

/** Nada que importar: ni filas nuevas ni depósitos pendientes de coste. */
export function nadaQueImportar(preview: PreviewResult): boolean {
  return preview.newCount === 0 && preview.depositReviews.length === 0
}

/** Lote en el que ningún archivo se ha podido leer (#326). */
export function loteIlegible(preview: PreviewResult): boolean {
  const archivos = preview.archivos ?? []
  return archivos.length > 1 && archivos.every(a => a.estado === 'no_reconocido')
}
