import { CalendarPlus } from 'lucide-react'
import type { FiscalHito } from '../../../api/portfolio'
import { buttonClasses, Hint } from '../../../components/ui'
import { buildIcs, plazosParaCalendario } from '../../../utils/calendarioIcs'

// «Añadir al calendario» (#538): descarga un .ics con todos los plazos que
// vienen, con avisos 30 y 7 días antes. Se importa con un clic en cualquier
// app de correo o calendario.

export function AnadirCalendario({ ciclo }: { ciclo: readonly FiscalHito[] }) {
  const plazos = plazosParaCalendario(ciclo)
  if (plazos.length === 0) return null

  function descargar() {
    const blob = new Blob([buildIcs(plazos)], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'plazos-fiscales.ics'
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <Hint label={`Descarga un .ics con ${plazos.length} ${plazos.length === 1 ? 'plazo' : 'plazos'} y avisos 30 y 7 días antes, para tu app de correo o calendario`}>
      <button type="button" onClick={descargar} className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}>
        <CalendarPlus size={13} aria-hidden="true" />
        Añadir al calendario
      </button>
    </Hint>
  )
}
