import type { QueryResult, QueryResultRow } from 'pg';

// Qué entra en una copia (#453): todo lo que no se puede recalcular. Fuera
// quedan las cachés de precios y cierres, los logos, los lotes FIFO (se
// recalculan tras restaurar), el registro de sincronización de saldos y las
// claves de API de las redes, que son secretos de este equipo.
//
// El orden es el de inserción: cada tabla va después de aquellas a las que
// apunta. La clave ordena las filas para que la copia sea estable.

export const BACKUP_TABLES = [
  { name: 'networks',             order: 'name' },
  { name: 'network_assets',       order: 'network_id, asset' },
  { name: 'wallets',              order: 'created_at, name' },
  { name: 'wallet_addresses',     order: 'created_at, id' },
  { name: 'csv_imports',          order: 'imported_at, id' },
  { name: 'transactions',         order: 'timestamp, id' },
  { name: 'raw_transactions',     order: 'time, id' },
  { name: 'asset_metadata',       order: 'symbol' },
  { name: 'app_config',           order: 'key' },
  { name: 'cobertura_revisiones', order: 'revisado_en, id' },
  { name: 'fiscal_declaraciones', order: 'ejercicio, tipo' },
  { name: 'irpf_escalas',         order: 'ejercicio' },
] as const;

export type BackupTable = typeof BACKUP_TABLES[number]['name'];
export const BACKUP_TABLE_NAMES: readonly BackupTable[] = BACKUP_TABLES.map(t => t.name);

export type BackupRow = Record<string, unknown>;

// Vale tanto el pool (db) como el cliente de una transacción.
export type Queryable = { query: <T extends QueryResultRow = BackupRow>(text: string, params?: unknown[]) => Promise<QueryResult<T>> };
export type BackupData = Record<BackupTable, BackupRow[]>;
export type BackupCounts = Record<BackupTable, number>;

/** Lee todas las tablas de la copia (los nombres salen de la lista fija, nunca de la petición). */
export async function readBackupData(client: Queryable): Promise<BackupData> {
  const data = {} as BackupData;
  for (const t of BACKUP_TABLES) {
    const { rows } = await client.query(`SELECT * FROM ${t.name} ORDER BY ${t.order}`);
    data[t.name] = rows;
  }
  return data;
}

export function countRows(data: BackupData): BackupCounts {
  return Object.fromEntries(BACKUP_TABLE_NAMES.map(t => [t, data[t].length])) as BackupCounts;
}

/** Columnas actuales de cada tabla de la copia, para validar las de un fichero. */
export async function tableColumns(client: Queryable): Promise<Map<BackupTable, Set<string>>> {
  const { rows } = await client.query<{ table_name: BackupTable; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = ANY($1)`,
    [BACKUP_TABLE_NAMES],
  );
  const map = new Map<BackupTable, Set<string>>(BACKUP_TABLE_NAMES.map(t => [t, new Set()]));
  for (const r of rows) map.get(r.table_name)?.add(r.column_name);
  return map;
}
