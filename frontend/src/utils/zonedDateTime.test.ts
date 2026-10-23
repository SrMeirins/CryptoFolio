import { describe, expect, it } from 'vitest'
import { fromZonedInput, toZonedInput } from './zonedDateTime'

// Hora del asistente en la zona de la app (#378): antes se mostraba en UTC y,
// al tocarla, se interpretaba en la zona del navegador (desfase de 1-2 h).
const TZ = 'Europe/Madrid'

describe('toZonedInput (#378)', () => {
  it('muestra la hora local de la zona en verano e invierno, con segundos', () => {
    expect(toZonedInput('2026-09-03T15:11:05Z', TZ)).toBe('2026-09-03T17:11:05')
    expect(toZonedInput('2026-01-15T10:30:00Z', TZ)).toBe('2026-01-15T11:30:00')
  })

  it('cambia de día cuando la hora local ya es el día siguiente', () => {
    expect(toZonedInput('2025-12-31T23:30:00Z', TZ)).toBe('2026-01-01T00:30:00')
  })

  it('un valor inválido da cadena vacía', () => {
    expect(toZonedInput('no-es-fecha', TZ)).toBe('')
  })
})

describe('fromZonedInput (#378)', () => {
  it('interpreta la hora escrita en la zona de la app', () => {
    expect(fromZonedInput('2026-09-03T17:11:05', TZ)).toBe('2026-09-03T15:11:05.000Z')
    expect(fromZonedInput('2026-01-15T11:30', TZ)).toBe('2026-01-15T10:30:00.000Z')
    expect(fromZonedInput('2026-01-01T00:30:00', TZ)).toBe('2025-12-31T23:30:00.000Z')
  })

  it('ida y vuelta sin desplazamiento (el fallo anterior restaba 1-2 h)', () => {
    for (const iso of ['2026-09-03T15:11:05.000Z', '2026-01-15T10:30:00.000Z', '2026-03-29T00:59:59.000Z', '2026-10-25T00:30:00.000Z']) {
      expect(fromZonedInput(toZonedInput(iso, TZ), TZ)).toBe(iso)
    }
  })

  it('cambio de hora: la inexistente pasa a la siguiente válida; la repetida toma la primera', () => {
    expect(fromZonedInput('2026-03-29T02:30', TZ)).toBe('2026-03-29T01:30:00.000Z') // 03:30 CEST
    expect(fromZonedInput('2026-10-25T02:30', TZ)).toBe('2026-10-25T00:30:00.000Z') // primera 02:30 (CEST)
  })

  it('formato no válido → cadena vacía', () => {
    expect(fromZonedInput('', TZ)).toBe('')
    expect(fromZonedInput('2026-13-01', TZ)).toBe('')
  })
})
