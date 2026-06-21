import { Router, Request, Response } from 'express';
import { db } from '../db/client';
import { getHistoricalPriceEur } from '../modules/prices/binance';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────
async function getUmbral721(): Promise<number> {
  const res = await db.query("SELECT value FROM app_config WHERE key = 'modelo721_threshold'");
  return res.rows.length > 0 ? (parseInt(res.rows[0].value) || 50000) : 50000;
}

const FIAT_ASSETS = new Set(['EUR', 'USD', 'GBP', 'CHF', 'BRL', 'ARS', 'USDT', 'USDC', 'BUSD', 'DAI']);

function parseYear(raw: string): number | null {
  const y = parseInt(raw, 10);
  if (isNaN(y) || y < 2009 || y > 2100) return null; // Bitcoin nació en 2009
  return y;
}

// Claves oficiales AEAT: D=Dinero, V=Valores/cripto, I=Inmueble, O=Otros/sin contrapartida
function getContrapartidaClave(activoRecibido: string | null): { clave: string; descripcion: string } {
  if (!activoRecibido)                      return { clave: 'O', descripcion: 'Sin contrapartida directa (comision/perdida)' };
  if (FIAT_ASSETS.has(activoRecibido))      return { clave: 'D', descripcion: `Moneda de curso legal (${activoRecibido})` };
  return { clave: 'V', descripcion: `Otra moneda virtual (${activoRecibido})` };
}

function getTipoRendimiento(operationType: string): string {
  const map: Record<string, string> = {
    'STAKING_REWARD':   'Staking',
    'MINING_REWARD':    'Minería',
    'LENDING_INTEREST':        'Lending / Interés flexible',
    'LENDING_INTEREST_LOCKED': 'Lending / Interés bloqueado',
    'CASHBACK':         'Cashback / Bonus',
    'AIRDROP':          'Airdrop',
  };
  return map[operationType] ?? operationType;
}

// Reconstruye el estado histórico de lotes a una fecha dada.
// Los consumos NONE (transferencias internas) restan correctamente del lote origen.
async function getLotesAFecha(fecha: Date) {
  const res = await db.query(`
    SELECT
      fl.asset,
      fl.wallet_id,
      w.name  AS wallet_name,
      w.color AS wallet_color,
      w.type  AS wallet_kind,
      SUM(
        fl.quantity_original - COALESCE(
          (SELECT SUM(flc.quantity_consumed)
           FROM fifo_lot_consumptions flc
           WHERE flc.lot_id = fl.id
             AND flc.consumed_at <= $1
          ), 0
        )
      ) AS quantity,
      SUM(fl.cost_basis_eur) AS cost_basis
    FROM fifo_lots fl
    JOIN wallets w ON w.id = fl.wallet_id
    JOIN transactions t_open ON t_open.id = fl.open_transaction_id
    WHERE fl.opened_at <= $1
      AND (
        t_open.operation_type NOT IN ('TRANSFER_INTERNAL', 'WITHDRAW')
        OR t_open.timestamp <= $1
      )
    GROUP BY fl.asset, fl.wallet_id, w.name, w.color, w.type
    HAVING SUM(
      fl.quantity_original - COALESCE(
        (SELECT SUM(flc.quantity_consumed)
         FROM fifo_lot_consumptions flc
         WHERE flc.lot_id = fl.id
           AND flc.consumed_at <= $1
        ), 0
      )
    ) > 0.000001
    ORDER BY fl.asset, w.name
  `, [fecha]);
  return res.rows;
}

