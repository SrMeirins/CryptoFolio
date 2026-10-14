import { describe, expect, it } from 'vitest'
import { assetHue, assetInitials } from './assetInitials'

describe('assetInitials (#201)', () => {
  it('dos caracteres alfanuméricos en mayúsculas', () => {
    expect(assetInitials('btc')).toBe('BT')
    expect(assetInitials('1000SATS')).toBe('10')
    expect(assetInitials('X')).toBe('X')
    expect(assetInitials('--')).toBe('?')
  })

  it('el tono es estable, válido y no depende de mayúsculas', () => {
    expect(assetHue('ONDO')).toBe(assetHue('ONDO'))
    expect(assetHue('ondo')).toBe(assetHue('ONDO'))
    for (const s of ['BTC', 'ETH', 'PYTH', 'WIF', '1000SATS']) {
      const h = assetHue(s)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })

  it('reparte colores distintos entre símbolos distintos', () => {
    const hues = new Set(['BTC', 'ETH', 'XRP', 'ADA', 'DOT', 'LINK', 'HBAR', 'ONDO'].map(assetHue))
    expect(hues.size).toBeGreaterThanOrEqual(6)
  })
})
