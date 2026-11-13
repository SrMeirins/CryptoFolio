import { useId, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { descargarFichero } from '../../../api/client'
import { portfolioApi } from '../../../api/portfolio'
import { buttonClasses, Dropdown, Modal, ModalBody, ModalFooter, ModalHeader, Notice, QueryError } from '../../../components/ui'
import { useToast } from '../../../hooks/useToast'
import { usePrivacyStore } from '../../../store/privacyStore'
import { EXPORT_PREFS_KEY, leerPrefs, nombrePorDefecto, rutaExport, type PrefsExport } from '../../../utils/exportFiscal'
import { SeleccionExport } from './SeleccionExport'

// Exportar un ejercicio (#547): diálogo con el ejercicio, el formato (cada uno
// dice para qué sirve) y las secciones. Descarga directa, sin abrir pestañas,
// con «Preparando…» mientras se genera y aviso con el nombre del fichero al
// terminar. Lo elegido se recuerda como preferencia (también en Ajustes).

export function ExportDialog({ year, onClose }: { year: number; onClose: () => void }) {
  const titleId = useId()
  const qc = useQueryClient()
  const toast = useToast()
  const privacy = usePrivacyStore(s => s.hidden)
  const yearsQ = useQuery({ queryKey: ['fiscal-years'], queryFn: portfolioApi.getFiscalYears })
  const configQ = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const [ejercicio, setEjercicio] = useState(year)
  const [elegidas, setElegidas] = useState<PrefsExport | null>(null)
  const prefs = elegidas ?? leerPrefs(configQ.data?.[EXPORT_PREFS_KEY])
  const [preparando, setPreparando] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function descargar() {
    setPreparando(true); setError(null)
    try {
      const { blob, nombre } = await descargarFichero(rutaExport(ejercicio, prefs), nombrePorDefecto(ejercicio, prefs.formato))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = nombre
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Exportación descargada', nombre)
      // Se recuerda lo elegido; si no se puede guardar, la descarga ya está hecha.
      portfolioApi.setConfig(EXPORT_PREFS_KEY, JSON.stringify(prefs)).then(() => qc.invalidateQueries({ queryKey: ['config'] })).catch(() => {})
      onClose()
    } catch (e) {
      setError(e)
    } finally {
      setPreparando(false)
    }
  }

  const years = yearsQ.data ?? [year]
  return (
    <Modal onClose={onClose} labelledBy={titleId} closeOnOverlay={!preparando}>
      <ModalHeader titleId={titleId} title="Exportar el ejercicio" icon={<Download size={16} aria-hidden="true" />} onClose={preparando ? undefined : onClose} />
      <ModalBody className="space-y-4 text-sm">
        {yearsQ.isError && <QueryError what="los ejercicios" error={yearsQ.error} onRetry={() => void yearsQ.refetch()} />}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-fg" aria-hidden="true">Ejercicio</span>
          <Dropdown size="sm" label="Ejercicio" value={ejercicio} onChange={setEjercicio}
            options={(years.includes(ejercicio) ? years : [ejercicio, ...years]).map(y => ({ value: y, label: String(y) }))} />
        </div>
        <SeleccionExport prefs={prefs} onChange={setElegidas} />
        {privacy && <Notice tipo="aviso" compact>Desactiva el modo privacidad para exportar: el fichero lleva todos los importes.</Notice>}
        {error !== null && <QueryError what="la exportación" error={error} onRetry={() => void descargar()} />}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={preparando} className={buttonClasses('ghost', 'sm')}>Cancelar</button>
        <button type="button" onClick={() => void descargar()} disabled={preparando || privacy} aria-busy={preparando} className={buttonClasses('primary', 'sm', 'flex gap-1.5')}>
          <Download size={13} aria-hidden="true" /> {preparando ? 'Preparando…' : 'Descargar'}
        </button>
      </ModalFooter>
    </Modal>
  )
}
