import { RawRowWithHash } from './types';
import { ACCOUNT_TO_WALLET, TRANSFER_DESTINATIONS } from './binanceAccounts';

// Construye el mapa hash de fila de salida → cuenta de destino real, a partir
// de las filas crudas que el propio parser ya expone (parseResult.rawRows).
// El mapping estático TRANSFER_DESTINATIONS no cubre todos los casos (p.ej.
// Cross Margin → Isolated Margin) — aquí se resuelve desde los datos reales:
// el parser solo emite la fila de SALIDA (change < 0) de cada par de
// transferencia interna, pero el CSV contiene también la fila de ENTRADA
// (change > 0) que indica la cuenta destino real.
//
// Antes, esta función volvía a parsear el CSV y recalculaba manualmente
// occurrenceIndex/rowHash con su propia copia de la fórmula de parser.ts —
// dos fórmulas de hash para la misma fila que, si se desincronizan, hacen
// fallar esta resolución en silencio para TODAS las transferencias internas
// (incidente real, 2026-09-29). Usar rawRows (ya hasheadas una sola vez por
// el parser) elimina esa clase de bug por construcción.
export function buildTransferDestinationMap(rawRows: RawRowWithHash[]): Map<string, string> {
  const incomingByKey = new Map<string, string>(); // key → cuenta de entrada
  const transferDestByHash = new Map<string, string>(); // rowHash de salida → cuenta destino

  for (const { record: rec } of rawRows) {
    const change = parseFloat(rec['Change'] ?? '0');
    if (change > 0 && TRANSFER_DESTINATIONS[rec['Operation']]) {
      const key = `${rec['Time']}|${rec['Operation']}|${rec['Coin']}|${rec['Change']}`;
      incomingByKey.set(key, rec['Account']);
    }
  }

  for (const { record: rec, hash } of rawRows) {
    const change = parseFloat(rec['Change'] ?? '0');
    if (change < 0 && TRANSFER_DESTINATIONS[rec['Operation']]) {
      const absChangeStr = rec['Change'].startsWith('-') ? rec['Change'].slice(1) : rec['Change'];
      const key = `${rec['Time']}|${rec['Operation']}|${rec['Coin']}|${absChangeStr}`;
      const incomingAccount = incomingByKey.get(key);
      if (incomingAccount) {
        transferDestByHash.set(hash, incomingAccount);
      }
    }
  }

  return transferDestByHash;
}

// Resuelve el wallet_id para una cuenta CSV. Binance usa ACCOUNT_TO_WALLET
// ('Spot' → 'Binance Spot', etc.); Bitvavo no tiene sub-cuentas, así que el
// parser ya emite el nombre de wallet literal ('Bitvavo') como account.
// Extraída de una closure dentro de la transacción DB a función nombrada y
// parametrizada — se puede testear sin montar una transacción real.
export function resolveWalletId(account: string, walletIdByName: Record<string, string>): string {
  const name = ACCOUNT_TO_WALLET[account] ?? account;
  const id = walletIdByName[name];
  if (!id) {
    throw new Error(
      `Falta la wallet de sistema "${name}" (cuenta CSV "${account}"). ` +
      `Puede que se haya borrado manualmente — créala de nuevo antes de reimportar.`
    );
  }
  return id;
}

// Resuelve el wallet_id destino para una transferencia interna. Primero
// intenta el mapa dinámico (buildTransferDestinationMap, construido desde las
// filas de entrada del CSV), que cubre casos que el mapping estático no puede
// conocer; si no hay match, cae al mapping estático TRANSFER_DESTINATIONS.
export function resolveDestinationWalletId(
  notes: string | undefined,
  account: string,
  rowHash: string | undefined,
  transferDestByHash: Map<string, string>,
  walletIdByName: Record<string, string>
): string | null {
  if (!notes) return null;
  if (rowHash) {
    const incomingAccount = transferDestByHash.get(rowHash);
    if (incomingAccount) {
      const walletName = ACCOUNT_TO_WALLET[incomingAccount];
      if (walletName && walletIdByName[walletName]) return walletIdByName[walletName];
    }
  }
  const destName = TRANSFER_DESTINATIONS[notes]?.[account];
  if (!destName) return null;
  return walletIdByName[destName] ?? null;
}
