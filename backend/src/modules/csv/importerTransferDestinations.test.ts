import { describe, expect, it } from 'vitest';
import { buildTransferDestinationMap, resolveWalletId, resolveDestinationWalletId } from './importerTransferDestinations';
import { RawRowWithHash } from './types';

// Antes de este turno, buildTransferDestinationMap volvía a parsear el CSV y
// recalculaba manualmente occurrenceIndex/rowHash — y resolveWalletId/
// resolveDestinationWalletId eran closures dentro de la transacción DB de
// importer.ts, imposibles de testear sin montar una transacción real. Ahora
// son funciones puras y parametrizadas — este test las ejercita aisladas.

function rawRow(record: Record<string, string>, hash: string): RawRowWithHash {
  return { record, hash };
}

describe('buildTransferDestinationMap', () => {
  it('empareja la fila de salida con la de entrada por time|operation|coin|amount y devuelve la cuenta destino', () => {
    const rows: RawRowWithHash[] = [
      rawRow({ Time: '2024-05-10 10:00:00', Account: 'Spot', Operation: 'Inter-Wallet Transfer', Coin: 'LUNC', Change: '-1000' }, 'hash-salida'),
      rawRow({ Time: '2024-05-10 10:00:00', Account: 'Cross Margin', Operation: 'Inter-Wallet Transfer', Coin: 'LUNC', Change: '1000' }, 'hash-entrada'),
    ];

    const map = buildTransferDestinationMap(rows);

    expect(map.get('hash-salida')).toBe('Cross Margin');
    expect(map.has('hash-entrada')).toBe(false); // solo se indexan las filas de SALIDA
  });

  it('no empareja filas de operaciones no listadas en TRANSFER_DESTINATIONS', () => {
    const rows: RawRowWithHash[] = [
      rawRow({ Time: '2024-01-01 00:00:00', Account: 'Spot', Operation: 'Deposit', Coin: 'BTC', Change: '-1' }, 'hash-1'),
      rawRow({ Time: '2024-01-01 00:00:00', Account: 'Funding', Operation: 'Deposit', Coin: 'BTC', Change: '1' }, 'hash-2'),
    ];

    const map = buildTransferDestinationMap(rows);

    expect(map.size).toBe(0);
  });

  it('no empareja si el importe no coincide exactamente', () => {
    const rows: RawRowWithHash[] = [
      rawRow({ Time: '2024-05-10 10:00:00', Account: 'Spot', Operation: 'Inter-Wallet Transfer', Coin: 'LUNC', Change: '-1000' }, 'hash-salida'),
      rawRow({ Time: '2024-05-10 10:00:00', Account: 'Cross Margin', Operation: 'Inter-Wallet Transfer', Coin: 'LUNC', Change: '999' }, 'hash-entrada'),
    ];

    const map = buildTransferDestinationMap(rows);

    expect(map.has('hash-salida')).toBe(false);
  });
});

describe('resolveWalletId', () => {
  it('resuelve una cuenta Binance conocida (Spot → Binance Spot) vía ACCOUNT_TO_WALLET', () => {
    const walletIdByName = { 'Binance Spot': 'wallet-123' };
    expect(resolveWalletId('Spot', walletIdByName)).toBe('wallet-123');
  });

  it('lanza un error explícito si falta la wallet de sistema', () => {
    expect(() => resolveWalletId('Spot', {})).toThrow(/Falta la wallet de sistema/);
  });
});

describe('resolveDestinationWalletId', () => {
  it('prioriza el mapa dinámico (transferDestByHash) sobre el mapping estático', () => {
    const transferDestByHash = new Map([['hash-salida', 'Cross Margin']]);
    const walletIdByName = { 'Binance Cross Margin': 'wallet-cross' };

    const result = resolveDestinationWalletId('Inter-Wallet Transfer', 'Spot', 'hash-salida', transferDestByHash, walletIdByName);

    expect(result).toBe('wallet-cross');
  });

  it('cae al mapping estático TRANSFER_DESTINATIONS si no hay match en el mapa dinámico', () => {
    const walletIdByName = { 'Binance Funding': 'wallet-funding' };

    const result = resolveDestinationWalletId(
      'Transfer Between Main and Funding Wallet', 'Spot', undefined, new Map(), walletIdByName
    );

    expect(result).toBe('wallet-funding');
  });

  it('devuelve null si no hay notes', () => {
    expect(resolveDestinationWalletId(undefined, 'Spot', 'hash-x', new Map(), {})).toBeNull();
  });
});
