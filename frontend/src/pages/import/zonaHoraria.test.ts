import { describe, expect, it } from 'vitest'
import { desfaseDetectado, etiquetaDesfase, OPCIONES_DESFASE, textoDeteccion, textoImpacto } from './zonaHoraria'

// Zona horaria de un CSV de Binance (#599). Datos sintéticos.
describe('etiquetaDesfase y opciones', () => {
  it('UTC, UTC+2, UTC-5', () => {
    expect(etiquetaDesfase(0)).toBe('UTC')
    expect(etiquetaDesfase(2)).toBe('UTC+2')
    expect(etiquetaDesfase(-5)).toBe('UTC-5')
  })
  it('de UTC-12 a UTC+14', () => {
    expect(OPCIONES_DESFASE).toHaveLength(27)
    expect(OPCIONES_DESFASE[0]).toEqual({ value: -12, label: 'UTC-12' })
    expect(OPCIONES_DESFASE.at(-1)).toEqual({ value: 14, label: 'UTC+14' })
  })
})

describe('textoDeteccion y desfaseDetectado', () => {
  const alta = { desfaseHoras: 2, coincidencias: 18, muestras: 20, confianza: 'alta' as const }
  it('comprobando, detectada, dudosa y sin datos', () => {
    expect(textoDeteccion(undefined, true)).toMatch(/^Comprobando/)
    expect(textoDeteccion(alta, false)).toBe('Detectada UTC+2: 18 de 20 órdenes coinciden con el mercado.')
    expect(textoDeteccion({ ...alta, confianza: 'baja', coincidencias: 9 }, false)).toMatch(/^Posible UTC\+2, sin certeza/)
    expect(textoDeteccion({ desfaseHoras: null, coincidencias: 0, muestras: 0, confianza: 'sin_datos' }, false)).toMatch(/^No se pudo comprobar/)
  })
  it('solo se aplica de oficio con confianza alta', () => {
    expect(desfaseDetectado(alta)).toBe(2)
    expect(desfaseDetectado({ ...alta, confianza: 'baja' })).toBeNull()
    expect(desfaseDetectado(undefined)).toBeNull()
  })
})

describe('textoImpacto', () => {
  it('cuántas, cuánto y hacia dónde; las editadas, aparte', () => {
    expect(textoImpacto({ desplazadas: 561, respetadas: 0, cambianDia: 44, cambianAnio: 0 }, 2))
      .toBe('Se desplazarán 561 transacciones 2 horas antes; 44 cambian de día y 0 de año.')
    expect(textoImpacto({ desplazadas: 3, respetadas: 1, cambianDia: 0, cambianAnio: 0 }, -1))
      .toBe('Se desplazarán 3 transacciones 1 hora después; 0 cambian de día y 0 de año. La que tiene la hora editada a mano no se toca.')
    expect(textoImpacto({ desplazadas: 3, respetadas: 2, cambianDia: 0, cambianAnio: 0 }, 1)).toMatch(/Las 2 con la hora editada a mano no se tocan\.$/)
  })
})
