import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ListChecks } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { buttonClasses, QueryError } from '../../components/ui'
import { useToast } from '../../hooks/useToast'
import { formatNumber } from '../../utils/format'
import { SettingsCard } from './SettingsCard'

// Plan de ventas guardado en Ajustes > Datos (#546): cuántas ventas tiene el
// del año en curso y los archivados, con acceso a Planificar y «Vaciar».

const FOCO = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'

export function PlanGuardadoCard({ index }: { index: number }) {
  const qc = useQueryClient()
  const toast = useToast()
  const planQ = useQuery({ queryKey: ['fiscal-plan-ajustes'], queryFn: () => portfolioApi.getPlan() })
  const p = planQ.data

  async function vaciar(ejercicio?: number) {
    try {
      const r = await portfolioApi.vaciarPlan(ejercicio)
      void qc.invalidateQueries({ queryKey: ['fiscal-plan-ajustes'] })
      void qc.invalidateQueries({ queryKey: ['fiscal-plan'] })
      toast.success('Plan vaciado', `${r.quitadas} ${r.quitadas === 1 ? 'venta quitada' : 'ventas quitadas'}`)
    } catch (e) { toast.fail('No se pudo vaciar el plan', e) }
  }

  return (
    <SettingsCard index={index} icon={ListChecks} title="Plan de ventas de fin de año"
      description="Las ventas que preparas en Fiscal, Planificar. Se guardan en la base de datos y van en la copia de seguridad.">
      {planQ.isError && <QueryError what="el plan de ventas" error={planQ.error} onRetry={() => void planQ.refetch()} />}
      {p && (
        <ul className="divide-y divide-border/60 text-xs">
          <li className="flex items-center gap-3 flex-wrap py-2">
            <span className="flex-1 min-w-0 text-fg">
              Plan de {p.ejercicio}: {p.ventas.length === 0 ? 'vacío' : `${p.ventas.length} ${p.ventas.length === 1 ? 'venta' : 'ventas'}`}
              {p.ventas.length > 0 && <span className="block text-fg-subtle truncate">{p.ventas.map(v => `${formatNumber(v.cantidad, 8)} ${v.asset}`).join(', ')}</span>}
            </span>
            <Link to="/fiscal?vista=planificar" className={`text-brand-ink hover:underline rounded ${FOCO}`}>Ver en Planificar</Link>
            {p.ventas.length > 0 && <button type="button" onClick={() => void vaciar()} className={buttonClasses('ghost', 'sm', 'text-negative-ink')}>Vaciar</button>}
          </li>
          {p.archivados.map(a => (
            <li key={a.ejercicio} className="flex items-center gap-3 flex-wrap py-2">
              <span className="flex-1 min-w-0 text-fg-muted">Plan archivado de {a.ejercicio}: {a.ventas} {a.ventas === 1 ? 'venta' : 'ventas'}</span>
              <button type="button" onClick={() => void vaciar(a.ejercicio)} aria-label={`Borrar el plan archivado de ${a.ejercicio}`} className={buttonClasses('ghost', 'sm', 'text-negative-ink')}>Borrar</button>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  )
}
