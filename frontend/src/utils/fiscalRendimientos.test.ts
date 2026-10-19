import { describe, expect, it } from 'vitest'
import { buildRendimientosCsv, tramosCompactos } from './fiscalRendimientos'
import type { RendimientoEvent } from '../pages/fiscal/types'

// CSV de rendimientos y tramos compactos (#313). Datos sintéticos.
const r = (p: Partial<RendimientoEvent>): RendimientoEvent =>
  ({ fecha: '2026-06-26', tipo: 'Cashback / Bonus', activo: 'EUR', cantidad: 0.76, valorEur: 0.76, wallet: 'Bitvavo', ...p })

describe('buildRendimientosCsv', () => {
  it('cabecera y filas con «;»', () => {
    const lines = buildRendimientosCsv([r({}), r({ tipo: 'Airdrop', activo: 'USDC', cantidad: 0.00256, valorEur: 0.0026 })]).split('\n')
    expect(lines[0]).toBe('Fecha;Tipo;Activo;Cantidad;Valor (EUR);Wallet')
    expect(lines[1]).toBe('2026-06-26;Cashback / Bonus;EUR;0.76;0.76;Bitvavo')
    expect(lines[2]).toBe('2026-06-26;Airdrop;USDC;0.00256;0.00;Bitvavo')
  })
  it('neutraliza fórmulas y separadores', () => {
    const line = buildRendimientosCsv([r({ wallet: '=HYPERLINK("x")', activo: 'A;B' })]).split('\n')[1]
    expect(line).toContain(`"'=HYPERLINK(""x"")"`)
    expect(line).toContain('"A;B"')
  })
})

describe('tramosCompactos', () => {
  it('compactos por debajo de 1.000 €', () => {
    expect(tramosCompactos(0.9)).toBe(true)
    expect(tramosCompactos(999.99)).toBe(true)
    expect(tramosCompactos(1_000)).toBe(false)
  })
})
