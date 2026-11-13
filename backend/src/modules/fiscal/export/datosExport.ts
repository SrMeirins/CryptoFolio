import type { EventoFiscal, Rendimiento } from '../eventosAnio';
import { baseAhorro, compensarPerdidas, type AnioFiscal } from '../compensacion';
import { calcularIrpfAhorro } from '../irpf';
import type { Escala } from '../escalasAhorro';

// Datos de una exportación fiscal (#547), comunes a CSV, Renta Web, Excel y
// PDF: así los totales de cada formato son los mismos y coinciden con la
// pantalla. Función pura. Las operaciones se agrupan por transacción como en
// la tabla de Operaciones (una venta que consume varios lotes es una fila);
// el detalle por lote va en «Lotes FIFO».

export const SECCIONES = ['resumen', 'compensacion', 'activos', 'operaciones', 'rendimientos', 'lotes'] as const;
export type Seccion = typeof SECCIONES[number];

/** Preferencias del diálogo de exportar (#547), en app_config y editables en Ajustes > Fiscal. */
export const EXPORT_PREFS_KEY = 'export_preferencias';
export const FORMATOS_EXPORT = ['csv', 'rentaweb', 'excel', 'pdf'] as const;

export const TITULO_SECCION: Record<Seccion, string> = {
  resumen: 'Resumen',
  compensacion: 'Compensación',
  activos: 'Por activo',
  operaciones: 'Operaciones',
  rendimientos: 'Rendimientos',
  lotes: 'Lotes FIFO',
};

const CANAL: Record<string, string> = { orden: 'Orden', convert: 'Convert', saldos: 'Saldos a BNB', liquidacion: 'Liquidación' };

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface OperacionExport {
  fecha: string;
  tipo: string;
  activo: string;
  cantidad: number;
  wallet: string;
  canal: string;
  clave: string;
  descripcion: string;
  /** Sin clave segura: revisar antes de declarar (#531). */
  revisar: boolean;
  valorTransmision: number;
  gastosTransmision: number;
  valorAdquisicion: number;
  gastosAdquisicion: number;
  resultado: number;
  lotes: number;
}

export interface LoteExport {
  fecha: string;
  activo: string;
  clave: string;
  descripcion: string;
  cantidad: number;
  fechaAdquisicion: string;
  wallet: string;
  valorTransmision: number;
  gastosTransmision: number;
  valorAdquisicion: number;
  gastosAdquisicion: number;
  resultado: number;
}

export interface RendimientoExport { fecha: string; tipo: string; base: 'Ahorro' | 'General'; activo: string; cantidad: number; wallet: string; valor: number }

export interface ActivoExport { activo: string; operaciones: number; ganancias: number; perdidas: number; neto: number }

export interface CompensacionExport {
  anio: number;
  original: number;
  /** Lo aplicado en el ejercicio exportado (con ganancias y con rendimientos). */
  aplicadaEnEjercicio: number;
  /** Lo que queda tras el ejercicio exportado. */
  pendiente: number;
  caducaEn: number;
}

export interface ResumenExport {
  ganancias: number;
  perdidas: number;
  neto: number;
  rendimientosAhorro: number;
  rendimientosGeneral: number;
  compensado: number;
  baseAhorro: number;
  cuota: number;
  operaciones: number;
  rendimientos: number;
}

export interface DatosExport {
  year: number;
  resumen: ResumenExport;
  compensacion: CompensacionExport[];
  activos: ActivoExport[];
  operaciones: OperacionExport[];
  rendimientos: RendimientoExport[];
  lotes: LoteExport[];
}

