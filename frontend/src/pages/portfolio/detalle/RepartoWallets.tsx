import { Lock } from 'lucide-react'
import type { LockedAmount } from '../../../api/portfolio'
import { formatAmount, formatMoney, formatPercent, type Currency } from '../../../utils/format'
import type { CryptoRow } from '../../../utils/assetTable'
import { ink } from '../../../utils/colors'

// Reparto del activo por wallet con lo bloqueado en staking o launchpool
// (#272; separado del panel en #528).
export function RepartoWallets({ row, price, currency, locked }: {
  row: CryptoRow
  price: number
  currency: Currency
  locked: readonly LockedAmount[]
}) {
  const hasPrice = price > 0
  return (
    <ul className="space-y-2">
      {row.wallets.map(w => {
        const value = w.quantity * price
        const share = row.totalQuantity > 0 ? (w.quantity / row.totalQuantity) * 100 : 0
        const wLocked = locked.filter(l => l.wallet_id === w.wallet_id)
        return (
          <li key={w.wallet_id} className="rounded-xl border border-border px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.wallet_color }} aria-hidden="true" />
              <span className="font-medium truncate" style={{ color: ink(w.wallet_color) }}>{w.wallet_name}</span>
              <span className="ml-auto mono tabular-nums text-xs text-fg-muted">{formatAmount(w.quantity)}</span>
              <span className="mono tabular-nums text-xs text-fg w-24 text-right">{hasPrice ? formatMoney(value, currency) : '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1 h-1 rounded-full bg-overlay/6 overflow-hidden" aria-hidden="true">
                <span className="block h-full rounded-full" style={{ width: `${share}%`, backgroundColor: w.wallet_color }} />
              </span>
              <span className="mono text-[11px] text-fg-subtle w-12 text-right">{formatPercent(share, 1)}</span>
            </div>
            {wLocked.map((l, i) => (
              <p key={i} className={`flex items-center gap-1.5 text-[11px] ${l.lock_kind === 'launchpool' ? 'text-accent-purple' : 'text-warning'}`}>
                <Lock size={10} aria-hidden="true" />
                {formatAmount(parseFloat(l.locked_amount))} bloqueado en {l.lock_kind === 'launchpool' ? 'launchpool' : 'staking'} · {l.staking_type}
              </p>
            ))}
          </li>
        )
      })}
    </ul>
  )
}
