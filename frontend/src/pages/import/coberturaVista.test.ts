import { describe, expect, it } from 'vitest'
import { fechasParaCopiar, marcasAnio, rangoExportar, segmento, textoEncaje } from './coberturaVista'

// Cobertura temporal (#328). Datos sintéticos.
describe('coberturaVista', () => {
  it('posiciona un tramo en porcentaje de la escala, con anchura mínima', () => {
    expect(segmento('2024-01-01', '2024-12-31', '2024-01-01', '2025-12-31').left).toBe(0)
    const mitad = segmento('2025-01-01', '2025-12-31', '2024-01-01', '2025-12-31')
    expect(mitad.left).toBeCloseTo(50.07, 1)
    expect(mitad.left + mitad.width).toBeCloseTo(100, 5)
    expect(segmento('2024-06-01', '2024-06-01', '2020-01-01', '2026-12-31').width).toBe(0.6)
  })

  it('una marca por año dentro de la escala', () => {
    expect(marcasAnio('2022-02-15', '2026-10-20').map(m => m.anio)).toEqual([2023, 2024, 2025, 2026])
    expect(marcasAnio('2026-06-25', '2026-10-20')).toEqual([])
  })



  it('textos y fechas para exportar', () => {
    const h = { desde: '2026-06-17', hasta: '2026-10-20', dias: 126, revisionId: null }
    expect(rangoExportar(h)).toBe('del 17 jun 2026 al 20 oct 2026')
    expect(fechasParaCopiar(h)).toBe('17/06/2026 – 20/10/2026')
    expect(textoEncaje({ tipo: 'deja_hueco', exchange: 'binance', desde: '2026-06-17', hasta: '2026-06-30', dias: 14 }))
      .toBe('Deja un hueco de 14 días en Binance del 17 jun 2026 al 30 jun 2026: si operaste entonces, exporta ese tramo.')
    expect(textoEncaje({ tipo: 'primera', exchange: 'binance', desde: '2022-02-15', hasta: '2026-06-16', dias: 126 }))
      .toBe('Primera importación de Binance: del 15 feb 2022 al 16 jun 2026; faltan 126 días hasta hoy.')
    expect(textoEncaje({ tipo: 'al_dia', exchange: 'bitvavo', desde: '2026-09-04', hasta: '2026-10-19', dias: 0 })).toBe('Pone Bitvavo al día hasta el 19 oct 2026.')
  })
})
