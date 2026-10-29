import type { ParsedTransaction } from './types';

// Compras con fiat sin su pago en el CSV (#435). Antes se importaban como
// airdrop (rendimiento en Fiscal); ahora son compras. Al re-importar, las ya
// guardadas como airdrop y sin editar a mano pasan a compra con EUR. Su coste
// es el indicado en la revisión (ya aplicado por id) o, si no, el valor de
// mercado con el que se importaron.

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

/** Pasa a compra la transacción de `id` si sigue siendo una airdrop sin editar; true si la cambia. */
export async function reclassifyOrphanBuy(db: Queryable, id: string, notes: string | null): Promise<boolean> {
  const res = await db.query(
    `UPDATE transactions
     SET operation_type = 'BUY'::operation_type, cost_asset = 'EUR',
         cost_amount = COALESCE(cost_amount, amount * price_per_unit),
         notes = $2, updated_at = NOW()
     WHERE id = $1 AND operation_type = 'AIRDROP' AND original_import IS NULL`,
    [id, notes]
  );
  return (res.rowCount ?? 0) > 0;
}

/** Reclasifica todas las compras huérfanas del archivo ya guardadas como airdrop. Devuelve cuántas. */
export async function reclassifyOrphanBuys(db: Queryable, transactions: readonly ParsedTransaction[]): Promise<number> {
  const orphans = transactions.filter(tx => tx.orphanFiatBuy);
  if (orphans.length === 0) return 0;
  const found = await db.query(
    `SELECT DISTINCT t.id::text AS id, rt.row_hash FROM raw_transactions rt JOIN transactions t ON t.id = rt.transaction_id
     WHERE rt.row_hash = ANY($1) AND t.operation_type = 'AIRDROP' AND t.original_import IS NULL`,
    [orphans.flatMap(tx => tx.rawRowHashes)]
  );
  let changed = 0;
  for (const row of found.rows) {
    const tx = orphans.find(o => o.rawRowHashes.includes(String(row.row_hash)));
    if (await reclassifyOrphanBuy(db, String(row.id), tx?.notes ?? null)) changed++;
  }
  return changed;
}
