import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Percent } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { fieldClasses, QueryError } from '../../components/ui'
import { useSettingFeedback } from '../../hooks/useSettingFeedback'
import { useToast } from '../../hooks/useToast'
import { cantidadEnCampo, parseCantidad } from '../../utils/planVentas'
import { COMISION_PLAN_KEY } from '../fiscal/plan/usePlan'
import { SavedMark } from './SavedMark'
import { SettingsCard } from './SettingsCard'

// Comisión estimada del plan de ventas en Ajustes > Fiscal (#546): la misma
// que se edita en el plan de Planificar. Se resta como gasto de cada venta.

const DEFECTO = 0.1

export function ComisionPlanCard({ index }: { index: number }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { saved, confirm } = useSettingFeedback()
  const configQ = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const guardado = Number(configQ.data?.[COMISION_PLAN_KEY])
  const actual = Number.isFinite(guardado) && configQ.data?.[COMISION_PLAN_KEY] !== undefined ? guardado : DEFECTO
  const [borrador, setBorrador] = useState<string | null>(null)
  const txt = borrador ?? cantidadEnCampo(actual)
  const n = parseCantidad(txt)
  const valido = Number.isFinite(n) && n >= 0 && n <= 10

  async function guardar(valor: number, deshacer = true) {
    const previo = actual
    try {
      await portfolioApi.setConfig(COMISION_PLAN_KEY, String(valor))
      await qc.invalidateQueries({ queryKey: ['config'] })
      void qc.invalidateQueries({ queryKey: ['fiscal-plan'] })
      setBorrador(null)
      confirm('comision-plan', `Comisión estimada del plan: ${cantidadEnCampo(valor)} %`, deshacer ? () => void guardar(previo, false) : undefined)
    } catch (e) {
      toast.fail('No se pudo guardar la comisión', e)
    }
  }

  return (
    <SettingsCard index={index} icon={Percent} title="Comisión estimada del plan de ventas" status={<SavedMark stamp={saved} id="comision-plan" />}
      description="Porcentaje que el plan de Planificar resta de cada venta como gasto de transmisión. Es una estimación: «Simular» permite la comisión exacta de cada venta.">
      {configQ.isError && <QueryError what="la configuración" error={configQ.error} onRetry={() => void configQ.refetch()} />}
      <label className="flex items-center gap-2 text-sm">
        <input type="text" inputMode="decimal" value={txt} maxLength={6} aria-label="Comisión estimada del plan en porcentaje"
          aria-invalid={!valido} aria-describedby={!valido ? 'comision-plan-error' : undefined}
          onChange={e => setBorrador(e.target.value)}
          onBlur={() => { if (valido && n !== actual) void guardar(n); else if (!valido) setBorrador(null) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className={fieldClasses('md', !valido, 'w-24 mono text-right')} />
        <span className="text-fg-muted">%</span>
      </label>
      {!valido && <p id="comision-plan-error" role="alert" className="text-xs text-negative-ink">Escribe un porcentaje de 0 a 10, por ejemplo 0,1.</p>}
    </SettingsCard>
  )
}
