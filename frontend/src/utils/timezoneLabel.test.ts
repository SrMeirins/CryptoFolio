import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_TIMEZONE, setCurrentTimezone } from '../constants/timezone'
import { timezoneCity, timezoneLabel } from './timezoneLabel'

afterEach(() => setCurrentTimezone(DEFAULT_TIMEZONE))

describe('timezoneLabel (#390)', () => {
  it('con la zona por defecto el texto es el de siempre', () => {
    expect(timezoneLabel()).toBe('hora de Madrid')
  })

  it('sigue la zona actual y nombra en castellano las habituales', () => {
    setCurrentTimezone('Atlantic/Canary')
    expect(timezoneLabel()).toBe('hora de Canarias')
    expect(timezoneLabel('America/New_York')).toBe('hora de Nueva York')
  })

  it('el resto usa la ciudad del identificador; UTC, «hora UTC»', () => {
    expect(timezoneCity('Asia/Ho_Chi_Minh')).toBe('Ho Chi Minh')
    expect(timezoneLabel('UTC')).toBe('hora UTC')
  })
})
