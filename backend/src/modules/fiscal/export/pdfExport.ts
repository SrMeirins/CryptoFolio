import { Response } from 'express';
import PDFDocument from 'pdfkit';
import { EventoFiscal, Rendimiento } from '../eventosAnio';

const PW = 595.28, PH = 841.89, ML = 40, MR = 40;
const W = PW - ML - MR;

// Palette
const C_DARK = '#0d1117', C_NAVY = '#1e293b', C_BLUE = '#3b82f6';
const C_GREEN = '#10b981', C_RED = '#ef4444', C_VIOLET = '#a78bfa';
const C_GRAY5 = '#64748b', C_GRAY3 = '#94a3b8', C_GRAY1 = '#e2e8f0';
const C_ROW_ALT = '#f8fafc', C_TEXT = '#0f172a';

type ColDef = { text: string; w: number; align?: 'left' | 'right' | 'center'; color?: string; bold?: boolean };

const fmtEurPdf = (n: number, sign = false) => {
  const abs = Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (sign) return (n >= 0 ? '+' : '-') + ' ' + abs + ' €';
  return (n < 0 ? '-' : '') + abs + ' €';
};

export function writePdfExport(
  res: Response, year: number, fiscalEvents: EventoFiscal[], rendimientos: Rendimiento[],
): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="fiscal_${year}.pdf"`);

  const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
  doc.pipe(res);

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
}
