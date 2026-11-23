import { describe, expect, it } from 'vitest'
import { guardarEnLista, leerMetas, nuevoIdMeta, progresoMeta, quitarDeLista, textoPct, textoPctCorto, type ContextoMetas, type Meta } from './metas'

// Metas de inversión (#520), con datos sintéticos.
const valor: Meta = { id: 'meta-0001', nombre: 'Cartera', tipo: 'valor', objetivo: 10000, moneda: 'EUR' }
const aportado: Meta = { id: 'meta-0002', nombre: 'Aportar', tipo: 'aportado', objetivo: 1200, moneda: 'EUR' }
const cantidad: Meta = { id: 'meta-0003', nombre: 'Acumular', tipo: 'cantidad', objetivo: 0.5, activo: 'BTC' }
const ctx: ContextoMetas = { currency: 'EUR', rate: 1, valorTotal: 7500, aportadoAnio: 300, cantidades: { BTC: 0.6 } }

describe('progresoMeta', () => {
  it('valor total: con el valor en vivo y lo que falta', () => {
    expect(progresoMeta(valor, ctx)).toEqual({ actual: 7500, objetivo: 10000, pct: 75, relleno: 75, faltan: 2500, cumplida: false, moneda: 'EUR', valorActual: null })
  })

  it('aportado en el año: neto de euros, que puede ser negativo', () => {
    expect(progresoMeta(aportado, ctx)?.pct).toBe(25)
    const negativo = progresoMeta(aportado, { ...ctx, aportadoAnio: -100 })
    expect(negativo?.relleno).toBe(0)
    expect(negativo?.faltan).toBe(1300)
    expect(progresoMeta(aportado, { ...ctx, aportadoAnio: null })).toBeNull()
  })

  it('cantidad de un activo: en unidades, cumplida y más de 100 %', () => {
    const p = progresoMeta(cantidad, ctx)
    expect(p?.moneda).toBeNull()
    expect(p?.cumplida).toBe(true)
    expect(p?.pct).toBeCloseTo(120, 9)
    expect(p?.relleno).toBe(100)
    expect(p?.faltan).toBe(0)
    expect(progresoMeta(cantidad, { ...ctx, cantidades: {} })?.pct).toBe(0)
    expect(progresoMeta(cantidad, ctx)?.valorActual).toBeNull()
    expect(progresoMeta(cantidad, { ...ctx, valores: { BTC: 30000 } })?.valorActual).toBe(30000)
  })

  it('convierte el objetivo a la moneda de visualización y sin tipo no mide', () => {
    const usd = progresoMeta(valor, { ...ctx, currency: 'USD', rate: 1.1, valorTotal: 5500 })
    expect(usd?.objetivo).toBeCloseTo(11000, 6)
    expect(usd?.pct).toBeCloseTo(50, 6)
    expect(progresoMeta(valor, { ...ctx, currency: 'USD', rate: null })).toBeNull()
    expect(progresoMeta(valor, { ...ctx, valorTotal: null })).toBeNull()
  })
})

describe('leerMetas', () => {
  it('lee la lista y descarta lo mal formado o el JSON roto', () => {
    expect(leerMetas(undefined)).toEqual([])
    expect(leerMetas({ metas: '{roto' })).toEqual([])
    expect(leerMetas({ metas: JSON.stringify([valor, { id: 'x', tipo: 'otro' }, cantidad]) })).toEqual([valor, cantidad])
  })
})

describe('cambios en la lista', () => {
  it('añade, sustituye en su sitio y quita', () => {
    const lista = guardarEnLista([valor], cantidad)
    expect(lista.map(m => m.id)).toEqual(['meta-0001', 'meta-0003'])
    expect(guardarEnLista(lista, { ...valor, objetivo: 1 })[0].objetivo).toBe(1)
    expect(quitarDeLista(lista, 'meta-0001')).toEqual([cantidad])
  })

  it('el id nuevo es aleatorio y cumple el formato del backend', () => {
    const a = nuevoIdMeta()
    expect(a).toMatch(/^[A-Za-z0-9-]{8,40}$/)
    expect(a).not.toBe(nuevoIdMeta())
  })
})

describe('textoPct', () => {
  it('redondea y acota', () => {
    expect(textoPct(75.4)).toBe('75 %')
    expect(textoPct(3.25)).toBe('3,3 %')
    expect(textoPct(0)).toBe('0 %')
    expect(textoPct(5000)).toBe('más de 999 %')
    expect(textoPctCorto(5000)).toBe('999+ %')
    expect(textoPctCorto(42)).toBe('42 %')
  })
})
