import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { formatEur, pnlColor } from '../utils/format'

export function Fiscal() {
  const { data: fiscal = [], isLoading } = useQuery({
    queryKey: ['fiscal-summary'],
    queryFn: portfolioApi.getFiscalSummary,
  })

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Resumen Fiscal</h1>
        <span className="text-xs text-gray-500">España — IRPF · Método FIFO</span>
      </div>
      <div className="space-y-4">
        {fiscal.map((year) => {
          const gainLoss = parseFloat(year.total_gain_loss_eur)
          const gains = parseFloat(year.total_gains_eur)
          const losses = parseFloat(year.total_losses_eur)
          return (
            <div key={year.fiscal_year} className="card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Ejercicio {year.fiscal_year}</h2>
                <span className={`mono text-xl font-bold ${pnlColor(gainLoss)}`}>
                  {gainLoss >= 0 ? '+' : ''}{formatEur(gainLoss)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-background-tertiary rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Ganancias</div>
                  <div className="mono text-accent-green font-semibold">+{formatEur(gains)}</div>
                </div>
                <div className="bg-background-tertiary rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Pérdidas</div>
                  <div className="mono text-accent-red font-semibold">{formatEur(losses)}</div>
                </div>
                <div className="bg-background-tertiary rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Operaciones</div>
                  <div className="mono text-gray-300 font-semibold">{year.num_operations}</div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Pérdidas</span>
                  <span>Ganancias</span>
                </div>
                <div className="h-2 bg-background-tertiary rounded-full overflow-hidden flex">
                  <div
                    className="bg-accent-red h-full"
                    style={{ width: `${Math.abs(losses) / (Math.abs(losses) + gains) * 100}%` }}
                  />
                  <div
                    className="bg-accent-green h-full"
                    style={{ width: `${gains / (Math.abs(losses) + gains) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
