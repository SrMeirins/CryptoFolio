import { describe, expect, it } from 'vitest'
import { dayLabel, filterActivity, groupByDay, localDay, localTimeOf, selectRecent } from './recentActivity'

// Actividad reciente (#237).
const TODAY = '2026-10-15'
const tx = (timestamp: string, group: 'buy' | 'sell' | 'transfer' | 'income' = 'buy') => ({ timestamp, group })

describe('hora de Madrid', () => {
  it('día y hora locales, también con el cambio de horario', () => {
    expect(localDay('2026-10-14T22:30:00Z')).toBe('2026-10-15')       // 00:30 CEST
    expect(localTimeOf('2026-10-14T22:30:00Z')).toBe('00:30')
    expect(localDay('2026-10-25T23:30:00Z')).toBe('2026-10-26')       // 00:30 CET, tras el cambio
    expect(localTimeOf('2026-10-25T23:30:00Z')).toBe('00:30')
  })
})

describe('selectRecent', () => {
  it('últimos 7 días, como máximo 12', () => {
    const txs = [...Array.from({ length: 15 }, () => tx('2026-10-14T10:00:00Z')), tx('2026-10-01T10:00:00Z')]
    expect(selectRecent(txs, TODAY)).toHaveLength(12)
    expect(selectRecent([tx('2026-10-09T10:00:00Z'), tx('2026-10-08T10:00:00Z')], TODAY)).toHaveLength(1)
  })
  it('sin operaciones en 7 días: las 8 más recientes', () => {
    const old = Array.from({ length: 10 }, (_, i) => tx(`2026-09-${String(20 - i).padStart(2, '0')}T10:00:00Z`))
    expect(selectRecent(old, TODAY)).toHaveLength(8)
    expect(selectRecent([], TODAY)).toEqual([])
  })
})

describe('filterActivity', () => {
  it('Todas, Compras, Ventas y Movimientos', () => {
    const items = [tx('2026-10-15T10:00:00Z', 'buy'), tx('2026-10-15T09:00:00Z', 'sell'), tx('2026-10-15T08:00:00Z', 'transfer'), tx('2026-10-15T07:00:00Z', 'income')]
    expect(filterActivity(items, 'all')).toHaveLength(4)
    expect(filterActivity(items, 'buy').map(i => i.group)).toEqual(['buy'])
    expect(filterActivity(items, 'transfer').map(i => i.group)).toEqual(['transfer'])
  })
})

describe('agrupación por día', () => {
  it('«Hoy», «Ayer» y fecha larga; grupos en el orden recibido', () => {
    expect(dayLabel('2026-10-15', TODAY)).toBe('Hoy')
    expect(dayLabel('2026-10-14', TODAY)).toBe('Ayer')
    expect(dayLabel('2026-09-03', TODAY)).toBe('Jueves, 3 sept')
    const groups = groupByDay([tx('2026-10-15T10:00:00Z'), tx('2026-10-15T08:00:00Z'), tx('2026-10-13T10:00:00Z')], TODAY)
    expect(groups.map(g => [g.label, g.items.length])).toEqual([['Hoy', 2], ['Martes, 13 oct', 1]])
  })
})
