import { useState } from 'react'
import { Filter } from 'lucide-react'
import { SegmentedControl } from '../../../components/ui'
import { FiscalChartCard } from '../FiscalChartCard'
import { RankingActivos } from './desglose/RankingActivos'
import { ContribucionActivos } from './desglose/ContribucionActivos'
import type { BreakdownItem } from '../types'

// Desglose por activo (#301, #540): dos vistas. Ranking, con columnas
// ordenables y filtros; Contribución, la cascada hasta el neto del ejercicio.

type Vista = 'ranking' | 'contribucion'
const VISTAS = [
  { value: 'ranking' as const, label: 'Ranking' },
  { value: 'contribucion' as const, label: 'Contribución' },
]

export function DesglosePorActivo({ data, onSelectAsset }: { data: BreakdownItem[]; onSelectAsset: (asset: string) => void }) {
  const [vista, setVista] = useState<Vista>('ranking')
  if (data.length === 0) return null
  return (
    <FiscalChartCard icon={Filter} title="Desglose por activo"
      right={<SegmentedControl options={VISTAS} value={vista} onChange={setVista} label="Vista del desglose" size="sm" />}>
      {vista === 'ranking'
        ? <RankingActivos data={data} onSelectAsset={onSelectAsset} />
        : <ContribucionActivos data={data} onSelectAsset={onSelectAsset} />}
    </FiscalChartCard>
  )
}
