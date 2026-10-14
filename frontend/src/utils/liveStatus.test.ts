import { describe, expect, it } from 'vitest'
import { liveStatus } from './liveStatus'

const now = 1_000_000

describe('liveStatus (#194)', () => {
  it('sin conexión: offline', () => {
    expect(liveStatus({ connected: false, feedAgeMs: 0, statusAt: now, now })).toBe('offline')
  })

  it('conectado con datos recientes del feed: live', () => {
    expect(liveStatus({ connected: true, feedAgeMs: 2_000, statusAt: now - 5_000, now })).toBe('live')
  })

  it('conectado pero el feed lleva más de 60 s sin datos: stale', () => {
    expect(liveStatus({ connected: true, feedAgeMs: 61_000, statusAt: now, now })).toBe('stale')
  })

  it('la antigüedad sigue contando desde el último estado recibido', () => {
    // El backend dijo 50 s hace 15 s: ya son 65 s sin datos.
    expect(liveStatus({ connected: true, feedAgeMs: 50_000, statusAt: now - 15_000, now })).toBe('stale')
  })

  it('el feed aún no ha entregado ningún dato: stale', () => {
    expect(liveStatus({ connected: true, feedAgeMs: null, statusAt: now, now })).toBe('stale')
  })

  it('sin ningún estado del backend (versión anterior o aún no llegado): live mientras haya conexión', () => {
    expect(liveStatus({ connected: true, feedAgeMs: null, statusAt: null, now })).toBe('live')
  })
})
