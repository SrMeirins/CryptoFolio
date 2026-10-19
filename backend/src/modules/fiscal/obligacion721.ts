import { getUmbral721, sumaValorCustodiaExchange, valorizarLotesEnFecha } from './lotesValoracion';
import { endOfYearMadrid, madridDate, madridYearMonth } from './madridTime';
import type { Obligacion721 } from './calendarioFiscal';

// Obligación del Modelo 721 para el calendario fiscal (#309): la del ejercicio
// anterior (valor a 31 de diciembre) y la estimada del actual (valor de hoy).
// Valorar la cartera cuesta precios históricos y la campana consulta cada
// minuto: se calcula como mucho una vez al día.

let cache: { dia: string; valor: Promise<Map<number, boolean | null>> } | null = null;

async function obligacionA(fecha: Date): Promise<boolean | null> {
  const { activos, preciosPendientes } = await valorizarLotesEnFecha(fecha);
  const supera = sumaValorCustodiaExchange(activos) > await getUmbral721();
  // Con precios pendientes el valor es un mínimo: si ya supera, la obligación es segura.
  return supera ? true : preciosPendientes.length > 0 ? null : false;
}

export async function obligaciones721(now: Date = new Date()): Promise<Obligacion721> {
  const dia = madridDate(now);
  if (!cache || cache.dia !== dia) {
    const y = madridYearMonth(now).year;
    const valor = Promise.all([obligacionA(endOfYearMadrid(y - 1)), obligacionA(now)])
      .then(([anterior, actual]) => new Map([[y - 1, anterior], [y, actual]]));
    // Si falla, no se queda en caché: el siguiente intento lo repite.
    valor.catch(() => { if (cache?.valor === valor) cache = null; });
    cache = { dia, valor };
  }
  const map = await cache.valor;
  return ejercicio => map.get(ejercicio) ?? null;
}

/** Solo para tests. */
export function resetObligaciones721Cache(): void {
  cache = null;
}
