import { AlertCircle, CheckCircle, X } from 'lucide-react'
import type { UnknownOperationSample, WizardResult } from './types'

export function UnknownOperationsCard({ unknownOperations, resolvedOps, unknownOperationSamples, onIgnoreOp, onCatalog }: {
  unknownOperations: string[]
  resolvedOps: Record<string, WizardResult>
  unknownOperationSamples: Record<string, UnknownOperationSample>
  onIgnoreOp: (op: string) => void
  onCatalog: (op: string) => void
}) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle size={15} className="text-warning" />
        <h2 className="font-medium text-sm">Operaciones desconocidas</h2>
      </div>
      <p className="text-xs text-fg-subtle">
        Cataloga cada operación para incluirla en el cálculo fiscal, o ignórala para excluirla del import.
      </p>
      <div className="space-y-2">
        {unknownOperations.map(op => {
          const resolved  = resolvedOps[op]
          const isIgnored = resolved?.operationTypeId === 'IGNORED'
          const sample    = unknownOperationSamples?.[op]
          return (
            <div key={op} className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  {!resolved
                    ? <AlertCircle size={14} className="text-warning shrink-0" />
                    : isIgnored
                      ? <X size={14} className="text-fg-subtle shrink-0" />
                      : <CheckCircle size={14} className="text-positive shrink-0" />
                  }
                  <span className="mono text-xs text-fg truncate">{op}</span>
                  {resolved && !isIgnored && (
                    <span className="text-xs text-positive shrink-0">{resolved.operationTypeId}</span>
                  )}
                  {isIgnored && <span className="text-xs text-fg-subtle shrink-0">Ignorada</span>}
                </div>
                {sample && (
                  <div className="text-xs text-fg-subtle ml-5">
                    {new Date(sample.timestamp).toLocaleDateString('es-ES')}
                    {sample.asset && ` · ${sample.asset}`}
                    {sample.amount > 0 && ` · ${sample.amount}`}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onIgnoreOp(op)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                    isIgnored
                      ? 'bg-background-card border border-border text-fg-muted'
                      : 'text-fg-subtle hover:text-fg hover:bg-background-card'
                  }`}
                >
                  {isIgnored ? 'Ignorada' : 'Ignorar'}
                </button>
                <button
                  type="button"
                  onClick={() => onCatalog(op)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    resolved && !isIgnored
                      ? 'bg-background-card text-fg-muted hover:text-on-warning'
                      : isIgnored
                        ? 'bg-background-card text-fg-subtle hover:text-on-warning'
                        : 'bg-warning text-on-warning hover:bg-warning/80'
                  }`}
                >
                  {resolved && !isIgnored ? 'Cambiar' : 'Catalogar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
