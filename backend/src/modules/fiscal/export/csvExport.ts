import { Response } from 'express';
import { sanitizeCsvField } from '../../csv/csvSafety';
import { fechaEs, type DatosExport } from './datosExport';

// CSV general del ejercicio (#547): una sola tabla que abre bien en hojas de
// cálculo en castellano. Separador punto y coma, coma decimal sin miles,
// fechas DD/MM/AAAA, BOM y saltos CRLF. Cada fila es una transmisión
// (agrupada por operación) o un rendimiento, con su Tipo y su Base del IRPF.
// Los textos que vienen de datos importados se sanean contra la inyección de
// fórmulas (csvSafety.ts).

const num = (n: number, decimales = 2) => n.toFixed(decimales).replace('.', ',');
const cantidad = (n: number) => String(Math.round(n * 1e8) / 1e8).replace('.', ',');

export const CABECERA_CSV = [
  'Fecha', 'Tipo', 'Base', 'Activo', 'Cantidad', 'Wallet', 'Canal', 'Clave contraprestación', 'Descripción contraprestación',
  'Valor transmisión EUR', 'Gastos transmisión EUR', 'Valor adquisición EUR', 'Gastos adquisición EUR', 'Resultado EUR',
];

export function csvGeneral(d: DatosExport): string {
  const lineas = [CABECERA_CSV.join(';')];
  for (const o of d.operaciones) {
    lineas.push([
      fechaEs(o.fecha), sanitizeCsvField(o.tipo), 'Ahorro', sanitizeCsvField(o.activo), cantidad(o.cantidad), sanitizeCsvField(o.wallet),
      o.canal, o.clave, sanitizeCsvField(o.descripcion),
      num(o.valorTransmision), num(o.gastosTransmision), num(o.valorAdquisicion), num(o.gastosAdquisicion), num(o.resultado),
    ].join(';'));
  }
  for (const r of d.rendimientos) {
    lineas.push([
      fechaEs(r.fecha), sanitizeCsvField(r.tipo), r.base, sanitizeCsvField(r.activo), cantidad(r.cantidad), sanitizeCsvField(r.wallet),
      '', '', '', '', '', '', '', num(r.valor),
    ].join(';'));
  }
  return '﻿' + lineas.join('\r\n');
}

export function writeCsvGeneral(res: Response, d: DatosExport): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fiscal_${d.year}.csv"`);
  res.send(csvGeneral(d));
}
