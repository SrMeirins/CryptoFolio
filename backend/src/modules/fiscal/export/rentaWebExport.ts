import { Response } from 'express';
import { sanitizeCsvField } from '../../csv/csvSafety';
import { EventoFiscal } from '../eventosAnio';

const eur = (n: number) => n.toFixed(2).replace('.', ',');
/**
 * El fichero Renta Web conserva su formato histórico en ASCII (#313): la
 * descripción lleva tildes en pantalla, pero aquí se escribe sin ellas para
 * no alterar lo que importa la herramienta de la AEAT.
 */
export const sinTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// Datos para la casilla 1800 de Renta WEB, sin tildes.
// Claves de contraprestación (#531, ver contrapartida.ts): F dinero de curso
// legal, N otra moneda virtual, B pago de un bien o servicio; vacía si hay que
// revisarla (donaciones y pérdidas).
// - valorTransmision = BRUTO (proceeds_neto + gastosTx) para que AEAT reste gastosTx correctamente.
// - gastosAdquisicion = 0 porque el cost_basis ya incluye las comisiones de compra.
// - Decimal: coma (,). Fecha: DD/MM/YYYY.
export function writeRentaWebCsv(res: Response, year: number, fiscalEvents: EventoFiscal[]): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fiscal_${year}_rentaweb.csv"`);

  const lines: string[] = [];
  lines.push('Fecha;Denominacion moneda virtual transmitida;Clave contraprestacion;Descripcion contraprestacion;Valor transmision EUR;Gastos transmision EUR;Valor adquisicion EUR;Gastos adquisicion EUR;Ganancia/Perdida EUR');

  for (const e of fiscalEvents) {
    // Valor transmisión bruto = neto + gastos tx (para que AEAT reste gastosTx sin doble conteo)
    const valorTxBruto = e.valorTransmisionEur + e.gastosTransmisionEur;
    // Gastos adquisición = 0 porque cost_basis ya incluye las comisiones de compra
    lines.push([
      fmtDate(e.fecha),
      sanitizeCsvField(e.activoTransmitido),
      e.contrapartidaClave,
      sanitizeCsvField(sinTildes(e.contrapartidaDescripcion)),
      eur(valorTxBruto),
      eur(e.gastosTransmisionEur),
      eur(e.valorAdquisicionEur),
      '0,00',
      eur(e.gananciaPerdidaEur),
    ].join(';'));
  }

  res.send('﻿' + lines.join('\r\n'));
}
