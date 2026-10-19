import { useState } from 'react'
import { CalendarClock, ChevronDown } from 'lucide-react'
import type { FiscalCalendar, FiscalHito } from '../../api/portfolio'
import { formatEur } from '../../utils/format'
import { formatFiscalDate } from '../../utils/fiscalTable'
import { buttonClasses } from '../../components/ui'

// Calendario fiscal (#309): franja con el próximo hito que se despliega en la
// línea de tiempo del ciclo (cierre → 721 → Renta). Fechas y estado vienen del
// backend, igual que en el Dashboard y la campana.

const plural = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

function plazo(h: FiscalHito): string {
  if (h.estado === 'proximo') return `${h.inicioAproximado ? 'abre hacia' : 'abre el'} ${formatFiscalDate(h.desde)} · faltan ${plural(h.diasParaAbrir)}`
  return h.diasRestantes === 0 ? 'hoy es el último día' : `${plural(h.diasRestantes)} para el ${formatFiscalDate(h.hasta)}`
}

const ACCION: Record<FiscalHito['id'], string> = { cierre: 'Planificar', modelo721: 'Ver Modelo 721', renta: 'Ver el ejercicio' }

function Detalle({ h, neto, enCurso }: { h: FiscalHito; neto: number | undefined; enCurso: boolean }) {
  if (h.id === 'modelo721') {
    return h.obligado === true ? <span className="text-negative">Obligado a presentarlo</span>
      : h.obligado === false ? <span className="text-positive">Sin obligación</span>
      : <span className="text-warning">Por confirmar</span>
  }
  // Si el ejercicio aún no ha terminado, el neto es provisional.
  if (h.id === 'renta') return neto === undefined ? null : <>{enCurso ? 'Neto hasta hoy' : 'A declarar'}: <span className="mono">{`${neto >= 0 ? '+' : ''}${formatEur(neto)}`}</span></>
  return <>Realiza ganancias o pérdidas antes del 31 dic</>
}

export function CalendarioFiscal({ data, netoPorAnio, onGo }: {
  data: FiscalCalendar
  netoPorAnio: ReadonlyMap<number, number>
  onGo: (h: FiscalHito) => void
}) {
  const [open, setOpen] = useState(false)
  const p = data.proximo
  const urgent = p.estado === 'en-curso' && p.diasRestantes <= 7
  const soon = p.estado === 'en-curso' && p.diasRestantes <= 30
  return (
    <section aria-label="Calendario fiscal" className="rounded-xl border border-border bg-background-card">
      <div className="flex items-center gap-3 flex-wrap px-4 py-2.5">
        <CalendarClock size={15} className={urgent ? 'text-negative' : soon ? 'text-warning' : 'text-brand'} aria-hidden="true" />
        <p className="text-sm text-fg-muted flex-1 min-w-[14rem]">
          <span className="text-fg-subtle">Próximo:</span> <span className="font-semibold text-fg">{p.titulo}</span>
          <span className={`ml-1.5 mono text-xs ${urgent ? 'text-negative' : soon ? 'text-warning' : 'text-fg-subtle'}`}>· {plazo(p)}</span>
        </p>
        <button type="button" onClick={() => onGo(p)} className={buttonClasses('secondary', 'sm')}>{ACCION[p.id]}</button>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="calendario-ciclo"
          className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 rounded-md px-1">
          Calendario <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <ol id="calendario-ciclo" className="grid gap-2 sm:grid-cols-3 px-4 pb-4 border-t border-border pt-3">
          {data.hitos.map(h => {
            const actual = h.id === p.id && h.ejercicio === p.ejercicio
            return (
              <li key={`${h.id}-${h.ejercicio}`} aria-current={actual ? 'step' : undefined}
                className={`rounded-xl border p-3 space-y-1.5 text-xs ${actual ? 'border-brand/40 bg-brand/5' : 'border-border'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-fg">{h.titulo}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${h.estado === 'en-curso' ? 'bg-positive/10 text-positive' : 'bg-overlay/8 text-fg-subtle'}`}>
                    {h.estado === 'en-curso' ? 'abierto' : 'próximo'}
                  </span>
                </div>
                <p className="text-fg-subtle">
                  {h.inicioAproximado ? 'Principios de abril' : formatFiscalDate(h.desde)} – {formatFiscalDate(h.hasta)}
                </p>
                {h.estado === 'en-curso' && (
                  <div className="h-1 rounded-full bg-overlay/8 overflow-hidden" role="img" aria-label={`${Math.round(h.progreso)} % del plazo transcurrido`}>
                    <span className="block h-full bg-brand rounded-full" style={{ width: `${Math.max(2, h.progreso)}%` }} />
                  </div>
                )}
                <p className="text-fg-muted">{plazo(h)}</p>
                <p className="text-fg-muted"><Detalle h={h} neto={netoPorAnio.get(h.ejercicio)} enCurso={h.ejercicio === Number(data.hoy.slice(0, 4))} /></p>
                <button type="button" onClick={() => onGo(h)} className="text-brand hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 rounded">{ACCION[h.id]} →</button>
              </li>
            )
          })}
        </ol>
      )}
      <p className="sr-only">Fechas habituales; la AEAT publica cada año el calendario oficial.</p>
    </section>
  )
}
