import { describe, expect, it } from 'vitest'
import { T, alpha, ink } from './colors'

describe('colores en estilos en línea (#198)', () => {
  it('los semánticos son variables del tema', () => {
    expect(T.positive).toBe('var(--cf-positive)')
    expect(Object.values(T).every(v => v.startsWith('var(--cf-'))).toBe(true)
  })

  it('alpha usa color-mix y funciona con variables y hexadecimales', () => {
    expect(alpha(T.negative, 12)).toBe('color-mix(in srgb, var(--cf-negative) 12%, transparent)')
    expect(alpha('#6366f1', 9)).toBe('color-mix(in srgb, #6366f1 9%, transparent)')
  })

  it('alpha limita el porcentaje a 0-100', () => {
    expect(alpha('#000000', 150)).toContain(' 100%')
    expect(alpha('#000000', -5)).toContain(' 0%')
  })

  it('ink oscurece según el tema mediante --cf-ink-shade', () => {
    expect(ink('#f59e0b')).toBe('color-mix(in srgb, #f59e0b, black var(--cf-ink-shade))')
  })
})
