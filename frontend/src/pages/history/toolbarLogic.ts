import type { HistoryFilterState } from './urlState'
import { selectedYear } from './keyboard/yearNav'

// Barra de filtros por niveles del Historial (#414): sugerencias del buscador
// y número de filtros activos dentro de «Más filtros». Funciones puras.

export interface Suggestion { kind: 'asset' | 'wallet'; value: string; label: string }

export const MAX_SUGGESTIONS = 6

/**
 * Activos y wallets que coinciden con lo escrito: primero los que empiezan
 * por ello, después los que lo contienen; sin los ya filtrados. Sin texto, nada.
 */
export function searchSuggestions(
  query: string, assets: readonly string[], wallets: readonly { id: string; name: string }[],
  current: Pick<HistoryFilterState, 'assets' | 'wallet_id'>,
): Suggestion[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const rank = (text: string) => (text.toLowerCase().startsWith(q) ? 0 : text.toLowerCase().includes(q) ? 1 : 2)
  const byRank = <T,>(items: T[], text: (x: T) => string) =>
    items.filter(x => rank(text(x)) < 2).sort((a, b) => rank(text(a)) - rank(text(b)) || text(a).localeCompare(text(b)))
  const assetHits = byRank(assets.filter(a => !current.assets.includes(a)), a => a)
    .map(a => ({ kind: 'asset' as const, value: a, label: a }))
  const walletHits = byRank(wallets.filter(w => w.id !== current.wallet_id), w => w.name)
    .map(w => ({ kind: 'wallet' as const, value: w.id, label: w.name }))
  // Hueco para las wallets aunque haya muchos activos que coincidan.
  const walletSlots = Math.min(walletHits.length, 2)
  return [...assetHits.slice(0, MAX_SUGGESTIONS - walletSlots), ...walletHits].slice(0, MAX_SUGGESTIONS)
}

/**
 * Filtros activos dentro del panel «Filtros» (#552): wallet, fechas exactas,
 * importe, archivo, manuales, editadas y la cuenta de enlaces antiguos. Un año
 * completo no cuenta: se elige y se ve en el selector de la barra.
 */
export function secondaryFilterCount(f: HistoryFilterState): number {
  const fechas = !!(f.date_from || f.date_to) && selectedYear(f.date_from, f.date_to) === null
  return [
    !!f.wallet_id, fechas, !!(f.value_min || f.value_max), !!f.import_id,
    f.manualOnly, f.editedOnly, !!f.account,
  ].filter(Boolean).length
}

/**
 * Cambio que quita solo los filtros del panel (#552): wallet, fechas exactas,
 * importe, archivo, manuales, editadas y cuenta. Un año completo, que vive en
 * la barra, se conserva.
 */
export function quitarDelPanel(f: HistoryFilterState): Partial<HistoryFilterState> {
  const patch: Partial<HistoryFilterState> = {
    wallet_id: '', import_id: '', value_min: '', value_max: '', manualOnly: false, editedOnly: false, account: '',
  }
  if (selectedYear(f.date_from, f.date_to) === null) Object.assign(patch, { date_from: '', date_to: '' })
  return patch
}
