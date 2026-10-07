import { Response } from 'express';
import ExcelJS from 'exceljs';
import { EventoFiscal, Rendimiento } from '../eventosAnio';

const EUR_FMT = '#,##0.00 €';
const EUR_COLS = ['valorTx', 'gastosTx', 'valorAdq', 'gastosAdq', 'gp'];

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a2e' } };
}

export async function writeExcelExport(
  res: Response, year: number, fiscalEvents: EventoFiscal[], rendimientos: Rendimiento[],
): Promise<void> {
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
  styleHeaderRow(sheet1.getRow(1));

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
    EUR_COLS.forEach(col => { row.getCell(col).numFmt = EUR_FMT; });
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
  EUR_COLS.forEach(col => { t1.getCell(col).numFmt = EUR_FMT; });
  t1.font = { bold: true };

  const sheet2 = workbook.addWorksheet('Rendimientos Capital Mob.');
  sheet2.columns = [
    { header: 'Fecha',     key: 'fecha',    width: 12 },
    { header: 'Tipo',      key: 'tipo',     width: 20 },
    { header: 'Activo',    key: 'activo',   width: 10 },
    { header: 'Cantidad',  key: 'cantidad', width: 15 },
    { header: 'Valor EUR', key: 'valor',    width: 15 },
  ];
  styleHeaderRow(sheet2.getRow(1));

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
}
