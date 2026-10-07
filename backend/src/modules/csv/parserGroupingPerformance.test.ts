import { describe, expect, it } from 'vitest';
import { parseBinanceCsv } from './parser';

// groupByTimestamp escaneaba linealmente TODOS los grupos ya creados por
// cada fila nueva — O(n²). Confirmado empíricamente antes del fix: 20.000
// filas tardaban 34s, 50.000 filas 211s (un historial de varios años con
// varias cuentas, nada exagerado). Este test fija el límite de tiempo para
// que una regresión futura al O(n²) falle aquí en segundos, no se descubra
// con un CSV real de un usuario colgando la importación varios minutos.
const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';

function buildLargeCsv(rows: number): string {
  const lines = [HEADER];
  const start = new Date('2020-01-01T00:00:00Z').getTime();
  for (let i = 0; i < rows; i++) {
    const t = new Date(start + i * 60_000); // 1 fila/minuto — timestamps únicos, sin solapar
    const ts = t.toISOString().slice(0, 19).replace('T', ' ');
    lines.push(`123,${ts},Spot,Deposit,BTC,${(i % 97) + 1},`);
  }
  return lines.join('\n');
}

describe('groupByTimestamp — regresión de rendimiento (antes O(n²))', () => {
  it('agrupa 20.000 filas en menos de 3 segundos (antes del fix: ~34s)', async () => {
    const csv = buildLargeCsv(20_000);
    const start = Date.now();
    const result = await parseBinanceCsv(csv);
    const elapsedMs = Date.now() - start;

    expect(result.transactions).toHaveLength(20_000);
    expect(elapsedMs).toBeLessThan(3000);
  }, 10_000);
});
