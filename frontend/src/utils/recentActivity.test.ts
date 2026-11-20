import { describe, expect, it } from 'vitest'
import { agruparRafagas, dayLabel, diasDesde, filterActivity, groupByDay, limitarFilas, localDay, localTimeOf, selectRecent } from './recentActivity'

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
  it('últimos 7 días, todas (el tope de filas va tras agrupar ráfagas, #516)', () => {
    const txs = [...Array.from({ length: 15 }, () => tx('2026-10-14T10:00:00Z')), tx('2026-10-01T10:00:00Z')]
    expect(selectRecent(txs, TODAY)).toHaveLength(15)
    expect(selectRecent([tx('2026-10-09T10:00:00Z'), tx('2026-10-08T10:00:00Z')], TODAY)).toHaveLength(1)
  })
  it('sin operaciones en 7 días: las 10 más recientes', () => {
    const old = Array.from({ length: 12 }, (_, i) => tx(`2026-09-${String(20 - i).padStart(2, '0')}T10:00:00Z`))
    expect(selectRecent(old, TODAY)).toHaveLength(10)
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

describe('agruparRafagas y diasDesde (#516)', () => {
  const op = (id: string, operation_type: string, asset: string, timestamp: string) => ({ tx: { id, operation_type, asset, timestamp } })
  it('agrupa seguidas del mismo tipo, activo y minuto; el resto, solas', () => {
    const r = agruparRafagas([
      op('a', 'BUY', 'XRP', '2026-10-14T10:00:05Z'),
      op('b', 'BUY', 'XRP', '2026-10-14T10:00:40Z'),
      op('c', 'BUY', 'XRP', '2026-10-14T10:00:59Z'),
      op('d', 'BUY', 'XRP', '2026-10-14T10:01:00Z'),
      op('e', 'SELL', 'XRP', '2026-10-14T10:01:10Z'),
      op('f', 'BUY', 'ADA', '2026-10-14T10:01:20Z'),
    ])
    expect(r.map(g => [g.key, g.items.length])).toEqual([['a', 3], ['d', 1], ['e', 1], ['f', 1]])
  })
  it('el minuto es el de la zona de la app y la agrupación cruza bien la medianoche UTC', () => {
    // 23:00:10 y 23:00:50 UTC son las 00:00 del día siguiente en Madrid: misma ráfaga.
    const r = agruparRafagas([op('a', 'STAKING_REWARD', 'ADA', '2026-10-14T23:00:10Z'), op('b', 'STAKING_REWARD', 'ADA', '2026-10-14T23:00:50Z')])
    expect(r).toHaveLength(1)
  })
  it('días desde una operación en la zona de la app', () => {
    expect(diasDesde('2026-10-14T10:00:00Z', '2026-10-14')).toBe(0)
    expect(diasDesde('2026-09-13T22:30:00Z', '2026-10-14')).toBe(30)
  })
})

describe('limitarFilas (#516)', () => {
  it('como mucho N filas en total, sin días vacíos', () => {
    const r = limitarFilas([{ day: 'a', filas: [1, 2, 3] }, { day: 'b', filas: [4, 5] }, { day: 'c', filas: [6] }], 4)
    expect(r).toEqual([{ day: 'a', filas: [1, 2, 3] }, { day: 'b', filas: [4] }])
  })
})
