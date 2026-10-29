import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { fiscalYearQueries } from '../pages/fiscal/fiscalYearQueries'
import { baseTramosCompensada } from '../utils/tramosIrpf'

// Datos de un ejercicio para la vista previa de Ajustes (#451, #452): la base
// del ahorro ya compensada y el valor para el Modelo 721, con las mismas
// consultas (y caché) que la página Fiscal. Sin año, el más reciente con datos.
export function useCurrentFiscalBase(forYear?: number) {
  const { data: years = [] } = useQuery({ queryKey: ['fiscal-years'], queryFn: portfolioApi.getFiscalYears })
  const year = forYear ?? years[0] ?? null
  const q = fiscalYearQueries(year ?? 0)
  const { data: summary } = useQuery({ ...q.summary, enabled: !!year })
  const { data: carryforward } = useQuery({ queryKey: ['fiscal-carryforward'], queryFn: portfolioApi.getFiscalCarryforward })
  if (!year || !summary) return null
  const cf = carryforward?.detalle.find(d => d.year === year)
  return {
    year,
    enCurso: summary.esAnioEnCurso,
    base: baseTramosCompensada(cf, summary.netoPatrimonial, summary.totalRendimientos),
    valor721: summary.valorTotal31Dic,
    valorIncompleto: summary.valorIncompleto,
  }
}
