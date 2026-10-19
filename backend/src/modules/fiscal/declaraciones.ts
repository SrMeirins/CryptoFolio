// Ejercicios declarados (#311). Lógica pura: qué cifras de la Renta han
// cambiado desde que se declaró y la obligación del Modelo 721 con la regla
// del incremento de 20.000 € respecto a la última presentación.

export interface CifrasRenta {
  ganancias: number;
  perdidas: number;
  neto: number;
  rendimientos: number;
  operaciones: number;
  base: number;
  cuota: number;
}

export const CAMPOS_RENTA: ReadonlyArray<keyof CifrasRenta> = ['ganancias', 'perdidas', 'neto', 'rendimientos', 'operaciones', 'base', 'cuota'];

export interface Cambio { campo: keyof CifrasRenta; declarado: number; actual: number }

/** Cifras que difieren (más de un céntimo; el nº de operaciones, en cualquier unidad). */
export function compararCifras(declaradas: Partial<CifrasRenta>, actuales: CifrasRenta): Cambio[] {
  return CAMPOS_RENTA.flatMap(campo => {
    const d = Number(declaradas[campo] ?? 0);
    const a = actuales[campo];
    const tol = campo === 'operaciones' ? 0.5 : 0.01;
    return Math.abs(a - d) > tol ? [{ campo, declarado: d, actual: a }] : [];
  });
}

/** Incremento a partir del cual hay que volver a presentar el 721. */
export const INCREMENTO_721 = 20_000;

export interface Presentacion721 { ejercicio: number; valor: number }

/**
 * Obligación del 721 de un ejercicio: el valor en custodia de terceros supera
 * el umbral y, si ya se presentó en un ejercicio anterior, ha aumentado más
 * de 20.000 € respecto a esa última presentación.
 */
export function obligacion721(valor: number, umbral: number, ultima: Presentacion721 | null): boolean {
  if (!(valor > umbral)) return false;
  if (!ultima) return true;
  return valor - ultima.valor > INCREMENTO_721;
}