// Carga y formatea los eventos fiscales y rendimientos de un año dado.
// Función compartida entre /events y /export para no duplicar lógica.
async function getEventosAnio(year: number) {
  const gpRows = await db.query(`
    SELECT
      flc.consumed_at             AS fecha,
      t.operation_type,
      fl.asset                    AS activo_transmitido,
      t.asset                     AS tx_asset,
      flc.quantity_consumed       AS cantidad,
      t.cost_asset,
      flc.proceeds_eur            AS valor_transmision,
      fl.fee_eur                  AS gastos_adquisicion,
      flc.cost_basis_consumed_eur AS valor_adquisicion,
      flc.gain_loss_eur,
      w.name                      AS wallet,
      t.id                        AS tx_id,
      t.fee_asset,
      t.fee_amount
    FROM fifo_lot_consumptions flc
    JOIN fifo_lots    fl ON fl.id = flc.lot_id
    JOIN transactions t  ON t.id  = flc.consuming_transaction_id
    JOIN wallets      w  ON w.id  = t.wallet_id
    WHERE EXTRACT(YEAR FROM flc.consumed_at) = $1
      AND flc.fiscal_event_type != 'NONE'
    ORDER BY flc.consumed_at ASC
  `, [year]);

  const FEE_OR_LOSS_OPS = new Set(['FEE_EXCHANGE', 'FEE_NETWORK', 'FEE', 'LOST', 'GIFT_SENT']);

  const fiscalEvents = await Promise.all(
    gpRows.rows.map(async (row: Record<string, unknown>) => {
      const opType    = row.operation_type as string;
      const asset     = row.activo_transmitido as string;
      const txAsset   = row.tx_asset as string | null;
      const costAsset = row.cost_asset as string | null;

      // Determinar qué se recibió a cambio:
      // - BUY permuta (comprar B con A): tx_asset = B (distinto de fl.asset = A)
      // - SELL (vender A por B): cost_asset = B, tx_asset = fl.asset
      // - FEE/LOST: sin contrapartida directa
      let activoRecibido: string | null;
      if (FEE_OR_LOSS_OPS.has(opType)) {
        activoRecibido = null;
      } else if (txAsset && txAsset !== asset) {
        activoRecibido = txAsset;      // permuta: compraron txAsset vendiendo asset
      } else {
        activoRecibido = costAsset || null;  // SELL: recibieron costAsset
      }

      const contrapartida = getContrapartidaClave(activoRecibido);

      let gastosTransmision = 0;
      if (row.fee_asset && row.fee_amount) {
        try {
          const feePrice = await getHistoricalPriceEur(
            row.fee_asset as string,
            new Date(row.fecha as string)
          );
          gastosTransmision = parseFloat(row.fee_amount as string) * feePrice;
        } catch {
          // precio de fee no disponible — gastos de transmisión = 0
        }
      }

      return {
        fecha:                    new Date(row.fecha as string).toISOString().slice(0, 10),
        tipo:                     opType,
        activoTransmitido:        asset,
        activoRecibido:           activoRecibido,
        cantidadTransmitida:      parseFloat(row.cantidad as string),
        contrapartidaClave:       contrapartida.clave,
        contrapartidaDescripcion: contrapartida.descripcion,
        valorTransmisionEur:      parseFloat(row.valor_transmision as string),
        gastosTransmisionEur:     gastosTransmision,
        valorAdquisicionEur:      parseFloat(row.valor_adquisicion as string),
        gastosAdquisicionEur:     parseFloat(row.gastos_adquisicion as string) || 0,
        gananciaPerdidaEur:       parseFloat(row.gain_loss_eur as string),
        wallet:                   row.wallet as string,
        txId:                     row.tx_id as string,
      };
    })
  );

  const rendRows = await db.query(`
    SELECT
      t.timestamp    AS fecha,
      t.operation_type,
      t.asset        AS activo,
      t.amount_net   AS cantidad,
      t.amount_net * COALESCE(t.price_per_unit, 0) AS valor_eur,
      w.name         AS wallet
    FROM transactions t
    JOIN wallets w ON w.id = t.wallet_id
    WHERE EXTRACT(YEAR FROM t.timestamp) = $1
      AND t.operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
    ORDER BY t.timestamp ASC
  `, [year]);

  const rendimientos = rendRows.rows.map((row: Record<string, unknown>) => ({
    fecha:    new Date(row.fecha as string).toISOString().slice(0, 10),
    tipo:     getTipoRendimiento(row.operation_type as string),
    activo:   row.activo as string,
    cantidad: parseFloat(row.cantidad as string),
    valorEur: parseFloat(row.valor_eur as string),
    wallet:   row.wallet as string,
  }));

  return { fiscalEvents, rendimientos };
}

// ── GET /api/fiscal/years ──────────────────────────────────────────────────
router.get('/years', async (_req: Request, res: Response) => {
  const result = await db.query(`
    SELECT DISTINCT EXTRACT(YEAR FROM consumed_at)::int AS year
    FROM fifo_lot_consumptions
    UNION
    SELECT DISTINCT EXTRACT(YEAR FROM timestamp)::int AS year
    FROM transactions
    WHERE operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
    ORDER BY year DESC
  `);
  res.json(result.rows.map((r: { year: number }) => r.year));
});

