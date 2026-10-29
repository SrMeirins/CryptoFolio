import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2, History } from 'lucide-react'
import type { AssetMetadata } from '../../../api/portfolio'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { iconButtonClasses, tableHeadRowClasses, tableRowClasses } from '../../../components/ui'
import { alpha, ink } from '../../../utils/colors'
import { formatNumber, formatPrice, type Currency } from '../../../utils/format'
import { SOURCE_META } from './helpers'
import { PRICE_STATE_LABEL, priceState, type PriceState, type SortColumn, type SortDirection } from './assetRows'

// Tabla de Activos en Ajustes (#450): logo con su respaldo común (CryptoIcon),
// fuente y par, precio en la moneda de visualización, estado del precio y uso.
// Las columnas se ordenan desde su cabecera; editar abre el panel lateral.

const STATE_TONE: Record<PriceState, string> = {
  binance: 'bg-positive/10 text-positive-ink',
  coingecko: 'bg-accent-purple/10 text-accent-purple',
  respaldo: 'bg-warning/10 text-warning-ink',
  'sin-precio': 'bg-negative/10 text-negative-ink',
  estable: 'bg-overlay/8 text-fg-subtle',
}

const COLUMNS: Array<{ id: SortColumn; label: string; align?: 'right' }> = [
  { id: 'activo', label: 'Activo' },
  { id: 'fuente', label: 'Fuente' },
  { id: 'precio', label: 'Precio', align: 'right' },
  { id: 'estado', label: 'Estado' },
  { id: 'uso', label: 'Uso' },
]

export function AssetsTable({ assets, priceOf, currency, sort, onSort, onEdit, onDelete }: {
  assets: readonly AssetMetadata[]
  priceOf: (a: AssetMetadata) => number | null | undefined
  currency: Currency
  sort: { col: SortColumn; dir: SortDirection }
  onSort: (col: SortColumn) => void
  onEdit: (symbol: string) => void
  onDelete: (symbol: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Activos y sus precios</caption>
        <thead>
          <tr className={tableHeadRowClasses()}>
            {COLUMNS.map(c => {
              const active = sort.col === c.id
              const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
              return (
                <th key={c.id} scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`px-4 py-2.5 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  <button type="button" onClick={() => onSort(c.id)}
                    className={`inline-flex items-center gap-1 rounded hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${active ? 'text-fg' : ''}`}>
                    {c.label} <Icon size={11} aria-hidden="true" className={active ? '' : 'opacity-50'} />
                  </button>
                </th>
              )
            })}
            <th scope="col" className="px-4 py-2.5 text-right font-medium"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {assets.map(a => {
            const price = priceOf(a)
            const state = priceState(a, price)
            const src = SOURCE_META[a.price_source] ?? SOURCE_META.unknown
            const pair = a.binance_eur_pair ?? a.binance_usdt_pair ?? a.binance_btc_pair ?? (a.price_source === 'coingecko' ? a.coingecko_id : null)
            const ops = a.operaciones ?? 0
            return (
              <tr key={a.symbol} data-asset={a.symbol} className={tableRowClasses(false, false, 'group/row')}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CryptoIcon symbol={a.symbol} size={26} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold mono">{a.symbol}</span>
                        {a.auto_detected && <span className="text-[10px] px-1 rounded bg-brand/10 text-brand-ink">auto</span>}
                      </div>
                      {a.name && a.name !== a.symbol && <div className="text-xs text-fg-subtle truncate max-w-48">{a.name}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs px-2 py-0.5 rounded-md font-medium whitespace-nowrap" style={{ backgroundColor: alpha(src.color, 10), color: ink(src.color) }}>{src.label}</span>
                  {pair && <span className="block text-[11px] mono text-fg-subtle mt-0.5 truncate max-w-40">{pair}</span>}
                </td>
                <td className="px-4 py-2.5 text-right mono tabular-nums whitespace-nowrap">
                  {price != null && price > 0 ? formatPrice(price, currency) : <span className="text-fg-subtle">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-md whitespace-nowrap ${STATE_TONE[state]}`}>{PRICE_STATE_LABEL[state]}</span>
                </td>
                <td className="px-4 py-2.5 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.en_cartera && <span className="px-1.5 py-0.5 rounded-md bg-brand/10 text-brand-ink whitespace-nowrap">En cartera</span>}
                    {ops > 0
                      ? (
                        <Link to={`/history?buscar=${encodeURIComponent(a.symbol)}`}
                          className="inline-flex items-center gap-1 text-brand-ink hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand whitespace-nowrap">
                          <History size={11} aria-hidden="true" /> {formatNumber(ops, 0)} {ops === 1 ? 'operación' : 'operaciones'}
                          <span className="sr-only"> de {a.symbol} en el Historial</span>
                        </Link>
                      )
                      : !a.en_cartera && <span className="text-fg-subtle whitespace-nowrap" title="Sin operaciones: se puede borrar">Sin uso, se puede borrar</span>}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-0.5">
                    <button type="button" onClick={() => onEdit(a.symbol)} aria-label={`Editar ${a.symbol}`} className={iconButtonClasses('md')}>
                      <Pencil size={13} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onDelete(a.symbol)} aria-label={`Eliminar ${a.symbol}`} disabled={ops > 0}
                      title={ops > 0 ? 'Tiene operaciones: no se puede borrar' : undefined}
                      className={iconButtonClasses('md', false, 'disabled:opacity-30 disabled:cursor-not-allowed', 'danger')}>
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
