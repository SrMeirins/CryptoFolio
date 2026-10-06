import { describe, expect, it } from 'vitest';
import { hayRecompra, type Adquisicion } from './antiRecompra';

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const compra = (asset: string, fecha: string, lotId = 'otro'): Adquisicion => ({ asset, fecha: d(fecha), lotId });

describe('hayRecompra (art. 33.5 LIRPF, ventana de 2 meses)', () => {
  // Caso del hallazgo: vendes con pérdida el 10-ene y recompras el 20-ene.
  it('recompra del mismo activo 10 días después → true', () => {
    expect(hayRecompra('BTC', d('2025-01-10'), 'lotVendido', [compra('BTC', '2025-01-20')])).toBe(true);
  });
  it('recompra ANTES de la venta dentro de 2 meses → true', () => {
    expect(hayRecompra('BTC', d('2025-03-10'), 'lotVendido', [compra('BTC', '2025-01-15')])).toBe(true);
  });
  it('recompra fuera de la ventana (más de 2 meses) → false', () => {
    expect(hayRecompra('BTC', d('2025-01-10'), 'lotVendido', [compra('BTC', '2025-03-11')])).toBe(false);
  });
  it('recompra de otro activo → false', () => {
    expect(hayRecompra('BTC', d('2025-01-10'), 'lotVendido', [compra('ETH', '2025-01-20')])).toBe(false);
  });
  it('el propio lote vendido no cuenta como recompra', () => {
    expect(hayRecompra('BTC', d('2025-01-10'), 'lotVendido', [compra('BTC', '2025-01-05', 'lotVendido')])).toBe(false);
  });
  it('sin adquisiciones → false', () => {
    expect(hayRecompra('BTC', d('2025-01-10'), 'lotVendido', [])).toBe(false);
  });

  // Casos límite de fin de mes: setUTCMonth() desborda si no se clampa al
  // último día válido del mes destino (ver comentario de mesesDesplazado).
  describe('ventana de fin de mes (sin desbordamiento)', () => {
    it('venta el 31-ene: el límite "-2 meses" cae en 30-nov (no 1-dic) — detecta recompra el 30-nov', () => {
      expect(hayRecompra('BTC', d('2025-01-31'), 'lotVendido', [compra('BTC', '2024-11-30')])).toBe(true);
    });
    it('venta el 31-dic: el límite "+2 meses" cae en 28-feb (no 3-mar) — NO detecta una recompra el 2-mar', () => {
      expect(hayRecompra('BTC', d('2025-12-31'), 'lotVendido', [compra('BTC', '2026-03-02')])).toBe(false);
    });
  });
});
