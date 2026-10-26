import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { FIFO_DUST_EPSILON } from '../../modules/fifo/constants';
import { cargarAniosFiscales, compensarPerdidas } from '../../modules/fiscal/carryforward';
import { parseTiposConfig } from '../../modules/fiscal/irpf';
import { madridYearMonth } from '../../modules/fiscal/madridTime';
import { colchonSinTributar, cuotaConExtra } from '../../modules/fiscal/planificador';
import { sendZodError } from './fiscalShared';
import { sendInternalError } from '../../middleware/errorHandler';

// Planificador de fin de año (#307). El contexto fiscal del ejercicio en
// curso y los lotes abiertos en orden FIFO; el navegador los valora con los
// precios en vivo. Las cuotas se calculan aquí con el mismo motor de
// compensación e IRPF que el simulador de venta.
const router = Router();

async function contexto() {
  const year = madridYearMonth().year;
  const anios = await cargarAniosFiscales(year);
  const tipos = parseTiposConfig((await db.query("SELECT value FROM app_config WHERE key = 'irpf_tramos_tipos'")).rows[0]?.value);
  return { year, anios, tipos };
}

// GET /api/fiscal/planificador
router.get('/planificador', async (_req: Request, res: Response) => {
  try {
    const { year, anios, tipos } = await contexto();
    const actual = anios.find(a => a.year === year) ?? { year, netoGP: 0, rendimientos: 0 };
    const { origenes } = compensarPerdidas(anios);
    const lotes = await db.query(
      `SELECT fl.asset, fl.wallet_id, w.name AS wallet_name, w.color AS wallet_color, w.type AS wallet_kind,
              fl.opened_at, fl.quantity_remaining::float AS quantity, fl.price_per_unit_eur::float AS unit_cost
       FROM fifo_lots fl JOIN wallets w ON w.id = fl.wallet_id
       WHERE fl.is_closed = FALSE AND fl.quantity_remaining > $1
       ORDER BY fl.asset, w.name, fl.opened_at ASC, fl.created_at ASC`,
      [FIFO_DUST_EPSILON],
    );
    // Adquisiciones de los últimos 2 meses (regla de recompra, art. 33.5 LIRPF).
    const recientes = await db.query(
      `SELECT asset, MAX(opened_at) AS ultima
       FROM fifo_lots WHERE opened_at >= now() - INTERVAL '2 months'
       GROUP BY asset`,
    );
    res.json({
      year,
      netoAnio: actual.netoGP,
      rendimientosAnio: actual.rendimientos,
      cuotaActual: cuotaConExtra(anios, year, tipos, 0),
      colchon: colchonSinTributar(anios, year),
      pendienteVigente: origenes.reduce((s, o) => s + o.pendiente, 0),
      caducanEsteAnio: origenes.filter(o => o.pendiente > 0.01 && o.caducaEn === year).reduce((s, o) => s + o.pendiente, 0),
      lotes: lotes.rows.map((r: Record<string, unknown>) => ({
        asset: r.asset, walletId: r.wallet_id, walletName: r.wallet_name, walletColor: r.wallet_color, walletKind: r.wallet_kind,
        openedAt: new Date(r.opened_at as string).toISOString(), quantity: r.quantity, unitCost: r.unit_cost,
      })),
      comprasRecientes: Object.fromEntries(recientes.rows.map((r: { asset: string; ultima: string }) => [r.asset, new Date(r.ultima).toISOString()])),
    });
  } catch (e) {
    sendInternalError(res, e, 'GET /api/fiscal/planificador');
  }
});

const cuotasSchema = z.strictObject({
  ganancias: z.array(z.number().min(-1e9).max(1e9)).min(1).max(200),
});

// POST /api/fiscal/planificador/cuotas — cuota del año con cada ganancia (o pérdida) adicional
router.post('/planificador/cuotas', async (req: Request, res: Response) => {
  const parsed = cuotasSchema.safeParse(req.body);
  if (!parsed.success) return sendZodError(res, parsed.error);
  try {
    const { year, anios, tipos } = await contexto();
    res.json({
      cuotaBase: cuotaConExtra(anios, year, tipos, 0),
      cuotas: parsed.data.ganancias.map(g => cuotaConExtra(anios, year, tipos, g)),
    });
  } catch (e) {
    sendInternalError(res, e, 'POST /api/fiscal/planificador/cuotas');
  }
});

export default router;
