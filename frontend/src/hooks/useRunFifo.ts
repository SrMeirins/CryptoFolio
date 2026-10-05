import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'

/**
 * Recalcula el motor FIFO. Antes esta acción estaba reimplementada por
 * separado en pages/settings/DatosSection.tsx (Ajustes → Datos) y
 * pages/import/AdvancedSection.tsx (Importar → Opciones avanzadas), cada
 * una invalidando un subconjunto DISTINTO e incompleto de queries:
 * DatosSection invalidaba fifo-lots+settings-stats (le faltaba
 * fiscal-summary) y AdvancedSection invalidaba fifo-lots+fiscal-summary
 * (le faltaba settings-stats, con fetch() crudo en vez de portfolioApi).
 */
export function useRunFifo() {
  const queryClient = useQueryClient()
  const [running, setRunning] = useState(false)
  const [result, setResult]   = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setResult(null)
    try {
      const data = await portfolioApi.runFifo()
      setResult(`${data.lotsCreated} lotes creados, ${data.lotsConsumed} consumos procesados (G/P neto ${(data.totalGainEur + data.totalLossEur).toFixed(2)} €)`)
      queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
      queryClient.invalidateQueries({ queryKey: ['fiscal-summary'] })
      queryClient.invalidateQueries({ queryKey: ['settings-stats'] })
    } catch (e) {
      setResult(`Error: ${(e as Error).message}`)
    } finally {
      setRunning(false)
    }
  }

  return { running, result, run }
}
