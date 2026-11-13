import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { getEventosAnio } from '../../modules/fiscal/eventosAnio';
import { getUmbral721, valorizarLotesEnFecha } from '../../modules/fiscal/lotesValoracion';
import { estado721, grupos721, historico721 } from '../../modules/fiscal/modelo721';
import { parseYear } from './fiscalShared';
import { listarDeclaraciones } from '../../modules/fiscal/declaracionesRepo';
import { reglasPublicas } from '../../modules/fiscal/custodia';
import { endOfLocalYear, localDate, localYearMonth } from '../../modules/time/localTime';
import { getAppTimezone } from '../../modules/time/appTimezone';
import { OPS_BASE_GENERAL, OPS_RCM_AHORRO } from '../../modules/fiscal/clasificacionRentas';

const router = Router();

// ── GET /api/fiscal/:year/breakdown ───────────────────────────────────────
// G/P neto agrupado por activo transmitido para el año dado.
router.get('/:year/breakdown', async (req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });

  const result = await db.query(`
    SELECT
      fl.asset,
      COALESCE(SUM(CASE WHEN flc.gain_loss_eur > 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS ganancias,
      COALESCE(SUM(CASE WHEN flc.gain_loss_eur < 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS perdidas,
      COALESCE(SUM(flc.gain_loss_eur), 0) AS neto,
      COUNT(*) AS operaciones
    FROM fifo_lot_consumptions flc
    JOIN fifo_lots fl ON fl.id = flc.lot_id
    WHERE EXTRACT(YEAR FROM flc.consumed_at AT TIME ZONE $2) = $1
      AND flc.fiscal_event_type != 'NONE'
    GROUP BY fl.asset
    ORDER BY ABS(SUM(flc.gain_loss_eur)) DESC
  `, [year, tz]);

  res.json(result.rows.map((r: Record<string, unknown>) => ({
    asset:       r.asset as string,
    ganancias:   parseFloat(r.ganancias as string),
    perdidas:    parseFloat(r.perdidas as string),
    neto:        parseFloat(r.neto as string),
    operaciones: parseInt(r.operaciones as string),
  })));
});

// ── GET /api/fiscal/:year/monthly ──────────────────────────────────────────
// Resultado mes a mes del año dado (gráfico de evolución): ganancias y
// pérdidas por separado (#539), neto, operaciones y acumulado.
router.get('/:year/monthly', async (req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });

  const result = await db.query(`
    SELECT
      EXTRACT(MONTH FROM flc.consumed_at AT TIME ZONE $2)::int AS mes,
      COALESCE(SUM(flc.gain_loss_eur), 0)      AS neto_mes,
      COALESCE(SUM(flc.gain_loss_eur) FILTER (WHERE flc.gain_loss_eur > 0), 0) AS ganancias_mes,
      COALESCE(SUM(flc.gain_loss_eur) FILTER (WHERE flc.gain_loss_eur < 0), 0) AS perdidas_mes,
      COUNT(*) AS operaciones_mes
    FROM fifo_lot_consumptions flc
    WHERE EXTRACT(YEAR FROM flc.consumed_at AT TIME ZONE $2) = $1
      AND flc.fiscal_event_type != 'NONE'
    GROUP BY mes
    ORDER BY mes
  `, [year, tz]);

  const byMonth = new Map(result.rows.map((r: Record<string, unknown>) => [
    parseInt(r.mes as string),
    {
      neto: parseFloat(r.neto_mes as string),
      ganancias: parseFloat(r.ganancias_mes as string),
      perdidas: parseFloat(r.perdidas_mes as string),
      operaciones: parseInt(r.operaciones_mes as string),
    },
  ]));

  const { year: currentYear, month: currentMonth } = localYearMonth(tz);
  const maxMonth = year < currentYear ? 12 : currentMonth;

  let acumulado = 0;
  const meses = [];
  for (let m = 1; m <= maxMonth; m++) {
    const d = byMonth.get(m);
    acumulado += d?.neto ?? 0;
    meses.push({
      mes: m,
      label: new Date(year, m - 1, 1).toLocaleDateString('es-ES', { month: 'short' }),
      netoMes:       d?.neto ?? 0,
      gananciasMes:  d?.ganancias ?? 0,
      perdidasMes:   d?.perdidas ?? 0,
      operacionesMes: d?.operaciones ?? 0,
      acumulado,
    });
  }

  // Sin proyección lineal (#301): extrapolar el resultado de unos meses al año completo no era fiable.
  res.json({ meses });
});

