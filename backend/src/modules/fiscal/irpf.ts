import { escalaOficial, type Escala } from './escalasAhorro';

// Cálculo del IRPF de la base del ahorro sobre la escala de un ejercicio
// (#452): límites y tipos de escalasAhorro.ts, con los tipos cambiados a mano
// en Ajustes. Por defecto, la escala vigente.
// Object.freeze: constantes compartidas por toda la app; una mutación
// accidental corrompería el cálculo fiscal de forma silenciosa.
const VIGENTE = escalaOficial(new Date().getUTCFullYear());
export const TRAMOS_LIMITES = Object.freeze([...VIGENTE.limites]);
export const TIPOS_DEFECTO = Object.freeze([...VIGENTE.tipos]);

/** Escala con los tipos dados sobre los límites vigentes (compatibilidad con llamadas antiguas). */
function comoEscala(tipos: readonly number[] | Escala): Escala {
  return Array.isArray(tipos) ? { limites: TRAMOS_LIMITES, tipos: tipos as readonly number[] } : tipos as Escala;
}

export function calcularIrpfAhorro(base: number, escalaOTipos: readonly number[] | Escala = TIPOS_DEFECTO): number {
  const { limites, tipos } = comoEscala(escalaOTipos);
  let restante = base;
  let anterior = 0;
  let cuota = 0;
  for (let i = 0; i < limites.length; i++) {
    if (restante <= 0) break;
    const tramo = Math.min(restante, limites[i] - anterior);
    cuota += tramo * (tipos[i] / 100);
    restante -= tramo;
    anterior = limites[i];
  }
  // Redondeo a céntimos (2 decimales): sin esto, la suma de tramos con
  // floats produce ruido visible en casos reales (ej. base=468.53 →
  // 89.02069999999999 en vez de 89.02) que se serializaba tal cual en la
  // respuesta JSON de /api/fiscal/simulate-sale.
  return Math.round(cuota * 100) / 100;
}

export interface TramoMarginal { tipo: number; desde: number; hasta: number; base: number; cuota: number }

/**
 * Tramos que atraviesa una base al pasar de `baseAntes` a `baseDespues` (#279):
 * el impuesto marginal de una operación es la suma de sus cuotas. Si la base
 * baja (venta con pérdida), los tramos se devuelven con base y cuota negativas.
 */
export function desgloseMarginal(baseAntes: number, baseDespues: number, escalaOTipos: readonly number[] | Escala = TIPOS_DEFECTO): TramoMarginal[] {
  const { limites, tipos } = comoEscala(escalaOTipos);
  const lo = Math.max(0, Math.min(baseAntes, baseDespues));
  const hi = Math.max(0, Math.max(baseAntes, baseDespues));
  const sign = baseDespues >= baseAntes ? 1 : -1;
  const out: TramoMarginal[] = [];
  let anterior = 0;
  for (let i = 0; i < limites.length; i++) {
    const desde = Math.max(lo, anterior);
    const hasta = Math.min(hi, limites[i]);
    if (hasta > desde) {
      const base = hasta - desde;
      out.push({ tipo: tipos[i], desde, hasta, base: sign * base, cuota: sign * Math.round(base * tipos[i]) / 100 });
    }
    anterior = limites[i];
  }
  return out;
}
