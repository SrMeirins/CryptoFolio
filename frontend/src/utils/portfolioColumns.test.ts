import { describe, expect, it } from 'vitest'
import { COLUMNAS, COLUMNAS_DEFECTO, columnasVisibles, portfolioColumnas, serializarColumnas, sinLasMenosPrioritarias, valueIndex } from './portfolioColumns'

// Columnas configurables de la tabla de posiciones (#527).
describe('portfolioColumnas', () => {
  it('sin valor o con un valor inválido, las de por defecto (sin máximo de 90 días ni ingresos)', () => {
    expect(portfolioColumnas(undefined)).toEqual(COLUMNAS_DEFECTO)
    expect(COLUMNAS_DEFECTO).not.toContain('maximo90')
    expect(COLUMNAS_DEFECTO).not.toContain('ingresos')
    expect(portfolioColumnas({ portfolio_columnas: 'no-json' })).toEqual(COLUMNAS_DEFECTO)
    expect(portfolioColumnas({ portfolio_columnas: '["cantidad","<script>"]' })).toEqual(COLUMNAS_DEFECTO)
    expect(portfolioColumnas({ portfolio_columnas: '{"a":1}' })).toEqual(COLUMNAS_DEFECTO)
  })
  it('respeta la lista guardada en el orden canónico; vacía es válida', () => {
    expect(portfolioColumnas({ portfolio_columnas: '["peso","cantidad"]' })).toEqual(['cantidad', 'peso'])
    expect(portfolioColumnas({ portfolio_columnas: '[]' })).toEqual([])
  })
  it('serializa en orden canónico y sin repetidos', () => {
    expect(serializarColumnas(['ingresos', 'cantidad', 'cantidad'])).toBe('["cantidad","ingresos"]')
  })
})

describe('columnasVisibles', () => {
  const todas = COLUMNAS.map(c => c.key)
  it('en compacto sin break-even; en tablas parciales sin resultado total ni ingresos', () => {
    expect(columnasVisibles(todas, { compact: true, parcial: false }).map(c => c.key)).not.toContain('breakeven')
    const parcial = columnasVisibles(todas, { compact: false, parcial: true }).map(c => c.key)
    expect(parcial).not.toContain('resultado')
    expect(parcial).not.toContain('ingresos')
    expect(parcial).toContain('coste')
  })
  it('la cantidad no es columna propia: va bajo el activo', () => {
    expect(columnasVisibles(todas, { compact: false, parcial: false }).map(c => c.key)).not.toContain('cantidad')
  })
  it('«Valor» va tras precio y tendencia', () => {
    expect(valueIndex(columnasVisibles(todas, { compact: false, parcial: false }))).toBe(2)
    expect(valueIndex(columnasVisibles(['precio', 'coste'], { compact: false, parcial: false }))).toBe(1)
    expect(valueIndex(columnasVisibles(['coste'], { compact: false, parcial: false }))).toBe(0)
  })
})

describe('sinLasMenosPrioritarias', () => {
  const cols = columnasVisibles(COLUMNAS.map(c => c.key), { compact: false, parcial: false })
  it('oculta primero ingresos, el máximo de 90 días y la antigüedad, sin cambiar el orden', () => {
    const { visibles, ocultas } = sinLasMenosPrioritarias(cols, 3)
    expect(ocultas.map(c => c.key).sort()).toEqual(['antiguedad', 'ingresos', 'maximo90'])
    expect(visibles.map(c => c.key)).toEqual(cols.map(c => c.key).filter(k => !['antiguedad', 'ingresos', 'maximo90'].includes(k)))
  })
  it('el P&L es lo último que se oculta', () => {
    expect(sinLasMenosPrioritarias(cols, cols.length - 1).visibles.map(c => c.key)).toEqual(['pnl'])
    expect(sinLasMenosPrioritarias(cols, 0).ocultas).toEqual([])
  })
})
