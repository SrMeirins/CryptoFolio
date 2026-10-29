import { describe, expect, it } from 'vitest'
import { dustThresholdEur, privacyOnStart, startPage } from './preferences'

// Preferencias de General (#446).
describe('preferencias', () => {
  it('umbral de polvo: el guardado o 1 € si falta o no es válido', () => {
    expect(dustThresholdEur(undefined)).toBe(1)
    expect(dustThresholdEur({ dust_threshold_eur: '2.5' })).toBe(2.5)
    expect(dustThresholdEur({ dust_threshold_eur: '0' })).toBe(0)
    for (const v of ['abc', '-1', '1001', '1,5', '']) expect(dustThresholdEur({ dust_threshold_eur: v })).toBe(1)
  })

  it('privacidad al abrir solo con true', () => {
    expect(privacyOnStart({ privacy_on_start: 'true' })).toBe(true)
    expect(privacyOnStart({ privacy_on_start: 'false' })).toBe(false)
    expect(privacyOnStart({})).toBe(false)
  })

  it('página de inicio: solo de la lista; cualquier otra, el Dashboard', () => {
    expect(startPage({ start_page: '/fiscal' })).toBe('/fiscal')
    for (const v of ['https://ejemplo.invalid', '//evil', '/settings', undefined]) expect(startPage({ start_page: v as string })).toBe('/')
  })
})
