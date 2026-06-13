import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, Transaction } from '../api/portfolio'
import {
  Search, ChevronLeft, ChevronRight, X, RefreshCw,
  Trash2, AlertTriangle, PenLine, Download, ChevronDown,
  TrendingUp, TrendingDown, Zap, Calendar,
  ChevronUp, BarChart2, Package, ArrowUpDown, ArrowUp, ArrowDown,
  Copy, Check, ArrowRight,
} from 'lucide-react'
import { useToast } from '../components/Toast'
import { ManualTxModal } from '../components/ManualTxModal'
import { DateRangePicker } from '../components/DateRangePicker'
import { formatEur, formatPrice } from '../utils/format'
import { OP_META } from '../constants/operations'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const CARD_META = {
  invested: { icon: TrendingUp,   iconColor: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)'  },
  ops:      { icon: BarChart2,    iconColor: '#6366f1', bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.2)'  },
  fees:     { icon: Zap,          iconColor: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)'  },
  sells:    { icon: TrendingDown, iconColor: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)'   },
}

type SortKey = 'fecha' | 'eur' | 'activo'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 50

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtAmount(n: string | null | number, decimals = 6): string {
  if (n === null || n === undefined || n === '') return '—'
  const v = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(v)) return '—'
  if (Math.abs(v) >= 1_000_000) return v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
  if (Math.abs(v) >= 1000)      return v.toLocaleString('es-ES', { maximumFractionDigits: 2 })
  if (Math.abs(v) >= 1)         return v.toFixed(4)
  return v.toFixed(decimals)
}

function fmtDate(ts: string): { date: string; time: string } {
  const d = new Date(ts)
  return {
    date: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' }),
    time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
  }
}

function fmtDateGroup(ts: string): string {
  return new Date(ts).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtMonthLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

function calcEurValue(tx: Transaction): number | null {
  if (tx.cost_asset === 'EUR' && tx.cost_amount) return Math.abs(parseFloat(tx.cost_amount))
  if (tx.price_per_unit && tx.amount_net) {
    const p = parseFloat(tx.price_per_unit), a = Math.abs(parseFloat(tx.amount_net))
    if (!isNaN(p) && !isNaN(a) && p > 0 && a > 0) return p * a
  }
  return null
}

function calcFeeEur(tx: Transaction): number | null {
  if (!tx.fee_amount || !tx.fee_asset) return null
  const amt = parseFloat(tx.fee_amount)
  if (isNaN(amt) || amt <= 0) return null
  if (tx.fee_asset === 'EUR') return amt
  if (tx.fee_asset === tx.asset && tx.price_per_unit) {
    const p = parseFloat(tx.price_per_unit)
    if (!isNaN(p) && p > 0) return amt * p
  }
  return null
}

// Atajo de fecha
function dateShortcut(mode: 'today' | 'month' | 'year'): { date_from: string; date_to: string } {
  const now  = new Date()
  const pad  = (n: number) => String(n).padStart(2, '0')
  const ymd  = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (mode === 'today') {
    const s = ymd(now)
    return { date_from: s, date_to: s }
  }
  if (mode === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return { date_from: ymd(from), date_to: ymd(now) }
  }
  // year
  return { date_from: `${now.getFullYear()}-01-01`, date_to: ymd(now) }
}

// ── Highlight ─────────────────────────────────────────────────────────────
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent-amber/30 text-white rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

// ── CopyButton ────────────────────────────────────────────────────────────
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="ml-1 text-gray-700 hover:text-gray-400 transition-colors inline-flex items-center"
      title="Copiar ID"
    >
      {copied ? <Check size={10} className="text-accent-green" /> : <Copy size={10} />}
    </button>
  )
}

// ── SortIcon ─────────────────────────────────────────────────────────────
function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown size={10} className="text-gray-700 ml-1" />
  return sortDir === 'asc'
    ? <ArrowUp size={10} className="text-accent-blue ml-1" />
    : <ArrowDown size={10} className="text-accent-blue ml-1" />
}