// ── GET /api/fiscal/overview ───────────────────────────────────────────────
// Devuelve resumen de todos los años disponibles en una sola llamada.
// Usado para la comparativa interanual y el carryforward de pérdidas.
router.get('/overview', async (_req: Request, res: Response) => {
  const yearsRes = await db.query(`
    SELECT DISTINCT EXTRACT(YEAR FROM consumed_at)::int AS year
    FROM fifo_lot_consumptions
    UNION
    SELECT DISTINCT EXTRACT(YEAR FROM timestamp)::int AS year
    FROM transactions
    WHERE operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
    ORDER BY year ASC
  `);

  const years: number[] = yearsRes.rows.map((r: { year: number }) => r.year);

  const data = await Promise.all(years.map(async (year) => {
    const gpRes = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN flc.gain_loss_eur > 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS total_ganancias,
        COALESCE(SUM(CASE WHEN flc.gain_loss_eur < 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS total_perdidas,
        COALESCE(SUM(flc.gain_loss_eur), 0) AS neto,
        COUNT(*) AS num_operaciones
      FROM fifo_lot_consumptions flc
      WHERE EXTRACT(YEAR FROM flc.consumed_at) = $1
        AND flc.fiscal_event_type != 'NONE'
    `, [year]);

    const rendRes = await db.query(`
      SELECT COALESCE(SUM(t.amount_net * COALESCE(t.price_per_unit, 0)), 0) AS total_rendimientos
      FROM transactions t
      WHERE EXTRACT(YEAR FROM t.timestamp) = $1
        AND t.operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
    `, [year]);

    return {
      year,
      esAnioEnCurso: year === new Date().getFullYear(),
      totalGanancias:  parseFloat(gpRes.rows[0]?.total_ganancias ?? '0'),
      totalPerdidas:   parseFloat(gpRes.rows[0]?.total_perdidas ?? '0'),
      netoPatrimonial: parseFloat(gpRes.rows[0]?.neto ?? '0'),
      numOperaciones:  parseInt(gpRes.rows[0]?.num_operaciones ?? '0'),
      totalRendimientos: parseFloat(rendRes.rows[0]?.total_rendimientos ?? '0'),
    };
  }));

  res.json(data);
});

// ── GET /api/fiscal/carryforward ───────────────────────────────────────────
// Análisis de compensación de pérdidas (últimos 4 años + año actual).
// Normativa española: pérdidas patrimoniales compensan contra ganancias
// patrimoniales sin límite, y contra rendimientos del capital mobiliario
// con límite del 25% de los rendimientos positivos del año.
router.get('/carryforward', async (_req: Request, res: Response) => {
  const currentYear = new Date().getFullYear();

  // Obtenemos neto G/P y rendimientos de los últimos 5 años
  const rows: { year: number; netoGP: number; rendimientos: number }[] = [];
  for (let y = currentYear - 4; y <= currentYear; y++) {
    const gpR = await db.query(`
      SELECT COALESCE(SUM(flc.gain_loss_eur), 0) AS neto
      FROM fifo_lot_consumptions flc
      WHERE EXTRACT(YEAR FROM flc.consumed_at) = $1
        AND flc.fiscal_event_type != 'NONE'
    `, [y]);
    const rendR = await db.query(`
      SELECT COALESCE(SUM(t.amount_net * COALESCE(t.price_per_unit, 0)), 0) AS total
      FROM transactions t
      WHERE EXTRACT(YEAR FROM t.timestamp) = $1
        AND t.operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
    `, [y]);
    rows.push({
      year: y,
      netoGP:        parseFloat(gpR.rows[0]?.neto ?? '0'),
      rendimientos:  parseFloat(rendR.rows[0]?.total ?? '0'),
    });
  }

  // Simulamos la compensación año a año manteniendo un pool de pérdidas pendientes
  // con su año de origen (para respetar el límite de 4 años)
  type PendienteItem = { year: number; importe: number };
  let pendientes: PendienteItem[] = [];

  const resultado = rows.map(({ year, netoGP, rendimientos }) => {
    // Expirar pérdidas de hace más de 4 años
    pendientes = pendientes.filter(p => year - p.year <= 4);

    const perdidaEsteAnio  = netoGP < 0 ? Math.abs(netoGP) : 0;
    const gananciasPatrim  = netoGP > 0 ? netoGP : 0;

    // 1. Compensar pérdidas pendientes contra ganancias patrimoniales del año
    const pendienteTotalPatrim = pendientes.reduce((s, p) => s + p.importe, 0);
    const compensadoPatrim = Math.min(pendienteTotalPatrim, gananciasPatrim);
    const restanteGanancias = gananciasPatrim - compensadoPatrim;

    // Aplicar consumo proporcional FIFO sobre los pendientes
    let aConsumir = compensadoPatrim;
    for (const p of pendientes) {
      const consumido = Math.min(p.importe, aConsumir);
      p.importe -= consumido;
      aConsumir -= consumido;
      if (aConsumir <= 0) break;
    }
    pendientes = pendientes.filter(p => p.importe > 0.01);

    // 2. Compensar pérdidas pendientes restantes contra rendimientos (límite 25%)
    const limiteRendimientos = rendimientos > 0 ? rendimientos * 0.25 : 0;
    const pendienteTotalRend = pendientes.reduce((s, p) => s + p.importe, 0);
    const compensadoRend = Math.min(pendienteTotalRend, limiteRendimientos);

    aConsumir = compensadoRend;
    for (const p of pendientes) {
      const consumido = Math.min(p.importe, aConsumir);
      p.importe -= consumido;
      aConsumir -= consumido;
      if (aConsumir <= 0) break;
    }
    pendientes = pendientes.filter(p => p.importe > 0.01);

    // Acumular pérdida de este año
    if (perdidaEsteAnio > 0.01) {
      pendientes.push({ year, importe: perdidaEsteAnio });
    }

    return {
      year,
      netoAntes:          netoGP,
      rendimientos,
      perdida:            perdidaEsteAnio,
      compensadoPatrim,
      compensadoRend,
      compensado:         compensadoPatrim + compensadoRend,
      limiteRend25:       limiteRendimientos,
      netoDespues:        restanteGanancias,
    };
  });

  res.json({
    pendienteTotal: pendientes.reduce((s, p) => s + p.importe, 0),
    detalle: resultado,
  });
});

// ── GET /api/fiscal/:year/breakdown ───────────────────────────────────────
// G/P neto agrupado por activo transmitido para el año dado.
router.get('/:year/breakdown', async (req: Request, res: Response) => {
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
    WHERE EXTRACT(YEAR FROM flc.consumed_at) = $1
      AND flc.fiscal_event_type != 'NONE'
    GROUP BY fl.asset
    ORDER BY ABS(SUM(flc.gain_loss_eur)) DESC
  `, [year]);

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
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });

  const result = await db.query(`
    SELECT
      EXTRACT(MONTH FROM flc.consumed_at)::int AS mes,
      COALESCE(SUM(flc.gain_loss_eur), 0)      AS neto_mes
    FROM fifo_lot_consumptions flc
    WHERE EXTRACT(YEAR FROM flc.consumed_at) = $1
      AND flc.fiscal_event_type != 'NONE'
    GROUP BY mes
    ORDER BY mes
  `, [year]);

  const byMonth = new Map(result.rows.map((r: Record<string, unknown>) => [
    parseInt(r.mes as string),
    parseFloat(r.neto_mes as string),
  ]));

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
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

  // Proyección lineal para año en curso
  let proyeccionFinAnio: number | null = null;
  if (year === currentYear && currentMonth > 0 && acumulado !== 0) {
    proyeccionFinAnio = acumulado * (12 / currentMonth);
  }

  res.json({ meses, proyeccionFinAnio });
});

// ── GET /api/fiscal/:year/summary ──────────────────────────────────────────
router.get('/:year/summary', async (req: Request, res: Response) => {
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });

  const currentYear = new Date().getFullYear();
  const esAnioEnCurso = year === currentYear;

  const gpRes = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN flc.gain_loss_eur > 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS total_ganancias,
      COALESCE(SUM(CASE WHEN flc.gain_loss_eur < 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS total_perdidas,
      COALESCE(SUM(flc.gain_loss_eur), 0) AS neto,
      COUNT(*) AS num_operaciones
    FROM fifo_lot_consumptions flc
    WHERE EXTRACT(YEAR FROM flc.consumed_at) = $1
      AND flc.fiscal_event_type != 'NONE'
  `, [year]);

  const rendRes = await db.query(`
    SELECT
      COALESCE(SUM(t.amount_net * COALESCE(t.price_per_unit, 0)), 0) AS total_rendimientos,
      COUNT(*) AS num_rendimientos
    FROM transactions t
    WHERE EXTRACT(YEAR FROM t.timestamp) = $1
      AND t.operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
  `, [year]);

  const dec31 = esAnioEnCurso ? new Date() : new Date(`${year}-12-31T23:59:59Z`);
  const lotes = await getLotesAFecha(dec31);

  let valorTotal721 = 0;
  for (const lot of lotes) {
    try {
      const price = await getHistoricalPriceEur(lot.asset, dec31);
      valorTotal721 += parseFloat(lot.quantity) * price;
    } catch {
      // precio no disponible — lote excluido del cálculo
    }
  }

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
    valorTotal31Dic:             valorTotal721,
    superaUmbral721:             valorTotal721 > umbral,
    umbral721:                   umbral,
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
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });

  const currentYear = new Date().getFullYear();
  const esAnioEnCurso = year === currentYear;
  const dec31 = esAnioEnCurso ? new Date() : new Date(`${year}-12-31T23:59:59Z`);

  const lotes = await getLotesAFecha(dec31);
  const umbral = await getUmbral721();

  const activos = await Promise.all(
    lotes.map(async (row: Record<string, unknown>) => {
      const quantity = parseFloat(row.quantity as string);
      let precio = 0;
      let valorEur = 0;
      try {
        precio = await getHistoricalPriceEur(row.asset as string, dec31);
        valorEur = quantity * precio;
      } catch {
        // precio no disponible — activo con valorEur = 0
      }

      return {
        asset:        row.asset as string,
        wallet_id:    row.wallet_id as string,
        wallet_name:  row.wallet_name as string,
        wallet_kind:  row.wallet_kind as string,
        wallet_color: row.wallet_color as string,
        quantity,
        costBasisEur: parseFloat(row.cost_basis as string),
        precioEur:    precio,
        valorEur,
      };
    })
  );

  const totalValor = activos.reduce((sum, a) => sum + a.valorEur, 0);

  res.json({
    year,
    esAnioEnCurso,
    fecha:        dec31.toISOString().slice(0, 10),
    activos,
    totalValor,
    superaUmbral: totalValor > umbral,
    umbral,
    aviso: 'El Modelo 721 aplica a criptoactivos custodiados en exchanges extranjeros. Consulta con tu asesor fiscal sobre la aplicabilidad a wallets de autocustodia.',
  });
});

// ── GET /api/fiscal/:year/export ───────────────────────────────────────────
router.get('/:year/export', async (req: Request, res: Response) => {
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });

  const format = (req.query.format as string) ?? 'csv';
  const { fiscalEvents, rendimientos } = await getEventosAnio(year);

  // ── CSV ───────────────────────────────────────────────────────────────────
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fiscal_${year}_modelo100.csv"`);

    const lines: string[] = [];
    lines.push('GANANCIAS Y PERDIDAS PATRIMONIALES - MODELO 100');
    lines.push('Fecha;Denominacion activo transmitido;Clave contrapartida;Descripcion contrapartida;Valor transmision EUR;Gastos transmision EUR;Valor adquisicion EUR;Gastos adquisicion EUR;Ganancia/Perdida EUR');

    for (const e of fiscalEvents) {
      lines.push([
        e.fecha,
        e.activoTransmitido,
        e.contrapartidaClave,
        e.contrapartidaDescripcion,
        e.valorTransmisionEur.toFixed(2),
        e.gastosTransmisionEur.toFixed(2),
        e.valorAdquisicionEur.toFixed(2),
        e.gastosAdquisicionEur.toFixed(2),
        e.gananciaPerdidaEur.toFixed(2),
      ].join(';'));
    }

    lines.push('');
    lines.push('RENDIMIENTOS DEL CAPITAL MOBILIARIO');
    lines.push('Fecha;Tipo;Activo;Cantidad;Valor EUR');
    for (const r of rendimientos) {
      lines.push([r.fecha, r.tipo, r.activo, r.cantidad.toFixed(8), r.valorEur.toFixed(2)].join(';'));
    }

    res.send('﻿' + lines.join('\n'));

  // ── RENTA WEB ─────────────────────────────────────────────────────────────
  // Formato compatible con la importación de la herramienta Renta Web (AEAT).
  // Claves AEAT: D=Dinero, V=Valores/cripto, O=Otros/sin contrapartida.
  // - valorTransmision = BRUTO (proceeds_neto + gastosTx) para que AEAT reste gastosTx correctamente.
  // - gastosAdquisicion = 0 porque el cost_basis ya incluye las comisiones de compra.
  // - Decimal: coma (,). Fecha: DD/MM/YYYY.
  } else if (format === 'rentaweb') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fiscal_${year}_rentaweb.csv"`);

    const eur = (n: number) => n.toFixed(2).replace('.', ',');
    const fmtDate = (iso: string) => {
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    };

    const lines: string[] = [];
    lines.push('Fecha;Denominacion moneda virtual transmitida;Clave contraprestacion;Descripcion contraprestacion;Valor transmision EUR;Gastos transmision EUR;Valor adquisicion EUR;Gastos adquisicion EUR;Ganancia/Perdida EUR');

    for (const e of fiscalEvents) {
      // Valor transmisión bruto = neto + gastos tx (para que AEAT reste gastosTx sin doble conteo)
      const valorTxBruto = e.valorTransmisionEur + e.gastosTransmisionEur;
      // Gastos adquisición = 0 porque cost_basis ya incluye las comisiones de compra
      lines.push([
        fmtDate(e.fecha),
        e.activoTransmitido,
        e.contrapartidaClave,
        e.contrapartidaDescripcion,
        eur(valorTxBruto),
        eur(e.gastosTransmisionEur),
        eur(e.valorAdquisicionEur),
        '0,00',
        eur(e.gananciaPerdidaEur),
      ].join(';'));
    }

    res.send('﻿' + lines.join('\r\n'));

  // ── EXCEL ─────────────────────────────────────────────────────────────────
  } else if (format === 'excel') {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CryptoFolio';
    workbook.created = new Date();

    const sheet1 = workbook.addWorksheet('Ganancias Patrimoniales');
    sheet1.columns = [
      { header: 'Fecha',                    key: 'fecha',     width: 12 },
      { header: 'Activo transmitido',        key: 'activo',    width: 15 },
      { header: 'Cantidad',                  key: 'cantidad',  width: 15 },
      { header: 'Clave contrapartida',       key: 'clave',     width: 10 },
      { header: 'Descripcion contrapartida', key: 'desc',      width: 30 },
      { header: 'Valor transmision EUR',     key: 'valorTx',   width: 20 },
      { header: 'Gastos transmision EUR',    key: 'gastosTx',  width: 20 },
      { header: 'Valor adquisicion EUR',     key: 'valorAdq',  width: 20 },
      { header: 'Gastos adquisicion EUR',    key: 'gastosAdq', width: 20 },
      { header: 'Ganancia/Perdida EUR',      key: 'gp',        width: 20 },
    ];
    sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a2e' } };

    const EUR_FMT = '#,##0.00 €';
    const EUR_COLS_1 = ['valorTx', 'gastosTx', 'valorAdq', 'gastosAdq', 'gp'];

    for (const e of fiscalEvents) {
      const row = sheet1.addRow({
        fecha:     e.fecha,
        activo:    e.activoTransmitido,
        cantidad:  e.cantidadTransmitida,
        clave:     e.contrapartidaClave,
        desc:      e.contrapartidaDescripcion,
        valorTx:   e.valorTransmisionEur,
        gastosTx:  e.gastosTransmisionEur,
        valorAdq:  e.valorAdquisicionEur,
        gastosAdq: e.gastosAdquisicionEur,
        gp:        e.gananciaPerdidaEur,
      });
      EUR_COLS_1.forEach(col => { row.getCell(col).numFmt = EUR_FMT; });
      row.getCell('gp').font = {
        color: { argb: e.gananciaPerdidaEur >= 0 ? 'FF00c896' : 'FFe74c3c' },
        bold: true,
      };
    }

    const t1 = sheet1.addRow({
      fecha:     'TOTAL',
      valorTx:   fiscalEvents.reduce((s, e) => s + e.valorTransmisionEur, 0),
      gastosTx:  fiscalEvents.reduce((s, e) => s + e.gastosTransmisionEur, 0),
      valorAdq:  fiscalEvents.reduce((s, e) => s + e.valorAdquisicionEur, 0),
      gastosAdq: fiscalEvents.reduce((s, e) => s + e.gastosAdquisicionEur, 0),
      gp:        fiscalEvents.reduce((s, e) => s + e.gananciaPerdidaEur, 0),
    });
    EUR_COLS_1.forEach(col => { t1.getCell(col).numFmt = EUR_FMT; });
    t1.font = { bold: true };

    const sheet2 = workbook.addWorksheet('Rendimientos Capital Mob.');
    sheet2.columns = [
      { header: 'Fecha',     key: 'fecha',    width: 12 },
      { header: 'Tipo',      key: 'tipo',     width: 20 },
      { header: 'Activo',    key: 'activo',   width: 10 },
      { header: 'Cantidad',  key: 'cantidad', width: 15 },
      { header: 'Valor EUR', key: 'valor',    width: 15 },
    ];
    sheet2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a2e' } };

    for (const r of rendimientos) {
      const row2 = sheet2.addRow({ fecha: r.fecha, tipo: r.tipo, activo: r.activo, cantidad: r.cantidad, valor: r.valorEur });
      row2.getCell('valor').numFmt = EUR_FMT;
    }

    const t2 = sheet2.addRow({
      fecha: 'TOTAL',
      valor: rendimientos.reduce((s, r) => s + r.valorEur, 0),
    });
    t2.getCell('valor').numFmt = EUR_FMT;
    t2.font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="fiscal_${year}.xlsx"`);
    await workbook.xlsx.write(res);

  // ── PDF ───────────────────────────────────────────────────────────────────
  } else if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fiscal_${year}.pdf"`);

    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
    doc.pipe(res);

    const PW = 595.28, PH = 841.89, ML = 40, MR = 40;
    const W = PW - ML - MR;

    // Palette
    const C_DARK = '#0d1117', C_NAVY = '#1e293b', C_BLUE = '#3b82f6';
    const C_GREEN = '#10b981', C_RED = '#ef4444', C_VIOLET = '#a78bfa';
    const C_GRAY5 = '#64748b', C_GRAY3 = '#94a3b8', C_GRAY1 = '#e2e8f0';
    const C_ROW_ALT = '#f8fafc', C_TEXT = '#0f172a';

    // Computed totals
    const totalGP        = fiscalEvents.reduce((s, e) => s + e.gananciaPerdidaEur, 0);
    const totalGanancias = fiscalEvents.filter(e => e.gananciaPerdidaEur > 0).reduce((s, e) => s + e.gananciaPerdidaEur, 0);
    const totalPerdidas  = fiscalEvents.filter(e => e.gananciaPerdidaEur < 0).reduce((s, e) => s + e.gananciaPerdidaEur, 0);
    const totalRend      = rendimientos.reduce((s, r) => s + r.valorEur, 0);

    // Per-asset breakdown
    const byAsset = new Map<string, { ops: number; ganancias: number; perdidas: number; neto: number }>();
    for (const e of fiscalEvents) {
      const p = byAsset.get(e.activoTransmitido) ?? { ops: 0, ganancias: 0, perdidas: 0, neto: 0 };
      byAsset.set(e.activoTransmitido, {
        ops: p.ops + 1,
        ganancias: p.ganancias + Math.max(0, e.gananciaPerdidaEur),
        perdidas:  p.perdidas  + Math.min(0, e.gananciaPerdidaEur),
        neto:      p.neto      + e.gananciaPerdidaEur,
      });
    }
    const assetBreakdown = [...byAsset.entries()].sort((a, b) => Math.abs(b[1].neto) - Math.abs(a[1].neto));

    const fmtEurPdf = (n: number, sign = false) => {
      const abs = Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (sign) return (n >= 0 ? '+' : '-') + ' ' + abs + ' €';
      return (n < 0 ? '-' : '') + abs + ' €';
    };

    // ── Layout helpers ────────────────────────────────────────────────────
    let pageNum = 0;

    const addPage = () => {
      if (pageNum > 0) doc.addPage({ margin: 0, size: 'A4' });
      pageNum++;
      // Footer
      const fy = PH - 26;
      doc.rect(ML, fy - 4, W, 0.4).fill(C_GRAY1);
      doc.fontSize(7).font('Helvetica').fillColor(C_GRAY3)
        .text(
          `CryptoFolio · Informe Fiscal ${year} · ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}`,
          ML, fy, { width: W - 50, lineBreak: false }
        )
        .text(`${pageNum}`, ML, fy, { width: W, align: 'right', lineBreak: false });
      doc.y = pageNum === 1 ? 100 : 36;
    };

    const needsPage = (h: number) => { if (doc.y + h > PH - 42) addPage(); };

    const sectionHeader = (title: string) => {
      needsPage(28);
      const y = doc.y;
      doc.rect(ML, y, W, 21).fill(C_NAVY);
      doc.rect(ML, y, 3, 21).fill(C_BLUE);
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(C_BLUE)
        .text(title, ML + 12, y + 6, { width: W - 20, lineBreak: false });
      doc.y = y + 25;
    };

    type ColDef = { text: string; w: number; align?: 'left' | 'right' | 'center'; color?: string; bold?: boolean };

    const tHead = (cols: ColDef[]) => {
      const y = doc.y;
      const tw = cols.reduce((s, c) => s + c.w, 0);
      doc.rect(ML, y, tw, 17).fill(C_NAVY);
      let cx = ML;
      cols.forEach(col => {
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor(C_GRAY3)
          .text(col.text.toUpperCase(), cx + 4, y + 5, { width: col.w - 8, align: col.align ?? 'left', lineBreak: false });
        cx += col.w;
      });
      doc.y = y + 17;
    };

    const tRow = (cols: ColDef[], idx: number) => {
      const ROW_H = 15;
      needsPage(ROW_H + 2);
      const y = doc.y;
      const tw = cols.reduce((s, c) => s + c.w, 0);
      doc.rect(ML, y, tw, ROW_H).fill(idx % 2 === 0 ? '#ffffff' : C_ROW_ALT);
      let cx = ML;
      cols.forEach(col => {
        doc.fontSize(7.5)
          .font(col.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(col.color ?? C_TEXT)
          .text(col.text, cx + 4, y + 4, { width: col.w - 8, align: col.align ?? 'left', lineBreak: false });
        cx += col.w;
      });
      doc.rect(ML, y + ROW_H, tw, 0.3).fill(C_GRAY1);
      doc.y = y + ROW_H;
    };

    const totalRow = (label: string, value: string, color: string, totalW: number) => {
      const y = doc.y;
      doc.rect(ML, y, totalW, 17).fill(C_NAVY);
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(C_GRAY3)
        .text(label, ML + 8, y + 5, { width: totalW / 2, lineBreak: false });
      doc.fontSize(8).font('Helvetica-Bold').fillColor(color)
        .text(value, ML + 8, y + 5, { width: totalW - 16, align: 'right', lineBreak: false });
      doc.y = y + 19;
    };

    // ── PAGE 1: HEADER ────────────────────────────────────────────────────
    addPage();

    // Dark header band
    doc.rect(0, 0, PW, 88).fill(C_DARK);
    doc.rect(0, 85, PW, 3).fill(C_BLUE);

    // Logo + title
    doc.fontSize(8).font('Helvetica-Bold').fillColor(C_BLUE)
      .text('CRYPTOFOLIO', ML, 16, { lineBreak: false });
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#ffffff')
      .text(`Informe Fiscal ${year}`, ML, 30, { lineBreak: false });
    doc.fontSize(8.5).font('Helvetica').fillColor(C_GRAY3)
      .text(
        `España · IRPF · Método FIFO · Generado el ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}`,
        ML, 60, { lineBreak: false }
      );

    doc.y = 100;

    // Summary boxes
    const summaryItems = [
      { label: 'RESULTADO NETO',  value: fmtEurPdf(totalGP, true), color: totalGP >= 0 ? C_GREEN : C_RED },
      { label: 'GANANCIAS',       value: '+' + fmtEurPdf(totalGanancias), color: C_GREEN },
      { label: 'PÉRDIDAS',        value: fmtEurPdf(totalPerdidas),         color: C_RED   },
      { label: 'OPERACIONES',     value: String(fiscalEvents.length),       color: C_BLUE  },
      ...(totalRend > 0 ? [{ label: 'RENDIMIENTOS', value: fmtEurPdf(totalRend), color: C_VIOLET }] : []),
    ];
    const nbx = summaryItems.length;
    const bw  = W / nbx;
    const bStartY = doc.y;

    summaryItems.forEach((item, i) => {
      const bx = ML + i * bw;
      doc.rect(bx + 1, bStartY, bw - 2, 58).fill(C_NAVY);
      doc.rect(bx + 1, bStartY, bw - 2, 3).fill(item.color);
      doc.fontSize(6.5).font('Helvetica-Bold').fillColor(C_GRAY5)
        .text(item.label, bx + 10, bStartY + 12, { width: bw - 20, lineBreak: false });
      doc.fontSize(11).font('Helvetica-Bold').fillColor(item.color)
        .text(item.value, bx + 10, bStartY + 28, { width: bw - 20, lineBreak: false });
    });
    doc.y = bStartY + 66;

    // ── ASSET BREAKDOWN ───────────────────────────────────────────────────
    sectionHeader(`Desglose por activo — ${assetBreakdown.length} activos`);

    const ac = [
      { text: 'Activo',      w: 70                                         },
      { text: 'Operaciones', w: 65,  align: 'right' as const               },
      { text: 'Ganancias',   w: 105, align: 'right' as const               },
      { text: 'Pérdidas',    w: 105, align: 'right' as const               },
      { text: 'Neto',        w: W - 345, align: 'right' as const           },
    ];
    ac[4].w = W - ac.slice(0, 4).reduce((s, c) => s + c.w, 0);
    tHead(ac);

    assetBreakdown.forEach(([asset, d], i) => {
      tRow([
        { text: asset,                                            w: ac[0].w, bold: true },
        { text: String(d.ops),                                   w: ac[1].w, align: 'right', color: C_GRAY5 },
        { text: d.ganancias > 0 ? '+' + fmtEurPdf(d.ganancias) : '—', w: ac[2].w, align: 'right', color: d.ganancias > 0 ? C_GREEN : C_GRAY5 },
        { text: d.perdidas < 0 ? fmtEurPdf(d.perdidas) : '—',   w: ac[3].w, align: 'right', color: d.perdidas < 0 ? C_RED : C_GRAY5 },
        { text: fmtEurPdf(d.neto, true),                         w: ac[4].w, align: 'right', bold: true, color: d.neto >= 0 ? C_GREEN : C_RED },
      ], i);
    });
    totalRow('TOTAL', fmtEurPdf(totalGP, true), totalGP >= 0 ? C_GREEN : C_RED, W);

    // ── TRANSACTIONS DETAIL ───────────────────────────────────────────────
    addPage();
    sectionHeader(`Detalle de operaciones — ${fiscalEvents.length} transmisiones`);

    const tc = [
      { text: 'Fecha',    w: 55 },
      { text: 'Activo',   w: 42 },
      { text: 'Cantidad', w: 62, align: 'right' as const },
      { text: 'Clave',    w: 28, align: 'center' as const },
      { text: 'V. Transmisión', w: 87, align: 'right' as const },
      { text: 'V. Adquisición', w: 87, align: 'right' as const },
      { text: 'G/P EUR',  w: W - 361, align: 'right' as const },
    ];
    tc[6].w = W - tc.slice(0, 6).reduce((s, c) => s + c.w, 0);
    tHead(tc);

    fiscalEvents.forEach((e, i) => {
      tRow([
        { text: e.fecha,                                      w: tc[0].w, color: C_GRAY5 },
        { text: e.activoTransmitido,                         w: tc[1].w, bold: true },
        { text: (e.cantidadTransmitida ?? 0).toFixed(4),     w: tc[2].w, align: 'right', color: C_GRAY5 },
        { text: e.contrapartidaClave,                        w: tc[3].w, align: 'center', color: C_GRAY5 },
        { text: fmtEurPdf(e.valorTransmisionEur),            w: tc[4].w, align: 'right' },
        { text: fmtEurPdf(e.valorAdquisicionEur),            w: tc[5].w, align: 'right', color: C_GRAY5 },
        { text: fmtEurPdf(e.gananciaPerdidaEur, true),       w: tc[6].w, align: 'right', bold: true, color: e.gananciaPerdidaEur >= 0 ? C_GREEN : C_RED },
      ], i);
    });
    totalRow(
      `Total ${fiscalEvents.length} operaciones`,
      `Ganancias ${fmtEurPdf(totalGanancias)}   Pérdidas ${fmtEurPdf(totalPerdidas)}   Neto ${fmtEurPdf(totalGP, true)}`,
      totalGP >= 0 ? C_GREEN : C_RED,
      W
    );

    // ── RENDIMIENTOS ──────────────────────────────────────────────────────
    if (rendimientos.length > 0) {
      needsPage(60);
      doc.y += 10;
      sectionHeader(`Rendimientos del Capital Mobiliario — ${rendimientos.length} operaciones`);

      const rc = [
        { text: 'Fecha',    w: 60 },
        { text: 'Tipo',     w: 130 },
        { text: 'Activo',   w: 55 },
        { text: 'Cantidad', w: 80, align: 'right' as const },
        { text: 'Valor EUR', w: W - 325, align: 'right' as const },
      ];
      rc[4].w = W - rc.slice(0, 4).reduce((s, c) => s + c.w, 0);
      tHead(rc);

      rendimientos.forEach((r, i) => {
        tRow([
          { text: r.fecha,              w: rc[0].w, color: C_GRAY5 },
          { text: r.tipo,               w: rc[1].w },
          { text: r.activo,             w: rc[2].w, bold: true },
          { text: r.cantidad.toFixed(6), w: rc[3].w, align: 'right', color: C_GRAY5 },
          { text: fmtEurPdf(r.valorEur), w: rc[4].w, align: 'right', bold: true, color: C_VIOLET },
        ], i);
      });
      totalRow('Total rendimientos', fmtEurPdf(totalRend), C_VIOLET, W);
    }

    // ── AVISO LEGAL ───────────────────────────────────────────────────────
    needsPage(50);
    doc.y += 14;
    doc.rect(ML, doc.y, W, 0.4).fill(C_GRAY1);
    doc.y += 8;
    doc.fontSize(7).font('Helvetica').fillColor(C_GRAY3)
      .text(
        'AVISO LEGAL: Este informe es orientativo y no constituye asesoramiento fiscal. Los cálculos se basan en el método FIFO según la normativa española vigente (LIRPF). Los importes en EUR se obtienen aplicando el tipo de cambio en la fecha de cada operación. Consulta con un asesor fiscal antes de presentar tu declaración de la renta.',
        ML, doc.y, { width: W, align: 'justify' }
      );

    doc.end();

  } else {
    res.status(400).json({ error: 'Formato no soportado. Usa: csv, excel, pdf, rentaweb' });
  }
});

