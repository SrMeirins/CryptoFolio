// Compensación de pérdidas patrimoniales entre ejercicios (normativa española):
// las pérdidas compensan ganancias patrimoniales sin límite y rendimientos del
// capital mobiliario hasta el 25 % de los rendimientos positivos del año; las
// pendientes caducan tras los 4 ejercicios siguientes. Se consumen de más
// antigua a más nueva. Lógica pura, sin acceso a la base de datos (#305).

export interface AnioFiscal { year: number; netoGP: number; rendimientos: number }

export interface DetalleCompensacion {
  year: number;
  netoAntes: number;
  rendimientos: number;
  perdida: number;
  compensadoPatrim: number;
  compensadoRend: number;
  compensado: number;
  limiteRend25: number;
  netoDespues: number;
}

/** Una pérdida por su año de origen (#305): original = compensado + pendiente + caducado. */
export interface OrigenPerdida {
  year: number;
  original: number;
  compensadoPatrim: number;
  compensadoRend: number;
  pendiente: number;
  caducado: number;
  /** Último ejercicio en que se puede compensar (31 de diciembre de ese año). */
  caducaEn: number;
}

/** Ejercicios siguientes en que una pérdida se puede compensar. */
export const ANIOS_COMPENSACION = 4;

const EPS = 0.01;

export function compensarPerdidas(rows: readonly AnioFiscal[]): { pendienteTotal: number; detalle: DetalleCompensacion[]; origenes: OrigenPerdida[] } {
  const origenes: OrigenPerdida[] = [];
  const vivos = () => origenes.filter(o => o.pendiente > EPS);

  // Consume `importe` de las pérdidas vivas, de la más antigua a la más nueva.
  const consumir = (importe: number, campo: 'compensadoPatrim' | 'compensadoRend') => {
    let resto = importe;
    for (const o of vivos()) {
      if (resto <= 0) break;
      const c = Math.min(o.pendiente, resto);
      o.pendiente -= c;
      o[campo] += c;
      resto -= c;
    }
  };

  const detalle = rows.map(({ year, netoGP, rendimientos }) => {
    // Caducan las que ya han agotado sus 4 ejercicios siguientes.
    for (const o of origenes) {
      if (year > o.caducaEn && o.pendiente > EPS) { o.caducado += o.pendiente; o.pendiente = 0; }
    }

    const perdidaEsteAnio = netoGP < 0 ? Math.abs(netoGP) : 0;
    const gananciasPatrim = netoGP > 0 ? netoGP : 0;

    // 1. Contra las ganancias patrimoniales del año, sin límite.
    const pendienteTotalPatrim = vivos().reduce((s, o) => s + o.pendiente, 0);
    const compensadoPatrim = Math.min(pendienteTotalPatrim, gananciasPatrim);
    consumir(compensadoPatrim, 'compensadoPatrim');

    // 2. Lo que queda, contra rendimientos con el límite del 25 %.
    const limiteRendimientos = rendimientos > 0 ? rendimientos * 0.25 : 0;
    const pendienteTotalRend = vivos().reduce((s, o) => s + o.pendiente, 0);
    const compensadoRend = Math.min(pendienteTotalRend, limiteRendimientos);
    consumir(compensadoRend, 'compensadoRend');

    // La pérdida de este año queda pendiente para los siguientes.
    if (perdidaEsteAnio > EPS) {
      origenes.push({ year, original: perdidaEsteAnio, compensadoPatrim: 0, compensadoRend: 0, pendiente: perdidaEsteAnio, caducado: 0, caducaEn: year + ANIOS_COMPENSACION });
    }

    return {
      year,
      netoAntes:        netoGP,
      rendimientos,
      perdida:          perdidaEsteAnio,
      compensadoPatrim,
      compensadoRend,
      compensado:       compensadoPatrim + compensadoRend,
      limiteRend25:     limiteRendimientos,
      netoDespues:      gananciasPatrim - compensadoPatrim,
    };
  });

  // Los restos por debajo del céntimo no se arrastran.
  for (const o of origenes) if (o.pendiente <= EPS) o.pendiente = 0;
  return { pendienteTotal: origenes.reduce((s, o) => s + o.pendiente, 0), detalle, origenes };
}

/** Base del ahorro de un ejercicio tras compensar (misma fórmula que el panel Fiscal). */
export function baseAhorro(d: DetalleCompensacion): number {
  return d.netoDespues + (d.rendimientos - d.compensadoRend);
}
