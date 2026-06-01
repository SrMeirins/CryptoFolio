import { Router, Request, Response } from 'express';
import { db } from '../db/client';
import { getHistoricalPriceEur } from '../modules/prices/binance';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

const router = Router();

// Umbral Modelo 721 configurable desde app_config
async function getUmbral721(): Promise<number> {
  const res = await db.query("SELECT value FROM app_config WHERE key = 'modelo721_threshold'");
  return res.rows.length > 0 ? (parseInt(res.rows[0].value) || 50000) : 50000;
}

// ── Tipos ──────────────────────────────────────────────────────────────────
interface FiscalEvent {
  fecha: string;
  tipo: string;
  activoTransmitido: string;
  cantidadTransmitida: number;
  contrapartidaClave: string;
  contrapartidaDescripcion: string;
  valorTransmisionEur: number;
  gastosTransmisionEur: number;
  valorAdquisicionEur: number;
  gastosAdquisicionEur: number;
  gananciaPeridaEur: number;
  wallet: string;
  txId: string;
}

interface RendimientoEvent {
  fecha: string;
  tipo: string;
  activo: string;
  cantidad: number;
  valorEur: number;
  wallet: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getContrapartidaClave(costAsset: string | null): { clave: string; descripcion: string } {
  if (!costAsset || costAsset === 'EUR') {
    return { clave: 'F', descripcion: 'Moneda de curso legal (EUR)' };
  }
  return { clave: 'N', descripcion: `Otra moneda virtual (${costAsset})` };
}

function getTipoRendimiento(operationType: string): string {
  const map: Record<string, string> = {
    'STAKING_REWARD':   'Staking',
    'MINING_REWARD':    'Mineria',
    'LENDING_INTEREST': 'Lending / Interes',
    'CASHBACK':         'Cashback / Bonus',
    'AIRDROP':          'Airdrop',
  };
  return map[operationType] ?? operationType;
}

// Calcula lotes abiertos a una fecha dada reconstruyendo el estado historico.
// Los lotes destino de transferencias se excluyen si la transferencia ocurrió
// después de la fecha consultada (condición sobre t_open.timestamp).
// Los consumos de tipo NONE (transferencias internas) restan correctamente
// del lote origen sin aparecer como eventos fiscales.
// Reconstruye el estado histórico de lotes a una fecha dada.
// soloExchange=true filtra por wallets de tipo 'exchange' (Modelo 721).
// Los lotes destino de transferencias solo aparecen si la transferencia
// ocurrió antes de la fecha consultada (JOIN con t_open.timestamp).
// Los consumos NONE (transferencias internas) restan correctamente del lote origen.
async function getLotesAFecha(fecha: Date, soloExchange = false) {
  const walletFilter = soloExchange ? `AND w.type = 'exchange'` : '';
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
      ${walletFilter}
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

// ── GET /api/fiscal/years ──────────────────────────────────────────────────
router.get('/years', async (_req: Request, res: Response) => {
  const result = await db.query(`
    SELECT DISTINCT EXTRACT(YEAR FROM consumed_at)::int AS year
    FROM fifo_lot_consumptions
    UNION
    SELECT DISTINCT EXTRACT(YEAR FROM timestamp)::int AS year
    FROM transactions
    WHERE operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','CASHBACK','AIRDROP')
    ORDER BY year DESC
  `);
  res.json(result.rows.map((r: { year: number }) => r.year));
});

// ── GET /api/fiscal/:year/summary ──────────────────────────────────────────
router.get('/:year/summary', async (req: Request, res: Response) => {
  const year = parseInt(req.params.year);
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
      AND t.operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','CASHBACK','AIRDROP')
  `, [year]);

  const dec31 = esAnioEnCurso ? new Date() : new Date(`${year}-12-31T23:59:59Z`);
  const lotes = await getLotesAFecha(dec31, false);

  let valorTotal721 = 0;
  for (const lot of lotes) {
    try {
      const price = await getHistoricalPriceEur(lot.asset, dec31);
      valorTotal721 += parseFloat(lot.quantity) * price;
    } catch { /* ignorar */ }
  }

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
    superaUmbral721:             valorTotal721 > await getUmbral721(),
    umbral721:                   await getUmbral721(),
  });
});

// ── GET /api/fiscal/:year/events ───────────────────────────────────────────
router.get('/:year/events', async (req: Request, res: Response) => {
  const year = parseInt(req.params.year);

  const gpRows = await db.query(`
    SELECT
      flc.consumed_at             AS fecha,
      t.operation_type,
      fl.asset                    AS activo_transmitido,
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

  const fiscalEvents: FiscalEvent[] = await Promise.all(
    gpRows.rows.map(async (row: Record<string, unknown>) => {
      const contrapartida = getContrapartidaClave(row.cost_asset as string | null);

      let gastosTransmision = 0;
      if (row.fee_asset && row.fee_amount) {
        try {
          const feePrice = await getHistoricalPriceEur(
            row.fee_asset as string,
            new Date(row.fecha as string)
          );
          gastosTransmision = parseFloat(row.fee_amount as string) * feePrice;
        } catch { /* ignorar */ }
      }

      return {
        fecha:                    new Date(row.fecha as string).toISOString().slice(0, 10),
        tipo:                     row.operation_type as string,
        activoTransmitido:        row.activo_transmitido as string,
        cantidadTransmitida:      parseFloat(row.cantidad as string),
        contrapartidaClave:       contrapartida.clave,
        contrapartidaDescripcion: contrapartida.descripcion,
        valorTransmisionEur:      parseFloat(row.valor_transmision as string),
        gastosTransmisionEur:     gastosTransmision,
        valorAdquisicionEur:      parseFloat(row.valor_adquisicion as string),
        gastosAdquisicionEur:     parseFloat(row.gastos_adquisicion as string) || 0,
        gananciaPeridaEur:        parseFloat(row.gain_loss_eur as string),
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
      AND t.operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','CASHBACK','AIRDROP')
    ORDER BY t.timestamp ASC
  `, [year]);

  const rendimientos: RendimientoEvent[] = rendRows.rows.map((row: Record<string, unknown>) => ({
    fecha:    new Date(row.fecha as string).toISOString().slice(0, 10),
    tipo:     getTipoRendimiento(row.operation_type as string),
    activo:   row.activo as string,
    cantidad: parseFloat(row.cantidad as string),
    valorEur: parseFloat(row.valor_eur as string),
    wallet:   row.wallet as string,
  }));

  res.json({ fiscalEvents, rendimientos });
});

// ── GET /api/fiscal/:year/modelo721 ───────────────────────────────────────
router.get('/:year/modelo721', async (req: Request, res: Response) => {
  const year = parseInt(req.params.year);
  const currentYear = new Date().getFullYear();
  const esAnioEnCurso = year === currentYear;
  const dec31 = esAnioEnCurso ? new Date() : new Date(`${year}-12-31T23:59:59Z`);

  const lotes = await getLotesAFecha(dec31, false);

  const activos = await Promise.all(
    lotes.map(async (row: Record<string, unknown>) => {
      const quantity = parseFloat(row.quantity as string);
      let precio = 0;
      let valorEur = 0;
      try {
        precio = await getHistoricalPriceEur(row.asset as string, dec31);
        valorEur = quantity * precio;
      } catch { /* ignorar */ }

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
    superaUmbral: totalValor > await getUmbral721(),
    umbral:       await getUmbral721(),
    aviso:        'El Modelo 721 aplica a criptoactivos custodiados en exchanges extranjeros. Consulta con tu asesor fiscal sobre la aplicabilidad a wallets de autocustodia.',
  });
});

// ── GET /api/fiscal/:year/export ───────────────────────────────────────────
router.get('/:year/export', async (req: Request, res: Response) => {
  const year = parseInt(req.params.year);
  const format = (req.query.format as string) ?? 'csv';

  const eventsRes = await fetch(`http://localhost:3001/api/fiscal/${year}/events`);
  const { fiscalEvents, rendimientos } = await eventsRes.json() as {
    fiscalEvents: FiscalEvent[];
    rendimientos: RendimientoEvent[];
  };

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
        e.gananciaPeridaEur.toFixed(2),
      ].join(';'));
    }

    lines.push('');
    lines.push('RENDIMIENTOS DEL CAPITAL MOBILIARIO');
    lines.push('Fecha;Tipo;Activo;Cantidad;Valor EUR');
    for (const r of rendimientos) {
      lines.push([r.fecha, r.tipo, r.activo, r.cantidad.toFixed(8), r.valorEur.toFixed(2)].join(';'));
    }

    res.send('\uFEFF' + lines.join('\n'));

  // ── RENTA WEB ─────────────────────────────────────────────────────────────
  } else if (format === 'rentaweb') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fiscal_${year}_rentaweb.csv"`);

    const lines: string[] = [];
    lines.push('Denominacion moneda virtual transmitida;Clave tipo contraprestacion;Valor transmision EUR;Gastos transmision EUR;Valor adquisicion EUR;Gastos adquisicion EUR;Ganancia/Perdida EUR');

    for (const e of fiscalEvents) {
      lines.push([
        e.activoTransmitido,
        e.contrapartidaClave,
        e.valorTransmisionEur.toFixed(2),
        e.gastosTransmisionEur.toFixed(2),
        e.valorAdquisicionEur.toFixed(2),
        e.gastosAdquisicionEur.toFixed(2),
        e.gananciaPeridaEur.toFixed(2),
      ].join(';'));
    }

    res.send('\uFEFF' + lines.join('\n'));

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
        gp:        e.gananciaPeridaEur,
      });
      row.getCell('gp').font = {
        color: { argb: e.gananciaPeridaEur >= 0 ? 'FF00c896' : 'FFe74c3c' },
        bold: true,
      };
    }

