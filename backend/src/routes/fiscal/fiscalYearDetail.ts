import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { getEventosAnio } from '../../modules/fiscal/eventosAnio';
import { getUmbral721, sumaValorCustodiaExchange, valorizarLotesEnFecha } from '../../modules/fiscal/lotesValoracion';
import { parseYear } from './fiscalShared';
import { obligacion721 } from '../../modules/fiscal/declaraciones';
import { listarDeclaraciones, ultimaPresentacion721 } from '../../modules/fiscal/declaracionesRepo';
import { endOfLocalYear, localDate, localYearMonth } from '../../modules/time/localTime';
import { getAppTimezone } from '../../modules/time/appTimezone';

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
// G/P acumulado mes a mes para el año dado (para gráfico de evolución).
router.get('/:year/monthly', async (req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });

  const result = await db.query(`
    SELECT
      EXTRACT(MONTH FROM flc.consumed_at AT TIME ZONE $2)::int AS mes,
      COALESCE(SUM(flc.gain_loss_eur), 0)      AS neto_mes
    FROM fifo_lot_consumptions flc
    WHERE EXTRACT(YEAR FROM flc.consumed_at AT TIME ZONE $2) = $1
      AND flc.fiscal_event_type != 'NONE'
    GROUP BY mes
    ORDER BY mes
  `, [year, tz]);

  const byMonth = new Map(result.rows.map((r: Record<string, unknown>) => [
    parseInt(r.mes as string),
    parseFloat(r.neto_mes as string),
  ]));

  const { year: currentYear, month: currentMonth } = localYearMonth(tz);
  const maxMonth = year < currentYear ? 12 : currentMonth;

  let acumulado = 0;
  const meses = [];
  for (let m = 1; m <= maxMonth; m++) {
    acumulado += byMonth.get(m) ?? 0;
    meses.push({
      mes: m,
      label: new Date(year, m - 1, 1).toLocaleDateString('es-ES', { month: 'short' }),
      netoMes:    byMonth.get(m) ?? 0,
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

  const rendRes = await db.query(`
    SELECT
      COALESCE(SUM(t.amount_net * COALESCE(t.price_per_unit, 0)), 0) AS total_rendimientos,
      COUNT(*) AS num_rendimientos
    FROM transactions t
    WHERE EXTRACT(YEAR FROM t.timestamp AT TIME ZONE $2) = $1
      AND t.operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
  `, [year, tz]);

  const dec31 = esAnioEnCurso ? new Date() : endOfLocalYear(tz, year);
  const { activos, preciosPendientes } = await valorizarLotesEnFecha(dec31);
  // Modelo 721: solo cuenta la custodia de terceros (exchanges); la
  // autocustodia (hardware/software) no se declara en este modelo.
  const valorTotal721 = sumaValorCustodiaExchange(activos);

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
router.get('/:year/modelo721', async (req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });

  const currentYear = localYearMonth(tz).year;
  const esAnioEnCurso = year === currentYear;
  const dec31 = esAnioEnCurso ? new Date() : endOfLocalYear(tz, year);

  const { activos, preciosPendientes } = await valorizarLotesEnFecha(dec31);
  const umbral = await getUmbral721();

  const totalValor = activos.reduce((sum, a) => sum + a.valorEur, 0);
  const ultimaPresentacion = await ultimaPresentacion721(year);
  const presentado = (await listarDeclaraciones()).find(d => d.ejercicio === year && d.tipo === 'modelo721') ?? null;
  // Solo la custodia de terceros computa para el umbral del 721.
  const totalValorCustodia = sumaValorCustodiaExchange(activos);

  res.json({
    year,
    esAnioEnCurso,
    // Día de Madrid (#303): en el año en curso, recortar el ISO daba el día UTC.
    fecha:        localDate(tz, dec31),
    activos,
    totalValor,
    totalValorCustodia,
    superaUmbral: totalValorCustodia > umbral,
    umbral,
    // Regla del incremento de 20.000 € respecto al último 721 presentado (#311).
    ultimaPresentacion,
    obligado: obligacion721(totalValorCustodia, umbral, ultimaPresentacion),
    presentado: presentado ? { declaradoEn: presentado.declaradoEn, valor: presentado.cifras.valor } : null,
    // Activos sin precio: los totales son un mínimo (#267).
    preciosPendientes,
    incompleto: preciosPendientes.length > 0,
    aviso: 'El Modelo 721 aplica a criptoactivos cuya custodia está en manos de un tercero situado en el extranjero (exchanges). Se cuentan todos los exchanges registrados; confirma con tu asesor fiscal cuáles son entidades extranjeras. La autocustodia no computa.',
  });
});

export default router;
