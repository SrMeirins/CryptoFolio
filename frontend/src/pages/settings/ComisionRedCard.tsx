import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Network } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { SegmentedControl, QueryError } from '../../components/ui'
import { useSettingFeedback } from '../../hooks/useSettingFeedback'
import { useToast } from '../../hooks/useToast'
import { COMISION_RED_KEY, comisionRedCriterio, mensajeCambioComisionRed, type ComisionRedCriterio } from '../../utils/comisionRed'
import { SettingsCard } from './SettingsCard'
import { SavedMark } from './SavedMark'
import { failure } from '../../utils/queryFailure'

// Comisión de red en traspasos a wallets propias (#532). No hay criterio
// expreso de la DGT para este caso: la app ofrece las dos opciones con textos
// prudentes. Cambiarla recalcula el FIFO, con confirmación y Deshacer.

const OPCIONES = [
  { value: 'transmision' as const, label: 'Transmisión' },
  { value: 'coste' as const, label: 'Sumar al coste' },
]

export function ComisionRedCard({ index = 0 }: { index?: number }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { saved, confirm } = useSettingFeedback()
  const configQ = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const { data: config } = configQ
  const declQ = useQuery({ queryKey: ['fiscal-declaraciones'], queryFn: portfolioApi.getDeclaraciones })
  const { data: declaraciones = [] } = declQ
  const actual = comisionRedCriterio(config)
  const [pendiente, setPendiente] = useState<ComisionRedCriterio | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const ejercicios = [...new Set(declaraciones.map(d => d.ejercicio))].sort()

  /** Guarda el criterio y recalcula el FIFO; `undoable`: ofrece volver al anterior. */
  async function aplicar(next: ComisionRedCriterio, previo: ComisionRedCriterio, undoable = true) {
    setPendiente(null)
    setAplicando(true)
    try {
      await portfolioApi.setConfig(COMISION_RED_KEY, next)
      await portfolioApi.runFifo()
      // Cambian lotes, ganancias, pérdidas y todo lo que depende de ellos.
      await queryClient.invalidateQueries()
      confirm(COMISION_RED_KEY, next === 'coste' ? 'Comisión de red sumada al coste; FIFO recalculado' : 'Comisión de red como transmisión; FIFO recalculado',
        undoable ? () => void aplicar(previo, next, false) : undefined)
    } catch (e) {
      toast.fail('No se pudo cambiar el criterio', e)
    } finally {
      setAplicando(false)
    }
  }

  // Fallo de sus consultas (#498): se dice en la tarjeta, con Reintentar.
  const fallo = failure(configQ, declQ)
  return (
    <SettingsCard index={index} icon={Network} title="Comisión de red en traspasos propios" status={<SavedMark stamp={saved} id={COMISION_RED_KEY} />}
      description={<>
        Cómo se trata la comisión que cobra la red al mover cripto a otra wallet tuya registrada.
        <strong className="font-medium text-fg"> Transmisión</strong> (por defecto): esas unidades se consideran transmitidas y dan ganancia o pérdida.
        <strong className="font-medium text-fg"> Sumar al coste</strong>: no hay ganancia ni pérdida y su coste pasa a las unidades que llegan.
        No hay un criterio expreso de Hacienda para este caso; consulta con un asesor. Los retiros a «Wallets externas» siempre se tratan como transmisión.
      </>}
      action={<SegmentedControl label="Criterio de la comisión de red" options={OPCIONES} value={actual} disabled={aplicando || !!fallo}
        onChange={v => { if (v !== actual) setPendiente(v) }} />}>
      {fallo && <QueryError what="el criterio actual" error={fallo.error} onRetry={fallo.retry} className="mb-3 rounded-xl border border-border" />}
      {aplicando && <p role="status" className="text-xs text-fg-subtle">Recalculando el FIFO…</p>}
      {pendiente !== null && (
        <ConfirmDialog title="Cambiar el criterio de la comisión de red" confirmLabel="Cambiar el criterio y recalcular"
          message={mensajeCambioComisionRed(pendiente, ejercicios)}
          onConfirm={() => void aplicar(pendiente, actual)} onCancel={() => setPendiente(null)} />
      )}
    </SettingsCard>
  )
}
