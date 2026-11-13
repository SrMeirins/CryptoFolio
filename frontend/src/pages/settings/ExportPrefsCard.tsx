import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { QueryError } from '../../components/ui'
import { useSettingFeedback } from '../../hooks/useSettingFeedback'
import { useToast } from '../../hooks/useToast'
import { EXPORT_PREFS_KEY, leerPrefs, type PrefsExport } from '../../utils/exportFiscal'
import { SeleccionExport } from '../fiscal/exportar/SeleccionExport'
import { SavedMark } from './SavedMark'
import { SettingsCard } from './SettingsCard'

// Exportación fiscal en Ajustes > Fiscal (#547): el formato y las secciones
// que el diálogo de exportar propone de entrada; cada exportación los
// actualiza con lo último elegido.

export function ExportPrefsCard({ index }: { index: number }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { saved, confirm } = useSettingFeedback()
  const configQ = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  // La elección se ve al momento; si no se puede guardar, vuelve a la guardada.
  const [local, setLocal] = useState<PrefsExport | null>(null)
  const prefs = local ?? leerPrefs(configQ.data?.[EXPORT_PREFS_KEY])

  async function guardar(p: PrefsExport, previas: PrefsExport | null = prefs) {
    setLocal(p)
    try {
      await portfolioApi.setConfig(EXPORT_PREFS_KEY, JSON.stringify(p))
      await qc.invalidateQueries({ queryKey: ['config'] })
      confirm('export', 'Preferencias de exportación', previas ? () => void guardar(previas, null) : undefined)
    } catch (e) {
      setLocal(null)
      toast.fail('No se pudieron guardar las preferencias', e)
    }
  }

  return (
    <SettingsCard index={index} icon={Download} title="Exportación del ejercicio" status={<SavedMark stamp={saved} id="export" />}
      description="Formato y secciones que propone «Exportar» en Fiscal. También se recuerda lo último que eliges al exportar.">
      {configQ.isError && <QueryError what="la configuración" error={configQ.error} onRetry={() => void configQ.refetch()} />}
      <SeleccionExport prefs={prefs} onChange={p => void guardar(p)} />
    </SettingsCard>
  )
}
