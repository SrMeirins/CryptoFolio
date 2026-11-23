import { Link } from 'react-router-dom'
import { LayoutDashboard, RotateCcw } from 'lucide-react'
import { Button } from '../../components/ui'
import { EditorDiseno } from '../../components/dashboard/EditorDiseno'
import { useDashboardDiseno } from '../../hooks/useDashboardDiseno'
import { DISENO_DEFECTO, esPorDefecto } from '../../utils/dashboardDiseno'
import { SettingsCard } from './SettingsCard'

// Ajustes › General › Diseño del Dashboard (#521): el mismo editor que el modo
// Personalizar del Dashboard (orden, mostrar u ocultar y contraer) y Restaurar,
// con Deshacer en el aviso. Los cambios se guardan al momento.

export function DisenoDashboardCard({ index }: { index: number }) {
  const { diseno, guardar } = useDashboardDiseno()
  return (
    <SettingsCard index={index} icon={LayoutDashboard} title="Diseño del Dashboard"
      description={<>Orden de los paneles, cuáles se muestran y cuáles aparecen contraídos. También desde el botón «Personalizar» del <Link to="/" className="text-brand-ink hover:underline">Dashboard</Link>. Las métricas de arriba son fijas.</>}
      action={
        <Button size="sm" variant="ghost" icon={<RotateCcw size={14} aria-hidden="true" />} disabled={esPorDefecto(diseno)}
          onClick={() => void guardar(DISENO_DEFECTO, { mensaje: 'Diseño por defecto del Dashboard', deshacer: true })}>
          Restaurar diseño por defecto
        </Button>
      }>
      <div data-testid="ajustes-diseno">
        <EditorDiseno diseno={diseno} onCambiar={d => guardar(d)} />
      </div>
    </SettingsCard>
  )
}
