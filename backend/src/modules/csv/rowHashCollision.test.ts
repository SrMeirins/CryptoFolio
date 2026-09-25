import { describe, expect, it } from 'vitest';
import { parseBinanceCsv } from './parser';

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';

function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseBinanceCsv — colisión de hash entre filas idénticas en el mismo segundo', () => {
  // Caso real confirmado en el histórico de Binance del usuario: dos compras
  // de 689 AMP, genuinamente distintas, con exactamente los mismos valores
  // (mismo User ID/Time/Account/Operation/Coin/Change/Remark) al mismo
  // segundo. Antes del fix, ambas filas producían el mismo row_hash — un
  // reimport de ese CSV descartaría la segunda por completo vía
  // ON CONFLICT (row_hash) DO NOTHING.
  it('dos filas con tupla idéntica producen hashes distintos (no colisionan)', async () => {
    const rows = [
      '84158159,2024-03-18 12:19:11,Spot,Transaction Buy,AMP,689,',
      '84158159,2024-03-18 12:19:11,Spot,Transaction Buy,AMP,689,',
    ];

    const result = await getRowHashes(csv(rows));
    expect(result.rowHashes.length).toBe(2);
    expect(result.rowHashes[0]).not.toBe(result.rowHashes[1]);
  });

  it('el hash sigue siendo estable entre dos parseos del mismo CSV (reimport correcto)', async () => {
    const rows = [
      '84158159,2024-03-18 12:19:11,Spot,Transaction Buy,AMP,689,',
      '84158159,2024-03-18 12:19:11,Spot,Transaction Buy,AMP,689,',
      '84158159,2024-03-18 13:05:03,Strategy,Transaction Buy,FRONT,4,',
    ];

    const first  = await getRowHashes(csv(rows));
    const second = await getRowHashes(csv(rows));
    expect(first.rowHashes).toEqual(second.rowHashes);
  });

  it('una tercera fila idéntica (triple colisión) también se distingue de las otras dos', async () => {
    const rows = [
      '84158159,2024-03-18 12:19:11,Spot,Transaction Buy,AMP,689,',
      '84158159,2024-03-18 12:19:11,Spot,Transaction Buy,AMP,689,',
      '84158159,2024-03-18 12:19:11,Spot,Transaction Buy,AMP,689,',
    ];

    const result = await getRowHashes(csv(rows));
    const unique = new Set(result.rowHashes);
    expect(unique.size).toBe(3);
  });

  // Hallazgo relacionado: si Binance cambia retroactivamente el Remark de una
  // operación ya importada (documentado como riesgo real por Binance), un
  // reexport del mismo periodo generaría un hash distinto para la MISMA
  // operación real → se reimportaría como transacción nueva, duplicando el
  // histórico. El Remark ya no participa en el hash — solo el índice de
  // aparición de la tupla estable (User ID/Time/Account/Operation/Coin/Change).
  it('un cambio retroactivo de Remark no cambia el hash de la misma operación real', async () => {
    const before = await getRowHashes(csv([
      '84158159,2024-03-18 12:19:11,Spot,Transaction Buy,AMP,689,Texto original',
    ]));
    const after = await getRowHashes(csv([
      '84158159,2024-03-18 12:19:11,Spot,Transaction Buy,AMP,689,Binance reformateó este texto',
    ]));
    expect(before.rowHashes).toEqual(after.rowHashes);
  });
});

// El row_hash vive dentro de ParsedTransaction.rawRowHashes tras el
// agrupamiento — para este test basta con extraerlo de ahí sin depender de
// cómo se interpreta el grupo (BUY normal, ya cubierto por otros tests).
async function getRowHashes(content: string): Promise<{ rowHashes: string[] }> {
  const result = await parseBinanceCsv(content);
  const rowHashes = result.transactions.flatMap(tx => tx.rawRowHashes);
  return { rowHashes };
}
