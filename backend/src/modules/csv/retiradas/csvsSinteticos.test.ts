import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { esHistorialRetiradas, parseHistorialRetiradas } from './historialRetiradas';

// Los CSV sintéticos de docs/test-csvs (#548) deben seguir siendo válidos.
// El contenedor de desarrollo solo monta src: sin docs/ la prueba se omite (CI y host sí la corren).
const hayDocs = existsSync(path.join(__dirname, '../../../../../docs/test-csvs'));
const leer = (n: string) => readFileSync(path.join(__dirname, '../../../../../docs/test-csvs', n));

describe.skipIf(!hayDocs)('CSV sintéticos de retiradas', () => {
  it('el historial de retiradas se reconoce y solo trae las completadas', () => {
    const b = leer('binance-retiradas-sintetico.csv');
    expect(esHistorialRetiradas(b)).toBe(true);
    expect(parseHistorialRetiradas(b).map(r => [r.coin, r.bruto])).toEqual([['XRP', 10.2], ['ETH', 0.501]]);
  });
  it('el historial de transacciones no es un historial de retiradas', () => {
    expect(esHistorialRetiradas(leer('binance-historial-sintetico.csv'))).toBe(false);
  });
});