// ── POST /api/fiscal/simulate-sale ────────────────────────────────────────
// Simulación pura FIFO: no escribe nada en DB. Devuelve impacto fiscal de una
// venta hipotética. Usa los lotes abiertos ordenados FIFO (oldest first).
router.post('/simulate-sale', async (req: Request, res: Response) => {
  const { asset, quantity, priceEur } = req.body as {
    asset?: string;
    quantity?: number;
    priceEur?: number;
  };

  if (!asset || typeof quantity !== 'number' || quantity <= 0 || typeof priceEur !== 'number' || priceEur < 0) {
    res.status(400).json({ error: 'Se requieren: asset (string), quantity (number > 0), priceEur (number >= 0)' });
    return;
  }

  const lotsRes = await db.query(
    `SELECT
       fl.id,
       fl.asset,
       fl.quantity_remaining::float AS quantity_remaining,
       fl.cost_basis_eur::float     AS cost_basis_eur,
       fl.price_per_unit_eur::float AS price_per_unit_eur,
       fl.opened_at,
       w.name AS wallet_name
     FROM fifo_lots fl
     JOIN wallets w ON w.id = fl.wallet_id
     WHERE fl.asset = $1
       AND fl.is_closed = FALSE
       AND fl.quantity_remaining > 0.0000001
     ORDER BY fl.opened_at ASC, fl.id ASC`,
    [asset.toUpperCase()]
  );

  if (lotsRes.rows.length === 0) {
    res.status(404).json({ error: `No hay lotes abiertos para ${asset}` });
    return;
  }

  const totalAvailable = lotsRes.rows.reduce((s: number, r: Record<string, number>) => s + r.quantity_remaining, 0);
  if (quantity > totalAvailable + 0.0001) {
    res.status(400).json({ error: `Solo hay ${totalAvailable.toFixed(6)} ${asset} disponibles` });
    return;
  }

  // Simular consumo FIFO
  let remaining = quantity;
  let totalProceeds  = 0;
  let totalCostBasis = 0;
  let totalGain = 0;
  let totalLoss = 0;

  const lotsConsumed: {
    lotId:        string;
    walletName:   string;
    openedAt:     string;
    qtyAvailable: number;
    qtyConsumed:  number;
    costBasisConsumed: number;
    pricePerUnit: number;
    proceedsEur:  number;
    gainLossEur:  number;
  }[] = [];

  for (const row of lotsRes.rows as Record<string, unknown>[]) {
    if (remaining <= 0.0000001) break;

    const lotQty   = row.quantity_remaining as number;
    const costBasis = row.cost_basis_eur as number;
    const consumed  = Math.min(lotQty, remaining);
    const proportion = consumed / lotQty;
    const costConsumed = costBasis * proportion;
    const proceeds    = consumed * priceEur;
    const gainLoss    = proceeds - costConsumed;

    totalProceeds  += proceeds;
    totalCostBasis += costConsumed;
    if (gainLoss >= 0) totalGain += gainLoss;
    else               totalLoss += gainLoss;

    lotsConsumed.push({
      lotId:             row.id as string,
      walletName:        row.wallet_name as string,
      openedAt:          new Date(row.opened_at as string).toISOString().slice(0, 10),
      qtyAvailable:      lotQty,
      qtyConsumed:       consumed,
      costBasisConsumed: costConsumed,
      pricePerUnit:      row.price_per_unit_eur as number,
      proceedsEur:       proceeds,
      gainLossEur:       gainLoss,
    });

    remaining -= consumed;
  }

  const netGainLoss = totalGain + totalLoss;

  // Estimación IRPF (solo sobre ganancias netas; no considera otras rentas del año)
  const TRAMOS = [
    { hasta: 6_000,    tipo: 0.19 },
    { hasta: 50_000,   tipo: 0.21 },
    { hasta: 200_000,  tipo: 0.23 },
    { hasta: 300_000,  tipo: 0.27 },
    { hasta: Infinity, tipo: 0.28 },
  ];

  let irpfEstimate = 0;
  if (netGainLoss > 0) {
    let base = netGainLoss;
    let anterior = 0;
    for (const t of TRAMOS) {
      if (base <= 0) break;
      const tramo = Math.min(base, t.hasta - anterior);
      irpfEstimate += tramo * t.tipo;
      base    -= tramo;
      anterior = t.hasta;
    }
  }

  res.json({
    asset:         asset.toUpperCase(),
    quantity,
    priceEur,
    totalProceeds,
    totalCostBasis,
    totalGain,
    totalLoss,
    netGainLoss,
    irpfEstimate,
    lotsConsumed,
  });
});

export default router;
