import { getUmbral721, sumaValorCustodiaExchange, valorizarLotesEnFecha } from './lotesValoracion';
import { obligacion721 } from './declaraciones';
import { ultimaPresentacion721 } from './declaracionesRepo';
import { endOfYearMadrid, madridDate, madridYearMonth } from './madridTime';
import type { Obligacion721 } from './calendarioFiscal';

// Obligación del Modelo 721 para el calendario fiscal (#309): la del ejercicio
// anterior (valor a 31 de diciembre) y la estimada del actual (valor de hoy).
// Valorar la cartera cuesta precios históricos y la campana consulta cada
// minuto: se calcula como mucho una vez al día.

let cache: { dia: string; valor: Promise<Map<number, boolean | null>> } | null = null;
// Marcar o desmarcar un 721 cambia la regla: los endpoints de declaraciones vacían la caché.

async function obligacionA(ejercicio: number, fecha: Date): Promise<boolean | null> {
  const { activos, preciosPendientes } = await valorizarLotesEnFecha(fecha);
  // Regla del incremento de 20.000 € respecto al último 721 presentado (#311).
  const supera = obligacion721(sumaValorCustodiaExchange(activos), await getUmbral721(), await ultimaPresentacion721(ejercicio));
  // Con precios pendientes el valor es un mínimo: si ya supera, la obligación es segura.
  return supera ? true : preciosPendientes.length > 0 ? null : false;
}

export async function obligaciones721(now: Date = new Date()): Promise<Obligacion721> {
  const dia = madridDate(now);
  if (!cache || cache.dia !== dia) {
    const y = madridYearMonth(now).year;
    const valor = Promise.all([obligacionA(y - 1, endOfYearMadrid(y - 1)), obligacionA(y, now)])
      .then(([anterior, actual]) => new Map([[y - 1, anterior], [y, actual]]));
    // Si falla, no se queda en caché: el siguiente intento lo repite.
    valor.catch(() => { if (cache?.valor === valor) cache = null; });
    cache = { dia, valor };
  }
  const map = await cache.valor;
  return ejercicio => map.get(ejercicio) ?? null;
}

/** Vacía la caché: al marcar o quitar un 721 presentado, y en tests. */
export function resetObligaciones721Cache(): void {
  cache = null;
}
