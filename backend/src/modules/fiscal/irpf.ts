// Tramos de la base del ahorro vigentes desde 2025 (Ley 7/2024). Los límites en
// euros son fijos por ley; los porcentajes son configurables en Ajustes → Fiscal
// (app_config.irpf_tramos_tipos, array JSON de 5 porcentajes) — misma fuente
// que usa el frontend.
export const TRAMOS_LIMITES = [6_000, 50_000, 200_000, 300_000, Infinity];
export const TIPOS_DEFECTO = [19, 21, 23, 27, 30];

export function parseTiposConfig(raw: string | undefined | null): number[] {
  if (!raw) return TIPOS_DEFECTO;
  try {
    const arr = JSON.parse(raw);
    if (
      Array.isArray(arr) && arr.length === TIPOS_DEFECTO.length &&
      arr.every(n => typeof n === 'number' && n > 0 && n <= 100)
    ) return arr;
  } catch { /* config corrupta → defaults */ }
  return TIPOS_DEFECTO;
}

export function calcularIrpfAhorro(base: number, tipos: number[] = TIPOS_DEFECTO): number {
  let restante = base;
  let anterior = 0;
  let cuota = 0;
  for (let i = 0; i < TRAMOS_LIMITES.length; i++) {
    if (restante <= 0) break;
    const tramo = Math.min(restante, TRAMOS_LIMITES[i] - anterior);
    cuota += tramo * (tipos[i] / 100);
    restante -= tramo;
    anterior = TRAMOS_LIMITES[i];
  }
  return cuota;
}
