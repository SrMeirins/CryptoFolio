import { Router, Request, Response } from 'express';
import { pool } from '../../db/client';
import { MADRID_TZ } from '../../modules/fiscal/madridTime';
import { hasFilters, historyExportSchema } from '../../modules/history/listFilters';
import { historyRowsSql } from '../../modules/history/historyQuery';
import { CSV_BOM, HISTORY_CSV_HEADER, HistoryCsvRow, historyCsvFilename, historyCsvLine } from '../../modules/history/csvFormat';
import { waitForDrain } from '../../modules/history/streamWrite';
import { sendZodError } from './transactionsShared';

const router = Router();

// Zona de las fechas del CSV y del nombre del archivo (la sustituirá #347).
const EXPORT_TZ = MADRID_TZ;
export const EXPORT_BATCH = 1000;
// Tiempos límite de la transacción de exportación (fallo seguro): una consulta
// atascada o un cliente que deja de leer no retienen la conexión indefinidamente.
const STATEMENT_TIMEOUT_MS = 60_000;
const IDLE_IN_TX_TIMEOUT_MS = 120_000;

// ── GET /api/transactions/export.csv ──────────────────────────────────────
// Todo lo filtrado, en el orden elegido (#349). Se escribe en streaming con un
// cursor SQL dentro de una transacción REPEATABLE READ de solo lectura: la
// valoración se calcula una vez, la memoria queda acotada a un lote y el
// resultado es coherente aunque cambien los datos durante la descarga.
router.get('/export.csv', async (req: Request, res: Response) => {
  const parsed = historyExportSchema.safeParse(req.query);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  const filters = parsed.data;
  const { sql, params } = historyRowsSql(filters, EXPORT_TZ);

  const client = await pool.connect();
  let aborted = false;
  req.on('close', () => { if (!res.writableFinished) aborted = true; });
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout = ${IDLE_IN_TX_TIMEOUT_MS}`);
    await client.query(`DECLARE historial_csv NO SCROLL CURSOR FOR ${sql}`, params);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${historyCsvFilename(new Date(), EXPORT_TZ, hasFilters(filters))}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.write(`${CSV_BOM}${HISTORY_CSV_HEADER}\n`);

    for (;;) {
      if (aborted) break;
      const batch = await client.query<HistoryCsvRow>(`FETCH ${EXPORT_BATCH} FROM historial_csv`);
      if (batch.rows.length === 0) break;
      const chunk = batch.rows.map(r => historyCsvLine(r, EXPORT_TZ)).join('\n') + '\n';
      // Respeta la contrapresión: espera a que el cliente consuma el lote, o a
      // que se desconecte (en ese caso se deja de leer y se libera la conexión).
      if (!res.write(chunk) && !(await waitForDrain(res))) aborted = true;
    }
    await client.query('COMMIT');
    if (!aborted) res.end();
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (res.headersSent) {
      // A mitad del streaming ya no se puede responder con un error: se corta
      // la descarga para que no quede un CSV incompleto que parezca válido.
      res.destroy(err as Error);
    } else {
      throw err;
    }
  } finally {
    client.release();
  }
});

export default router;
