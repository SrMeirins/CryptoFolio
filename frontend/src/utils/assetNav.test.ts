import { describe, expect, it } from 'vitest'
import { assetPosition, neighbourAsset } from './assetNav'

// Navegación entre activos con [ y ] (#528).
describe('neighbourAsset', () => {
  const order = ['AAA', 'BBB', 'CCC', 'BBB']
  it('anterior y siguiente en el orden de la tabla, de forma circular y sin repetir', () => {
    expect(neighbourAsset(order, 'BBB', 1)).toBe('CCC')
    expect(neighbourAsset(order, 'CCC', 1)).toBe('AAA')
    expect(neighbourAsset(order, 'AAA', -1)).toBe('CCC')
    expect(assetPosition(order, 'CCC')).toEqual({ index: 3, total: 3 })
  })
  it('sin otro activo o fuera de la lista, no navega', () => {
    expect(neighbourAsset(['AAA'], 'AAA', 1)).toBeNull()
    expect(neighbourAsset(order, 'ZZZ', 1)).toBeNull()
    expect(assetPosition(order, 'ZZZ')).toBeNull()
  })
})
