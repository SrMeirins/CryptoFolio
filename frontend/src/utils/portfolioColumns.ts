import type { SortKey } from './assetTable'

// Columnas configurables de la tabla de posiciones (#527). «Activo» y «Valor»
// se ven siempre; el resto se elige en Portfolio o en Ajustes y se guarda en
// app_config (portfolio_columnas, validada en el backend con la misma lista).

export const PORTFOLIO_COLUMNAS_KEY = 'portfolio_columnas'

export type ColumnKey =
  | 'cantidad' | 'precio' | 'tendencia' | 'coste' | 'pnl' | 'resultado'
  | 'breakeven' | 'antiguedad' | 'peso' | 'maximo90' | 'ingresos'

export interface ColumnDef {
  key: ColumnKey
  label: string
  /** Texto de ayuda de la cabecera. */
  hint?: string
  /** Clave de orden; sin ella, la cabecera no ordena. */
  sort?: SortKey
  /** Depende de todo el activo (ventas y rentas): no se muestra en tablas parciales. */
  global?: boolean
  /** Se oculta en la densidad compacta. */
  hideCompact?: boolean
  /** No es columna propia: se pinta bajo el nombre del activo (#527). */
  enActivo?: boolean
  /** Orden en que se ocultan las columnas cuando no caben: menor, antes. */
  prioridad: number
}

/** Orden de pintado; «Valor» va entre la tendencia y el coste. */
export const COLUMNAS: readonly ColumnDef[] = [
  { key: 'cantidad', label: 'Cantidad', sort: 'quantity', enActivo: true, prioridad: 99 },
  { key: 'precio', label: 'Precio', sort: 'price', prioridad: 8 },
  { key: 'tendencia', label: '7 d', hint: 'Tendencia de los últimos 7 días', prioridad: 3 },
  { key: 'coste', label: 'Coste', sort: 'cost', hint: 'Lo que costaron las unidades que sigues teniendo, según el FIFO', prioridad: 5 },
  { key: 'pnl', label: 'P&L', sort: 'pnl', hint: 'P&L no realizado en importe y %', prioridad: 10 },
  { key: 'resultado', label: 'Resultado total', sort: 'resultado', global: true, prioridad: 7,
    hint: 'P&L no realizado más lo ya realizado con ese activo (ventas, permutas y comisiones pagadas con él). Lo realizado se calcula en euros y se convierte al cambio de hoy; el desglose, en el globo de cada importe.' },
  { key: 'breakeven', label: 'Break-even', sort: 'breakeven', hideCompact: true, prioridad: 6,
    hint: 'Precio medio de compra y distancia del precio actual. La subida para recuperar es mayor que la caída: tras caer un 50 %, hace falta subir un 100 %.' },
  { key: 'antiguedad', label: 'Antigüedad', sort: 'antiguedad', hint: 'Desde la compra más antigua que sigues teniendo', prioridad: 2 },
  { key: 'maximo90', label: 'Desde máx. 90 d', sort: 'maximo90', hint: 'Distancia del precio actual al cierre diario más alto de los últimos 90 días', prioridad: 1 },
  { key: 'ingresos', label: 'Ingresos', sort: 'ingresos', global: true, prioridad: 0,
    hint: 'Todo lo recibido de ese activo como renta (staking, airdrops, recompensas...), valorado al recibirlo y convertido al cambio de hoy' },
  { key: 'peso', label: '% cartera', sort: 'weight', prioridad: 4 },
]

/** Visibles por defecto: todas salvo las opcionales (máximo de 90 días e ingresos). */
export const COLUMNAS_DEFECTO: readonly ColumnKey[] = COLUMNAS.map(c => c.key).filter(k => k !== 'maximo90' && k !== 'ingresos')

const KNOWN = new Set<string>(COLUMNAS.map(c => c.key))

/** Columnas guardadas; si faltan o no son válidas, las de por defecto. Una lista vacía es válida. */
export function portfolioColumnas(config: Readonly<Record<string, string>> | undefined): ColumnKey[] {
  const raw = config?.[PORTFOLIO_COLUMNAS_KEY]
  if (!raw) return [...COLUMNAS_DEFECTO]
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(v => typeof v === 'string' && KNOWN.has(v))) return [...COLUMNAS_DEFECTO]
    return COLUMNAS.map(c => c.key).filter(k => parsed.includes(k))
  } catch (e) {
    if (e instanceof SyntaxError) return [...COLUMNAS_DEFECTO]
    throw e
  }
}

/** Valor a guardar: en el orden canónico y sin repetidos. */
export function serializarColumnas(cols: readonly ColumnKey[]): string {
  return JSON.stringify(COLUMNAS.map(c => c.key).filter(k => cols.includes(k)))
}

/** Columnas propias que pinta una tabla concreta (la cantidad va bajo el activo). */
export function columnasVisibles(cols: readonly ColumnKey[], opts: { compact: boolean; parcial: boolean }): ColumnDef[] {
  return COLUMNAS.filter(c => cols.includes(c.key) && !c.enActivo && !(opts.compact && c.hideCompact) && !(opts.parcial && c.global))
}

/** Quita las `n` columnas de menor prioridad (las que no caben, #527); conserva el orden. */
export function sinLasMenosPrioritarias(cols: readonly ColumnDef[], n: number): { visibles: ColumnDef[]; ocultas: ColumnDef[] } {
  if (n <= 0) return { visibles: [...cols], ocultas: [] }
  const fuera = new Set([...cols].sort((a, b) => a.prioridad - b.prioridad).slice(0, n).map(c => c.key))
  return { visibles: cols.filter(c => !fuera.has(c.key)), ocultas: cols.filter(c => fuera.has(c.key)) }
}

const ANTES_DEL_VALOR = new Set<ColumnKey>(['precio', 'tendencia'])

/** Posición de «Valor» entre las columnas visibles: tras precio y tendencia. */
export function valueIndex(cols: readonly ColumnDef[]): number {
  return cols.filter(c => ANTES_DEL_VALOR.has(c.key)).length
}
