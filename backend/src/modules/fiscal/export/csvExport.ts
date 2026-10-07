import { Response } from 'express';
import { sanitizeCsvField } from '../../csv/csvSafety';
import { EventoFiscal, Rendimiento } from '../eventosAnio';

// Formato Modelo 100 (declaración IRPF española) — CSV con ; como separador.
export function writeModelo100Csv(
  res: Response, year: number, fiscalEvents: EventoFiscal[], rendimientos: Rendimiento[],
): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fiscal_${year}_modelo100.csv"`);

  const lines: string[] = [];
  lines.push('GANANCIAS Y PERDIDAS PATRIMONIALES - MODELO 100');
  lines.push('Fecha;Denominacion activo transmitido;Clave contrapartida;Descripcion contrapartida;Valor transmision EUR;Gastos transmision EUR;Valor adquisicion EUR;Gastos adquisicion EUR;Ganancia/Perdida EUR');

  // activoTransmitido y contrapartidaDescripcion (esta última incrusta un
  // símbolo de activo, ver contrapartida.ts) provienen en última instancia
  // de la columna "Coin" de un CSV de exchange importado, sin whitelist —
  // se sanean contra CSV Formula Injection antes de escribirlos (ver
  // csvSafety.ts). El resto de campos son literales o números propios.
  for (const e of fiscalEvents) {
    lines.push([
      e.fecha,
      sanitizeCsvField(e.activoTransmitido),
      e.contrapartidaClave,
      sanitizeCsvField(e.contrapartidaDescripcion),
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
    lines.push([r.fecha, r.tipo, sanitizeCsvField(r.activo), r.cantidad.toFixed(8), r.valorEur.toFixed(2)].join(';'));
  }

  res.send('﻿' + lines.join('\n'));
}
