import { describe, expect, it, vi } from 'vitest';

// canalDe no toca la base, pero eventosAnio importa el cliente: se simula.
vi.mock('../../db/client', () => ({ db: {} }));
const { canalDe } = await import('./eventosAnio');

// Canal de una operación (#543): de la línea original del CSV, o de las notas
// si la importación es anterior a guardar esas líneas.
describe('canalDe', () => {
  it('usa el canal de la línea original del CSV', () => {
    expect(canalDe('orden', 'Binance Convert: USDT→FTT')).toBe('orden');
    expect(canalDe('convert', null)).toBe('convert');
    expect(canalDe('saldos', null)).toBe('saldos');
    expect(canalDe('liquidacion', null)).toBe('liquidacion');
  });

  it('sin línea original, lo deduce de las notas', () => {
    expect(canalDe(null, 'Binance Convert: USDT→FTT')).toBe('convert');
    expect(canalDe(null, 'Small Assets Exchange BNB')).toBe('saldos');
  });

  it('sin datos para saberlo, no inventa un canal', () => {
    expect(canalDe(null, null)).toBeNull();
    expect(canalDe('otra cosa', 'manual')).toBeNull();
  });
});
