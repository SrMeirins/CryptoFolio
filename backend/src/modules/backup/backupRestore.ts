import type { PoolClient } from 'pg';
import { BackupFormatError, BACKUP_SCHEMA } from './backupEnvelope';
import { BACKUP_TABLE_NAMES, countRows, readBackupData, tableColumns, type BackupCounts, type BackupData, type BackupRow, type BackupTable, type Queryable } from './backupTables';

// Restauración de una copia (#453). Todo va en una transacción: si algo
// falla, la base queda como estaba. Antes de sustituir nada se guarda el
// estado actual en backup_snapshots para poder volver atrás.
//
// Redes y wallets del sistema se crean en cada instalación con identificadores
// propios, así que las de la copia se casan con las locales por id y, si no,
// por nombre (ambos únicos); las referencias de la copia se traducen a los ids
// locales. Las redes locales que no están en la copia se conservan (pueden
// tener claves de API). Las wallets que no son del sistema y no están en la
// copia se borran; las del sistema no se pueden borrar.

export const SNAPSHOTS_KEPT = 3;

// Tablas que se vacían, de las que dependen a las que no. Los lotes FIFO se
// recalculan después; el registro de sincronización apunta a las direcciones.
const CLEAR_ORDER = [
  'fifo_lot_consumptions', 'fifo_lots', 'fifo_shortfalls', 'balance_sync_log',
  'raw_transactions', 'transactions', 'csv_imports', 'wallet_addresses',
  'cobertura_revisiones', 'fiscal_declaraciones', 'irpf_escalas', 'asset_metadata', 'app_config',
] as const;

// Tablas que se insertan tal cual (tras traducir ids), en orden de dependencias.
const INSERT_ORDER: readonly BackupTable[] = [
  'csv_imports', 'transactions', 'raw_transactions', 'wallet_addresses',
  'asset_metadata', 'app_config', 'cobertura_revisiones', 'fiscal_declaraciones', 'irpf_escalas',
];

type IdMap = Map<string, string>;

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Comprueba que las columnas de la copia existen hoy: con una versión igual o anterior, siempre. */
function checkColumns(data: BackupData, columns: Map<BackupTable, Set<string>>): void {
  for (const [table, rows] of Object.entries(data) as [BackupTable, BackupRow[]][]) {
    const known = columns.get(table);
    for (const row of rows) {
      for (const col of Object.keys(row)) {
        if (!known?.has(col)) throw new BackupFormatError(`La copia trae una columna desconocida (${table}.${col}).`, 'datos');
      }
    }
  }
}

/**
 * Inserta filas con las columnas que traen (las que falten toman su valor por
 * defecto). Los valores los convierte Postgres desde JSON a los tipos de la tabla;
 * los nombres de tabla y columna ya están validados contra el esquema real.
 */
async function insertRows(client: PoolClient, table: BackupTable, rows: BackupRow[], suffix = ''): Promise<void> {
  if (rows.length === 0) return;
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))].map(quoteIdent).join(', ');
  await client.query(
    `INSERT INTO ${quoteIdent(table)} (${cols})
     SELECT ${cols} FROM json_populate_recordset(NULL::${quoteIdent(table)}, $1::json) ${suffix}`,
    [JSON.stringify(rows)],
  );
}

function remap(rows: BackupRow[], fields: readonly string[], map: IdMap): BackupRow[] {
  return rows.map(r => {
    const out = { ...r };
    for (const f of fields) {
      const v = out[f];
      if (typeof v === 'string' && map.has(v)) out[f] = map.get(v);
    }
    return out;
  });
}

/**
 * Casa las filas de la copia con las locales por id o por nombre, actualiza
 * las casadas con `updatable` e inserta las nuevas. Devuelve la traducción de
 * ids y los ids locales casados.
 */
async function mergeByIdOrName(client: PoolClient, table: 'networks' | 'wallets', rows: BackupRow[],
  updatable: (local: { is_system?: boolean }) => readonly string[], beforeUpdate?: (matched: Set<string>) => Promise<void>,
): Promise<{ map: IdMap; matched: Set<string> }> {
  const local = (await client.query<{ id: string; name: string; is_system?: boolean }>(
    `SELECT * FROM ${quoteIdent(table)}`)).rows;
  const byId = new Map(local.map(l => [l.id, l]));
  const byName = new Map(local.map(l => [l.name, l]));
  const map: IdMap = new Map();
  const matched = new Set<string>();
  const updates: { local: typeof local[number]; row: BackupRow }[] = [];
  const inserts: BackupRow[] = [];
  for (const row of rows) {
    const hit = byId.get(String(row.id)) ?? byName.get(String(row.name));
    if (hit && !matched.has(hit.id)) {
      map.set(String(row.id), hit.id);
      matched.add(hit.id);
      updates.push({ local: hit, row });
    } else {
      inserts.push(row);
    }
  }
  await beforeUpdate?.(matched);
  for (const { local: l, row } of updates) {
    const cols = updatable(l).filter(c => c in row);
    if (cols.length === 0) continue;
    await client.query(
      `UPDATE ${quoteIdent(table)} SET ${cols.map((c, i) => `${quoteIdent(c)} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [l.id, ...cols.map(c => row[c])],
    );
  }
  await insertRows(client, table, inserts);
  return { map, matched };
}