    const t1 = sheet1.addRow({
      fecha:     'TOTAL',
      valorTx:   fiscalEvents.reduce((s, e) => s + e.valorTransmisionEur, 0),
      gastosTx:  fiscalEvents.reduce((s, e) => s + e.gastosTransmisionEur, 0),
      valorAdq:  fiscalEvents.reduce((s, e) => s + e.valorAdquisicionEur, 0),
      gastosAdq: fiscalEvents.reduce((s, e) => s + e.gastosAdquisicionEur, 0),
      gp:        fiscalEvents.reduce((s, e) => s + e.gananciaPeridaEur, 0),
    });
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
      sheet2.addRow({ fecha: r.fecha, tipo: r.tipo, activo: r.activo, cantidad: r.cantidad, valor: r.valorEur });
    }

    const t2 = sheet2.addRow({
      fecha: 'TOTAL',
      valor: rendimientos.reduce((s, r) => s + r.valorEur, 0),
    });
    t2.font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="fiscal_${year}.xlsx"`);
    await workbook.xlsx.write(res);

  // ── PDF ───────────────────────────────────────────────────────────────────
  } else if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fiscal_${year}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold')
      .text(`Resumen Fiscal ${year}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#666666')
      .text(`Generado el ${new Date().toLocaleDateString('es-ES')} - CryptoFolio`, { align: 'center' });
    doc.moveDown(2);

    const totalGP        = fiscalEvents.reduce((s, e) => s + e.gananciaPeridaEur, 0);
    const totalGanancias = fiscalEvents.filter(e => e.gananciaPeridaEur > 0).reduce((s, e) => s + e.gananciaPeridaEur, 0);
    const totalPerdidas  = fiscalEvents.filter(e => e.gananciaPeridaEur < 0).reduce((s, e) => s + e.gananciaPeridaEur, 0);

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000')
      .text('Ganancias y Perdidas Patrimoniales');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica')
      .text(`Total ganancias: ${totalGanancias.toFixed(2)} EUR`)
      .text(`Total perdidas: ${totalPerdidas.toFixed(2)} EUR`);
    doc.fontSize(12).font('Helvetica-Bold')
      .fillColor(totalGP >= 0 ? '#00c896' : '#e74c3c')
      .text(`Resultado neto: ${totalGP.toFixed(2)} EUR`);
    doc.fillColor('#000000').moveDown(1.5);

    doc.fontSize(12).font('Helvetica-Bold').text('Detalle de operaciones');
    doc.moveDown(0.5);

    const colWidths = [65, 40, 30, 70, 70, 65];
    const headers   = ['Fecha', 'Activo', 'Clave', 'Val. Transmision', 'Val. Adquisicion', 'G/P EUR'];
    let x = 50;

    doc.fontSize(8).font('Helvetica-Bold');
    const headerY = doc.y;
    headers.forEach((h, i) => {
      doc.text(h, x, headerY, { width: colWidths[i] });
      x += colWidths[i];
    });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);

    doc.fontSize(7).font('Helvetica');
    for (const e of fiscalEvents) {
      if (doc.y > 750) doc.addPage();
      x = 50;
      const y = doc.y;
      [
        e.fecha,
        e.activoTransmitido,
        e.contrapartidaClave,
        e.valorTransmisionEur.toFixed(2),
        e.valorAdquisicionEur.toFixed(2),
        e.gananciaPeridaEur.toFixed(2),
      ].forEach((val, i) => {
        if (i === 5) doc.fillColor(e.gananciaPeridaEur >= 0 ? '#00c896' : '#e74c3c');
        doc.text(val, x, y, { width: colWidths[i] });
        doc.fillColor('#000000');
        x += colWidths[i];
      });
      doc.moveDown(0.5);
    }

    if (rendimientos.length > 0) {
      doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').text('Rendimientos del Capital Mobiliario');
      doc.moveDown(0.5);

      const totalRend = rendimientos.reduce((s, r) => s + r.valorEur, 0);
      doc.fontSize(10).font('Helvetica').text(`Total rendimientos: ${totalRend.toFixed(2)} EUR`);
      doc.moveDown(1);

      const rendColW   = [80, 120, 60, 100, 80];
      const rendHeaders = ['Fecha', 'Tipo', 'Activo', 'Cantidad', 'Valor EUR'];
      x = 50;
      doc.fontSize(8).font('Helvetica-Bold');
      const rendHeaderY = doc.y;
      rendHeaders.forEach((h, i) => {
        doc.text(h, x, rendHeaderY, { width: rendColW[i] });
        x += rendColW[i];
      });
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);

      doc.fontSize(7).font('Helvetica');
      for (const r of rendimientos) {
        if (doc.y > 750) doc.addPage();
        x = 50;
        const y = doc.y;
        [r.fecha, r.tipo, r.activo, r.cantidad.toFixed(6), r.valorEur.toFixed(2)].forEach((val, i) => {
          doc.text(val, x, y, { width: rendColW[i] });
          x += rendColW[i];
        });
        doc.moveDown(0.5);
      }
    }

    if (doc.y > 700) doc.addPage();
    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').fillColor('#666666')
      .text('AVISO LEGAL: Esta informacion es orientativa y no constituye asesoramiento fiscal. Los calculos se basan en el metodo FIFO segun la normativa espanola vigente. Consulta con un asesor fiscal antes de presentar tu declaracion de la renta.');

    doc.end();

  } else {
    res.status(400).json({ error: 'Formato no soportado. Usa: csv, excel, pdf, rentaweb' });
  }
});

export default router;