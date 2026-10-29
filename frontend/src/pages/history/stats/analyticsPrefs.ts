import type { ChartMode } from './statsChart'

// Preferencias de la analítica del Historial recordadas en este navegador
// (#376): si estaba desplegada, el modo del gráfico y si incluye el margen
// (#403). Si el almacenamiento no
// está disponible, valen solo para la sesión.

const OPEN_KEY = 'cryptofolio.historial.analiticaAbierta'
const MODE_KEY = 'cryptofolio.historial.modoGrafico'
const MARGIN_KEY = 'cryptofolio.historial.incluirMargen'

export function readAnalyticsOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false }
}

export function saveAnalyticsOpen(open: boolean): void {
  try { localStorage.setItem(OPEN_KEY, open ? '1' : '0') } catch { /* almacenamiento no disponible */ }
}

export function readChartMode(): ChartMode {
  try { return localStorage.getItem(MODE_KEY) === 'valor' ? 'valor' : 'ops' } catch { return 'ops' }
}

export function saveChartMode(mode: ChartMode): void {
  try { localStorage.setItem(MODE_KEY, mode) } catch { /* almacenamiento no disponible */ }
}

/** Última elección del margen en el resumen (#403); por defecto, sin margen. */
export function readIncludeMargin(): boolean {
  try { return localStorage.getItem(MARGIN_KEY) === '1' } catch { return false }
}

export function saveIncludeMargin(include: boolean): void {
  try { localStorage.setItem(MARGIN_KEY, include ? '1' : '0') } catch { /* almacenamiento no disponible */ }
}

const MORE_FILTERS_KEY = 'cryptofolio.historial.masFiltros'

/** Si «Más filtros» estaba desplegado (#414). */
export function readMoreFiltersOpen(): boolean {
  try { return localStorage.getItem(MORE_FILTERS_KEY) === '1' } catch { return false }
}

export function saveMoreFiltersOpen(open: boolean): void {
  try { localStorage.setItem(MORE_FILTERS_KEY, open ? '1' : '0') } catch { /* almacenamiento no disponible */ }
}
