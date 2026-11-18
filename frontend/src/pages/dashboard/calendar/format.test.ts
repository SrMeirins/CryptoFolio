import { describe, expect, it } from 'vitest'
import { setAmountsHidden } from '../../../utils/format'
import { signedTiny } from './format'

describe('signedTiny (#512)', () => {
  it('sin moneda, con k desde mil y signo', () => {
    expect(signedTiny(1234)).toBe('+1,2k')
    expect(signedTiny(-85.4)).toBe('−85')
    expect(signedTiny(12_500)).toBe('+13k')
    expect(signedTiny(0.2)).toBe('0')
  })
  it('con los importes ocultos no muestra la cifra', () => {
    setAmountsHidden(true)
    expect(signedTiny(1234)).toBe('•••')
    setAmountsHidden(false)
  })
})
