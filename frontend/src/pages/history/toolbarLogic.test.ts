import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS } from './urlState'
import { quitarDelPanel, searchSuggestions, secondaryFilterCount } from './toolbarLogic'

// Barra de filtros por niveles (#414). Datos sintéticos.
const wallets = [{ id: 'w1', name: 'Exchange principal' }, { id: 'w2', name: 'Fría' }]
const assets = ['ADA', 'BTC', 'XRP', 'XLM', 'AXS']

describe('searchSuggestions (#414)', () => {
  it('primero lo que empieza por el texto, después lo que lo contiene', () => {
    // «Exchange principal» también contiene la x: va detrás de los activos.
    expect(searchSuggestions('x', assets, wallets, EMPTY_FILTERS).map(s => s.label)).toEqual(['XLM', 'XRP', 'AXS', 'Exchange principal'])
  })

  it('wallets por nombre, sin distinguir mayúsculas', () => {
    expect(searchSuggestions('fr', assets, wallets, EMPTY_FILTERS)).toEqual([{ kind: 'wallet', value: 'w2', label: 'Fría' }])
  })

  it('sin texto no sugiere, y no repite lo ya filtrado', () => {
    expect(searchSuggestions('  ', assets, wallets, EMPTY_FILTERS)).toEqual([])
    expect(searchSuggestions('x', assets, wallets, { assets: ['XRP'], wallet_id: '' }).map(s => s.label)).not.toContain('XRP')
    expect(searchSuggestions('fr', assets, wallets, { assets: [], wallet_id: 'w2' })).toEqual([])
  })

  it('como mucho 6, dejando sitio a las wallets', () => {
    const muchos = Array.from({ length: 10 }, (_, i) => `E${i}`)
    const s = searchSuggestions('e', muchos, wallets, EMPTY_FILTERS)
    expect(s).toHaveLength(6)
    expect(s.filter(x => x.kind === 'wallet')).toHaveLength(1)
  })
})

describe('secondaryFilterCount (#552)', () => {
  it('cuenta wallet, fechas exactas, importe, archivo, manuales, editadas y cuenta', () => {
    expect(secondaryFilterCount(EMPTY_FILTERS)).toBe(0)
    expect(secondaryFilterCount({ ...EMPTY_FILTERS, date_from: '2025-02-01', date_to: '2025-03-31', value_min: '5' })).toBe(2)
    expect(secondaryFilterCount({ ...EMPTY_FILTERS, manualOnly: true, editedOnly: true, import_id: 'x', account: 'Spot', wallet_id: 'w1' })).toBe(5)
  })

  it('un año completo no cuenta: se ve en el selector de la barra', () => {
    expect(secondaryFilterCount({ ...EMPTY_FILTERS, date_from: '2025-01-01', date_to: '2025-12-31' })).toBe(0)
  })

  it('los filtros de la barra no cuentan', () => {
    expect(secondaryFilterCount({ ...EMPTY_FILTERS, types: ['BUY'], assets: ['BTC'], search: 'x' })).toBe(0)
  })
})

describe('quitarDelPanel (#552)', () => {
  it('quita los del panel y conserva los de la barra y el año completo', () => {
    const f = { ...EMPTY_FILTERS, types: ['BUY'], wallet_id: 'w1', manualOnly: true, date_from: '2025-01-01', date_to: '2025-12-31', value_min: '5' }
    const r = { ...f, ...quitarDelPanel(f) }
    expect(secondaryFilterCount(r)).toBe(0)
    expect(r.types).toEqual(['BUY'])
    expect(r.date_from).toBe('2025-01-01')
  })
  it('las fechas exactas sí se quitan', () => {
    const f = { ...EMPTY_FILTERS, date_from: '2025-02-01', date_to: '2025-03-31' }
    expect({ ...f, ...quitarDelPanel(f) }.date_from).toBe('')
  })
})

