import { describe, expect, it } from 'vitest';
import { toCapitalFlows } from './capitalFlows';

const row = (operation_type: string, timestamp: string, quantity: number, asset = 'USDT', wallet_id = 'w1') =>
  ({ operation_type, timestamp, quantity, asset, wallet_id });

describe('toCapitalFlows — devoluciones de margen (#185)', () => {
  it('lo devuelto por encima de la deuda pendiente es interés: no es flujo', () => {
    const flows = toCapitalFlows([
      row('MARGIN_BORROW', '2026-01-01T10:00:00Z', 100),
      row('MARGIN_REPAY', '2026-01-02T10:00:00Z', -101),
    ]);
    expect(flows.map(f => [f.quantity, f.kind])).toEqual([[100, 'margin'], [-100, 'margin']]);
  });

  it('sin interés el resultado es el de siempre', () => {
    const flows = toCapitalFlows([
      row('MARGIN_BORROW', '2026-01-01T10:00:00Z', 100),
      row('MARGIN_REPAY', '2026-01-02T10:00:00Z', -100),
    ]);
    expect(flows.map(f => f.quantity)).toEqual([100, -100]);
  });

  it('devoluciones parciales consumen la deuda y solo el exceso final es interés', () => {
    const flows = toCapitalFlows([
      row('MARGIN_BORROW', '2026-01-01T10:00:00Z', 100),
      row('MARGIN_REPAY', '2026-01-02T10:00:00Z', -60),
      row('MARGIN_REPAY', '2026-01-03T10:00:00Z', -45),
    ]);
    expect(flows.map(f => f.quantity)).toEqual([100, -60, -40]);
  });

  it('una devolución sin deuda pendiente es todo interés y no genera flujo', () => {
    expect(toCapitalFlows([row('MARGIN_REPAY', '2026-01-02T10:00:00Z', -5)])).toEqual([]);
  });

  it('la deuda se lleva por activo y wallet', () => {
    const flows = toCapitalFlows([
      row('MARGIN_BORROW', '2026-01-01T10:00:00Z', 100, 'USDT', 'w1'),
      row('MARGIN_REPAY', '2026-01-02T10:00:00Z', -100, 'USDT', 'w2'),  // otra wallet: sin deuda
      row('MARGIN_REPAY', '2026-01-02T11:00:00Z', -100, 'BTC', 'w1'),   // otro activo: sin deuda
      row('MARGIN_REPAY', '2026-01-02T12:00:00Z', -100, 'USDT', 'w1'),
    ]);
    expect(flows.map(f => [f.asset, f.quantity])).toEqual([['USDT', 100], ['USDT', -100]]);
  });

  it('en el mismo instante el préstamo va antes que la devolución, sea cual sea el orden de llegada', () => {
    const flows = toCapitalFlows([
      row('MARGIN_REPAY', '2026-01-01T10:00:00Z', -100),
      row('MARGIN_BORROW', '2026-01-01T10:00:00Z', 100),
    ]);
    expect(flows.map(f => f.quantity)).toEqual([100, -100]);
  });

  it('los flujos de capital no cambian y se marcan como capital', () => {
    const flows = toCapitalFlows([
      row('DEPOSIT_FIAT', '2026-01-01T10:00:00Z', 1000, 'EUR'),
      row('WITHDRAW_FIAT', '2026-01-02T10:00:00Z', -300, 'EUR'),
      row('GIFT_SENT', '2026-01-03T10:00:00Z', -5, 'XRP'),
    ]);
    expect(flows.map(f => [f.quantity, f.kind])).toEqual([[1000, 'capital'], [-300, 'capital'], [-5, 'capital']]);
    expect(flows[0].at).toBe(Date.parse('2026-01-01T10:00:00Z'));
  });
});
