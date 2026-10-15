import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { WalletAddress } from '../../../api/portfolio'
import { SYNC_BADGE } from './helpers'
import { iconButtonClasses } from '../../../components/ui'
import { formatNumber } from '../../../utils/format'

export function SyncBadge({ addr, onSync, syncing }: { addr: WalletAddress; onSync: () => void; syncing: boolean }) {
  const [showDetail, setShowDetail] = useState(false)
  const meta = SYNC_BADGE[addr.sync_status]

  return (
    <div className="relative flex items-center gap-1">
      <button type="button" onClick={() => setShowDetail(v => !v)}
        className={`text-xs px-1.5 py-0.5 rounded-lg font-medium ${meta.className}`}>
        {meta.label}
      </button>
      <button type="button" onClick={onSync} disabled={syncing}
        title="Verificar ahora" aria-label="Verificar ahora"
        className={iconButtonClasses('sm', false, '', 'brand')}>
        <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
      </button>
      {showDetail && addr.sync_details.length > 0 && (
        <div className="absolute top-6 left-0 z-10 w-64 rounded-lg border border-border bg-background-card p-2.5 shadow-lg space-y-1">
          {addr.sync_details.map(d => (
            <p key={d.asset} className="text-xs text-fg-muted">
              <span className="font-medium text-fg">{d.asset}</span> — Real: {d.onchain_balance ?? '—'} · App: {d.expected_balance}
              {d.status === 'discrepancy' && d.onchain_balance !== null && (
                <span className="text-warning"> · Diferencia: {formatNumber(d.onchain_balance - d.expected_balance, 6, 6)}</span>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
