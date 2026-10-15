import { describe, expect, it } from 'vitest'
import {
  activitySubtitle, allocationSubtitle, calendarSubtitle, dashboardSubtitle, evolutionSubtitle, fiscalSubtitle,
  moversSubtitle, portfolioSubtitle,
} from './panelSubtitles'

// Subtítulos con contexto (#232).
describe('subtítulos de página y panel', () => {
  it('Dashboard: resumen, activos y fecha en hora de Madrid', () => {
    expect(dashboardSubtitle(13, new Date(Date.UTC(2026, 9, 15, 10)))).toBe('Resumen de tu cartera · 13 activos · jueves 15 oct')
    expect(dashboardSubtitle(0, new Date(Date.UTC(2026, 9, 15, 23, 30)))).toBe('Resumen de tu cartera · viernes 16 oct')
  })

  it('Portfolio: activos y wallets, con singular', () => {
    expect(portfolioSubtitle(13, 4)).toBe('13 activos en 4 wallets')
    expect(portfolioSubtitle(1, 1)).toBe('1 activo en 1 wallet')
    expect(portfolioSubtitle(0, 0)).toBe('Sin activos en cartera')
  })

  it('Evolución: periodo, inicio del historial y rango', () => {
    expect(evolutionSubtitle('Todo', Date.UTC(2022, 1, 19), null)).toBe('Todo · desde feb 2022')
    expect(evolutionSubtitle('30D', null, null)).toBe('Últimos 30 días')
    expect(evolutionSubtitle('24H', null, null)).toBe('Últimas 24 horas · cada 15 min')
    expect(evolutionSubtitle('Rango', null, { from: '2026-09-01', to: '2026-09-10' })).toBe('1 sept – 10 sept')
    expect(evolutionSubtitle('Rango', null, { from: '2026-09-01', to: '' })).toBe('1 sept')
  })

  it('Distribución: número de activos y el de mayor peso', () => {
    expect(allocationSubtitle([{ name: 'XRP', value: 40 }, { name: 'HBAR', value: 60 }], 100)).toBe('2 activos · HBAR 60%')
    expect(allocationSubtitle([], 0)).toBe('Sin activos con valor')
    expect(allocationSubtitle([{ name: 'Ledger', value: 3 }], 3, 'wallet')).toBe('1 wallet · Ledger 100%')
  })

  it('Fiscal, actividad, variación y calendario', () => {
    expect(fiscalSubtitle(2026, 45)).toBe('Ejercicio 2026 · 45 operaciones')
    expect(fiscalSubtitle(2026, 1)).toBe('Ejercicio 2026 · 1 operación')
    expect(activitySubtitle(8)).toBe('Últimas 8 operaciones')
    expect(activitySubtitle(0)).toBe('Sin operaciones todavía')
    expect(moversSubtitle('24h', 13)).toBe('13 activos · variación en 24 h, en vivo')
    expect(moversSubtitle('total', 1)).toBe('1 activo · sobre el precio medio de compra')
    expect(calendarSubtitle('month', 'Octubre de 2026', 2026)).toBe('Octubre de 2026 · día natural, hora de Madrid')
    expect(calendarSubtitle('year', '', 2026)).toBe('2026 · resumen por meses')
  })
})
