import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, parseHistoryUrl, toApiParams, toHistoryUrl } from './urlState'
import { DEFAULT_SORT } from './sorting'

const parse = (qs: string) => parseHistoryUrl(new URLSearchParams(qs))

describe('estado del Historial en la URL (#366)', () => {
  it('ida y vuelta: la URL restaura filtros, orden y página', () => {
    const state = {
      filters: { ...EMPTY_FILTERS, search: 'nota', types: ['BUY', 'SELL'], assets: ['BTC', 'XRP'], account: 'Spot',
        date_from: '2025-01-01', date_to: '2025-12-31', manualOnly: true, value_min: '10', value_max: '500.5',
        wallet_id: '7f3a1c2e-1b2c-4d5e-8f90-123456789abc', import_id: '8f3a1c2e-1b2c-4d5e-8f90-123456789abc' },
      sort: { key: 'valor' as const, dir: 'asc' as const },
      page: 3,
    }
    expect(parse(toHistoryUrl(state).toString())).toEqual(state)
  })

  it('sin filtros la URL queda vacía', () => {
    expect(toHistoryUrl({ filters: EMPTY_FILTERS, sort: DEFAULT_SORT, page: 1 }).toString()).toBe('')
  })

  it('los enlaces antiguos siguen funcionando (?buscar=, ?import=)', () => {
    const r = parse('buscar=XRP&import=8f3a1c2e-1b2c-4d5e-8f90-123456789abc')
    expect(r.filters.search).toBe('XRP')
    expect(r.filters.import_id).toBe('8f3a1c2e-1b2c-4d5e-8f90-123456789abc')
  })

  it('ignora en silencio los valores manipulados o inválidos', () => {
    const r = parse("tipo=BUY,FOO,' OR 1=1&activo=btc,<script>,xrp&wallet=abc&desde=2025-02-30&min=-5&max=1e9&orden=notes&dir=x&pagina=-2&manuales=si")
    expect(r.filters.types).toEqual(['BUY'])
    expect(r.filters.assets).toEqual(['BTC', 'XRP'])
    expect(r.filters).toMatchObject({ wallet_id: '', date_from: '', value_min: '', value_max: '', manualOnly: false })
    expect(r.sort).toEqual(DEFAULT_SORT)
    expect(r.page).toBe(1)
  })

  it('rangos invertidos: descarta el extremo superior; listas de más de 30 se recortan', () => {
    const r = parse(`desde=2025-05-01&hasta=2025-01-01&min=100&max=10&activo=${Array.from({ length: 40 }, (_, i) => `A${i}`).join(',')}`)
    expect(r.filters).toMatchObject({ date_from: '2025-05-01', date_to: '', value_min: '100', value_max: '' })
    expect(r.filters.assets).toHaveLength(30)
  })

  it('la API recibe USD sin rango de importe y la moneda de visualización con rango', () => {
    expect(toApiParams(EMPTY_FILTERS, DEFAULT_SORT, 0, 50, 'EUR').currency).toBe('USD')
    const ranged = toApiParams({ ...EMPTY_FILTERS, value_min: '10', types: ['BUY', 'SELL'] }, DEFAULT_SORT, 50, 50, 'EUR')
    expect(ranged).toMatchObject({ currency: 'EUR', value_min: '10', type: 'BUY,SELL', offset: '50' })
  })
})
