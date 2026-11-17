import { describe, expect, it } from 'vitest'
import { GRAFICO_MARCAS_KEY, marcasGrafico, marcasLabel } from './graficoMarcas'

// Marcas del gráfico de precio del detalle (#528).
describe('marcasGrafico', () => {
  it('lee el valor guardado y, si falta o no es válido, usa puntos', () => {
    expect(marcasGrafico({ [GRAFICO_MARCAS_KEY]: 'banderas-abajo' })).toBe('banderas-abajo')
    expect(marcasGrafico({ [GRAFICO_MARCAS_KEY]: 'otra' })).toBe('puntos')
    expect(marcasGrafico(undefined)).toBe('puntos')
    expect(marcasLabel('banderas-arriba')).toBe('Banderas arriba')
  })
})
