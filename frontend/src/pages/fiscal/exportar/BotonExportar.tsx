import { useState } from 'react'
import { Download } from 'lucide-react'
import { buttonClasses } from '../../../components/ui'
import { ExportDialog } from './ExportDialog'

// Botón «Exportar» de la cabecera de Fiscal (#547): abre el diálogo de exportar.
export function BotonExportar({ year }: { year: number }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} aria-haspopup="dialog" className={buttonClasses('secondary', 'md', 'flex')}>
        <Download size={14} aria-hidden="true" /> Exportar
      </button>
      {abierto && <ExportDialog year={year} onClose={() => setAbierto(false)} />}
    </>
  )
}
