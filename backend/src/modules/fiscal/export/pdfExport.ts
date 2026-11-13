import { Response } from 'express';
import PDFDocument from 'pdfkit';
import { fechaEs, TITULO_SECCION, type DatosExport, type Seccion } from './datosExport';

// Informe fiscal en PDF (#547), pensado para imprimir: A4 apaisado, fondo
// blanco, márgenes de impresión, cabecera con el ejercicio y «Página N de M»
// en cada página. Las tablas repiten su cabecera al cambiar de página y no
// parten una fila. Secciones según lo elegido en el diálogo de exportar.

const PW = 841.89, PH = 595.28;
const M = 36;
const W = PW - 2 * M;
const TOP = M + 26;           // bajo la cabecera de página
const BOTTOM = PH - M - 16;   // sobre el pie
const ROW = 15;

const C_TEXT = '#0f172a', C_MUTED = '#475569', C_LINE = '#cbd5e1', C_HEAD = '#e2e8f0', C_ALT = '#f8fafc';
const C_POS = '#047857', C_NEG = '#b91c1c';

/** Número con punto de miles y coma decimal (también con 4 cifras, que es-ES no agrupa). */
function miles(n: number, decimales: number, minimo = decimales): string {
  const [ent, dec = ''] = Math.abs(n).toFixed(decimales).split('.');
  const recortado = dec.replace(/0+$/, '').padEnd(minimo, '0');
  const negativo = n < 0 && /[1-9]/.test(ent + dec)
  return `${negativo ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${recortado ? `,${recortado}` : ''}`;
}
export const eur = (n: number) => `${miles(Math.round(n * 100) / 100, 2)} €`;
export const cant = (n: number) => miles(n, 8, 0);

type Alin = 'left' | 'right';
interface ColPdf { titulo: string; ancho: number; alin?: Alin }
type Celda = { texto: string; color?: string; negrita?: boolean };

