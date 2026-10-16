import { useState } from 'react'
import { AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { formatEur, pnlColor, formatPercent, formatNumber } from '../../utils/format'
import { CryptoIcon } from '../../components/CryptoIcon'
import type { Modelo721 } from './types'
import { T, alpha, ink } from '../../utils/colors'
import { badgeClasses } from '../../components/ui'
import { MODELO721_LABELS, modelo721Status, pendingPricesText } from '../../utils/modelo721Status'

export function Modelo721Card({ data, activeYear }: { data: Modelo721; activeYear: number }) {
  const [expanded, setExpanded] = useState(true)
  const currentYear = new Date().getFullYear()
  const deadline    = `31 mar ${activeYear + 1}`
  const vencido     = !data.esAnioEnCurso && activeYear < currentYear
  const pctUmbral   = Math.min((data.totalValorCustodia / data.umbral) * 100, 100)
  const autocustodia = data.totalValor - data.totalValorCustodia
  // Con precios pendientes los totales son un mínimo (#267).
  const status = modelo721Status(data)
  const pending = pendingPricesText(data.preciosPendientes)
  const min = data.incompleto ? '≥ ' : ''

  return (
    <div className={`bg-background-card border rounded-xl overflow-hidden ${
      data.superaUmbral ? 'border-negative/40' : 'border-border'
    }`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-overlay/2 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm">Modelo 721</h3>
              {data.esAnioEnCurso && (
                <span className={badgeClasses('info', 'sm')}>estimación actual</span>
              )}
              {vencido && (
                <span className="text-xs bg-background-tertiary text-fg-subtle px-2 py-0.5 rounded-full">cerrado</span>
              )}
            </div>
            <p className="text-xs text-fg-subtle mt-0.5">
              {data.esAnioEnCurso
                ? `Valoración a ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}`
                : `Valoración a 31 dic ${activeYear}`
              }
            </p>
          </div>

          {status === 'obligatorio' ? (
            <div className="flex items-center gap-1.5 bg-negative/10 border border-negative/20 text-negative text-xs px-2.5 py-1 rounded-xl">
              <AlertTriangle size={11} />
              <span className="font-medium">Obligatorio declarar</span>
              {!data.esAnioEnCurso && <span className="opacity-70">· {deadline}</span>}
            </div>
          ) : status === 'incompleto' ? (
            <div className="flex items-center gap-1.5 bg-warning/10 border border-warning/20 text-warning text-xs px-2.5 py-1 rounded-xl">
              <AlertTriangle size={11} />
              <span className="font-medium">{MODELO721_LABELS.incompleto}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-positive/10 text-positive text-xs px-2.5 py-1 rounded-xl">
              <span className="font-medium">{MODELO721_LABELS['sin-obligacion']}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className={`text-lg font-bold mono ${data.superaUmbral ? 'text-negative' : 'text-fg'}`}>
              {min}{formatEur(data.totalValorCustodia)}
            </div>
            <div className="text-xs text-fg-subtle">custodia de terceros · umbral {formatEur(data.umbral)}</div>
            {autocustodia > 0.01 && (
              <div className="text-xs text-fg-subtle">+ {formatEur(autocustodia)} en autocustodia (no computa)</div>
            )}
          </div>
          {expanded ? <ChevronUp size={14} className="text-fg-subtle" /> : <ChevronDown size={14} className="text-fg-subtle" />}
        </div>
      </button>

      <div className="px-5 pb-1">
        <div className="h-1 bg-background-tertiary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pctUmbral}%`,
              backgroundColor: data.superaUmbral ? T.negative : pctUmbral > 75 ? T.warning : T.positive,
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-fg-subtle mt-0.5">
          <span>0 €</span>
          <span>{formatPercent(pctUmbral, 0)} del umbral</span>
          <span>{formatEur(data.umbral)}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border">
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-2">
            {data.activos.map((a) => {
              const pnl = a.valorEur - a.costBasisEur
              return (
                <div key={`${a.asset}-${a.wallet_id}`} className="flex items-center gap-3 bg-background-tertiary/50 rounded-xl px-3 py-2.5">
                  <CryptoIcon symbol={a.asset} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm mono">{a.asset}</span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-lg font-medium shrink-0"
                        style={{
                          backgroundColor: a.wallet_kind === 'exchange' ? alpha(T.warning, 12) : `${alpha(a.wallet_color, 9)}`,
                          color: a.wallet_kind === 'exchange' ? T.warning : ink(a.wallet_color),
                        }}
                      >
                        {a.wallet_name}
                      </span>
                    </div>
                    <div className="text-xs text-fg-subtle mono mt-0.5">
                      {formatNumber(a.quantity, 4, 4)} × {a.sinPrecio ? <span className="text-warning">sin precio</span> : formatEur(a.precioEur)}
                    </div>
                    {a.costBasisEur > 0 && (
                      <div className="text-xs text-fg-subtle mono">
                        Coste adq.: {formatEur(a.costBasisEur)}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold mono text-sm">{formatEur(a.valorEur)}</div>
                    {a.costBasisEur > 0 && (
                      <div className={`text-xs mono ${pnlColor(pnl)}`}>
                        {pnl >= 0 ? '+' : ''}{formatEur(pnl)}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="px-5 pb-4 space-y-2">
            {pending && (
              <div role="status" className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-xl text-xs text-warning">
                <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                <span>{pending}: los totales son un mínimo. Se completarán cuando las fuentes de precios respondan.</span>
              </div>
            )}
            <div className="flex items-start gap-2 p-3 bg-background-tertiary rounded-xl text-xs text-fg-subtle">
              <Info size={11} className="shrink-0 mt-0.5" />
              Precios obtenidos de la API a fecha {data.fecha}. La columna de custodia indica dónde se encontraban los activos según el historial registrado.
            </div>
            <div className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-xl text-xs text-warning">
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />
              {data.aviso}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
