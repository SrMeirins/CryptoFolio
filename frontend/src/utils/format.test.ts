import { describe, expect, it } from 'vitest'
import { formatEurSigned, pnlColor } from './format'

// Importes con signo (#541).
describe('formatEurSigned (#541)', () => {
  it('signo explícito; por debajo de medio céntimo, 0,00 € sin signo', () => {
    expect(formatEurSigned(12)).toMatch(/^\+12,00\s€$/)
    expect(formatEurSigned(-3.4)).toMatch(/^-3,40\s€$/)
    expect(formatEurSigned(-0.003)).toMatch(/^0,00\s€$/)
    expect(formatEurSigned(0.004)).toMatch(/^0,00\s€$/)
    expect(formatEurSigned(0)).toMatch(/^0,00\s€$/)
  })
})

describe('pnlColor (#541)', () => {
  it('neutro si la cifra se muestra como 0,00', () => {
    expect(pnlColor(0.01)).toBe('text-positive')
    expect(pnlColor(-0.01)).toBe('text-negative')
    expect(pnlColor(-0.003)).toBe('text-fg-muted')
    expect(pnlColor(0)).toBe('text-fg-muted')
  })
})
