import { describe, expect, it } from 'vitest'
import { describirAlerta, estadoAlerta, precioEnMoneda } from './alertas'

// Alertas en la interfaz (#519), con datos sintéticos.
const base = { tipo: 'precio' as const, sentido: 'por_encima' as const, precio: 0.6, moneda: 'EUR' as const, repeticion: 'una_vez' as const, umbral_pct: null, activa: true, armada: true, ultimo_disparo_at: null }

describe('estadoAlerta', () => {
  it('vigilando, pausada, disparada y esperando a que vuelva', () => {
    expect(estadoAlerta(base)).toBe('vigilando')
    expect(estadoAlerta({ ...base, activa: false })).toBe('pausada')
    expect(estadoAlerta({ ...base, activa: false, ultimo_disparo_at: '2026-11-20T12:00:00Z' })).toBe('disparada')
    expect(estadoAlerta({ ...base, repeticion: 'cada_vez', armada: false, ultimo_disparo_at: '2026-11-20T12:00:00Z' })).toBe('rearmando')
    expect(estadoAlerta({ ...base, tipo: 'cartera', armada: false })).toBe('vigilando')
  })
})

describe('describirAlerta', () => {
  it('precio con su moneda y repetición; cartera con su umbral', () => {
    expect(describirAlerta(base)).toMatch(/^Por encima de 0,6\d*\s€, una vez$/)
    expect(describirAlerta({ ...base, sentido: 'por_debajo', moneda: 'USD', repeticion: 'cada_vez', precio: 2 })).toMatch(/^Por debajo de .*2.*\$.*, cada vez$/)
    expect(describirAlerta({ ...base, tipo: 'cartera', umbral_pct: 7.5 })).toBe('Cambio del valor en 24 h mayor que 7,5 %, subiendo o bajando')
  })
})

describe('precioEnMoneda', () => {
  it('convierte con las unidades de la moneda por EUR', () => {
    expect(precioEnMoneda(1, 'EUR', 'EUR', null)).toBe(1)
    expect(precioEnMoneda(1, 'EUR', 'USD', 1.1)).toBeCloseTo(1.1, 9)
    expect(precioEnMoneda(1.1, 'USD', 'EUR', 1.1)).toBeCloseTo(1, 9)
    expect(precioEnMoneda(1, 'USD', 'EUR', null)).toBeNull()
  })
})