export function construirExport(e: {
  year: number;
  eventos: readonly EventoFiscal[];
  rendimientos: readonly Rendimiento[];
  /** Años fiscales hasta el exportado (incluido). */
  anios: readonly AnioFiscal[];
  tipos: readonly number[] | Escala;
}): DatosExport {
  // Operaciones: una fila por transacción, sumando sus lotes.
  const porTx = new Map<string, OperacionExport>();
  for (const ev of e.eventos) {
    const op = porTx.get(ev.txId);
    if (op) {
      op.cantidad += ev.cantidadTransmitida;
      op.valorTransmision += ev.valorTransmisionEur;
      op.gastosTransmision += ev.gastosTransmisionEur;
      op.valorAdquisicion += ev.valorAdquisicionEur;
      op.gastosAdquisicion += ev.gastosAdquisicionEur;
      op.resultado += ev.gananciaPerdidaEur;
      op.lotes += 1;
      op.revisar ||= ev.contrapartidaRevisar;
    } else {
      porTx.set(ev.txId, {
        fecha: ev.fecha, tipo: ev.tipo, activo: ev.activoTransmitido, cantidad: ev.cantidadTransmitida, wallet: ev.wallet,
        canal: ev.canal ? CANAL[ev.canal] ?? '' : '', clave: ev.contrapartidaClave, descripcion: ev.contrapartidaDescripcion,
        revisar: ev.contrapartidaRevisar,
        valorTransmision: ev.valorTransmisionEur, gastosTransmision: ev.gastosTransmisionEur,
        valorAdquisicion: ev.valorAdquisicionEur, gastosAdquisicion: ev.gastosAdquisicionEur,
        resultado: ev.gananciaPerdidaEur, lotes: 1,
      });
    }
  }
  const operaciones = [...porTx.values()].map(o => ({
    ...o,
    valorTransmision: round2(o.valorTransmision), gastosTransmision: round2(o.gastosTransmision),
    valorAdquisicion: round2(o.valorAdquisicion), gastosAdquisicion: round2(o.gastosAdquisicion), resultado: round2(o.resultado),
  }));

  const lotes: LoteExport[] = e.eventos.map(ev => ({
    fecha: ev.fecha, activo: ev.activoTransmitido, clave: ev.contrapartidaClave, descripcion: ev.contrapartidaDescripcion, cantidad: ev.cantidadTransmitida, fechaAdquisicion: ev.fechaAdquisicion, wallet: ev.wallet,
    valorTransmision: round2(ev.valorTransmisionEur), gastosTransmision: round2(ev.gastosTransmisionEur),
    valorAdquisicion: round2(ev.valorAdquisicionEur), gastosAdquisicion: round2(ev.gastosAdquisicionEur), resultado: round2(ev.gananciaPerdidaEur),
  }));

  const rendimientos: RendimientoExport[] = e.rendimientos.map(r => ({
    fecha: r.fecha, tipo: r.tipo, base: r.base === 'general' ? 'General' : 'Ahorro', activo: r.activo, cantidad: r.cantidad, wallet: r.wallet, valor: round2(r.valorEur),
  }));

  // Ganancias y pérdidas por lote consumido, como el resumen y el desglose de
  // la pantalla: una venta con lotes en ganancia y en pérdida suma a los dos.
  const porActivo = new Map<string, ActivoExport>();
  for (const o of operaciones) {
    const a = porActivo.get(o.activo) ?? { activo: o.activo, operaciones: 0, ganancias: 0, perdidas: 0, neto: 0 };
    a.operaciones += 1;
    porActivo.set(o.activo, a);
  }
  for (const l of e.eventos) {
    const a = porActivo.get(l.activoTransmitido)!;
    if (l.gananciaPerdidaEur >= 0) a.ganancias += l.gananciaPerdidaEur; else a.perdidas += l.gananciaPerdidaEur;
    a.neto += l.gananciaPerdidaEur;
  }
  const activos = [...porActivo.values()]
    .map(a => ({ ...a, ganancias: round2(a.ganancias), perdidas: round2(a.perdidas), neto: round2(a.neto) }))
    .sort((x, y) => Math.abs(y.neto) - Math.abs(x.neto) || x.activo.localeCompare(y.activo));

  // Compensación y cuota del ejercicio, con el mismo cálculo que la pantalla.
  const { detalle, origenes } = compensarPerdidas(e.anios);
  const d = detalle.find(x => x.year === e.year);
  const base = d ? Math.max(0, baseAhorro(d)) : 0;
  const compensacion: CompensacionExport[] = origenes
    .filter(o => o.year < e.year && o.original > 0.005)
    .map(o => {
      const apl = o.aplicaciones.filter(a => a.year === e.year).reduce((s, a) => s + a.patrim + a.rend, 0);
      return { anio: o.year, original: round2(o.original), aplicadaEnEjercicio: round2(apl), pendiente: round2(o.pendiente), caducaEn: o.caducaEn };
    })
    .filter(c => c.aplicadaEnEjercicio > 0.005 || c.pendiente > 0.005);

  const ganancias = round2(e.eventos.reduce((s, l) => s + Math.max(0, l.gananciaPerdidaEur), 0));
  const perdidas = round2(e.eventos.reduce((s, l) => s + Math.min(0, l.gananciaPerdidaEur), 0));
  const resumen: ResumenExport = {
    ganancias, perdidas, neto: round2(ganancias + perdidas),
    rendimientosAhorro: round2(rendimientos.filter(r => r.base === 'Ahorro').reduce((s, r) => s + r.valor, 0)),
    rendimientosGeneral: round2(rendimientos.filter(r => r.base === 'General').reduce((s, r) => s + r.valor, 0)),
    compensado: round2(compensacion.reduce((s, c) => s + c.aplicadaEnEjercicio, 0)),
    baseAhorro: round2(base),
    cuota: round2(calcularIrpfAhorro(base, e.tipos)),
    operaciones: operaciones.length,
    rendimientos: rendimientos.length,
  };

  return { year: e.year, resumen, compensacion, activos, operaciones, rendimientos, lotes };
}

/** Fecha AAAA-MM-DD en DD/MM/AAAA. */
export const fechaEs = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
