import { describe, expect, it } from 'vitest'
import { buildInitialFields } from './operationWizardFields'

const NOW = '2026-01-15T10:00:00.000Z'
const now = () => NOW

describe('buildInitialFields', () => {
  it('alta manual sin datos previos: fecha por defecto = ahora', () => {
    expect(buildInitialFields({}, undefined, now)).toEqual({ timestamp: NOW })
  })

  it('modo edición: conserva los campos guardados, incluida su fecha', () => {
    const base = { timestamp: '2024-05-01T08:00:00.000Z', asset: 'BTC', amount: 0.5 }
    expect(buildInitialFields(base, undefined, now)).toEqual(base)
  })

  it('operación de CSV: fecha, activo y cantidad vienen del CSV, nunca de "ahora"', () => {
    const seed = { timestamp: '2023-12-23T06:26:48.000Z', asset: 'USTC', amount: 100 }
    expect(buildInitialFields({}, seed, now)).toEqual(seed)
  })

  it('no muta el objeto base recibido', () => {
    const base = { asset: 'ETH' }
    buildInitialFields(base, undefined, now)
    expect(base).toEqual({ asset: 'ETH' })
  })
})
