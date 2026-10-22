import type { AnioFiscal } from '../fiscal/compensacion';

// Resumen estructurado de una importación (#324): lo pinta el cliente sin leer
// el texto del log. Módulo puro (sin BD).

export type TipoAvisoFifo = 'sin_compras' | 'transferencia' | 'lote_sintetico' | 'otro';

export interface AvisoFifo {
  tipo: TipoAvisoFifo;
  activo: string | null;
  veces: number;
  /** Explicación en lenguaje claro, sin identificadores internos. */
  mensaje: string;
}

export interface ImpactoEjercicio { year: number; antes: number; despues: number }

export interface PrecioSinEncontrar { activo: string; fecha: string }

/** Desglose de un lote (#326): una importación registrada por archivo. */
export interface ArchivoImportado {
  importId: string; archivo: string; exchange: string; nuevas: number; duplicadas: number
  /** Importadas editadas a mano que el importador no ha tocado (#378). */
  editadas_respetadas?: number
}

export interface ResumenImportacion {
  /** Primera importación del lote (compatibilidad con un solo archivo). */
  importId: string;
  archivos?: ArchivoImportado[];
  archivo: string;
  nuevas: number;
  duplicadas: number;
  precios: { necesarios: number; obtenidos: number; sinPrecio: PrecioSinEncontrar[] };
  avisos: AvisoFifo[];
  impacto: ImpactoEjercicio[];
}

const MENSAJES: Record<Exclude<TipoAvisoFifo, 'otro'>, (activo: string) => string> = {
  sin_compras: a => `${a}: se vende o se gasta más de lo que consta comprado. Puede faltar un depósito o una importación anterior.`,
  transferencia: a => `${a}: se mueve más de lo que consta en la wallet de origen. Revisa las transferencias entre cuentas.`,
  lote_sintetico: a => `${a}: había saldo sin compras previas en esa cuenta; se asumió el precio de mercado. Puede faltar una transferencia interna.`,
};

function clasificar(texto: string): { tipo: TipoAvisoFifo; activo: string | null } {
  let m = texto.match(/^(?:Sin lotes abiertos|Lotes insuficientes) para (\S+)/);
  if (m) return { tipo: 'sin_compras', activo: m[1] };
  m = texto.match(/^TRANSFER sin lotes suficientes para (\S+)/);
  if (m) return { tipo: 'transferencia', activo: m[1] };
  m = texto.match(/lote sintético creado para (\S+)/);
  if (m) return { tipo: 'lote_sintetico', activo: m[1] };
  m = texto.match(/\((?:[A-Z_]+) (\S+) @/);
  return { tipo: 'otro', activo: m ? m[1] : null };
}

/** Quita UUIDs, fechas ISO y cantidades técnicas de un mensaje del motor. */
function limpiar(texto: string): string {
  return texto
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
    .replace(/\s*\(tx\s*\)|tx=\s*|\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Agrupa errores y avisos del FIFO por tipo y activo, de más a menos frecuente. */
export function agruparAvisosFifo(errors: readonly string[], warnings: readonly string[]): AvisoFifo[] {
  const grupos = new Map<string, AvisoFifo>();
  for (const texto of [...errors, ...warnings]) {
    const { tipo, activo } = clasificar(texto);
    const clave = tipo === 'otro' ? `otro|${limpiar(texto)}` : `${tipo}|${activo}`;
    const g = grupos.get(clave);
    if (g) { g.veces++; continue; }
    grupos.set(clave, {
      tipo, activo, veces: 1,
      mensaje: tipo === 'otro' || !activo ? limpiar(texto) : MENSAJES[tipo](activo),
    });
  }
  return [...grupos.values()].sort((a, b) => b.veces - a.veces);
}

/** Ejercicios cuyo G/P neto cambia con la importación (diferencia de al menos un céntimo). */
export function impactoPorEjercicio(antes: readonly AnioFiscal[], despues: readonly AnioFiscal[]): ImpactoEjercicio[] {
  const previo = new Map(antes.map(a => [a.year, a.netoGP]));
  const years = new Set([...antes.map(a => a.year), ...despues.map(d => d.year)]);
  const posterior = new Map(despues.map(d => [d.year, d.netoGP]));
  return [...years]
    .map(year => ({ year, antes: previo.get(year) ?? 0, despues: posterior.get(year) ?? 0 }))
    .filter(i => Math.abs(i.despues - i.antes) >= 0.005)
    .sort((a, b) => b.year - a.year);
}
