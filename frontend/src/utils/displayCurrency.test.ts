import { describe, expect, it } from 'vitest'
import {
  CURRENCY_STORAGE_KEY, parseCurrency, readStoredCurrency, resolveCurrency, writeStoredCurrency,
} from './displayCurrency'

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => { data[k] = v },
  }
}

const throwingStorage = {
  getItem: () => { throw new Error('bloqueado') },
  setItem: () => { throw new Error('bloqueado') },
}

describe('parseCurrency', () => {
  it('solo USD exacto es USD; cualquier otro valor cae en EUR', () => {
    expect(parseCurrency('USD')).toBe('USD')
    expect(parseCurrency('EUR')).toBe('EUR')
    for (const raw of ['usd', 'GBP', '', null, undefined, 1, '<script>']) expect(parseCurrency(raw)).toBe('EUR')
  })
})

describe('copia local de la preferencia', () => {
  it('escribe y vuelve a leer la moneda', () => {
    const s = memoryStorage()
    writeStoredCurrency(s, 'USD')
    expect(s.data[CURRENCY_STORAGE_KEY]).toBe('USD')
    expect(readStoredCurrency(s)).toBe('USD')
  })

  it('sin almacenamiento, vacío o con un valor manipulado: EUR', () => {
    expect(readStoredCurrency(undefined)).toBe('EUR')
    expect(readStoredCurrency(memoryStorage())).toBe('EUR')
    expect(readStoredCurrency(memoryStorage({ [CURRENCY_STORAGE_KEY]: 'JPY' }))).toBe('EUR')
  })

  it('un almacenamiento que lanza no rompe la app', () => {
    expect(readStoredCurrency(throwingStorage)).toBe('EUR')
    expect(() => writeStoredCurrency(throwingStorage, 'USD')).not.toThrow()
  })
})

describe('resolveCurrency', () => {
  it('manda app_config cuando está cargada', () => {
    expect(resolveCurrency({ display_currency: 'USD' }, 'EUR')).toBe('USD')
    expect(resolveCurrency({ display_currency: 'EUR' }, 'USD')).toBe('EUR')
  })

  it('mientras no carga, o si nunca se guardó, usa la copia local', () => {
    expect(resolveCurrency(undefined, 'USD')).toBe('USD')
    expect(resolveCurrency({ fiscal_method: 'fifo' }, 'USD')).toBe('USD')
  })
})
