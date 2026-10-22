import { describe, expect, it } from 'vitest'
import { appToday, datePresets } from './datePresets'

const byId = (today: string) => Object.fromEntries(datePresets(today).map(p => [p.id, [p.from, p.to]]))

describe('atajos de fecha (#366)', () => {
  it('rangos relativos a hoy', () => {
    expect(byId('2026-10-22')).toEqual({
      hoy: ['2026-10-22', '2026-10-22'],
      '30d': ['2026-09-23', '2026-10-22'],
      mes: ['2026-10-01', '2026-10-22'],
      'mes-pasado': ['2026-09-01', '2026-09-30'],
      anio: ['2026-01-01', '2026-10-22'],
      'anio-pasado': ['2025-01-01', '2025-12-31'],
    })
  })

  it('cambio de año y febrero bisiesto', () => {
    expect(byId('2026-01-10')['mes-pasado']).toEqual(['2025-12-01', '2025-12-31'])
    expect(byId('2024-03-05')['mes-pasado']).toEqual(['2024-02-01', '2024-02-29'])
    expect(byId('2026-01-10')['30d']).toEqual(['2025-12-12', '2026-01-10'])
  })

  it('hoy en la zona de la app, no en UTC: las 23:30Z del 31/12 ya son 1 de enero en Madrid', () => {
    expect(appToday(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01')
  })
})
