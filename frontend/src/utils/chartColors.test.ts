import { describe, expect, it } from 'vitest'
import { CHART_COLOR_VARS, DARK_CHART_COLORS, readChartColors } from './chartColors'

describe('readChartColors (#197)', () => {
  it('lee cada color de su variable CSS', () => {
    const vars: Record<string, string> = Object.fromEntries(Object.values(CHART_COLOR_VARS).map(v => [v, ` ${v}-valor `]))
    const colors = readChartColors(v => vars[v])
    expect(colors.up).toBe('--cf-chart-up-valor')
    expect(colors.tooltipBg).toBe('--cf-chart-tooltip-bg-valor')
  })

  it('si una variable falta, usa el valor del tema oscuro', () => {
    expect(readChartColors(() => '')).toEqual(DARK_CHART_COLORS)
  })
})
