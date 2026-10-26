import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_TIMEZONE, getAppTimezone, setCurrentTimezone } from '../constants/timezone'
import { zonedFormat } from './zonedFormat'

// Formateadores en la zona de la aplicación (#390).
afterEach(() => setCurrentTimezone(DEFAULT_TIMEZONE))

const HOUR: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
const instant = new Date('2026-01-15T10:30:00Z')

describe('zonedFormat (#390)', () => {
  it('por defecto formatea en Europe/Madrid', () => {
    expect(getAppTimezone()).toBe('Europe/Madrid')
    expect(zonedFormat('es-ES', HOUR).format(instant)).toBe('11:30')
  })

  it('sigue la zona actual: Canarias una hora menos en invierno', () => {
    setCurrentTimezone('Atlantic/Canary')
    expect(zonedFormat('es-ES', HOUR).format(instant)).toBe('10:30')
    setCurrentTimezone('Asia/Tokyo')
    expect(zonedFormat('es-ES', HOUR).format(instant)).toBe('19:30')
  })

  it('reutiliza el formateador para la misma zona y opciones', () => {
    expect(zonedFormat('es-ES', HOUR)).toBe(zonedFormat('es-ES', HOUR))
    const madrid = zonedFormat('es-ES', HOUR)
    setCurrentTimezone('UTC')
    expect(zonedFormat('es-ES', HOUR)).not.toBe(madrid)
  })
})
