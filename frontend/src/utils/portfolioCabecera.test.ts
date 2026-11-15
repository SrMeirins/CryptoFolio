import { describe, expect, it } from 'vitest'
import { custodiaPartes, partirImporte, recuperarCoste, trazoMini } from './portfolioCabecera'

// Cabecera de Portfolio (#525).
describe('recuperarCoste', () => {
  it('en pérdida, cuánto tendría que subir (no lo mismo que lo que bajó)', () => {
    const r = recuperarCoste(80, 100)
    expect(r).toMatchObject({ estado: 'perdida', faltan: 20 })
    if (r.estado === 'perdida') expect(r.subidaPct).toBeCloseTo(25, 9)
  })
  it('en ganancia, el margen sobre el coste; sin coste, nada que recuperar', () => {
    const r = recuperarCoste(120, 100)
    expect(r).toMatchObject({ estado: 'ganancia', sobra: 20 })
    if (r.estado === 'ganancia') expect(r.margenPct).toBeCloseTo(20, 9)
    expect(recuperarCoste(50, 0)).toEqual({ estado: 'sinCoste' })
    expect(recuperarCoste(0, 100)).toMatchObject({ estado: 'perdida', faltan: 100 })
  })
})

describe('custodiaPartes', () => {
  it('sin decimales cuando basta, y los dos lados suman exactamente 100', () => {
    expect(custodiaPartes(60, 40)).toMatchObject({ propia: '60', exchanges: '40', decimales: 0 })
    const c = custodiaPartes(624, 376)
    expect(c).toMatchObject({ propia: '62', exchanges: '38' })
  })
  it('no redondea un 99,7 % a 100 %: usa los decimales necesarios', () => {
    const c = custodiaPartes(997, 3)
    expect(c).toMatchObject({ propia: '99,7', exchanges: '0,3', decimales: 1 })
    expect(custodiaPartes(99_995, 5)).toMatchObject({ propia: '99,995', exchanges: '0,005', decimales: 3 })
  })
  it('todo en un lado lo dice así', () => {
    expect(custodiaPartes(100, 0).todo).toBe('propia')
    expect(custodiaPartes(0, 100).todo).toBe('exchanges')
  })
})

describe('trazoMini y partirImporte', () => {
  it('el mínimo abajo y el máximo arriba, de borde a borde; sin dos puntos, nada', () => {
    const t = trazoMini([10, 20, 15], 100, 40)!
    expect(t.linea).toBe('M0.0 38.0 L50.0 2.0 L100.0 20.0')
    expect(t.area.endsWith('L100 40 L0 40 Z')).toBe(true)
    expect(trazoMini([5], 100, 40)).toBeNull()
  })
  it('parte el importe en entero y decimales con la moneda', () => {
    expect(partirImporte('48.230,10 €')).toEqual({ entero: '48.230', resto: ',10 €' })
    expect(partirImporte('*** €')).toEqual({ entero: '*** €', resto: '' })
  })
})
