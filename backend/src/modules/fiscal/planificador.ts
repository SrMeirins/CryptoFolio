import type { Escala } from './escalasAhorro';
import { calcularIrpfAhorro } from './irpf';
import { baseAhorro, compensarPerdidas, type AnioFiscal } from './compensacion';

// Planificador de fin de año (#307). Lógica pura, sin base de datos: la
// cuota del ejercicio en curso si se realiza una ganancia (o pérdida)
// adicional, con la misma compensación entre años e IRPF que el simulador de
// venta, y el «colchón»: la ganancia máxima que no aumenta la cuota.

/** Base del ahorro del año `year` con un neto adicional. */
function baseConExtra(anios: readonly AnioFiscal[], year: number, extra: number): number {
  const conExtra = anios.map(a => (a.year === year ? { ...a, netoGP: a.netoGP + extra } : a));
  return Math.max(0, baseAhorro(compensarPerdidas(conExtra).detalle.at(-1)!));
}

/** Cuota del ahorro del año `year` (al céntimo) si se añade `extra` al neto de ganancias y pérdidas. */
export function cuotaConExtra(anios: readonly AnioFiscal[], year: number, tipos: readonly number[] | Escala, extra: number): number {
  return Math.round(calcularIrpfAhorro(baseConExtra(anios, year, extra), tipos) * 100) / 100;
}

/**
 * Ganancia máxima realizable este año sin que suba la cuota. La cuota no
 * baja al añadir ganancia, así que basta una bisección. Con rendimientos en el
 * año, las pérdidas pendientes que hoy compensan el 25 % de ellos pasan a
 * compensar la ganancia, y la cuota puede empezar a subir antes de agotarlas.
 */
export function colchonSinTributar(anios: readonly AnioFiscal[], year: number): number {
  // Se compara la base, no la cuota: la cuota se redondea al céntimo y unos
  // céntimos de ganancia parecerían gratis. Si la base no sube, la cuota tampoco.
  const base = baseConExtra(anios, year, 0);
  const sube = (g: number) => baseConExtra(anios, year, g) > base + 1e-9;
  if (sube(0.01)) return 0;
  // Cota superior: todo lo que podría absorber ganancias (pérdidas del año y pendientes) más un margen.
  const { origenes } = compensarPerdidas(anios);
  const actual = anios.find(a => a.year === year);
  let hi = origenes.reduce((s, o) => s + o.pendiente, 0) + Math.abs(Math.min(0, actual?.netoGP ?? 0)) + Math.max(0, actual?.rendimientos ?? 0) + 1;
  while (!sube(hi)) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (sube(mid)) hi = mid; else lo = mid;
  }
  return Math.floor(lo * 100) / 100;
}
