import type { ChartMode } from './statsChart'

// Preferencias de la analítica del Historial recordadas en este navegador
// (#376): si estaba desplegada y el modo del gráfico. Si el almacenamiento no
// está disponible, valen solo para la sesión.

const OPEN_KEY = 'cryptofolio.historial.analiticaAbierta'
const MODE_KEY = 'cryptofolio.historial.modoGrafico'

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
