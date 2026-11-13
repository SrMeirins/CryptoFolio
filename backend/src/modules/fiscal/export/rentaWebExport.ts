import { Response } from 'express';
import { sanitizeCsvField } from '../../csv/csvSafety';
import { fechaEs, type DatosExport } from './datosExport';

// Datos para la casilla 1800 de Renta WEB (#313, #547): una fila por lote
// consumido, como siempre ha sido este fichero (los totales son los mismos que
// agrupando por operación), con las claves de
// contraprestación de #531 (F dinero de curso legal, N otra moneda virtual,
// B pago de un bien o servicio; vacía si hay que revisarla) y los nombres de
// #488. Valores y gastos por separado (#543):
// (transmisión - gastos) - (adquisición + gastos) = resultado.
// Coma decimal, fecha DD/MM/AAAA y textos sin tildes, que es lo que importa la
// herramienta de la AEAT.

const eur = (n: number) => n.toFixed(2).replace('.', ',');
/** Sin tildes, para no alterar lo que importa Renta WEB. */
export const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function csvRentaWeb(d: DatosExport): string {
  const lineas = ['Fecha;Denominacion moneda virtual transmitida;Clave contraprestacion;Descripcion contraprestacion;Valor transmision EUR;Gastos transmision EUR;Valor adquisicion EUR;Gastos adquisicion EUR;Ganancia/Perdida EUR'];
  for (const l of d.lotes) {
    lineas.push([
      fechaEs(l.fecha), sanitizeCsvField(l.activo), l.clave, sanitizeCsvField(sinTildes(l.descripcion)),
      eur(l.valorTransmision), eur(l.gastosTransmision), eur(l.valorAdquisicion), eur(l.gastosAdquisicion), eur(l.resultado),
    ].join(';'));
  }
  return '﻿' + lineas.join('\r\n');
}

export function writeRentaWebCsv(res: Response, d: DatosExport): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fiscal_${d.year}_rentaweb.csv"`);
  res.send(csvRentaWeb(d));
}
