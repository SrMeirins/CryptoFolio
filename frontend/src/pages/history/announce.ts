import { formatNumber } from '../../utils/format'
import type { SortState } from './sorting'

// Texto de la región viva del Historial (#351): lo que oye el lector de
// pantalla tras cambiar filtros, orden o página.

const SORT_NAMES: Record<SortState['key'], string> = { fecha: 'fecha', valor: 'valor', activo: 'activo', tipo: 'tipo' }

export function resultAnnouncement(s: {
  loading: boolean; total: number; filtered: boolean; page: number; totalPages: number; sort: SortState
}): string {
  if (s.loading) return 'Cargando…'
  if (s.total === 0) return s.filtered ? 'Sin resultados para estos filtros' : 'Sin transacciones importadas'
  const count = `${formatNumber(s.total, 0)} ${s.total === 1 ? 'transacción' : 'transacciones'}${s.filtered ? (s.total === 1 ? ' filtrada' : ' filtradas') : ''}`
  const page = `página ${s.page} de ${Math.max(s.totalPages, 1)}`
  const order = `ordenadas por ${SORT_NAMES[s.sort.key]} ${s.sort.dir === 'asc' ? 'ascendente' : 'descendente'}`
  return `${count}, ${page}, ${order}`
}
