import { describe, expect, it } from 'vitest'
import { buildRows, groupState, summaryLabel, toggleGroup, toggleValue } from './multiSelectLogic'

const OPTS = [
  { value: 'BUY', label: 'Compra', group: 'Compras' },
  { value: 'BUY_FIAT', label: 'Compra EUR', group: 'Compras' },
  { value: 'SELL', label: 'Venta', group: 'Ventas' },
]

describe('selección múltiple (#366)', () => {
  it('marca y desmarca valores', () => {
    expect(toggleValue(['BUY'], 'SELL')).toEqual(['BUY', 'SELL'])
    expect(toggleValue(['BUY', 'SELL'], 'BUY')).toEqual(['SELL'])
  })

  it('estado y alternancia de un grupo entero', () => {
    expect(groupState([], OPTS, 'Compras')).toBe('none')
    expect(groupState(['BUY'], OPTS, 'Compras')).toBe('some')
    expect(groupState(['BUY', 'BUY_FIAT'], OPTS, 'Compras')).toBe('all')
    expect(toggleGroup(['SELL', 'BUY'], OPTS, 'Compras')).toEqual(['SELL', 'BUY', 'BUY_FIAT'])
    expect(toggleGroup(['SELL', 'BUY', 'BUY_FIAT'], OPTS, 'Compras')).toEqual(['SELL'])
  })

  it('cabecera de grupo antes de sus opciones solo si los grupos son seleccionables', () => {
    expect(buildRows(OPTS, true).map(r => (r.kind === 'group' ? `#${r.group}` : r.option.value))).toEqual(['#Compras', 'BUY', 'BUY_FIAT', '#Ventas', 'SELL'])
    expect(buildRows(OPTS, false).every(r => r.kind === 'option')).toBe(true)
  })

  it('texto del disparador', () => {
    expect(summaryLabel([], OPTS, 'Todos los tipos')).toBe('Todos los tipos')
    expect(summaryLabel(['SELL'], OPTS, 'Todos')).toBe('Venta')
    expect(summaryLabel(['SELL', 'BUY'], OPTS, 'Todos')).toBe('2 seleccionados')
    expect(summaryLabel(['SELL', 'BUY'], OPTS, 'Todos', 'tipos')).toBe('2 tipos')
  })
})
