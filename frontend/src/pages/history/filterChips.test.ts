import { describe, expect, it } from 'vitest'
import { activeChips, typeOptions } from './filterChips'
import { EMPTY_FILTERS } from './urlState'

const names = { wallet: () => 'Fría', importFile: () => 'archivo.csv', currencySymbol: '€' }

describe('chips de filtros activos (#366)', () => {
  it('un chip por filtro y por cada tipo o activo, cada uno sabe cómo quitarse', () => {
    const chips = activeChips({ ...EMPTY_FILTERS, types: ['BUY', 'SELL'], assets: ['BTC'], value_min: '10', value_max: '50', manualOnly: true }, names)
    expect(chips.map(c => c.label)).toEqual(['Tipo: Compra', 'Tipo: Venta', 'Activo: BTC', 'Importe: 10–50 €', 'Solo manuales'])
    expect(chips[0].clear).toEqual({ types: ['SELL'] })
    expect(chips[3].clear).toEqual({ value_min: '', value_max: '' })
  })

  it('sin filtros no hay chips', () => {
    expect(activeChips(EMPTY_FILTERS, names)).toEqual([])
  })

  it('el texto del chip conserva el HTML tal cual (React lo pinta como texto)', () => {
    expect(activeChips({ ...EMPTY_FILTERS, search: '<b>x</b>' }, names)[0].label).toBe('Busca: «<b>x</b>»')
  })
})

describe('opciones de tipo agrupadas (#366)', () => {
  it('agrupa por sentido y, si se conocen, solo ofrece los tipos presentes', () => {
    const opts = typeOptions(['SELL', 'BUY', 'FEE_EXCHANGE'])
    expect(opts.map(o => [o.value, o.group])).toEqual([['BUY', 'Compras'], ['SELL', 'Ventas'], ['FEE_EXCHANGE', 'Comisiones']])
    expect(typeOptions().length).toBeGreaterThan(20)
  })
})
