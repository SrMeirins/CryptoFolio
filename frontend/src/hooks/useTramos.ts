import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { type Tramo, TRAMOS_DEFAULT, parseTipos } from '../utils/tramosIrpf'

/** Lee los porcentajes de los tramos IRPF desde config (Ajustes → Fiscal) y los aplica sobre los tramos por defecto. */
export function useTramos(): Tramo[] {
  const { data: config = {} } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const tipos = config['irpf_tramos_tipos'] ? parseTipos(config['irpf_tramos_tipos']) : null
  if (!tipos) return TRAMOS_DEFAULT
  return TRAMOS_DEFAULT.map((t, i) => ({ ...t, tipo: tipos[i] ?? t.tipo }))
}
