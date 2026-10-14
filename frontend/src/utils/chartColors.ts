// Colores de los gráficos leídos del tema activo (#197): recharts necesita los
// valores concretos (no clases), así que se leen de las variables CSS --cf-chart-*.

export const CHART_COLOR_VARS = {
  up: '--cf-chart-up',
  down: '--cf-chart-down',
  gain: '--cf-chart-gain',
  loss: '--cf-chart-loss',
  warn: '--cf-chart-warn',
  neutral: '--cf-chart-neutral',
  neutralSoft: '--cf-chart-neutral-soft',
  axis: '--cf-chart-axis',
  axisMuted: '--cf-chart-axis-muted',
  grid: '--cf-chart-grid',
  gridStrong: '--cf-chart-grid-strong',
  cursor: '--cf-chart-cursor',
  cursorSoft: '--cf-chart-cursor-soft',
  cursorLine: '--cf-chart-cursor-line',
  tooltipBg: '--cf-chart-tooltip-bg',
  tooltipBorder: '--cf-chart-tooltip-border',
  tooltipLabel: '--cf-chart-tooltip-label',
} as const

export type ChartColors = Record<keyof typeof CHART_COLOR_VARS, string>

// Valores del tema oscuro, por si las variables no están disponibles (p. ej. en tests).
export const DARK_CHART_COLORS: ChartColors = {
  up: '#0ecb81', down: '#f75369', gain: '#0ecb81', loss: '#f75369', warn: '#f59e0b',
  neutral: '#6b7280', neutralSoft: '#4b5563', axis: '#4b5563', axisMuted: '#6b7280',
  grid: 'rgba(255,255,255,0.04)', gridStrong: '#2a2d3e', cursor: 'rgba(255,255,255,0.15)',
  cursorSoft: 'rgba(255,255,255,0.03)', cursorLine: 'rgba(255,255,255,0.1)', tooltipBg: '#0f1117', tooltipBorder: 'rgba(255,255,255,0.08)',
  tooltipLabel: '#9ca3af',
}

/** Lee cada variable con `get`; si alguna falta o está vacía, usa el valor oscuro. */
export function readChartColors(get: (cssVar: string) => string): ChartColors {
  const out = {} as ChartColors
  for (const [key, cssVar] of Object.entries(CHART_COLOR_VARS) as [keyof ChartColors, string][]) {
    out[key] = get(cssVar).trim() || DARK_CHART_COLORS[key]
  }
  return out
}
