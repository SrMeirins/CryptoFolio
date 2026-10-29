import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { WalletAddress } from '../../../api/portfolio'
import { Link } from 'react-router-dom'
import { etiquetaEstado } from './helpers'
import { iconButtonClasses } from '../../../components/ui'
import { formatNumber } from '../../../utils/format'

export function SyncBadge({ addr, onSync, syncing }: { addr: WalletAddress; onSync: () => void; syncing: boolean }) {
  const [showDetail, setShowDetail] = useState(false)
  const meta = etiquetaEstado(addr.sync_status, addr.sync_details)

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
        <div className="absolute top-6 left-0 z-10 w-72 rounded-lg border border-border bg-background-card p-2.5 shadow-lg space-y-2">
          {addr.sync_details.map(d => (
            <div key={d.asset} className="text-xs text-fg-muted space-y-0.5">
              <p>
                <span className="font-medium text-fg">{d.asset}</span>: en la red {d.onchain_balance ?? '—'} · en la app {d.expected_balance}
                {d.status === 'discrepancy' && d.onchain_balance !== null && (
                  <span className="text-warning"> · diferencia: {formatNumber(d.onchain_balance - d.expected_balance, 6, 6)}</span>
                )}
              </p>
              {/* Qué significa y qué hacer (#336) */}
              {d.diagnostico && d.diagnostico.nivel !== 'ok' && (
                <p className={d.diagnostico.nivel === 'aviso' ? 'text-warning' : d.diagnostico.nivel === 'error' ? 'text-negative' : 'text-fg-subtle'}>
                  {d.diagnostico.accion ?? d.diagnostico.mensaje}
                  {d.diagnostico.enlace && <> <Link to={d.diagnostico.enlace} className="text-brand hover:underline">Ir</Link></>}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
