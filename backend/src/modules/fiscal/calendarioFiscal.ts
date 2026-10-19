import { madridDate } from './madridTime';

// Calendario fiscal (#309): cierre del ejercicio, Modelo 721 y campaña de la
// Renta, en hora de Madrid. Lógica pura con `now` como parámetro; la usan el
// endpoint del calendario y el aviso de la campana, para que Fiscal,
// Dashboard y campana muestren siempre el mismo hito.

export type HitoId = 'cierre' | 'modelo721' | 'renta';
export type EstadoHito = 'pasado' | 'en-curso' | 'proximo';

export interface Hito {
  id: HitoId;
  /** Ejercicio al que se refiere (la Renta de 2025 se presenta en 2026). */
  ejercicio: number;
  titulo: string;
  /** Inicio y fin del plazo (AAAA-MM-DD, día de Madrid). */
  desde: string;
  hasta: string;
  /** La AEAT publica cada año el día exacto de inicio de la campaña de la Renta. */
  inicioAproximado: boolean;
  estado: EstadoHito;
  /** Días hasta el fin del plazo (0 = hoy es el último día); negativo si ya pasó. */
  diasRestantes: number;
  /** Días hasta que abre el plazo (0 si ya está abierto). */
  diasParaAbrir: number;
  /** % del plazo transcurrido (0 si no ha abierto). */
  progreso: number;
  /** Solo el 721: si hay obligación (null si no se sabe, p. ej. faltan precios). */
  obligado?: boolean | null;
}

/** Obligación del 721 de un ejercicio; null si no se puede afirmar. */
export type Obligacion721 = (ejercicio: number) => boolean | null;

// Apertura estimada de la campaña de la Renta: principios de abril (en la de
// 2026, el 8 de abril según la AEAT). Misma referencia que tenía el Dashboard.
const RENTA_ABRE_MD = '04-08';

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

function hito(id: HitoId, ejercicio: number, hoy: string, obligado: Obligacion721): Hito {
  const [titulo, desde, hasta, inicioAproximado] =
    id === 'cierre' ? [`Cierre del ejercicio ${ejercicio}`, `${ejercicio}-01-01`, `${ejercicio}-12-31`, false]
    : id === 'modelo721' ? [`Modelo 721 de ${ejercicio}`, `${ejercicio + 1}-01-01`, `${ejercicio + 1}-03-31`, false]
    : [`Renta de ${ejercicio}`, `${ejercicio + 1}-${RENTA_ABRE_MD}`, `${ejercicio + 1}-06-30`, true];
  const estado: EstadoHito = hoy < desde ? 'proximo' : hoy > hasta ? 'pasado' : 'en-curso';
  const largo = dayNumber(hasta) - dayNumber(desde);
  return {
    id, ejercicio, titulo, desde, hasta, inicioAproximado, estado,
    diasRestantes: dayNumber(hasta) - dayNumber(hoy),
    diasParaAbrir: Math.max(0, dayNumber(desde) - dayNumber(hoy)),
    progreso: estado === 'en-curso' && largo > 0 ? Math.min(100, ((dayNumber(hoy) - dayNumber(desde)) / largo) * 100) : 0,
    ...(id === 'modelo721' ? { obligado: obligado(ejercicio) } : {}),
  };
}

/**
 * Ciclo alrededor de hoy: los tres hitos que vienen. El próximo hito (el de
 * la campana y el Dashboard) salta el 721 si consta que no hay obligación.
 */
export function calendarioFiscal(now: Date = new Date(), obligado: Obligacion721 = () => null): { hoy: string; hitos: Hito[]; proximo: Hito } {
  const hoy = madridDate(now);
  const y = Number(hoy.slice(0, 4));
  const todos = [hito('modelo721', y - 1, hoy, obligado), hito('renta', y - 1, hoy, obligado), hito('cierre', y, hoy, obligado), hito('modelo721', y, hoy, obligado), hito('renta', y, hoy, obligado)];
  const vigentes = todos.filter(h => h.estado !== 'pasado').sort((a, b) => a.hasta.localeCompare(b.hasta));
  const proximo = vigentes.find(h => !(h.id === 'modelo721' && h.obligado === false)) ?? vigentes[0];
  return { hoy, hitos: vigentes.slice(0, 3), proximo };
}

/** Aviso para la campana: a 30 días del próximo hito (información) y a 7 (aviso). */
export function avisoCalendario(now: Date = new Date(), obligado: Obligacion721 = () => null): { type: 'info' | 'warning'; message: string } | null {
  const { proximo } = calendarioFiscal(now, obligado);
  if (proximo.diasRestantes > 30) return null;
  const cuando = proximo.diasRestantes === 0 ? 'hoy es el último día' : `${proximo.diasRestantes === 1 ? 'queda 1 día' : `quedan ${proximo.diasRestantes} días`}`;
  const accion = proximo.id === 'cierre' ? 'Revisa el planificador antes del 31 de diciembre.'
    : proximo.id === 'modelo721' ? 'Comprueba si estás obligado a presentarlo.'
    : 'Prepara la declaración con la exportación de Fiscal.';
  return { type: proximo.diasRestantes <= 7 ? 'warning' : 'info', message: `${proximo.titulo}: ${cuando}. ${accion}` };
}
