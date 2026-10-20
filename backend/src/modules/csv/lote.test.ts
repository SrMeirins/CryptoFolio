import { describe, expect, it } from 'vitest';
import { combinarVistasPrevias, type VistaArchivo } from './lote';
import type { PreviewResult } from './importerPreview';

// Lote de varios archivos (#326). Datos sintéticos.
const tx = (hash: string, isNew = true) => ({
  operationType: 'BUY' as const, timestamp: new Date('2024-01-01T00:00:00Z'), asset: 'BTC', amount: 1, amountNet: 1,
  account: 'Spot', subTradeCount: 1, rawRowHashes: [hash], isNew,
});
const resultado = (over: Partial<PreviewResult>): PreviewResult => ({
  validation: { valid: true, errors: [], warnings: [], info: [], detectedColumns: [], detectedLanguage: 'en', unknownOperations: [], rowCount: 1, dateRange: { from: '2024-01-01', to: '2024-01-31' } },
  transactions: [], duplicateCount: 0, newCount: 0, errors: [], unknownOperationSamples: {}, depositReviews: [], retiradas: null,
  ...over,
});
const vista = (nombre: string, r: PreviewResult, reconocido = true): VistaArchivo =>
  ({ nombre, exchange: 'binance', deteccion: { exchange: reconocido ? 'binance' : null, idioma: 'en', reconocido }, resultado: r });

describe('combinarVistasPrevias', () => {
  it('cuenta una sola vez las filas repetidas entre archivos solapados', () => {
    const l = combinarVistasPrevias([
      vista('2023.csv', resultado({ transactions: [tx('a'), tx('b')] })),
      vista('2023-2024.csv', resultado({ transactions: [tx('b'), tx('c')], validation: { ...resultado({}).validation, dateRange: { from: '2023-06-01', to: '2024-06-30' } } })),
    ]);
    expect(l.newCount).toBe(3);
    expect(l.repetidasEnLote).toBe(1);
    expect(l.archivos.map(a => [a.estado, a.nuevas, a.repetidasEnLote])).toEqual([['listo', 2, 0], ['listo', 1, 1]]);
    expect(l.transactions.filter(t => t.isNew).map(t => t.rawRowHashes[0])).toEqual(['a', 'b', 'c']);
    expect(l.transactions.map(t => t.archivo)).toEqual([0, 0, 1, 1]);
    expect(l.validation.dateRange).toEqual({ from: '2023-06-01', to: '2024-06-30' });
  });

  it('aparta los no reconocidos y los que no traen nada nuevo, con su motivo', () => {
    const invalido = resultado({ validation: { ...resultado({}).validation, valid: false, errors: ['Cabeceras no reconocidas'] } });
    const l = combinarVistasPrevias([
      vista('bueno.csv', resultado({ transactions: [tx('a')] })),
      vista('raro.csv', invalido, false),
      vista('viejo.csv', resultado({ transactions: [tx('z', false)], duplicateCount: 1 })),
      vista('copia.csv', resultado({ transactions: [tx('a')] })),
    ]);
    expect(l.archivos.map(a => a.estado)).toEqual(['listo', 'no_reconocido', 'sin_novedades', 'sin_novedades']);
    expect(l.archivos[1].motivo).toBe('Formato no reconocido');
    expect(l.archivos[2].motivo).toBe('Ya importado, nada nuevo');
    expect(l.archivos[3].motivo).toMatch(/otro archivo del lote/);
    expect(l.validation.valid).toBe(true);
    expect(l.validation.errors).toEqual(['raro.csv: Cabeceras no reconocidas']);
  });

  it('une depósitos sin repetir, suma el emparejamiento de retiradas y nombra los avisos por archivo', () => {
    const dep = { txKey: 'd1', timestamp: '2024-01-01T00:00:00.000Z', asset: 'SOL', amount: 1, historicalPrice: 100 };
    const l = combinarVistasPrevias([
      vista('a.csv', resultado({ depositReviews: [dep], retiradas: { filas: 5, emparejadas: 2, retiros: 3 }, validation: { ...resultado({}).validation, warnings: ['Gap de 3 dias'] } })),
      vista('b.csv', resultado({ depositReviews: [dep], retiradas: { filas: 5, emparejadas: 1, retiros: 1 } })),
    ]);
    expect(l.depositReviews).toHaveLength(1);
    expect(l.retiradas).toEqual({ filas: 5, emparejadas: 3, retiros: 4 });
    expect(l.validation.warnings).toEqual(['a.csv: Gap de 3 dias']);
  });

  it('un archivo válido sin ninguna transacción importable no se da por «ya importado» (#328)', () => {
    const l = combinarVistasPrevias([vista('vacio.csv', resultado({ transactions: [] }))]);
    expect(l.archivos[0]).toMatchObject({ estado: 'sin_novedades', motivo: 'No contiene transacciones que importar' });
  });

  it('un solo archivo: mismos mensajes sin prefijo', () => {
    const l = combinarVistasPrevias([vista('a.csv', resultado({ transactions: [tx('a')], validation: { ...resultado({}).validation, info: ['Info'] } }))]);
    expect(l.validation.info).toEqual(['Info']);
    expect(l.newCount).toBe(1);
  });
});
