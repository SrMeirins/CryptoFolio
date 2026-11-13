import { useMemo, useState } from 'react'
import { BookOpen, Download } from 'lucide-react'
import { ComoCalculamos } from '../../../components/metodologia'
import { buttonClasses, Hint, NotApplicable, panelSurface } from '../../../components/ui'
import { usePrivacyStore } from '../../../store/privacyStore'
import { usePricesStore } from '../../../store/pricesStore'
import { formatFiscalDate } from '../../../utils/fiscalTable'
import { buildModelo721Csv, liveModelo721 } from '../../../utils/modelo721View'
import type { Modelo721 } from '../types'
import { DondeEsta721 } from './DondeEsta721'
import { GruposEntidad } from './GruposEntidad'
import { Historico721 } from './Historico721'
import { Pendientes721 } from './Pendientes721'
import { PresentadoBloque } from './PresentadoBloque'
import { Veredicto721 } from './Veredicto721'

// Modelo 721 (#303, #545), de lo general a lo concreto: la respuesta (con su
// motivo, barra y margen), dónde está tu dinero (lo que computa y lo que no),
// lo que te falta por hacer, el detalle por entidad separado en lo que computa
// y lo que no, y el histórico. Qué cuenta y qué no se explica en «¿Cómo funciona?».

const FOCO = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'

export function Modelo721Vista({ data: snapshot, activeYear }: { data: Modelo721; activeYear: number }) {
  const privacy = usePrivacyStore(s => s.hidden)
  // Año en curso: precios en vivo del feed sobre la foto del servidor (#303).
  const livePrices = usePricesStore(s => s.prices)
  const data = useMemo(() => liveModelo721(snapshot, livePrices), [snapshot, livePrices])
  const [ayuda, setAyuda] = useState(false)

  function exportCsv() {
    const blob = new Blob(['\uFEFF' + buildModelo721Csv(data)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `modelo721_${activeYear}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <section aria-labelledby="m721-title" className={panelSurface('none', 'overflow-hidden')}>
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 py-4 border-b border-border">
        <div className="min-w-0">
          <h3 id="m721-title" className="font-semibold text-sm text-fg">Modelo 721 · {activeYear}</h3>
          <p className="text-xs text-fg-subtle mt-1">
            {data.esAnioEnCurso
              ? <>Valor en vivo, {formatFiscalDate(data.fecha)} · cuenta el del 31 de diciembre</>
              : <>Valoración a {formatFiscalDate(data.fecha)} · plazo del 1 de enero al 31 de marzo de {activeYear + 1}</>}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <button type="button" onClick={() => setAyuda(true)} aria-haspopup="dialog"
            className={`inline-flex items-center gap-1.5 text-brand-ink hover:underline rounded ${FOCO}`}>
            <BookOpen size={13} aria-hidden="true" /> ¿Cómo funciona?
          </button>
          <Hint label={privacy ? 'Desactiva el modo privacidad para exportar' : 'Monedas por entidad y activo, para preparar el modelo'}>
            <button type="button" onClick={exportCsv} disabled={privacy || data.grupos.length === 0} className={buttonClasses('secondary', 'sm', 'flex gap-1')}>
              <Download size={11} aria-hidden="true" /> CSV del 721
            </button>
          </Hint>
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        <Veredicto721 data={data} />
        {data.presentado && <PresentadoBloque data={data} year={activeYear} />}
        <DondeEsta721 data={data} />
        <Pendientes721 data={data} year={activeYear} />
        {data.grupos.length > 0
          ? <GruposEntidad grupos={data.grupos} reglas={data.reglas} />
          : <NotApplicable>No hay monedas en exchanges a esta fecha.</NotApplicable>}
        <Historico721 historico={data.historico} umbral={data.umbral} activeYear={activeYear} />
      </div>

      {ayuda && <ComoCalculamos inicial="modelo721" onClose={() => setAyuda(false)} />}
    </section>
  )
}