export function pdfBuffer(d: DatosExport, secciones: readonly Seccion[], generado: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: M, bufferPages: true, info: { Title: `Informe fiscal ${d.year}`, Creator: 'CryptoFolio' } });
  const trozos: Buffer[] = [];
  doc.on('data', (b: Buffer) => trozos.push(b));
  const fin = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(trozos))));

  let y = TOP;
  const nuevaPagina = () => { doc.addPage(); y = TOP; };
  const espacio = (h: number) => { if (y + h > BOTTOM) nuevaPagina(); };

  // El título reserva sitio para la cabecera de su tabla y dos filas: nunca queda huérfano al pie.
  const tituloSeccion = (t: string) => {
    espacio(30 + (ROW + 2) + ROW * 2);
    y += 6;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(C_TEXT).text(t, M, y, { width: W });
    y += 18;
    doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.6).strokeColor(C_LINE).stroke();
    y += 6;
  };

  const tabla = (cols: ColPdf[], filas: Celda[][], total?: Celda[]) => {
    const escala = W / cols.reduce((s, c) => s + c.ancho, 0);
    const anchos = cols.map(c => c.ancho * escala);
    const cabecera = () => {
      doc.rect(M, y, W, ROW + 2).fill(C_HEAD);
      let x = M;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C_TEXT);
      cols.forEach((c, i) => { doc.text(c.titulo, x + 3, y + 4, { width: anchos[i] - 6, height: ROW - 5, align: c.alin ?? 'left', lineBreak: false, ellipsis: true }); x += anchos[i]; });
      y += ROW + 2;
    };
    const fila = (celdas: Celda[], fondo?: string, negrita = false) => {
      if (y + ROW > BOTTOM) { nuevaPagina(); cabecera(); }
      if (fondo) doc.rect(M, y, W, ROW).fill(fondo);
      let x = M;
      celdas.forEach((c, i) => {
        doc.font(c.negrita || negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(c.color ?? C_TEXT)
          .text(c.texto, x + 3, y + 4, { width: anchos[i] - 6, height: ROW - 5, align: cols[i].alin ?? 'left', lineBreak: false, ellipsis: true });
        x += anchos[i];
      });
      y += ROW;
    };
    espacio(ROW * 3);
    cabecera();
    if (filas.length === 0) fila([{ texto: 'Sin datos en este ejercicio.', color: C_MUTED }, ...cols.slice(1).map(() => ({ texto: '' }))]);
    filas.forEach((f, i) => fila(f, i % 2 === 1 ? C_ALT : undefined));
    if (total) {
      if (y + ROW > BOTTOM) { nuevaPagina(); cabecera(); }
      doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.6).strokeColor(C_LINE).stroke();
      fila(total, undefined, true);
    }
    y += 8;
  };
  const imp = (n: number): Celda => ({ texto: eur(n), color: n < 0 ? C_NEG : n > 0 ? C_POS : C_TEXT });
  const r = d.resumen;

  // Portada breve
  doc.font('Helvetica-Bold').fontSize(20).fillColor(C_TEXT).text(`Informe fiscal ${d.year}`, M, y);
  y += 28;
  doc.font('Helvetica').fontSize(9).fillColor(C_MUTED)
    .text(`Ganancias y pérdidas patrimoniales y rendimientos de criptomonedas. Generado el ${generado}. Método FIFO.`, M, y, { width: W });
  y += 22;

  for (const s of secciones) {
    tituloSeccion(TITULO_SECCION[s]);
    if (s === 'resumen') {
      tabla([{ titulo: 'Concepto', ancho: 3 }, { titulo: 'Importe', ancho: 1, alin: 'right' }], [
        [{ texto: 'Ganancias patrimoniales' }, imp(r.ganancias)],
        [{ texto: 'Pérdidas patrimoniales' }, imp(r.perdidas)],
        [{ texto: 'Neto de ganancias y pérdidas', negrita: true }, { ...imp(r.neto), negrita: true }],
        [{ texto: 'Rendimientos del capital mobiliario (base del ahorro)' }, imp(r.rendimientosAhorro)],
        [{ texto: 'Rentas de la base general (informativo)' }, imp(r.rendimientosGeneral)],
        [{ texto: 'Pérdidas de años anteriores compensadas' }, imp(r.compensado)],
        [{ texto: 'Base del ahorro', negrita: true }, { texto: eur(r.baseAhorro), negrita: true }],
        [{ texto: 'Cuota estimada del ahorro', negrita: true }, { texto: eur(r.cuota), negrita: true }],
        [{ texto: 'Operaciones y rendimientos' }, { texto: `${r.operaciones} y ${r.rendimientos}` }],
      ]);
    } else if (s === 'compensacion') {
      tabla([
        { titulo: 'Año de la pérdida', ancho: 1 }, { titulo: 'Pérdida original', ancho: 1, alin: 'right' },
        { titulo: `Aplicada en ${d.year}`, ancho: 1, alin: 'right' }, { titulo: `Pendiente tras ${d.year}`, ancho: 1, alin: 'right' },
        { titulo: 'Caduca el 31/12 de', ancho: 1, alin: 'right' },
      ], d.compensacion.map(c => [{ texto: String(c.anio) }, { texto: eur(c.original) }, { texto: eur(c.aplicadaEnEjercicio) }, { texto: eur(c.pendiente) }, { texto: String(c.caducaEn) }]),
      [{ texto: 'Total' }, { texto: '' }, { texto: eur(r.compensado) }, { texto: eur(d.compensacion.reduce((t, c) => t + c.pendiente, 0)) }, { texto: '' }]);
    } else if (s === 'activos') {
      tabla([
        { titulo: 'Activo', ancho: 1.2 }, { titulo: 'Operaciones', ancho: 1, alin: 'right' }, { titulo: 'Ganancias', ancho: 1.4, alin: 'right' },
        { titulo: 'Pérdidas', ancho: 1.4, alin: 'right' }, { titulo: 'Neto', ancho: 1.4, alin: 'right' },
      ], d.activos.map(a => [{ texto: a.activo }, { texto: String(a.operaciones) }, imp(a.ganancias), imp(a.perdidas), imp(a.neto)]),
      [{ texto: 'Total' }, { texto: String(r.operaciones) }, imp(r.ganancias), imp(r.perdidas), imp(r.neto)]);
    } else if (s === 'operaciones') {
      tabla([
        { titulo: 'Fecha', ancho: 0.8 }, { titulo: 'Tipo', ancho: 0.9 }, { titulo: 'Activo', ancho: 0.7 }, { titulo: 'Cantidad', ancho: 1, alin: 'right' },
        { titulo: 'Wallet', ancho: 1.2 }, { titulo: 'Canal', ancho: 0.8 }, { titulo: 'Clave', ancho: 0.6 }, { titulo: 'Contraprestación', ancho: 1.3 },
        { titulo: 'V. transmisión', ancho: 1, alin: 'right' }, { titulo: 'G. transm.', ancho: 0.8, alin: 'right' },
        { titulo: 'V. adquisición', ancho: 1, alin: 'right' }, { titulo: 'G. adq.', ancho: 0.8, alin: 'right' }, { titulo: 'Resultado', ancho: 1, alin: 'right' },
      ], d.operaciones.map(o => [
        { texto: fechaEs(o.fecha) }, { texto: o.tipo }, { texto: o.activo }, { texto: cant(o.cantidad) }, { texto: o.wallet }, { texto: o.canal },
        { texto: o.revisar ? 'Revisar' : o.clave, color: o.revisar ? C_NEG : undefined }, { texto: o.descripcion },
        { texto: eur(o.valorTransmision) }, { texto: eur(o.gastosTransmision) }, { texto: eur(o.valorAdquisicion) }, { texto: eur(o.gastosAdquisicion) }, imp(o.resultado),
      ]), [{ texto: 'Total' }, ...Array(11).fill({ texto: '' }), imp(r.neto)]);
    } else if (s === 'rendimientos') {
      tabla([
        { titulo: 'Fecha', ancho: 0.8 }, { titulo: 'Tipo', ancho: 1.2 }, { titulo: 'Base', ancho: 0.7 }, { titulo: 'Activo', ancho: 0.8 },
        { titulo: 'Cantidad', ancho: 1.1, alin: 'right' }, { titulo: 'Wallet', ancho: 1.4 }, { titulo: 'Valor', ancho: 1, alin: 'right' },
      ], d.rendimientos.map(x => [{ texto: fechaEs(x.fecha) }, { texto: x.tipo }, { texto: x.base }, { texto: x.activo }, { texto: cant(x.cantidad) }, { texto: x.wallet }, { texto: eur(x.valor) }]),
      [{ texto: 'Total' }, ...Array(5).fill({ texto: '' }), { texto: eur(r.rendimientosAhorro + r.rendimientosGeneral) }]);
    } else {
      tabla([
        { titulo: 'Transmisión', ancho: 0.8 }, { titulo: 'Activo', ancho: 0.7 }, { titulo: 'Cantidad', ancho: 1, alin: 'right' }, { titulo: 'Adquisición', ancho: 0.8 },
        { titulo: 'Wallet', ancho: 1.2 }, { titulo: 'V. transmisión', ancho: 1, alin: 'right' }, { titulo: 'G. transm.', ancho: 0.8, alin: 'right' },
        { titulo: 'V. adquisición', ancho: 1, alin: 'right' }, { titulo: 'G. adq.', ancho: 0.8, alin: 'right' }, { titulo: 'Resultado', ancho: 1, alin: 'right' },
      ], d.lotes.map(l => [
        { texto: fechaEs(l.fecha) }, { texto: l.activo }, { texto: cant(l.cantidad) }, { texto: fechaEs(l.fechaAdquisicion) }, { texto: l.wallet },
        { texto: eur(l.valorTransmision) }, { texto: eur(l.gastosTransmision) }, { texto: eur(l.valorAdquisicion) }, { texto: eur(l.gastosAdquisicion) }, imp(l.resultado),
      ]), [{ texto: 'Total' }, ...Array(8).fill({ texto: '' }), imp(r.neto)]);
    }
  }

  // Cabecera y pie en todas las páginas, ya que se sabe cuántas hay.
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    // Sin margen inferior al escribir el pie: si no, pdfkit abriría una página nueva.
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fillColor(C_MUTED)
      .text(`CryptoFolio · Informe fiscal ${d.year}`, M, M - 4, { width: W / 2, lineBreak: false })
      .text(`Página ${i - start + 1} de ${count}`, M + W / 2, PH - M - 4, { width: W / 2, align: 'right', lineBreak: false })
      .text('Estimación orientativa: revisa los datos antes de presentar la declaración.', M, PH - M - 4, { width: W / 2, lineBreak: false });
    doc.moveTo(M, M + 10).lineTo(M + W, M + 10).lineWidth(0.5).strokeColor(C_LINE).stroke();
  }
  doc.end();
  return fin;
}

export async function writePdfExport(res: Response, d: DatosExport, secciones: readonly Seccion[], generado: string): Promise<void> {
  const buf = await pdfBuffer(d, secciones, generado);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="fiscal_${d.year}.pdf"`);
  res.send(buf);
}
