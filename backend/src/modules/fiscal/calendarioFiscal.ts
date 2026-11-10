import { localDate } from '../time/localTime';
import { DEFAULT_TIMEZONE } from '../time/appTimezone';

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
  /** Renta y 721: ya presentado (#542); no cuenta como próximo plazo ni lo recuerda la campana. */
  presentado?: boolean;
}

/** Si la Renta o el 721 de un ejercicio ya están presentados (#542). */
export type Presentada = (id: HitoId, ejercicio: number) => boolean;

/** Obligación del 721 de un ejercicio; null si no se puede afirmar. */
export type Obligacion721 = (ejercicio: number) => boolean | null;

// Apertura estimada de la campaña de la Renta: principios de abril (en la de
// 2026, el 8 de abril según la AEAT). Misma referencia que tenía el Dashboard.
const RENTA_ABRE_MD = '04-08';

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

function hito(id: HitoId, ejercicio: number, hoy: string, obligado: Obligacion721, presentada: Presentada): Hito {
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
    ...(id !== 'cierre' ? { presentado: presentada(id, ejercicio) } : {}),
  };
}

/**
 * Ciclo alrededor de hoy: los tres hitos que vienen. El próximo hito (el de
 * la campana y el Dashboard) salta el 721 si consta que no hay obligación.
 */
/** Meses de la línea del ciclo fiscal (#538): el actual y los 17 siguientes. */
export const MESES_CICLO = 18;

const pad = (n: number) => String(n).padStart(2, '0');

/** Primer día del mes actual y último del mes 17 meses después (AAAA-MM-DD). */
export function ventanaCiclo(hoy: string): { desde: string; hasta: string } {
  const [y, m] = hoy.split('-').map(Number);
  const fin = new Date(Date.UTC(y, m - 1 + MESES_CICLO, 0));
  return { desde: `${y}-${pad(m)}-01`, hasta: fin.toISOString().slice(0, 10) };
}

export interface CalendarioFiscal {
  hoy: string;
  /** Los tres hitos que vienen (la línea de tiempo del Dashboard). */
  hitos: Hito[];
  proximo: Hito;
  /** Ventana de 18 meses de la línea del ciclo (#538). */
  ventana: { desde: string; hasta: string };
  /** Todos los plazos que tocan la ventana, en orden de fin. */
  ciclo: Hito[];
}

export function calendarioFiscal(now: Date = new Date(), obligado: Obligacion721 = () => null, tz: string = DEFAULT_TIMEZONE, presentada: Presentada = () => false): CalendarioFiscal {
  // Hoy en la zona de la aplicación (#388).
  const hoy = localDate(tz, now);
  const y = Number(hoy.slice(0, 4));
  const todos = [y - 1, y, y + 1].flatMap(e => (['cierre', 'modelo721', 'renta'] as const).map(id => hito(id, e, hoy, obligado, presentada)))
    .sort((a, b) => a.hasta.localeCompare(b.hasta));
  const vigentes = todos.filter(h => h.estado !== 'pasado');
  // El próximo hito salta el 721 sin obligación y lo que ya está presentado (#542).
  const proximo = vigentes.find(h => !(h.id === 'modelo721' && h.obligado === false) && !h.presentado) ?? vigentes[0];
  const ventana = ventanaCiclo(hoy);
  const ciclo = todos.filter(h => h.hasta >= ventana.desde && h.desde <= ventana.hasta);
  return { hoy, hitos: vigentes.slice(0, 3), proximo, ventana, ciclo };
}

/** Aviso para la campana: a 30 días del próximo hito (información) y a 7 (aviso). */
export function avisoCalendario(now: Date = new Date(), obligado: Obligacion721 = () => null, tz: string = DEFAULT_TIMEZONE, presentada: Presentada = () => false): { type: 'info' | 'warning'; message: string } | null {
  const { proximo } = calendarioFiscal(now, obligado, tz, presentada);
  // Nada que recordar de un plazo ya presentado (#542).
  if (proximo.diasRestantes > 30 || proximo.presentado) return null;
  const cuando = proximo.diasRestantes === 0 ? 'hoy es el último día' : `${proximo.diasRestantes === 1 ? 'queda 1 día' : `quedan ${proximo.diasRestantes} días`}`;
  const accion = proximo.id === 'cierre' ? 'Revisa el planificador antes del 31 de diciembre.'
    : proximo.id === 'modelo721' ? 'Comprueba si estás obligado a presentarlo.'
    : 'Prepara la declaración con la exportación de Fiscal.';
  return { type: proximo.diasRestantes <= 7 ? 'warning' : 'info', message: `${proximo.titulo}: ${cuando}. ${accion}` };
}
