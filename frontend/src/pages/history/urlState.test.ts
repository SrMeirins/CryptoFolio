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

describe('agrupar comisiones (#371)', () => {
  it('activado por defecto; desactivado viaja en la URL y en la API', () => {
    expect(parse('').filters.groupFees).toBe(true)
    const off = { filters: { ...EMPTY_FILTERS, groupFees: false }, sort: DEFAULT_SORT, page: 1 }
    expect(toHistoryUrl(off).toString()).toBe('comisiones=sueltas')
    expect(parse('comisiones=sueltas').filters.groupFees).toBe(false)
    expect(toApiParams(off.filters, DEFAULT_SORT, 0, 50, 'EUR').group_fees).toBe('false')
    expect(toApiParams(EMPTY_FILTERS, DEFAULT_SORT, 0, 50, 'EUR')).not.toHaveProperty('group_fees')
  })
})

describe('filtro «Editadas» (#378)', () => {
  it('se guarda en la URL como editadas=1 y llega a la API como edited=true', () => {
    const f = { ...EMPTY_FILTERS, editedOnly: true }
    const url = toHistoryUrl({ filters: f, sort: DEFAULT_SORT, page: 1 })
    expect(url.get('editadas')).toBe('1')
    expect(parseHistoryUrl(url).filters.editedOnly).toBe(true)
    expect(toApiParams(f, DEFAULT_SORT, 0, 50, 'EUR').edited).toBe('true')
  })

  it('un valor distinto de 1 no activa el filtro', () => {
    expect(parseHistoryUrl(new URLSearchParams('editadas=si')).filters.editedOnly).toBe(false)
    expect(toApiParams(EMPTY_FILTERS, DEFAULT_SORT, 0, 50, 'EUR').edited).toBeUndefined()
  })
})

// Margen en el resumen (#403): en la URL, con la última elección si no la trae.
describe('margen en la URL (#403)', () => {
  const url = (q: string, remembered = false) => parseHistoryUrl(new URLSearchParams(q), remembered).filters.includeMargin

  it('por defecto sin margen; «margen=incluido» lo incluye', () => {
    expect(url('')).toBe(false)
    expect(url('margen=incluido')).toBe(true)
    expect(url('margen=raro')).toBe(false)
  })

  it('sin parámetro usa la última elección; «excluido» la anula', () => {
    expect(url('', true)).toBe(true)
    expect(url('margen=excluido', true)).toBe(false)
  })

  it('solo se escribe cuando se incluye y nunca va a la API de la lista', () => {
    const on = { filters: { ...EMPTY_FILTERS, includeMargin: true }, sort: DEFAULT_SORT, page: 1 }
    expect(toHistoryUrl(on).get('margen')).toBe('incluido')
    expect(toHistoryUrl({ ...on, filters: EMPTY_FILTERS }).has('margen')).toBe(false)
    expect(Object.keys(toApiParams(on.filters, DEFAULT_SORT, 0, 50, 'EUR'))).not.toContain('incluir_margen')
  })
})

// Tarjeta del resumen (#407): en la URL y en la API con su criterio de margen.
describe('tarjeta del resumen en la URL (#407)', () => {
  it('se lee y se escribe como «tarjeta»; lo inválido se ignora', () => {
    expect(parseHistoryUrl(new URLSearchParams('tarjeta=ventas')).filters.card).toBe('ventas')
    expect(parseHistoryUrl(new URLSearchParams('tarjeta=otra')).filters.card).toBe('')
    const on = { filters: { ...EMPTY_FILTERS, card: 'retirado' as const }, sort: DEFAULT_SORT, page: 1 }
    expect(toHistoryUrl(on).get('tarjeta')).toBe('retirado')
  })

  it('va a la API con el margen solo si la tarjeta está puesta', () => {
    const api = (over: Partial<typeof EMPTY_FILTERS>) => toApiParams({ ...EMPTY_FILTERS, ...over }, DEFAULT_SORT, 0, 50, 'EUR')
    expect(api({ card: 'ventas' })).toMatchObject({ tarjeta: 'ventas' })
    expect(api({ card: 'ventas' })).not.toHaveProperty('incluir_margen')
    expect(api({ card: 'ventas', includeMargin: true })).toMatchObject({ tarjeta: 'ventas', incluir_margen: 'true' })
    expect(api({ includeMargin: true })).not.toHaveProperty('incluir_margen')
  })
})
