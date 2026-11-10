// Compensación de la base del ahorro (art. 49 LIRPF; manual práctico IRPF de
// la AEAT, «Integración y compensación de rentas en la base imponible del
// ahorro»). Lógica pura, sin acceso a la base de datos (#305, #537).
//
// Fase 1, el propio ejercicio: si el saldo de ganancias y pérdidas sale
// negativo, se compensa con el saldo positivo de rendimientos del capital
// mobiliario del mismo año, hasta el 25 % de ese saldo. El resto queda
// pendiente para los 4 ejercicios siguientes.
// Fase 2, ejercicios anteriores, de la pérdida más antigua a la más nueva:
// primero contra el saldo positivo de ganancias del año, sin límite; después
// contra los rendimientos, con el mismo 25 % de forma conjunta con la fase 1
// (calculado sobre los rendimientos antes de compensaciones).
// Los rendimientos del capital mobiliario son siempre positivos aquí (rentas
// recibidas a valor de mercado), así que no hay saldo negativo de rendimientos.

export interface AnioFiscal { year: number; netoGP: number; rendimientos: number }

export interface DetalleCompensacion {
  year: number;
  netoAntes: number;
  rendimientos: number;
  perdida: number;
  /** Pérdidas de años anteriores compensadas con ganancias del año. */
  compensadoPatrim: number;
  /** Total compensado con rendimientos (fase 1 más fase 2), dentro del 25 %. */
  compensadoRend: number;
  /** Parte de `compensadoRend` que es la pérdida del propio año (fase 1). */
  compensadoRendAnio: number;
  compensado: number;
  limiteRend25: number;
  netoDespues: number;
}

/** Compensación de una pérdida en un ejercicio (#541): con ganancias y con rendimientos. */
export interface Aplicacion { year: number; patrim: number; rend: number }

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
  /** Compensaciones año a año (#541): ejercicio en que se aplicó y con qué. */
  aplicaciones: Aplicacion[];
  /**
   * Pérdida del último ejercicio del cálculo, el año en curso (#534): es
   * provisional, porque aún puede compensarse con ganancias del mismo año, y
   * no cuenta en `pendienteTotal`.
   */
  provisional: boolean;
}

/** Ejercicios siguientes en que una pérdida se puede compensar. */
export const ANIOS_COMPENSACION = 4;

const EPS = 0.01;

export interface ResultadoCompensacion {
  /** Pendiente de ejercicios cerrados, sin la pérdida provisional del año en curso (#534). */
  pendienteTotal: number;
  /** Pérdida neta del año en curso, aún provisional; 0 si no hay. */
  pendienteProvisional: number;
  detalle: DetalleCompensacion[];
  origenes: OrigenPerdida[];
}

export function compensarPerdidas(rows: readonly AnioFiscal[]): ResultadoCompensacion {
  const origenes: OrigenPerdida[] = [];
  const vivos = () => origenes.filter(o => o.pendiente > EPS);

  // Anota en la pérdida lo compensado en un ejercicio (#541), sumando si ya había algo de ese año.
  const anotar = (o: OrigenPerdida, year: number, campo: 'patrim' | 'rend', c: number) => {
    const a = o.aplicaciones.find(x => x.year === year) ?? o.aplicaciones[o.aplicaciones.push({ year, patrim: 0, rend: 0 }) - 1];
    a[campo] += c;
  };

  // Consume `importe` de las pérdidas vivas, de la más antigua a la más nueva.
  const consumir = (importe: number, campo: 'compensadoPatrim' | 'compensadoRend', year: number) => {
    let resto = importe;
    for (const o of vivos()) {
      if (resto <= 0) break;
      const c = Math.min(o.pendiente, resto);
      o.pendiente -= c;
      o[campo] += c;
      if (c > 0) anotar(o, year, campo === 'compensadoPatrim' ? 'patrim' : 'rend', c);
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
    const limiteRendimientos = rendimientos > 0 ? rendimientos * 0.25 : 0;

    // Fase 1: la pérdida del propio año contra sus rendimientos, hasta el 25 %.
    const compensadoRendAnio = Math.min(perdidaEsteAnio, limiteRendimientos);

    // Fase 2a: pérdidas anteriores contra las ganancias del año, sin límite.
    const pendienteTotalPatrim = vivos().reduce((s, o) => s + o.pendiente, 0);
    const compensadoPatrim = Math.min(pendienteTotalPatrim, gananciasPatrim);
    consumir(compensadoPatrim, 'compensadoPatrim', year);

    // Fase 2b: lo que queda, contra rendimientos con lo que deje libre la fase 1 del 25 %.
    const pendienteTotalRend = vivos().reduce((s, o) => s + o.pendiente, 0);
    const compensadoRendPrevio = Math.min(pendienteTotalRend, limiteRendimientos - compensadoRendAnio);
    consumir(compensadoRendPrevio, 'compensadoRend', year);
    const compensadoRend = compensadoRendAnio + compensadoRendPrevio;

    // Lo que no se compensa de la pérdida de este año queda para los siguientes.
    if (perdidaEsteAnio > EPS) {
      origenes.push({
        year, original: perdidaEsteAnio, compensadoPatrim: 0, compensadoRend: compensadoRendAnio,
        pendiente: perdidaEsteAnio - compensadoRendAnio, caducado: 0, caducaEn: year + ANIOS_COMPENSACION, provisional: false,
        aplicaciones: compensadoRendAnio > 0 ? [{ year, patrim: 0, rend: compensadoRendAnio }] : [],
      });
    }

    return {
      year,
      netoAntes:        netoGP,
      rendimientos,
      perdida:          perdidaEsteAnio,
      compensadoPatrim,
      compensadoRend,
      compensadoRendAnio,
      compensado:       compensadoPatrim + compensadoRend,
      limiteRend25:     limiteRendimientos,
      netoDespues:      gananciasPatrim - compensadoPatrim,
    };
  });

  // Los restos por debajo del céntimo no se arrastran.
  for (const o of origenes) if (o.pendiente <= EPS) o.pendiente = 0;
  // La del último ejercicio (el año en curso) es provisional y va aparte (#534).
  const ultimo = rows.at(-1)?.year;
  for (const o of origenes) o.provisional = o.year === ultimo;
  const suma = (provisional: boolean) => origenes.filter(o => o.provisional === provisional).reduce((s, o) => s + o.pendiente, 0);
  return { pendienteTotal: suma(false), pendienteProvisional: suma(true), detalle, origenes };
}

/** Base del ahorro de un ejercicio tras compensar (misma fórmula que el panel Fiscal). */
export function baseAhorro(d: DetalleCompensacion): number {
  return d.netoDespues + (d.rendimientos - d.compensadoRend);
}
