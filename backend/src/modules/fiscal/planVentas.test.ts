import { describe, expect, it } from 'vitest';
import { simularPlan, type LotePlan } from './planVentas';
import { consumirFifo } from './simularVenta';

// Plan de ventas (#546). Datos sintéticos; tipos por defecto.
const TIPOS = [19, 21, 23, 27, 30];
const Y = 2026;
const anios = (neto = 0) => [{ year: Y, netoGP: neto, rendimientos: 0 }];

// AAA: un lote antiguo en w1 (10 u a 100 €) y uno reciente en w2 (10 u a 300 €).
const LOTES: LotePlan[] = [
  { id: 'l1', asset: 'AAA', walletId: 'w1', walletName: 'Uno', openedAt: '2024-01-01', quantity: 10, costBasis: 1000, pricePerUnit: 100 },
  { id: 'l2', asset: 'AAA', walletId: 'w2', walletName: 'Dos', openedAt: '2025-01-01', quantity: 10, costBasis: 3000, pricePerUnit: 300 },
  { id: 'l3', asset: 'BBB', walletId: 'w1', walletName: 'Uno', openedAt: '2025-06-01', quantity: 5, costBasis: 1000, pricePerUnit: 200 },
];
const base = { lotes: LOTES, anios: anios(), year: Y, tipos: TIPOS, comisionPct: 0, comprasRecientes: {} };

describe('simularPlan', () => {
  it('dos ventas del mismo activo en wallets distintas consumen el FIFO global una tras otra', () => {
    const r = simularPlan({ ...base, ventas: [
      { asset: 'AAA', walletId: 'w2', cantidad: 6, precioEur: 200 },
      { asset: 'AAA', walletId: 'w1', cantidad: 6, precioEur: 200 },
    ] });
    // Vender en w2 consume primero el lote antiguo de w1 (FIFO global): 6 u a 100 €.
    expect(r.ventas[0]).toMatchObject({ cantidadVendida: 6, coste: 600, resultado: 600 });
    // La segunda: 4 u del lote antiguo (400 €) y 2 del reciente (600 €).
    expect(r.ventas[1]).toMatchObject({ cantidadVendida: 6, coste: 1000, resultado: 200 });
    // Coincide con simular las ventas en secuencia sobre los lotes que quedan.
    const lotesAAA = LOTES.filter(l => l.asset === 'AAA');
    const primera = consumirFifo(lotesAAA, 6, 200, 0);
    const quedan = [{ ...lotesAAA[0], quantity: 4, costBasis: 400 }, lotesAAA[1]];
    const segunda = consumirFifo(quedan, 6, 200, 0);
    expect(r.neto).toBeCloseTo(primera.netGainLoss + segunda.netGainLoss, 2);
    expect(r.cuotaDespues).toBeCloseTo(800 * 0.19, 2);
  });

  it('la comisión es gasto de la venta y la pérdida resta de la ganancia del plan', () => {
    const r = simularPlan({ ...base, comisionPct: 1, ventas: [
      { asset: 'AAA', walletId: 'w1', cantidad: 10, precioEur: 200 },
      { asset: 'BBB', walletId: 'w1', cantidad: 5, precioEur: 100 },
    ] });
    expect(r.ventas[0]).toMatchObject({ bruto: 2000, comision: 20, resultado: 980 });
    expect(r.ventas[1].resultado).toBeCloseTo(-505, 2);
    expect(r).toMatchObject({ ganancia: 980, perdida: -505, neto: 475 });
  });

  it('avisa si se supera el colchón, con lo que pasa y la cuota que añade', () => {
    // 300 € de pérdida en el año: el colchón es 300 €.
    const r = simularPlan({ ...base, anios: anios(-300), ventas: [{ asset: 'AAA', walletId: 'w1', cantidad: 10, precioEur: 200 }] });
    expect(r.colchon).toBeCloseTo(300, 2);
    expect(r.avisos).toContainEqual({ tipo: 'colchon', exceso: 700, cuotaExtra: 133 });
    const dentro = simularPlan({ ...base, anios: anios(-300), ventas: [{ asset: 'AAA', walletId: 'w1', cantidad: 2, precioEur: 200 }] });
    expect(dentro.avisos).toEqual([]);
  });

  it('avisa de la regla de recompra solo en activos vendidos con pérdida y comprados hace menos de 2 meses', () => {
    const r = simularPlan({ ...base, comprasRecientes: { BBB: ['2026-10-01'], AAA: ['2026-10-02'] }, ventas: [
      { asset: 'AAA', walletId: 'w1', cantidad: 1, precioEur: 200 },
      { asset: 'BBB', walletId: 'w1', cantidad: 1, precioEur: 100 },
    ] });
    expect(r.avisos).toEqual([{ tipo: 'recompra', asset: 'BBB', compras: ['2026-10-01'] }]);
  });

  it('avisa si se pide más de lo que hay en la wallet y solo vende lo que hay', () => {
    const r = simularPlan({ ...base, ventas: [
      { asset: 'AAA', walletId: 'w1', cantidad: 7, precioEur: 200 },
      { asset: 'AAA', walletId: 'w1', cantidad: 7, precioEur: 200 },
    ] });
    expect(r.ventas.map(v => v.cantidadVendida)).toEqual([7, 3]);
    expect(r.avisos.filter(a => a.tipo === 'saldo')).toEqual([{ tipo: 'saldo', asset: 'AAA', walletId: 'w1', pedido: 14, disponible: 10 }]);
  });
});