/** Sustituye los datos por los de la copia, dentro de la transacción de `client`. */
export async function replaceData(client: PoolClient, partial: Partial<BackupData>): Promise<void> {
  // Una copia previa de una versión anterior puede no tener las tablas nuevas.
  const data = Object.fromEntries(BACKUP_TABLE_NAMES.map(t => [t, partial[t] ?? []])) as BackupData;
  checkColumns(data, await tableColumns(client));
  for (const t of CLEAR_ORDER) await client.query(`DELETE FROM ${t}`);

  // Redes: se fusionan; los contratos de tokens, por red y activo.
  const nets = await mergeByIdOrName(client, 'networks', data.networks,
    () => ['name', 'native_asset', 'explorer_url', 'explorer_tx_url']);
  // Sin id: si la red ya tiene ese contrato, se actualiza el local.
  const assets = remap(data.network_assets, ['network_id'], nets.map).map(r => { const out = { ...r }; delete out.id; return out });
  await insertRows(client, 'network_assets', assets,
    'ON CONFLICT (network_id, asset) DO UPDATE SET contract_address = EXCLUDED.contract_address');

  // Wallets: las del sistema conservan su tipo; las que sobran se borran
  // antes de renombrar, para no chocar con sus nombres.
  const wallets = await mergeByIdOrName(client, 'wallets', data.wallets,
    l => (l.is_system ? ['name', 'is_default', 'color', 'notes'] : ['name', 'type', 'is_default', 'color', 'notes']),
    async matched => {
      await client.query('DELETE FROM wallets WHERE NOT is_system AND NOT (id = ANY($1::uuid[]))', [[...matched]]);
    });

  const rows: Partial<Record<BackupTable, BackupRow[]>> = {
    transactions: remap(remap(data.transactions, ['wallet_id', 'destination_wallet_id'], wallets.map), ['counterparty_network_id'], nets.map),
    wallet_addresses: remap(remap(data.wallet_addresses, ['wallet_id'], wallets.map), ['network_id'], nets.map),
  };
  for (const t of INSERT_ORDER) await insertRows(client, t, rows[t] ?? data[t]);
}

export interface SnapshotInfo { id: string; created_at: string; schema: number; counts: BackupCounts }

/** Guarda el estado actual y deja solo las copias previas más recientes. */
export async function saveSnapshot(client: PoolClient): Promise<string> {
  const current = await readBackupData(client);
  const { rows } = await client.query<{ id: string }>(
    'INSERT INTO backup_snapshots (schema, counts, data) VALUES ($1, $2, $3) RETURNING id',
    [BACKUP_SCHEMA, JSON.stringify(countRows(current)), JSON.stringify(current)],
  );
  await client.query(
    `DELETE FROM backup_snapshots WHERE id NOT IN (SELECT id FROM backup_snapshots ORDER BY created_at DESC LIMIT $1)`,
    [SNAPSHOTS_KEPT],
  );
  return rows[0].id;
}

export async function listSnapshots(client: Queryable): Promise<SnapshotInfo[]> {
  const { rows } = await client.query<SnapshotInfo>(
    'SELECT id, created_at, schema, counts FROM backup_snapshots ORDER BY created_at DESC');
  return rows;
}

/** Restaura una copia: guarda el estado actual y sustituye los datos. */
export async function restoreBackup(client: PoolClient, data: BackupData): Promise<{ snapshotId: string }> {
  const snapshotId = await saveSnapshot(client);
  await replaceData(client, data);
  return { snapshotId };
}

/** Vuelve al estado de una copia previa y la retira. Devuelve false si no existe. */
export async function revertSnapshot(client: PoolClient, id: string): Promise<boolean> {
  const { rows } = await client.query<{ data: Partial<BackupData> }>('SELECT data FROM backup_snapshots WHERE id = $1', [id]);
  if (!rows[0]) return false;
  await replaceData(client, rows[0].data);
  await client.query('DELETE FROM backup_snapshots WHERE id = $1', [id]);
  return true;
}
