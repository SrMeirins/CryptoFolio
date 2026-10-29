// Edición de transacciones importadas (#378). En la primera edición se guarda
// en `original_import` una copia de los campos que afectan a FIFO y Fiscal tal
// como se importaron; si una edición posterior los deja como el original, la
// copia se borra (deja de estar «editada»). Las notas no cuentan. Las manuales
// no se siguen: no tienen original.

/** Lo mínimo para consultar dentro de una transacción de BD. */
type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

/** Campos seguidos, en el orden en que se muestran las diferencias. */
export const TRACKED_FIELDS = [
  'operation_type', 'timestamp', 'asset', 'amount', 'amount_net',
  'cost_asset', 'cost_amount', 'price_per_unit', 'fee_asset', 'fee_amount',
  'wallet_id', 'destination_wallet_id', 'destination_pending',
] as const;
export type TrackedField = typeof TRACKED_FIELDS[number];

/**
 * Copia de los campos seguidos como jsonb. Los números van como numeric de
 * jsonb, así que «1.50» y «1.5» se comparan iguales.
 */
export function snapshotSql(alias = 't'): string {
  return `jsonb_build_object(${TRACKED_FIELDS.map(f => `'${f}', ${alias}.${f}`).join(', ')})`;
}

/**
 * Aplica `update` sobre una transacción bloqueada y actualiza su copia del
 * original. Devuelve false si no existe.
 */
export async function updateTrackingOriginal(
  client: Queryable, id: string, update: () => Promise<void>,
): Promise<boolean> {
  const before = await client.query(
    `SELECT manually_added, original_import, ${snapshotSql()} AS current
     FROM transactions t WHERE id = $1 FOR UPDATE`, [id]);
  if (before.rows.length === 0) return false;
  await update();
  const row = before.rows[0];
  if (row.manually_added) return true;
  const original = row.original_import ?? row.current;
  await client.query(
    `UPDATE transactions t
     SET original_import = CASE WHEN ${snapshotSql()} = $2::jsonb THEN NULL ELSE $2::jsonb END
     WHERE id = $1`, [id, JSON.stringify(original)]);
  return true;
}

export type RestoreResult = 'restaurada' | 'no_encontrada' | 'no_editada';

/** Repone los campos seguidos tal como se importaron y borra la copia. */
export async function restoreOriginal(client: Queryable, id: string): Promise<RestoreResult> {
  const r = await client.query('SELECT original_import FROM transactions WHERE id = $1 FOR UPDATE', [id]);
  if (r.rows.length === 0) return 'no_encontrada';
  if (r.rows[0].original_import === null) return 'no_editada';
  await client.query(
    `UPDATE transactions SET
       operation_type        = (o->>'operation_type')::operation_type,
       timestamp             = (o->>'timestamp')::timestamptz,
       asset                 = o->>'asset',
       amount                = (o->>'amount')::numeric,
       amount_net            = (o->>'amount_net')::numeric,
       cost_asset            = o->>'cost_asset',
       cost_amount           = (o->>'cost_amount')::numeric,
       price_per_unit        = (o->>'price_per_unit')::numeric,
       fee_asset             = o->>'fee_asset',
       fee_amount            = (o->>'fee_amount')::numeric,
       wallet_id             = (o->>'wallet_id')::uuid,
       destination_wallet_id = (o->>'destination_wallet_id')::uuid,
       destination_pending   = (o->>'destination_pending')::boolean,
       original_import       = NULL
     FROM (SELECT original_import AS o FROM transactions WHERE id = $1) src
     WHERE id = $1`, [id]);
  return 'restaurada';
}
