import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Vela } from '../prices/binance';

// Detección de la zona horaria de un CSV de Binance (#599) frente a un mercado
// simulado: precio que sube y baja a lo largo del día. Datos sintéticos.
const HORA = 3_600_000;
const MIN = 60_000;
const precioEn = (ms: number) => 100 + 10 * Math.sin(ms / (5 * HORA));
let red = true;

function velas(desde: number, hasta: number, paso: number): Vela[] {
  const out: Vela[] = [];
  for (let t = Math.floor(desde / paso) * paso; t <= hasta; t += paso) {
    const muestras = Array.from({ length: 11 }, (_, i) => precioEn(t + (paso * i) / 10));
    const medio = precioEn(t + paso / 2);
    out.push({ inicio: t, alto: Math.max(...muestras), bajo: Math.min(...muestras), cierre: precioEn(t + paso), volumen: 1, volumenCotizacion: medio });
  }
  return out;
}

vi.mock('../prices/binance', () => ({
  fetchVelas: vi.fn(async (_pair: string, intervalo: '1m' | '1h', desde: number, hasta: number) => {
    if (!red) throw new Error('fallo de red simulado');
    return velas(desde, hasta, intervalo === '1m' ? MIN : HORA);
  }),
  isDefinitiveNoData: () => false,
}));
vi.mock('../../db/client', () => ({ db: { query: vi.fn(async () => ({ rows: [] })) } }));

const { detectarZonaHoraria, muestrasDeOrdenes, puntuarDesfases } = await import('./zonaHoraria');

const INICIO = Date.UTC(2024, 2, 1, 0, 0);
/** Órdenes reales cada 7 h; el CSV las da en UTC+desfase, leídas como UTC. */
function ordenes(desfase: number, n = 12) {
  return Array.from({ length: n }, (_, i) => {
    const real = INICIO + i * 7 * HORA + 17 * MIN;
    const precio = precioEn(Math.floor(real / MIN) * MIN + MIN / 2);
    return { operationType: 'BUY', asset: 'ABC', costAsset: 'USDT', amount: 10, costAmount: 10 * precio, timestamp: new Date(real + desfase * HORA) };
  });
}

beforeEach(() => { red = true; });

describe('muestrasDeOrdenes', () => {
  it('solo órdenes con precio comparable: ni Convert, ni saldos a BNB, ni compras con fiat raras', () => {
    const m = muestrasDeOrdenes([
      ...ordenes(0, 2),
      { operationType: 'BUY', asset: 'ABC', costAsset: 'USDT', amount: 1, costAmount: 1, timestamp: new Date(INICIO), notes: 'Binance Convert: USDT→ABC' },
      { operationType: 'BUY', asset: 'BNB', costAsset: 'ABC', amount: 1, costAmount: 1, timestamp: new Date(INICIO), notes: 'Small Assets Exchange: ABC→BNB (dust)' },
      { operationType: 'DEPOSIT_CRYPTO', asset: 'ABC', amount: 1, timestamp: new Date(INICIO) },
    ]);
    expect(m.map(x => x.pair)).toEqual(['ABCUSDT', 'ABCUSDT']);
  });
  it('reparte como mucho 20 muestras en el tiempo', () => {
    const m = muestrasDeOrdenes(ordenes(0, 60));
    expect(m).toHaveLength(20);
    expect(m[19].instanteMs - m[0].instanteMs).toBeGreaterThan(50 * 7 * HORA);
  });
});

describe('detectarZonaHoraria', () => {
  it.each([0, 2, -5])('detecta un CSV exportado en UTC%s', async d => {
    const r = await detectarZonaHoraria(ordenes(d));
    expect(r).toMatchObject({ desfaseHoras: d, confianza: 'alta', muestras: 12 });
    expect(r.coincidencias).toBeGreaterThanOrEqual(9);
  });

  it('sin red: sin datos, para preguntar', async () => {
    red = false;
    expect(await detectarZonaHoraria(ordenes(2))).toMatchObject({ desfaseHoras: null, confianza: 'sin_datos' });
  });

  it('sin órdenes comparables: sin datos', async () => {
    expect(await detectarZonaHoraria([])).toMatchObject({ desfaseHoras: null, confianza: 'sin_datos', muestras: 0 });
  });

  it('puntuarDesfases: el desfase real reúne las coincidencias', () => {
    const m = muestrasDeOrdenes(ordenes(3));
    const v = m.map(x => velas(x.instanteMs - 16 * HORA, x.instanteMs + 14 * HORA, HORA));
    const puntos = puntuarDesfases(m, v);
    expect(Math.max(...puntos.values())).toBe(puntos.get(3));
  });
});
