import { useState } from 'react'
import { AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { formatEur, pnlColor } from '../../utils/format'
import { AssetLogo } from './helpers'
import type { Modelo721 } from './types'

export function Modelo721Card({ data, activeYear }: { data: Modelo721; activeYear: number }) {
  const [expanded, setExpanded] = useState(true)
  const currentYear = new Date().getFullYear()
  const deadline    = `31 mar ${activeYear + 1}`
  const vencido     = !data.esAnioEnCurso && activeYear < currentYear
  const pctUmbral   = Math.min((data.totalValor / data.umbral) * 100, 100)

  return (
    <div className={`bg-background-card border rounded-2xl overflow-hidden ${
      data.superaUmbral ? 'border-accent-red/40' : 'border-border'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm">Modelo 721</h3>
              {data.esAnioEnCurso && (
                <span className="text-[10px] bg-accent-blue/15 text-accent-blue px-2 py-0.5 rounded-full">estimación actual</span>
              )}
              {vencido && (
                <span className="text-[10px] bg-background-tertiary text-gray-500 px-2 py-0.5 rounded-full">cerrado</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {data.esAnioEnCurso
                ? `Valoración a ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}`
                : `Valoración a 31 dic ${activeYear}`
              }
            </p>
          </div>

          {data.superaUmbral ? (
            <div className="flex items-center gap-1.5 bg-accent-red/10 border border-accent-red/20 text-accent-red text-xs px-2.5 py-1 rounded-xl">
              <AlertTriangle size={11} />
              <span className="font-medium">Obligatorio declarar</span>
              {!data.esAnioEnCurso && <span className="opacity-70">· {deadline}</span>}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-accent-green/10 text-accent-green text-xs px-2.5 py-1 rounded-xl">
              <span className="font-medium">Sin obligación</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className={`text-lg font-bold mono ${data.superaUmbral ? 'text-accent-red' : 'text-white'}`}>
              {formatEur(data.totalValor)}
            </div>
            <div className="text-[10px] text-gray-500">umbral {formatEur(data.umbral)}</div>
          </div>
          {expanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </div>
      </button>

      <div className="px-5 pb-1">
        <div className="h-1 bg-background-tertiary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pctUmbral}%`,
              backgroundColor: data.superaUmbral ? '#ef4444' : pctUmbral > 75 ? '#f59e0b' : '#10b981',
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
          <span>0 €</span>
          <span>{pctUmbral.toFixed(0)}% del umbral</span>
          <span>{formatEur(data.umbral)}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border">
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-2">
            {data.activos.map((a, i) => (
              <div key={i} className="flex items-center gap-3 bg-background-tertiary/50 rounded-xl px-3 py-2.5">
                <AssetLogo symbol={a.asset} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm mono">{a.asset}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                      style={{
                        backgroundColor: a.wallet_kind === 'exchange' ? 'rgba(245,158,11,0.12)' : `${a.wallet_color}18`,
                        color: a.wallet_kind === 'exchange' ? '#f59e0b' : a.wallet_color,
                      }}
                    >
                      {a.wallet_name}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 mono mt-0.5">
                    {a.quantity.toFixed(4)} × {formatEur(a.precioEur)}
                  </div>
                  {a.costBasisEur > 0 && (
                    <div className="text-[10px] text-gray-600 mono">
                      Coste adq.: {formatEur(a.costBasisEur)}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold mono text-sm">{formatEur(a.valorEur)}</div>
                  {a.costBasisEur > 0 && (
                    <div className={`text-[10px] mono ${pnlColor(a.valorEur - a.costBasisEur)}`}>
                      {a.valorEur - a.costBasisEur >= 0 ? '+' : ''}{formatEur(a.valorEur - a.costBasisEur)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 pb-4 space-y-2">
            <div className="flex items-start gap-2 p-3 bg-background-tertiary rounded-xl text-[11px] text-gray-500">
              <Info size={11} className="shrink-0 mt-0.5" />
              Precios obtenidos de la API a fecha {data.fecha}. La columna de custodia indica dónde se encontraban los activos según el historial registrado.
            </div>
            <div className="flex items-start gap-2 p-3 bg-accent-amber/5 border border-accent-amber/20 rounded-xl text-[11px] text-accent-amber">
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />
              {data.aviso}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
