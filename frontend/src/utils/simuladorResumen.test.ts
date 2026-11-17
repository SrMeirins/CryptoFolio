import { describe, expect, it } from 'vitest'
import type { SimulationResult } from '../api/portfolio'
import { cascada, recompraHasta, resumenTexto, tramosLotes } from './simuladorResumen'

// Cascada y resumen del simulador (#529). Datos sintéticos.
const base = (over: Partial<SimulationResult> = {}): SimulationResult => ({
  asset: 'SINT', quantity: 15, priceEur: 2.333333, feePct: 0.1, walletId: 'w1',
  wallets: [{ walletId: 'w1', walletName: 'Wallet venta', quantity: 20 }, { walletId: 'w2', walletName: 'Wallet ajena', quantity: 999 }],
  totalProceeds: 34.999995, totalFee: 0.034999995, netProceeds: 34.96499, totalCostBasis: 20, totalGain: 14.96, totalLoss: 0,
  netGainLoss: 14.96, irpfEstimate: 2.84, irpf: { year: 2026, baseAntes: 100, baseDespues: 114.96, marginal: 2.8449, desglose: [] },
  recompra: { aviso: false, comprasRecientes: [] }, netoEnMano: 32.12009, resultadoNeto: 12.12,
  lotsConsumed: [
    { lotId: 'a', walletName: 'Wallet ajena', openedAt: '2024-03-01', qtyAvailable: 10, qtyConsumed: 10, costBasisConsumed: 10, pricePerUnit: 1, proceedsEur: 23.3, feeEur: 0.02, partial: false, gainLossEur: 13.3 },
    { lotId: 'b', walletName: 'Wallet venta', openedAt: '2024-06-01', qtyAvailable: 10, qtyConsumed: 5, costBasisConsumed: 10, pricePerUnit: 2, proceedsEur: 11.7, feeEur: 0.01, partial: true, gainLossEur: 1.66 },
  ],
  ...over,
})

describe('cascada', () => {
  it('importe menos comisión menos IRPF suma exactamente el neto mostrado (al céntimo)', () => {
    const c = cascada(base())
    const [importe, comision, irpf, neto] = c.lineas.map(l => l.cents)
    expect([importe, comision, irpf]).toEqual([3500, 3, 284])
    expect(neto).toBe(importe - comision - irpf)
    expect(c.netoCents).toBe(3213)
    // Coincide con el neto del backend al céntimo.
    expect(Math.abs(c.netoCents / 100 - base().netoEnMano)).toBeLessThan(0.01)
  })
  it('con pérdida, el ahorro de IRPF va aparte y no suma al neto', () => {
    const c = cascada(base({ irpf: { year: 2026, baseAntes: 100, baseDespues: 90, marginal: -1.9, desglose: [] } }))
    expect(c.lineas.find(l => l.key === 'irpf')!.cents).toBe(0)
    expect(c.netoCents).toBe(3500 - 3)
    expect(c.ahorroIrpf).toBeCloseTo(1.9, 9)
  })
})

describe('tramosLotes', () => {
  it('reparte la barra por cantidad en el orden FIFO', () => {
    const t = tramosLotes(base())
    expect(t.map(x => [x.lotId, Math.round(x.share)])).toEqual([['a', 67], ['b', 33]])
    expect(t[1].partial).toBe(true)
    // La barra de cada fila es el propio lote: llena si sale entero.
    expect(t.map(x => x.fraccionLote)).toEqual([100, 50])
    expect(t[1]).toMatchObject({ available: 10, unitCost: 2 })
  })
})

describe('resumenTexto', () => {
  const texto = resumenTexto(base(), { walletName: 'Wallet venta', fecha: new Date('2026-11-17T10:00:00Z') })
  it('lleva la cascada, el resultado y los lotes, en texto plano', () => {
    expect(texto.split('\n')[0]).toBe('Simulación de venta de SINT (17 nov 2026, estimación)')
    expect(texto).toContain('Wallet de venta: Wallet venta')
    expect(texto).toMatch(/Neto en mano: 32,13\s€/)
    expect(texto).toContain('Lotes que salen (FIFO): 2, comprados del 1 mar 2024 al 1 jun 2024')
    expect(texto).toContain('Estimación orientativa')
  })
  it('no incluye datos de otras wallets', () => {
    expect(texto).not.toContain('Wallet ajena')
    expect(texto).not.toMatch(/999/)
  })
})

describe('recompraHasta', () => {
  it('dos meses después de la venta', () => {
    expect(recompraHasta(new Date('2026-11-17T10:00:00Z')).toISOString().slice(0, 10)).toBe('2027-01-17')
  })
})
