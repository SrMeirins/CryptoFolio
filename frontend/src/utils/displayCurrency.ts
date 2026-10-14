import type { Currency } from './format'

// Preferencia de moneda de visualización (#176). La fuente de verdad es la
// clave `display_currency` de app_config; localStorage guarda una copia para
// pintar ya en la moneda correcta al arrancar, antes de que llegue la config.

export const DISPLAY_CURRENCY_KEY = 'display_currency'
export const CURRENCY_STORAGE_KEY = 'cflio_display_currency'
export const CURRENCIES: readonly Currency[] = ['EUR', 'USD']

export const CURRENCY_TOOLTIP =
  'Moneda de visualización. El dólar se toma del precio de USDT (tipo de cada fecha). Fiscal siempre en EUR.'

/** Valor guardado → moneda válida; cualquier otro valor cae en EUR. */
export function parseCurrency(raw: unknown): Currency {
  return raw === 'USD' ? 'USD' : 'EUR'
}

/** Copia local de la preferencia; EUR si no hay o el almacenamiento no está disponible. */
export function readStoredCurrency(storage: Pick<Storage, 'getItem'> | undefined): Currency {
  try {
    return parseCurrency(storage?.getItem(CURRENCY_STORAGE_KEY))
  } catch {
    return 'EUR'
  }
}

export function writeStoredCurrency(storage: Pick<Storage, 'setItem'> | undefined, currency: Currency): void {
  try {
    storage?.setItem(CURRENCY_STORAGE_KEY, currency)
  } catch {
    // Almacenamiento bloqueado (modo privado, cuota): la preferencia sigue en app_config.
  }
}

/** Moneda efectiva: la de app_config si ya se cargó; si no, la copia local. */
export function resolveCurrency(config: Record<string, string> | undefined, stored: Currency): Currency {
  const raw = config?.[DISPLAY_CURRENCY_KEY]
  return raw === undefined ? stored : parseCurrency(raw)
}