// ── GET /api/fiscal/:year/summary ──────────────────────────────────────────
router.get('/:year/summary', async (req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });

  const currentYear = localYearMonth(tz).year;
  const esAnioEnCurso = year === currentYear;

  const gpRes = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN flc.gain_loss_eur > 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS total_ganancias,
      COALESCE(SUM(CASE WHEN flc.gain_loss_eur < 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS total_perdidas,
      COALESCE(SUM(flc.gain_loss_eur), 0) AS neto,
      COUNT(*) AS num_operaciones
    FROM fifo_lot_consumptions flc
    WHERE EXTRACT(YEAR FROM flc.consumed_at AT TIME ZONE $2) = $1
      AND flc.fiscal_event_type != 'NONE'
  `, [year, tz]);

  // Rentas en especie por base (#537): las del ahorro entran en la cuota; las
  // de la base general solo se informan.
  const rendRes = await db.query(`
    SELECT
      COALESCE(SUM(t.amount_net * COALESCE(t.price_per_unit, 0)) FILTER (WHERE t.operation_type = ANY($3)), 0) AS total_rendimientos,
      COUNT(*) FILTER (WHERE t.operation_type = ANY($3)) AS num_rendimientos,
      COALESCE(SUM(t.amount_net * COALESCE(t.price_per_unit, 0)) FILTER (WHERE t.operation_type = ANY($4)), 0) AS total_base_general,
      COUNT(*) FILTER (WHERE t.operation_type = ANY($4)) AS num_base_general
    FROM transactions t
    WHERE EXTRACT(YEAR FROM t.timestamp AT TIME ZONE $2) = $1
  `, [year, tz, OPS_RCM_AHORRO, OPS_BASE_GENERAL]);

  const dec31 = esAnioEnCurso ? new Date() : endOfLocalYear(tz, year);
  const { activos, preciosPendientes } = await valorizarLotesEnFecha(dec31);
  // Modelo 721: solo cuenta la custodia de terceros en el extranjero (#545);
  // la autocustodia y las entidades españolas no se declaran en este modelo.
  const valorTotal721 = (await grupos721(activos, dec31)).filter(g => g.computa).reduce((s, g) => s + g.totalEur, 0);

  const umbral = await getUmbral721();

  res.json({
    year,
    esAnioEnCurso,
    totalGanancias:              parseFloat(gpRes.rows[0].total_ganancias),
    totalPerdidas:               parseFloat(gpRes.rows[0].total_perdidas),
    netoPatrimonial:             parseFloat(gpRes.rows[0].neto),
    numOperacionesPatrimoniales: parseInt(gpRes.rows[0].num_operaciones),
    totalRendimientos:           parseFloat(rendRes.rows[0].total_rendimientos),
    numRendimientos:             parseInt(rendRes.rows[0].num_rendimientos),
    totalBaseGeneral:            parseFloat(rendRes.rows[0].total_base_general),
    numBaseGeneral:              parseInt(rendRes.rows[0].num_base_general),
    // Con precios pendientes el valor es un mínimo: si ya supera el umbral la
    // obligación es segura; si no, el resultado es incompleto (#267).
    valorTotal31Dic:             valorTotal721,
    superaUmbral721:             valorTotal721 > umbral,
    umbral721:                   umbral,
    preciosPendientes,
    valorIncompleto:             preciosPendientes.length > 0,
  });
});

// ── GET /api/fiscal/:year/events ───────────────────────────────────────────
router.get('/:year/events', async (req: Request, res: Response) => {
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });

  const data = await getEventosAnio(year);
  res.json(data);
});

// ── GET /api/fiscal/:year/modelo721 ───────────────────────────────────────
// Por entidad custodia, con veredicto (umbral, incremento y extinción) e
// histórico a 31 de diciembre (#545).
router.get('/:year/modelo721', async (req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });

  const currentYear = localYearMonth(tz).year;
  const esAnioEnCurso = year === currentYear;
  const dec31 = esAnioEnCurso ? new Date() : endOfLocalYear(tz, year);

  const [estado, historico, declaraciones] = await Promise.all([
    estado721(year, dec31), historico721(tz, currentYear), listarDeclaraciones(),
  ]);
  const presentado = declaraciones.find(d => d.ejercicio === year && d.tipo === 'modelo721') ?? null;
  const { grupos, veredicto, preciosPendientes, ultimaPresentacion, totalCartera } = estado;

  res.json({
    year,
    esAnioEnCurso,
    // Día de Madrid (#303): en el año en curso, recortar el ISO daba el día UTC.
    fecha:        localDate(tz, dec31),
    grupos,
    veredicto,
    historico,
    // Toda la cartera (autocustodia incluida) y lo que computa: custodia de
    // terceros en el extranjero (o sin entidad asignada).
    totalValor:   totalCartera,
    totalValorCustodia: veredicto.valorEur,
    superaUmbral: veredicto.valorEur > veredicto.umbral,
    umbral:       veredicto.umbral,
    ultimaPresentacion,
    obligado:     veredicto.obligado === true,
    presentado:   presentado ? { declaradoEn: presentado.declaradoEn, valor: presentado.cifras.valor } : null,
    // Wallets de exchange cuya custodia no se sabe: computan por prudencia.
    sinCustodia:  grupos.flatMap(g => g.wallets.filter(w => w.origen === 'desconocido').map(w => ({ id: w.id, nombre: w.nombre }))),
    // Reglas automáticas de los exchanges que la app importa, con sus fuentes.
    reglas:       reglasPublicas(),
    // Activos sin precio: los totales son un mínimo (#267).
    preciosPendientes,
    incompleto:   preciosPendientes.length > 0,
  });
});

export default router;
