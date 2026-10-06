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
        <AlertCircle size={15} className="text-accent-amber" />
        <h2 className="font-medium text-sm">Operaciones desconocidas</h2>
      </div>
      <p className="text-xs text-gray-500">
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
                    ? <AlertCircle size={14} className="text-accent-amber shrink-0" />
                    : isIgnored
                      ? <X size={14} className="text-gray-500 shrink-0" />
                      : <CheckCircle size={14} className="text-accent-green shrink-0" />
                  }
                  <span className="font-mono text-xs text-gray-300 truncate">{op}</span>
                  {resolved && !isIgnored && (
                    <span className="text-xs text-accent-green shrink-0">{resolved.operationTypeId}</span>
                  )}
                  {isIgnored && <span className="text-xs text-gray-600 shrink-0">Ignorada</span>}
                </div>
                {sample && (
                  <div className="text-xs text-gray-600 ml-5">
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
                      ? 'bg-background-card border border-border text-gray-400'
                      : 'text-gray-600 hover:text-gray-300 hover:bg-background-card'
                  }`}
                >
                  {isIgnored ? 'Ignorada' : 'Ignorar'}
                </button>
                <button
                  type="button"
                  onClick={() => onCatalog(op)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    resolved && !isIgnored
                      ? 'bg-background-card text-gray-400 hover:text-white'
                      : isIgnored
                        ? 'bg-background-card text-gray-500 hover:text-white'
                        : 'bg-accent-amber text-black hover:bg-accent-amber/80'
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
