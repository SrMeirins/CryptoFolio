import { describe, expect, it } from 'vitest';
import { consumirFifo, type LoteAbierto } from './simularVenta';
import { desgloseMarginal } from './irpf';

// Simulación de venta (#279): consumo FIFO de una wallet con comisión.
const lote = (id: string, openedAt: string, quantity: number, unit: number): LoteAbierto =>
  ({ id, walletName: 'W', openedAt, quantity, costBasis: quantity * unit, pricePerUnit: unit });

describe('consumirFifo', () => {
  const lotes = [lote('a', '2024-01-01', 10, 1), lote('b', '2024-06-01', 10, 3)];

  it('consume en orden y marca el lote vendido en parte', () => {
    const r = consumirFifo(lotes, 15, 2);
    expect(r.lotsConsumed.map(l => [l.lotId, l.qtyConsumed, l.partial])).toEqual([['a', 10, false], ['b', 5, true]]);
    expect(r.totalCostBasis).toBeCloseTo(25, 9);       // 10 × 1 + 5 × 3
    expect(r.netGainLoss).toBeCloseTo(5, 9);           // 30 − 25
  });

  it('la comisión reduce el valor de transmisión y la ganancia, repartida por lote', () => {
    const r = consumirFifo(lotes, 15, 2, 1);           // 1 % de 30 € = 0,30 €
    expect(r.totalFee).toBeCloseTo(0.3, 9);
    expect(r.netProceeds).toBeCloseTo(29.7, 9);
    expect(r.netGainLoss).toBeCloseTo(4.7, 9);
    expect(r.lotsConsumed[0].feeEur).toBeCloseTo(0.2, 9);
  });

  it('ganancias y pérdidas por lote se separan', () => {
    const r = consumirFifo(lotes, 20, 2);
    expect(r.totalGain).toBeCloseTo(10, 9);
    expect(r.totalLoss).toBeCloseTo(-10, 9);
  });
});

describe('desgloseMarginal', () => {
  it('tramos que atraviesa la base al subir', () => {
    const d = desgloseMarginal(4_000, 10_000);
    expect(d.map(t => [t.tipo, t.base])).toEqual([[19, 2_000], [21, 4_000]]);
    expect(d.reduce((s, t) => s + t.cuota, 0)).toBeCloseTo(1_220, 6);   // 380 + 840
  });
  it('al bajar (venta con pérdida), base y cuota negativas', () => {
    const d = desgloseMarginal(10_000, 4_000);
    expect(d.reduce((s, t) => s + t.cuota, 0)).toBeCloseTo(-1_220, 6);
  });
});
