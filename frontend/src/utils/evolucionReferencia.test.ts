import { describe, expect, it } from 'vitest'
import { conReferencia, csvEvolucion, preciosDiarios, preciosIntradia } from './evolucionReferencia'
import type { PuntoVentana } from './evolucionVentana'

// Referencia y CSV de la evolución (#510). Datos sintéticos.
const p = (dia: number, value: number, extra: Partial<PuntoVentana> = {}): PuntoVentana => ({
  x: Date.UTC(2026, 0, dia), value, pnl: 0, pct: 0, stepPct: null, deposit: 0, withdrawal: 0, live: false, aportado: value, capital: value, vacio: value < 0.01, ...extra,
})

describe('conReferencia: misma base y mismos flujos que la cartera', () => {
  const precios = new Map([[Date.UTC(2026, 0, 2), 100], [Date.UTC(2026, 0, 3), 110], [Date.UTC(2026, 0, 4), 90]])
  it('parte del mismo punto (valor, P&L y %) que la cartera', () => {
    const r = conReferencia([p(1, 0), p(2, 1000, { pnl: 5, pct: 0.5 }), p(3, 1050, { capital: 1000 })], precios)
    expect(r[0].ref).toBeNull()
    expect(r[1].ref).toEqual({ value: 1000, pnl: 5, pct: 0.5 })
    // Sin flujos: el valor sigue al precio (+10 %) y el P&L suma esa ganancia.
    expect(r[2].ref!.value).toBeCloseTo(1100, 9)
    expect(r[2].ref!.pnl).toBeCloseTo(105, 9)
    expect(r[2].ref!.pct).toBeCloseTo(10.5, 9)
  })
  it('un depósito compra referencia a su precio y no cuenta como ganancia', () => {
    const r = conReferencia([p(2, 1000), p(3, 1600, { deposit: 550, capital: 1550 }), p(4, 1500, { capital: 1550 })], precios)
    // Día 3: 10 u. a 110 = 1100 más 5 u. compradas con 550 = 1650; P&L = 1650 - 1000 - 550 = 100.
    expect(r[1].ref!.value).toBeCloseTo(1650, 9)
    expect(r[1].ref!.pnl).toBeCloseTo(100, 9)
    // Día 4: 15 u. a 90 = 1350; P&L = 1350 - 1550 = -200, sobre el capital máximo de 1550.
    expect(r[2].ref!.value).toBeCloseTo(1350, 9)
    expect(r[2].ref!.pct).toBeCloseTo((-200 / 1550) * 100, 9)
  })
  it('sin precios, sin referencia', () => {
    expect(conReferencia([p(2, 1000)], null)[0].ref).toBeNull()
    expect(conReferencia([p(9, 1000)], precios)[0].ref).toBeNull()
  })
})

describe('precios en la moneda elegida', () => {
  const closes = { days: 2, closes: { BTC: [{ date: '2026-01-02', price: 100 }, { date: '2026-01-03', price: 120 }], USDT: [{ date: '2026-01-02', price: 0.8 }] } }
  it('en EUR tal cual; en USD con el cierre de USDT de ese día', () => {
    expect([...preciosDiarios(closes, 'BTC', 'EUR').values()]).toEqual([100, 120])
    expect([...preciosDiarios(closes, 'BTC', 'USD').entries()]).toEqual([[Date.UTC(2026, 0, 2), 125]])
    expect(preciosDiarios(undefined, 'ETH', 'EUR').size).toBe(0)
  })
  it('intradía: por instante, sin huecos', () => {
    expect([...preciosIntradia([1, 2, 3], [10, null, 0]).entries()]).toEqual([[1, 10]])
  })
})

describe('csvEvolucion', () => {
  const puntos = conReferencia([p(1, 0), p(2, 1234.5, { pnl: -0.004, pct: 1.23456, aportado: 1000 })], new Map([[Date.UTC(2026, 0, 2), 50]]))
  it('punto y coma, coma decimal, BOM, fecha ISO y la referencia', () => {
    const csv = csvEvolucion(puntos, { intraday: false, referencia: 'BTC', currency: 'EUR' })
    expect(csv.startsWith('﻿')).toBe(true)
    const [cab, f1, f2] = csv.slice(1).trim().split('\r\n')
    expect(cab).toBe('Fecha;Valor (EUR);Aportado (EUR);P&L (EUR);Rentabilidad (%);BTC: valor equivalente (EUR);BTC: rentabilidad (%)')
    expect(f1).toBe('2026-01-01;0,00;;;;;')
    // En el punto de partida, la referencia coincide con la cartera.
    expect(f2).toBe('2026-01-02;1234,50;1000,00;0,00;1,2346;1234,50;1,2346')
  })
  it('sin referencia, sin sus columnas; en 24 h, fecha y hora ISO', () => {
    const csv = csvEvolucion(puntos, { intraday: true, referencia: null, currency: 'USD' })
    expect(csv.slice(1).split('\r\n')[0]).toBe('Fecha y hora (UTC);Valor (USD);Aportado (USD);P&L (USD);Rentabilidad (%)')
    expect(csv).toContain('2026-01-02T00:00:00.000Z;1234,50')
  })
})