// ── Logo de activo ─────────────────────────────────────────────────────────
function AssetLogo({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const [ok, setOk] = useState(true)
  if (ok) {
    return (
      <img
        src={`https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`}
        alt={symbol} width={size} height={size}
        className="rounded-full shrink-0"
        onError={() => setOk(false)}
      />
    )
  }
  return (
    <div
      className="rounded-full bg-background-tertiary flex items-center justify-center font-bold text-gray-400 shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {symbol.slice(0, 2)}
    </div>
  )
}

// ── Chip de operación ──────────────────────────────────────────────────────
function OpChip({ type }: { type: string }) {
  const meta = OP_META[type] ?? { label: type, color: '#6b7280' }
  return (
    <span
      className="inline-flex items-center font-semibold rounded-md text-[10px] px-1.5 py-0.5 whitespace-nowrap shrink-0"
      style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
    >
      {meta.label}
    </span>
  )
}

// ── Chart tooltip ──────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number; name?: string }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-background-card border border-border rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400 mb-1 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-white mono">{p.name}: <span className="font-bold">{p.value}</span></p>
      ))}
    </div>
  )
}

// ── Stats bar ──────────────────────────────────────────────────────────────
function StatsBar({ stats }: {
  stats: {
    totals: {
      total_ops: number; unique_assets: number; total_invested: number
      total_fee_ops: number; total_fees_eur: number; total_buys: number; total_sells: number; total_manual: number
    }
  }
}) {
  const { totals } = stats
  const cards = [
    { ...CARD_META.invested, title: 'Invertido',    value: formatEur(totals.total_invested),  sub: `${totals.total_buys} compras`        },
    { ...CARD_META.ops,      title: 'Operaciones',  value: totals.total_ops.toLocaleString('es-ES'), sub: `${totals.unique_assets} activos únicos` },
    { ...CARD_META.fees,     title: 'Comisiones',   value: formatEur(totals.total_fees_eur),   sub: `${totals.total_fee_ops} ops con fee` },
    { ...CARD_META.sells,    title: 'Ventas',       value: totals.total_sells.toLocaleString('es-ES'), sub: `${totals.total_manual} manuales`    },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <div key={c.title} className="rounded-2xl p-4 flex items-center gap-3 border"
            style={{ backgroundColor: c.bg, borderColor: c.border }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${c.iconColor}22` }}>
              <Icon size={16} style={{ color: c.iconColor }} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">{c.title}</div>
              <div className="text-base font-bold mono text-white truncate">{c.value}</div>
              <div className="text-[10px] text-gray-600">{c.sub}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Panel analítica ────────────────────────────────────────────────────────
function AnalyticsPanel({ stats, onAssetClick }: {
  stats: {
    monthly:   { mes: string; total_ops: number; compras: number; ventas: number; ingresos: number; transferencias: number; eur_invertido: number }[]
    topAssets: { asset: string; ops: number; eur_volume: number }[]
    fees:      { asset: string; ops: number; total_amount: number; total_eur: number }[]
  }
  onAssetClick: (asset: string) => void
}) {
  const [open, setOpen] = useState(false)
  const chartData = stats.monthly.map(m => ({
    name:          fmtMonthLabel(m.mes),
    Compras:       m.compras,
    Ventas:        m.ventas,
    Ingresos:      m.ingresos,
    Transferencias: m.transferencias,
    Otros:         m.total_ops - m.compras - m.ventas - m.ingresos - m.transferencias,
  }))
  const maxOps = Math.max(...stats.monthly.map(m => m.total_ops), 1)

  return (
    <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-gray-500" />
          <span className="text-sm font-medium">Analítica de actividad</span>
          <span className="text-[10px] text-gray-600">últimos 18 meses · top activos · fees</span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>

      {open && (
        <div className="border-t border-border p-5 space-y-5">
          {/* Gráfico — ancho completo */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">Operaciones por mes</p>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={10} barGap={1}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis hide domain={[0, maxOps * 1.2]} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="Compras"        stackId="a" fill="#10b981" />
                <Bar dataKey="Ventas"         stackId="a" fill="#ef4444" />
                <Bar dataKey="Ingresos"       stackId="a" fill="#f59e0b" />
                <Bar dataKey="Transferencias" stackId="a" fill="#6b7280" />
                <Bar dataKey="Otros"          stackId="a" fill="#4b5563" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2">
              {[['Compras','#10b981'],['Ventas','#ef4444'],['Ingresos','#f59e0b'],['Transferencias','#6b7280'],['Otros','#4b5563']].map(([l,c]) => (
                <div key={l} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: c }} />{l}
                </div>
              ))}
            </div>
          </div>

          {/* Top activos + Fees — dos columnas iguales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1 border-t border-border/50">
            {/* Top activos */}
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">
                Top activos <span className="text-gray-700 normal-case">· último año</span>
              </p>
              <div className="space-y-1.5">
                {stats.topAssets.slice(0, 6).map((a) => (
                  <button
                    key={a.asset}
                    onClick={() => onAssetClick(a.asset)}
                    className="w-full flex items-center gap-2 group/asset hover:bg-background-tertiary/50 rounded-lg px-1 py-0.5 transition-colors"
                    title={`Filtrar por ${a.asset}`}
                  >
                    <AssetLogo symbol={a.asset} size={16} />
                    <span className="text-xs mono font-bold text-gray-300 w-12 shrink-0 group-hover/asset:text-white transition-colors">{a.asset}</span>
                    <div className="flex-1 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-accent-blue/60 group-hover/asset:bg-accent-blue transition-colors"
                        style={{ width: `${(a.ops / (stats.topAssets[0]?.ops ?? 1)) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-500 w-5 text-right shrink-0">{a.ops}</span>
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-gray-700 mt-1.5 pl-1">Click para filtrar</p>
            </div>

            {/* Fees por activo */}
            {stats.fees.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">
                  Fees por activo <span className="text-gray-700 normal-case">· último año</span>
                </p>
                <div className="space-y-1.5">
                  {stats.fees.map((f) => (
                    <div key={f.asset} className="flex items-center gap-2">
                      <AssetLogo symbol={f.asset} size={16} />
                      <span className="text-xs mono font-bold text-gray-300 w-12 shrink-0">{f.asset}</span>
                      <div className="flex-1 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-accent-amber/50"
                          style={{ width: `${(f.total_eur / (stats.fees[0]?.total_eur ?? 1)) * 100}%` }} />
                      </div>
                      {f.total_eur > 0
                        ? <span className="text-[11px] text-gray-400 mono font-semibold shrink-0">{formatEur(f.total_eur)}</span>
                        : <span className="text-[10px] text-gray-600 mono shrink-0">{fmtAmount(f.total_amount, 4)}</span>
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Fila de transacción ────────────────────────────────────────────────────
function TxRow({
  tx, onDelete, onEdit, isDeleting, searchTerm,
}: {
  tx: Transaction
  onDelete: (id: string) => void
  onEdit:   (tx: Transaction) => void
  isDeleting: boolean
  searchTerm: string
}) {
  const [expanded, setExpanded]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const meta   = OP_META[tx.operation_type] ?? { label: tx.operation_type, color: '#6b7280', group: 'other', rowBg: 'transparent' }
  const isBuy  = meta.group === 'buy' || meta.group === 'income'
  const isSell = meta.group === 'sell'

  const { date, time } = fmtDate(tx.timestamp)
  const eurValue = calcEurValue(tx)
  const feeEur   = calcFeeEur(tx)

  const hasCost  = tx.cost_asset && tx.cost_amount && parseFloat(tx.cost_amount) !== 0
  const priceLine = tx.price_per_unit
    ? (() => {
        const p = parseFloat(tx.price_per_unit)
        if (isNaN(p) || p <= 0) return null
        const sym = tx.cost_asset ?? 'EUR'
        if (p >= 10000) return `${p.toLocaleString('es-ES', { maximumFractionDigits: 0 })} ${sym}`
        if (p >= 100)   return `${p.toFixed(2)} ${sym}`
        if (p >= 1)     return `${p.toFixed(4)} ${sym}`
        return `${p.toFixed(6)} ${sym}`
      })()
    : null

  return (
    <>
      <tr
        className={`group border-b border-border/40 transition-colors cursor-pointer ${expanded ? 'bg-background-tertiary/50' : ''}`}
        style={{ backgroundColor: expanded ? undefined : meta.rowBg }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Fecha */}
        <td className="px-4 py-2.5 whitespace-nowrap align-middle">
          <div className="text-[11px] font-medium text-gray-300">{date}</div>
          <div className="text-[10px] text-gray-600 mono">{time}</div>
        </td>

        {/* Tipo */}
        <td className="px-3 py-2.5 align-middle">
          <div className="flex items-center gap-1.5">
            <OpChip type={tx.operation_type} />
            {tx.manually_added && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-accent-blue/15 text-accent-blue font-bold shrink-0">M</span>
            )}
          </div>
        </td>

        {/* Activo + cantidad */}
        <td className="px-3 py-2.5 align-middle">
          <div className="flex items-center gap-2 min-w-0">
            <AssetLogo symbol={tx.asset} size={26} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold mono text-sm text-white">
                  <Highlight text={tx.asset} query={searchTerm} />
                </span>
                <span className={`text-xs mono font-semibold ${isBuy ? 'text-accent-green' : isSell ? 'text-accent-red' : 'text-gray-300'}`}>
                  {isBuy ? '+' : isSell ? '−' : ''}{fmtAmount(tx.amount_net)}
                </span>
              </div>
              {tx.notes && (
                <p className="text-[10px] text-gray-600 truncate max-w-[200px] leading-tight mt-0.5">{tx.notes}</p>
              )}
            </div>
          </div>
        </td>

        {/* Valor EUR */}
        <td className="px-3 py-2.5 text-right align-middle">
          {eurValue != null ? (
            <>
              <div className="text-sm mono font-semibold text-white">{formatPrice(eurValue)}</div>
              {priceLine && <div className="text-[10px] text-gray-600 mono mt-0.5">@ {priceLine}</div>}
            </>
          ) : hasCost ? (
            <>
              <div className="text-xs mono text-gray-400">{fmtAmount(tx.cost_amount, 4)}</div>
              <div className="text-[10px] text-gray-600">{tx.cost_asset}</div>
            </>
          ) : (
            <span className="text-gray-700 text-xs">—</span>
          )}
        </td>

        {/* Fee */}
        <td className="px-3 py-2.5 align-middle">
          {tx.fee_asset && tx.fee_amount ? (
            <div className="flex items-center gap-1.5">
              <AssetLogo symbol={tx.fee_asset} size={14} />
              <div>
                <div className="text-xs mono text-gray-400">
                  {fmtAmount(tx.fee_amount, 6)} <span className="text-gray-600 text-[10px]">{tx.fee_asset}</span>
                </div>
                {feeEur != null && <div className="text-[10px] text-gray-600 mono">{formatEur(feeEur)}</div>}
              </div>
            </div>
          ) : (
            <span className="text-gray-700 text-xs">—</span>
          )}
        </td>

        {/* Wallet */}
        <td className="px-3 py-2.5 align-middle">
          {tx.operation_type === 'TRANSFER_INTERNAL' && tx.destination_wallet_name ? (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold"
                style={{ backgroundColor: `${tx.wallet_color}18`, color: tx.wallet_color }}>
                {tx.wallet_name}
              </span>
              <ArrowRight size={10} className="text-gray-600 shrink-0" />
              <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold"
                style={{ backgroundColor: `${tx.destination_wallet_color}18`, color: tx.destination_wallet_color ?? '#6b7280' }}>
                {tx.destination_wallet_name}
              </span>
            </div>
          ) : (
            <>
              <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold"
                style={{ backgroundColor: `${tx.wallet_color}18`, color: tx.wallet_color }}>
                {tx.wallet_name}
              </span>
              {tx.account && <div className="text-[10px] text-gray-600 mt-0.5">{tx.account}</div>}
            </>
          )}
        </td>

        {/* Acciones */}
        <td className="px-3 py-2.5 align-middle" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-0.5">
            {tx.manually_added && !confirmDelete && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                <button onClick={() => onEdit(tx)}
                  className="p-1.5 rounded-lg hover:bg-accent-blue/10 text-gray-600 hover:text-accent-blue transition-colors">
                  <PenLine size={12} />
                </button>
                <button onClick={() => setConfirmDelete(true)}
                  className="p-1.5 rounded-lg hover:bg-accent-red/10 text-gray-600 hover:text-accent-red transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            )}
            {tx.manually_added && confirmDelete && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500">¿Borrar?</span>
                <button onClick={() => onDelete(tx.id)} disabled={isDeleting} className="text-accent-red p-0.5">
                  {isDeleting ? <RefreshCw size={11} className="animate-spin" /> : <AlertTriangle size={11} />}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-gray-600 p-0.5"><X size={11} /></button>
              </div>
            )}
            <button onClick={() => setExpanded(e => !e)}
              className="p-1 text-gray-700 hover:text-gray-400 transition-colors">
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </td>
      </tr>

      {/* Fila expandida */}
      {expanded && (
        <tr className="bg-background-tertiary/15">
          <td colSpan={7} className="px-6 py-3 border-b border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">ID</div>
                <div className="mono text-gray-500 text-[10px] break-all flex items-center gap-1">
                  {tx.id}
                  <CopyButton value={tx.id} />
                </div>
              </div>
              {tx.price_per_unit && (
                <div>
                  <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Precio unitario</div>
                  <div className="mono text-gray-300">{parseFloat(tx.price_per_unit).toFixed(8)} {tx.cost_asset ?? 'EUR'}</div>
                </div>
              )}
              {tx.destination_wallet_name && (
                <div>
                  <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Destino</div>
                  <span className="text-[11px] px-2 py-0.5 rounded-md font-semibold"
                    style={{ backgroundColor: `${tx.destination_wallet_color}18`, color: tx.destination_wallet_color ?? '#6b7280' }}>
                    {tx.destination_wallet_name}
                  </span>
                </div>
              )}
              <div>
                <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Importado</div>
                <div className="text-gray-500 text-[11px]">
                  {new Date(tx.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {tx.manually_added && <span className="ml-1.5 text-accent-blue font-medium">· Manual</span>}
                </div>
              </div>
              {tx.notes && (
                <div className="col-span-2">
                  <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Notas</div>
                  <div className="text-gray-400">{tx.notes}</div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Filtros ────────────────────────────────────────────────────────────────
interface Filters {
  asset: string; account: string; type: string; wallet_id: string
  manualOnly: boolean; date_from: string; date_to: string; search: string; offset: number
}
const INITIAL: Filters = {
  asset: '', account: '', type: '', wallet_id: '',
  manualOnly: false, date_from: '', date_to: '', search: '', offset: 0,
}

// ── Página principal ───────────────────────────────────────────────────────
export function History() {
  const queryClient = useQueryClient()
  const toast       = useToast()
  const searchRef   = useRef<HTMLInputElement>(null)

  const [filters, setFilters]         = useState<Filters>(INITIAL)
  const [sortKey, setSortKey]         = useState<SortKey>('fecha')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')
  const [deletingId, setDeletingId]   = useState<string | null>(null)
  const [editingTx, setEditingTx]     = useState<Transaction | null>(null)
  const [showNewTx, setShowNewTx]     = useState(false)

  const { data: walletList = [] } = useQuery({
    queryKey: ['wallets-list'],
    queryFn:  async () => {
      const r = await fetch('/api/wallets')
      return r.json() as Promise<{ id: string; name: string; color: string }[]>
    },
    staleTime: 60_000,
  })

  const { data: stats } = useQuery({
    queryKey: ['tx-stats'],
    queryFn:  () => portfolioApi.getTransactionStats(),
    staleTime: 5 * 60_000,
  })

  const queryParams = useMemo(() => ({
    limit:  String(PAGE_SIZE),
    offset: String(filters.offset),
    ...(filters.asset      ? { asset:         filters.asset.toUpperCase() } : {}),
    ...(filters.account    ? { account:        filters.account }            : {}),
    ...(filters.type       ? { type:           filters.type }               : {}),
    ...(filters.wallet_id  ? { wallet_id:      filters.wallet_id }          : {}),
    ...(filters.date_from  ? { date_from:      filters.date_from }          : {}),
    ...(filters.date_to    ? { date_to:        filters.date_to }            : {}),
    ...(filters.search     ? { search:         filters.search }             : {}),
    ...(filters.manualOnly ? { manually_added: 'true' }                     : {}),
  }), [filters])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['transactions', queryParams],
    queryFn:  () => portfolioApi.getTransactions(queryParams),
    placeholderData: prev => prev,
  })

  const rawTransactions: Transaction[] = data?.transactions ?? []
  const total      = data?.total ?? 0
  const totalEur   = data?.total_eur ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(filters.offset / PAGE_SIZE)

  // Ordenación cliente sobre la página actual
  const transactions = useMemo(() => {
    const arr = [...rawTransactions]
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'fecha') {
      arr.sort((a, b) => dir * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()))
    } else if (sortKey === 'eur') {
      arr.sort((a, b) => dir * ((calcEurValue(a) ?? 0) - (calcEurValue(b) ?? 0)))
    } else if (sortKey === 'activo') {
      arr.sort((a, b) => dir * a.asset.localeCompare(b.asset))
    }
    return arr
  }, [rawTransactions, sortKey, sortDir])

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const tx of transactions) {
      const day = tx.timestamp.slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(tx)
    }
    return [...map.entries()]
  }, [transactions])

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(prev => ({ ...prev, [key]: value, ...(key !== 'offset' ? { offset: 0 } : {}) }))
  }
  function clearFilters() { setFilters(INITIAL); setSortKey('fecha'); setSortDir('desc') }

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(col); setSortDir('desc') }
  }

  // Click en top activos → aplica buscador
  const handleAssetClick = useCallback((asset: string) => {
    setFilters(prev => ({ ...prev, search: asset, offset: 0 }))
    searchRef.current?.focus()
  }, [])

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await portfolioApi.deleteManualTx(id)
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['tx-stats'] })
      queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
      toast.success('Transacción eliminada', 'FIFO recalculado')
    } catch (e) {
      toast.error('Error al eliminar', (e as Error).message)
    } finally {
      setDeletingId(null)
    }
  }

  function handleModalSuccess() {
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['tx-stats'] })
    queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
    setEditingTx(null); setShowNewTx(false)
  }

  function exportCsv() {
    const rows = [
      ['Fecha','Tipo','Activo','Importe','Coste','Activo coste','Precio unitario','Fee','Activo fee','Wallet','Cuenta','Manual','Notas'].join(';'),
      ...transactions.map(tx => [
        new Date(tx.timestamp).toISOString().slice(0, 16).replace('T', ' '),
        tx.operation_type, tx.asset, tx.amount_net,
        tx.cost_amount ?? '', tx.cost_asset ?? '', tx.price_per_unit ?? '',
        tx.fee_amount ?? '', tx.fee_asset ?? '',
        tx.wallet_name, tx.account ?? '',
        tx.manually_added ? 'Sí' : 'No',
        (tx.notes ?? '').replace(/;/g, ','),
      ].join(';'))
    ].join('\n')
    const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `historial_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const hasActiveFilters = !!(filters.asset || filters.account || filters.type || filters.wallet_id ||
    filters.manualOnly || filters.date_from || filters.date_to || filters.search)

  const KNOWN_ACCOUNTS = ['Spot', 'Funding', 'Cross Margin', 'Isolated Margin', 'Futures', 'Manual']

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Cabecera ── */}
      <div className="shrink-0 px-6 pt-6 pb-4 space-y-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Historial</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {total > 0
                ? `${total.toLocaleString('es-ES')} transacciones${hasActiveFilters ? ' filtradas' : ''}`
                : 'Sin transacciones importadas'}
              {hasActiveFilters && totalEur > 0 && (
                <span className="ml-2 text-accent-blue font-semibold mono">· {formatEur(totalEur)} total</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white px-3 py-1.5 border border-border rounded-lg hover:border-gray-500 transition-colors">
                <X size={11} /> Limpiar
              </button>
            )}
            <button onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-background-tertiary border border-border rounded-lg text-xs text-gray-400 hover:text-white hover:border-gray-500 transition-colors">
              <Download size={13} /> CSV
            </button>
            <button onClick={() => setShowNewTx(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-blue/15 border border-accent-blue/30 rounded-lg text-xs text-accent-blue hover:bg-accent-blue/25 transition-colors font-medium">
              + Nueva
            </button>
          </div>
        </div>

        {/* ── Filtros ── */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Búsqueda */}
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              ref={searchRef}
              placeholder="Buscar activo o nota…"
              value={filters.search}
              onChange={e => setFilter('search', e.target.value)}
              className="bg-background-tertiary border border-border rounded-lg pl-7 pr-8 py-1.5 text-xs placeholder-gray-600 focus:outline-none focus:border-accent-blue w-48"
            />
            {filters.search && (
              <button onClick={() => setFilter('search', '')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                <X size={10} />
              </button>
            )}
          </div>

          {/* Tipo */}
          <select value={filters.type} onChange={e => setFilter('type', e.target.value)}
            className="bg-background-tertiary border border-border rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-accent-blue">
            <option value="">Todos los tipos</option>
            {Object.entries(OP_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          {/* Wallet */}
          <select value={filters.wallet_id} onChange={e => setFilter('wallet_id', e.target.value)}
            className="bg-background-tertiary border border-border rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-accent-blue">
            <option value="">Todas las wallets</option>
            {walletList.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>

          {/* Cuenta */}
          <select value={filters.account} onChange={e => setFilter('account', e.target.value)}
            className="bg-background-tertiary border border-border rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-accent-blue">
            <option value="">Todas las cuentas</option>
            {KNOWN_ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* Rango de fechas */}
          <DateRangePicker
            from={filters.date_from}
            to={filters.date_to}
            onChange={(f, t) => setFilters(prev => ({ ...prev, date_from: f, date_to: t, offset: 0 }))}
          />

          {/* Solo manuales */}
          <button onClick={() => setFilter('manualOnly', !filters.manualOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filters.manualOnly
                ? 'bg-accent-blue/10 border-accent-blue/40 text-accent-blue'
                : 'bg-background-tertiary border-border text-gray-400 hover:border-accent-blue/30'
            }`}>
            <PenLine size={11} /> Manuales
          </button>

          {isFetching && <RefreshCw size={11} className="text-gray-600 animate-spin ml-1" />}
        </div>
      </div>

      {/* ── Contenido ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-4 pb-4 space-y-4">

          {!hasActiveFilters && stats && (
            <>
              <StatsBar stats={stats} />
              <AnalyticsPanel stats={stats} onAssetClick={handleAssetClick} />
            </>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
              <RefreshCw size={16} className="animate-spin mr-2" /> Cargando…
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Package size={28} className="text-gray-700" />
              <p className="text-gray-500 text-sm">
                {hasActiveFilters ? 'Sin resultados para estos filtros.' : 'No hay transacciones. Importa un CSV para empezar.'}
              </p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs text-accent-blue hover:underline">Limpiar filtros</button>
              )}
            </div>
          ) : (
            <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] text-gray-500 uppercase tracking-wider border-b border-border bg-background-tertiary/40">
                    <th className="text-left px-4 py-2.5 font-medium">
                      <button onClick={() => toggleSort('fecha')} className="flex items-center hover:text-gray-300 transition-colors">
                        Fecha <SortIcon col="fecha" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="text-left px-3 py-2.5 font-medium">Tipo</th>
                    <th className="text-left px-3 py-2.5 font-medium">
                      <button onClick={() => toggleSort('activo')} className="flex items-center hover:text-gray-300 transition-colors">
                        Activo <SortIcon col="activo" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="text-right px-3 py-2.5 font-medium">
                      <button onClick={() => toggleSort('eur')} className="flex items-center ml-auto hover:text-gray-300 transition-colors">
                        Valor EUR <SortIcon col="eur" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="text-left px-3 py-2.5 font-medium">Fee</th>
                    <th className="text-left px-3 py-2.5 font-medium">Wallet</th>
                    <th className="px-3 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([day, txs]) => (
                    <>
                      <tr key={`day-${day}`} className="bg-background-tertiary/25">
                        <td colSpan={7} className="px-4 py-1.5">
                          <div className="flex items-center gap-2">
                            <Calendar size={9} className="text-gray-600" />
                            <span className="text-[10px] text-gray-600 font-semibold capitalize">
                              {fmtDateGroup(day + 'T12:00:00')}
                            </span>
                            <span className="text-[10px] text-gray-700">
                              · {txs.length} operacion{txs.length !== 1 ? 'es' : ''}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {txs.map(tx => (
                        <TxRow
                          key={tx.id}
                          tx={tx}
                          onDelete={handleDelete}
                          onEdit={setEditingTx}
                          isDeleting={deletingId === tx.id}
                          searchTerm={filters.search}
                        />
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Paginación ── */}
      {total > PAGE_SIZE && (
        <div className="shrink-0 border-t border-border px-4 py-3 flex items-center justify-between bg-background-primary">
          <span className="text-xs text-gray-600">
            {filters.offset + 1}–{Math.min(filters.offset + PAGE_SIZE, total)} de {total.toLocaleString('es-ES')}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilter('offset', Math.max(0, filters.offset - PAGE_SIZE))}
              disabled={filters.offset === 0}
              className="p-1.5 rounded-lg bg-background-tertiary border border-border hover:bg-border disabled:opacity-40 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-gray-500 px-2 mono">{currentPage + 1} / {totalPages}</span>
            <button
              onClick={() => setFilter('offset', filters.offset + PAGE_SIZE)}
              disabled={filters.offset + PAGE_SIZE >= total}
              className="p-1.5 rounded-lg bg-background-tertiary border border-border hover:bg-border disabled:opacity-40 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {(showNewTx || editingTx) && (
        <ManualTxModal
          onClose={() => { setShowNewTx(false); setEditingTx(null) }}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  )
}
