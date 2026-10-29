// Escalas oficiales de la base liquidable del ahorro por ejercicio (#452):
// tipo combinado estatal + autonómico de territorio común (las dos partes
// suman lo mismo en cada tramo). Verificadas en los manuales de la Renta de la
// Agencia Tributaria (gravamen de la base liquidable del ahorro) de cada año:
// - hasta 2020: 19 / 21 / 23 (último tramo desde 50.000 €)
// - 2021 y 2022 (Ley 11/2020): nuevo tramo del 26 % desde 200.000 €
// - 2023 y 2024 (Ley 31/2022): 27 % de 200.000 a 300.000 € y 28 % desde 300.000 €
// - desde 2025 (Ley 7/2024): el último tramo sube al 30 %
// Los años anteriores a 2016 (otra escala) usan la de 2016 a 2020: la app no
// tiene datos de entonces. Los límites en euros son fijos por ley; los tipos se
// pueden cambiar a mano por ejercicio (tabla irpf_escalas).

export interface Escala { limites: readonly number[]; tipos: readonly number[] }

const OFICIALES: ReadonlyArray<{ desde: number; escala: Escala }> = Object.freeze([
  { desde: 2025, escala: { limites: [6_000, 50_000, 200_000, 300_000, Infinity], tipos: [19, 21, 23, 27, 30] } },
  { desde: 2023, escala: { limites: [6_000, 50_000, 200_000, 300_000, Infinity], tipos: [19, 21, 23, 27, 28] } },
  { desde: 2021, escala: { limites: [6_000, 50_000, 200_000, Infinity], tipos: [19, 21, 23, 26] } },
  { desde: 0, escala: { limites: [6_000, 50_000, Infinity], tipos: [19, 21, 23] } },
]);

/** Escala oficial del ahorro de un ejercicio. */
export function escalaOficial(ejercicio: number): Escala {
  return OFICIALES.find(o => ejercicio >= o.desde)!.escala;
}

/** Tipos válidos para la escala de un ejercicio: uno por tramo, mayores que 0 y hasta 100. */
export function tiposValidos(ejercicio: number, tipos: unknown): tipos is number[] {
  return Array.isArray(tipos) && tipos.length === escalaOficial(ejercicio).tipos.length
    && tipos.every(t => typeof t === 'number' && Number.isFinite(t) && t > 0 && t <= 100);
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ tipos: string[] | number[] }> }> };

/** Escala del ejercicio: la oficial con los tipos cambiados a mano, si los hay y siguen siendo válidos. */
export async function escalaDe(db: Queryable, ejercicio: number): Promise<Escala & { personalizada: boolean }> {
  const oficial = escalaOficial(ejercicio);
  const row = (await db.query('SELECT tipos FROM irpf_escalas WHERE ejercicio = $1', [ejercicio])).rows[0];
  const tipos = row ? row.tipos.map(Number) : null;
  return tipos && tiposValidos(ejercicio, tipos)
    ? { limites: oficial.limites, tipos, personalizada: true }
    : { ...oficial, personalizada: false };
}
