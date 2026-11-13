import { Response } from 'express';
import ExcelJS from 'exceljs';
import { escaparFormula } from '../../csv/csvSafety';
import { TITULO_SECCION, type DatosExport, type Seccion } from './datosExport';

// Excel del ejercicio (#547): una hoja por sección elegida (Resumen,
// Compensación, Por activo, Operaciones, Rendimientos y Lotes FIFO). Fechas
// reales con formato DD/MM/AAAA, importes con formato de euros, filtros en
// las cabeceras y la primera fila fija. Los textos que vienen de datos
// importados se escapan contra fórmulas.

const EUR = '#,##0.00 €;-#,##0.00 €';
const CANT = '#,##0.########';
const FECHA = 'dd/mm/yyyy';

type Col = { header: string; key: string; width: number; fmt?: string };

/** Fecha AAAA-MM-DD como fecha real de la hoja (mediodía UTC, para que ninguna zona la mueva de día). */
const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`);
const texto = (s: string) => escaparFormula(s);

function hojaTabla(wb: ExcelJS.Workbook, nombre: string, cols: Col[], filas: Record<string, unknown>[], total?: Record<string, unknown>) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map(c => ({ header: c.header, key: c.key, width: c.width }));
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  cab.alignment = { vertical: 'middle', wrapText: true };
  for (const f of filas) ws.addRow(f);
  if (filas.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + filas.length, column: cols.length } };
  if (total) {
    const t = ws.addRow(total);
    t.font = { bold: true };
  }
  cols.forEach((c, i) => { if (c.fmt) ws.getColumn(i + 1).numFmt = c.fmt; });
  return ws;
}

export async function excelBuffer(d: DatosExport, secciones: readonly Seccion[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CryptoFolio';
  wb.created = new Date();
  const r = d.resumen;

  for (const s of secciones) {
    const nombre = TITULO_SECCION[s];
    if (s === 'resumen') {
      const ws = wb.addWorksheet(nombre);
      ws.columns = [{ header: `Ejercicio ${d.year}`, key: 'k', width: 44 }, { header: 'Importe', key: 'v', width: 18 }];
      ws.getRow(1).font = { bold: true };
      const filas: [string, number, string?][] = [
        ['Ganancias patrimoniales', r.ganancias],
        ['Pérdidas patrimoniales', r.perdidas],
        ['Neto de ganancias y pérdidas', r.neto],
        ['Rendimientos del capital mobiliario (base del ahorro)', r.rendimientosAhorro],
        ['Rentas de la base general (informativo)', r.rendimientosGeneral],
        ['Pérdidas de años anteriores compensadas', r.compensado],
        ['Base del ahorro', r.baseAhorro],
        ['Cuota estimada del ahorro', r.cuota],
        ['Operaciones', r.operaciones, CANT],
        ['Rendimientos', r.rendimientos, CANT],
      ];
      for (const [k, v, fmt] of filas) ws.addRow({ k, v }).getCell('v').numFmt = fmt ?? EUR;
      continue;
    }
    if (s === 'compensacion') {
      hojaTabla(wb, nombre, [
        { header: 'Año de la pérdida', key: 'anio', width: 16 },
        { header: 'Pérdida original', key: 'original', width: 18, fmt: EUR },
        { header: `Aplicada en ${d.year}`, key: 'aplicada', width: 18, fmt: EUR },
        { header: `Pendiente tras ${d.year}`, key: 'pendiente', width: 20, fmt: EUR },
        { header: 'Caduca el 31 de diciembre de', key: 'caduca', width: 24 },
      ], d.compensacion.map(c => ({ anio: c.anio, original: c.original, aplicada: c.aplicadaEnEjercicio, pendiente: c.pendiente, caduca: c.caducaEn })),
      { anio: 'Total', aplicada: r.compensado, pendiente: d.compensacion.reduce((t, c) => t + c.pendiente, 0) });
      continue;
    }
    if (s === 'activos') {
      hojaTabla(wb, nombre, [
        { header: 'Activo', key: 'activo', width: 14 },
        { header: 'Operaciones', key: 'ops', width: 12 },
        { header: 'Ganancias', key: 'g', width: 16, fmt: EUR },
        { header: 'Pérdidas', key: 'p', width: 16, fmt: EUR },
        { header: 'Neto', key: 'n', width: 16, fmt: EUR },
      ], d.activos.map(a => ({ activo: texto(a.activo), ops: a.operaciones, g: a.ganancias, p: a.perdidas, n: a.neto })),
      { activo: 'Total', g: r.ganancias, p: r.perdidas, n: r.neto });
      continue;
    }
    if (s === 'operaciones') {
      hojaTabla(wb, nombre, [
        { header: 'Fecha', key: 'fecha', width: 12, fmt: FECHA },
        { header: 'Tipo', key: 'tipo', width: 14 },
        { header: 'Activo', key: 'activo', width: 12 },
        { header: 'Cantidad', key: 'cantidad', width: 16, fmt: CANT },
        { header: 'Wallet', key: 'wallet', width: 20 },
        { header: 'Canal', key: 'canal', width: 14 },
        { header: 'Clave contraprestación', key: 'clave', width: 14 },
        { header: 'Descripción contraprestación', key: 'desc', width: 30 },
        { header: 'Revisar', key: 'revisar', width: 10 },
        { header: 'Valor transmisión', key: 'vt', width: 17, fmt: EUR },
        { header: 'Gastos transmisión', key: 'gt', width: 17, fmt: EUR },
        { header: 'Valor adquisición', key: 'va', width: 17, fmt: EUR },
        { header: 'Gastos adquisición', key: 'ga', width: 17, fmt: EUR },
        { header: 'Resultado', key: 'res', width: 16, fmt: EUR },
      ], d.operaciones.map(o => ({
        fecha: fecha(o.fecha), tipo: texto(o.tipo), activo: texto(o.activo), cantidad: o.cantidad, wallet: texto(o.wallet), canal: o.canal,
        clave: o.clave, desc: texto(o.descripcion), revisar: o.revisar ? 'Sí' : '',
        vt: o.valorTransmision, gt: o.gastosTransmision, va: o.valorAdquisicion, ga: o.gastosAdquisicion, res: o.resultado,
      })), {
        fecha: 'Total',
        vt: d.operaciones.reduce((t, o) => t + o.valorTransmision, 0), gt: d.operaciones.reduce((t, o) => t + o.gastosTransmision, 0),
        va: d.operaciones.reduce((t, o) => t + o.valorAdquisicion, 0), ga: d.operaciones.reduce((t, o) => t + o.gastosAdquisicion, 0), res: r.neto,
      });
      continue;
    }
    if (s === 'rendimientos') {
      hojaTabla(wb, nombre, [
        { header: 'Fecha', key: 'fecha', width: 12, fmt: FECHA },
        { header: 'Tipo', key: 'tipo', width: 16 },
        { header: 'Base', key: 'base', width: 10 },
        { header: 'Activo', key: 'activo', width: 12 },
        { header: 'Cantidad', key: 'cantidad', width: 16, fmt: CANT },
        { header: 'Wallet', key: 'wallet', width: 20 },
        { header: 'Valor', key: 'valor', width: 16, fmt: EUR },
      ], d.rendimientos.map(x => ({ fecha: fecha(x.fecha), tipo: texto(x.tipo), base: x.base, activo: texto(x.activo), cantidad: x.cantidad, wallet: texto(x.wallet), valor: x.valor })),
      { fecha: 'Total', valor: r.rendimientosAhorro + r.rendimientosGeneral });
      continue;
    }
    hojaTabla(wb, nombre, [
      { header: 'Fecha de transmisión', key: 'fecha', width: 14, fmt: FECHA },
      { header: 'Activo', key: 'activo', width: 12 },
      { header: 'Cantidad', key: 'cantidad', width: 16, fmt: CANT },
      { header: 'Fecha de adquisición', key: 'fadq', width: 14, fmt: FECHA },
      { header: 'Wallet', key: 'wallet', width: 20 },
      { header: 'Valor transmisión', key: 'vt', width: 17, fmt: EUR },
      { header: 'Gastos transmisión', key: 'gt', width: 17, fmt: EUR },
      { header: 'Valor adquisición', key: 'va', width: 17, fmt: EUR },
      { header: 'Gastos adquisición', key: 'ga', width: 17, fmt: EUR },
      { header: 'Resultado', key: 'res', width: 16, fmt: EUR },
    ], d.lotes.map(l => ({
      fecha: fecha(l.fecha), activo: texto(l.activo), cantidad: l.cantidad, fadq: fecha(l.fechaAdquisicion), wallet: texto(l.wallet),
      vt: l.valorTransmision, gt: l.gastosTransmision, va: l.valorAdquisicion, ga: l.gastosAdquisicion, res: l.resultado,
    })), { fecha: 'Total', res: r.neto });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function writeExcelExport(res: Response, d: DatosExport, secciones: readonly Seccion[]): Promise<void> {
  const buf = await excelBuffer(d, secciones);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="fiscal_${d.year}.xlsx"`);
  res.send(buf);
}
