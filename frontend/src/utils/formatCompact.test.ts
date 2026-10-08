import { describe, expect, it } from 'vitest'
import { formatEurCompact } from './format'

// Intl usa un espacio duro antes del símbolo: se normaliza para comparar.
const plain = (s: string) => s.replace(/\s/g, ' ')

describe('formatEurCompact', () => {
  it('redondea a euros sin decimales', () => {
    expect(plain(formatEurCompact(146.2))).toBe('146 €')
    expect(plain(formatEurCompact(-202.57))).toBe('-203 €')
  })

  it('agrupa miles con el formato español', () => {
    expect(plain(formatEurCompact(12345.6))).toBe('12.346 €')
  })
})
