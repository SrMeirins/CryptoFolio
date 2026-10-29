import { describe, expect, it } from 'vitest'
import { healthCards, sinceLabel } from './dataHealth'

// Salud de los datos (#454), con fechas sintéticas.
const now = new Date('2026-01-10T12:00:00Z')

describe('sinceLabel', () => {
  it('minutos, horas y días; sin fecha, «Nunca»', () => {
    expect(sinceLabel(null, now)).toBe('Nunca')
    expect(sinceLabel('2026-01-10T11:59:50Z', now)).toBe('Hace 1 min')
    expect(sinceLabel('2026-01-10T11:15:00Z', now)).toBe('Hace 45 min')
    expect(sinceLabel('2026-01-09T09:00:00Z', now)).toBe('Hace 27 h')
    expect(sinceLabel('2026-01-01T12:00:00Z', now)).toBe('Hace 9 días')
  })
})

describe('healthCards', () => {
  const base = { dbSizeBytes: 15 * 1024 * 1024, lastImportAt: '2026-01-05T10:00:00.000Z', lastFifoAt: '2026-01-06T10:00:00.000Z', lastBackupAt: '2026-01-10T03:00:00.000Z' }

  it('todo al día: sin avisos y el tamaño legible', () => {
    const cards = healthCards(base, now)
    expect(cards.map(c => c.warning)).toEqual([null, null, null, null])
    expect(cards[0].value).toBe('15 MB')
  })

  it('avisa del FIFO anterior a la última importación y de copias antiguas o inexistentes', () => {
    const cards = healthCards({ ...base, lastFifoAt: '2026-01-04T10:00:00.000Z', lastBackupAt: '2026-01-01T00:00:00.000Z' }, now)
    expect(cards.find(c => c.key === 'fifo')?.warning).toBe('Anterior a la última importación')
    expect(cards.find(c => c.key === 'backup')?.warning).toBe('Sin copias recientes')
    expect(healthCards({ ...base, lastBackupAt: null }, now).find(c => c.key === 'backup')?.value).toBe('Nunca')
    expect(healthCards({ ...base, lastImportAt: null, lastFifoAt: null }, now).find(c => c.key === 'fifo')?.warning).toBeNull()
  })
})
