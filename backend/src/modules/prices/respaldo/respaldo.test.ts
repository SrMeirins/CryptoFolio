import { describe, expect, it } from 'vitest';
import { Circuito } from './circuito';
import { CuotaMensual } from './cuota';
import { cierreVelaOkx, dentroDeUnAnio, elegirIdPaprika, instrumentoOkx } from './seleccion';

// Fuentes de respaldo de precios (#337). Datos sintéticos.
describe('Circuito', () => {
  it('se abre tras el umbral de fallos seguidos y se cierra pasada la pausa', () => {
    let t = 0;
    const c = new Circuito(3, 1000, () => t);
    c.fallo(); c.fallo();
    expect(c.permitido()).toBe(true);
    c.fallo();
    expect(c.permitido()).toBe(false);
    t = 1000;
    expect(c.permitido()).toBe(true);
  });
  it('un éxito reinicia la cuenta', () => {
    const c = new Circuito(2, 1000, () => 0);
    c.fallo(); c.exito(); c.fallo();
    expect(c.permitido()).toBe(true);
  });
});

describe('CuotaMensual', () => {
  const cab = (l: string, r: string, s: string) => ({ get: (n: string) => ({ 'ratelimit-limit': l, 'ratelimit-remaining': r, 'ratelimit-reset': s } as Record<string, string>)[n] ?? null });
  it('sin datos, hay presupuesto; por debajo de la reserva, no hasta el reinicio', () => {
    let t = 0;
    const q = new CuotaMensual(0.1, () => t);
    expect(q.hayPresupuesto()).toBe(true);
    q.actualizar(cab('20000', '5000', '100'));
    expect(q.hayPresupuesto()).toBe(true);
    q.actualizar(cab('20000', '1999', '100'));
    expect(q.hayPresupuesto()).toBe(false);
    t = 100_001;
    expect(q.hayPresupuesto()).toBe(true);
  });
});

describe('selección', () => {
  it('elige la moneda activa con la misma sigla y mejor ranking', () => {
    expect(elegirIdPaprika([
      { id: 'nft-falso', symbol: 'NFT', rank: 0, is_active: true },
      { id: 'nft-apenft', symbol: 'NFT', rank: 171, is_active: true },
      { id: 'nft-viejo', symbol: 'NFT', rank: 5, is_active: false },
      { id: 'otro', symbol: 'NFTX', rank: 1, is_active: true },
    ], 'nft')).toBe('nft-apenft');
    expect(elegirIdPaprika([], 'NFT')).toBeNull();
  });
  it('histórico de CoinPaprika solo del último año', () => {
    const ahora = Date.parse('2026-10-21T00:00:00Z');
    expect(dentroDeUnAnio('2026-01-01', ahora)).toBe(true);
    expect(dentroDeUnAnio('2025-10-01', ahora)).toBe(false);
  });
  it('lee el cierre de la vela diaria de OKX del día pedido', () => {
    const filas = [[String(Date.parse('2024-03-01T00:00:00Z')), '1', '2', '0.5', '0.0000005086'], [String(Date.parse('2024-02-29T00:00:00Z')), '1', '1', '1', '0.4']];
    expect(cierreVelaOkx(filas, '2024-03-01')).toBe(0.0000005086);
    expect(cierreVelaOkx(filas, '2024-03-02')).toBeNull();
    expect(instrumentoOkx('nft')).toBe('NFT-USDT');
  });
});
