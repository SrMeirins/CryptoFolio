// Base del IRPF en la que se integra cada renta recibida en especie (#537).
// Única fuente de verdad: las consultas SQL reciben estas listas como
// parámetro (`= ANY($n)`), nunca concatenadas.
//
// - Base del ahorro, rendimientos del capital mobiliario por cesión de
//   capitales propios (art. 25.2 LIRPF): staking (DGT V1766-22) e intereses
//   de lending.
// - Base general, ganancias patrimoniales no derivadas de transmisión
//   (art. 37.1 y 45 LIRPF): airdrops (DGT V1948-21) y minería sin actividad
//   económica organizada. El cashback y los bonos se tratan igual por
//   prudencia: no hay consulta vinculante; es un criterio de la aplicación.
// Las de la base general no se compensan con las pérdidas del ahorro y su
// cuota depende del resto de ingresos, así que la app solo las informa.

export type BaseIrpf = 'ahorro' | 'general';

export const OPS_RCM_AHORRO: readonly string[] = ['STAKING_REWARD', 'LENDING_INTEREST', 'LENDING_INTEREST_LOCKED'];
export const OPS_BASE_GENERAL: readonly string[] = ['MINING_REWARD', 'CASHBACK', 'AIRDROP'];
/** Todas las rentas recibidas en especie, de una base u otra. */
export const OPS_RENTA_ESPECIE: readonly string[] = [...OPS_RCM_AHORRO, ...OPS_BASE_GENERAL];

export function baseDeRenta(operationType: string): BaseIrpf {
  return OPS_BASE_GENERAL.includes(operationType) ? 'general' : 'ahorro';
}

/** Separa una lista de rentas por base, conservando el orden. */
export function separarPorBase<T extends { base: BaseIrpf }>(rentas: readonly T[]): { ahorro: T[]; general: T[] } {
  return { ahorro: rentas.filter(r => r.base === 'ahorro'), general: rentas.filter(r => r.base === 'general') };
}

/** Título de la sección de las rentas de la base general en las exportaciones. */
export const TITULO_BASE_GENERAL = 'Ganancias no derivadas de transmisión (base general, informativo)';
