import type { HistoryFilterState } from './urlState'

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

/** Filtros activos dentro de «Más filtros» (fechas, importe, archivo, manuales, editadas, cuenta antigua). */
export function secondaryFilterCount(f: HistoryFilterState): number {
  return [
    !!(f.date_from || f.date_to), !!(f.value_min || f.value_max), !!f.import_id,
    f.manualOnly, f.editedOnly, !!f.account,
  ].filter(Boolean).length
}
