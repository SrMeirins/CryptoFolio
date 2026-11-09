import type { CarryforwardDetalle } from '../pages/fiscal/types'
import { baseTramosCompensada } from './tramosIrpf'
import { formatEur } from './format'

// Cascada «De dónde sale la cuota» (#537), en formato de extracto: de las
// ganancias y pérdidas del ejercicio a la base del ahorro, paso a paso. Sigue
// el art. 49 LIRPF igual que el backend (modules/fiscal/compensacion.ts):
// - fase 1: una pérdida neta del año no entra en la base; compensa hasta el
//   25 % de los rendimientos del mismo año y el resto pasa a los 4 siguientes;
// - fase 2: las pérdidas de años anteriores compensan las ganancias del año
//   sin límite y después los rendimientos con lo que quede del mismo 25 %.
// La base final es exactamente `baseTramosCompensada`, la misma de la cuota.

export type TipoPaso = 'suma' | 'resta' | 'total'

export interface PasoCascada {
  key: 'ganancias' | 'perdidas' | 'neto' | 'arrastre' | 'compPatrim' | 'rendimientos' | 'compRendAnio' | 'compRend' | 'base'
  label: string
  /** Importe con signo del paso; en los totales, el valor acumulado. */
  importe: number
  tipo: TipoPaso
  /** Explicación breve del ajuste, si no se entiende solo. */
  nota?: string
}

export interface Cascada {
  pasos: PasoCascada[]
  base: number
}

const EPS = 0.005

export function cascadaCuota({ ganancias, perdidas, rendimientos, cf }: {
  ganancias: number
  /** Suma de pérdidas del ejercicio, en negativo. */
  perdidas: number
  /** Rendimientos del capital mobiliario de la base del ahorro. */
  rendimientos: number
  cf?: CarryforwardDetalle
}): Cascada {
  const pasos: PasoCascada[] = []
  const mover = (key: PasoCascada['key'], label: string, importe: number, nota?: string) => {
    pasos.push({ key, label, importe, tipo: importe >= 0 ? 'suma' : 'resta', ...(nota && { nota }) })
  }
  const total = (key: PasoCascada['key'], label: string, valor: number) => {
    pasos.push({ key, label, importe: valor, tipo: 'total' })
  }

  mover('ganancias', 'Ganancias', ganancias)
  mover('perdidas', 'Pérdidas', perdidas)
  const neto = ganancias + perdidas
  total('neto', 'Neto patrimonial', neto)

  const rendNota = 'Staking e intereses de préstamos (lending).'
  if (cf) {
    const compAnio = cf.compensadoRendAnio
    const compPrevio = cf.compensadoRend - compAnio
    if (neto < -EPS) {
      const pasa = -neto - compAnio
      mover('arrastre', 'Pérdida neta del año, fuera de la base', -neto, compAnio > EPS
        ? `Compensa ${formatEur(compAnio)} de rendimientos (abajo); el resto, ${formatEur(pasa)}, pasa a los 4 ejercicios siguientes.`
        : 'Pasa entera a los 4 ejercicios siguientes.')
    }
    if (cf.compensadoPatrim > EPS) mover('compPatrim', 'Pérdidas anteriores compensadas con ganancias', -cf.compensadoPatrim, 'Pérdidas pendientes de años anteriores, sin límite.')
    mover('rendimientos', 'Rendimientos del capital mobiliario', cf.rendimientos, rendNota)
    if (compAnio > EPS) mover('compRendAnio', 'Pérdida del año compensada con rendimientos', -compAnio, 'Como máximo el 25 % de los rendimientos (art. 49 LIRPF).')
    if (compPrevio > EPS) mover('compRend', 'Pérdidas anteriores compensadas con rendimientos', -compPrevio,
      compAnio > EPS ? 'Con lo que deja libre la pérdida del año del mismo límite del 25 %.' : 'Como máximo el 25 % de los rendimientos (art. 49 LIRPF).')
  } else {
    mover('rendimientos', 'Rendimientos del capital mobiliario', rendimientos, rendNota)
  }

  // El total sale de la misma fórmula que la cuota, no de la suma acumulada.
  const base = baseTramosCompensada(cf, neto, rendimientos)
  total('base', 'Base del ahorro', base)

  return { pasos, base }
}

/** Avance del año natural (#537): día N de 365 o 366 a partir de AAAA-MM-DD. */
export function avanceAnio(hoy: string): { dia: number; dias: number; pct: number } {
  const [y, m, d] = hoy.split('-').map(Number)
  const dia = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000) + 1
  const dias = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365
  return { dia, dias, pct: (dia / dias) * 100 }
}
