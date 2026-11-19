import { Link } from 'react-router-dom'
import { CalendarClock, Scale } from 'lucide-react'
import type { Modelo721 } from '../../fiscal/types'
import { badgeClasses } from '../../../components/ui'
import { formatEur, formatPercent } from '../../../utils/format'
import { MODELO721_LABELS, modelo721Status, pendingPricesText } from '../../../utils/modelo721Status'
import type { deadlineFromHito } from '../../../utils/fiscalPanel'

// Tira del Modelo 721 y el próximo plazo (#515): a la izquierda, anillo del
// valor en el extranjero frente al umbral con su veredicto (lleva al Modelo
// 721 de Fiscal); a la derecha, el próximo plazo con su línea de tiempo (abre,
// el marcador de hoy y cierra) y los días que faltan (lleva al calendario de Fiscal).

type Plazo = NonNullable<ReturnType<typeof deadlineFromHito>>
const SHORT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const corta = (d: string) => SHORT.format(new Date(`${d}T00:00:00Z`)).replace('.', '')
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

function Anillo({ pct, tono }: { pct: number; tono: string }) {
  const r = 18
  const c = 2 * Math.PI * r
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0 -rotate-90">
      <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-overlay/10" />
      <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className={tono}
        strokeDasharray={`${(Math.min(100, pct) / 100) * c} ${c}`} />
    </svg>
  )
}

export function Tira721({ modelo721, plazo, urgencia, enlace721 }: {
  modelo721: Modelo721 | undefined
  plazo: Plazo | null
  urgencia: 'calm' | 'soon' | 'urgent'
  enlace721: string
}) {
  const zona = 'flex-1 min-w-0 flex items-center gap-3 rounded-xl p-3 hover:bg-overlay/4 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60'
  const status = modelo721 ? modelo721Status(modelo721) : null
  const pct = modelo721 ? (modelo721.totalValorCustodia / modelo721.umbral) * 100 : 0
  const tonoAnillo = modelo721?.superaUmbral ? 'stroke-negative' : pct > 75 ? 'stroke-warning' : 'stroke-positive'
  const colorPlazo = { calm: 'bg-brand', soon: 'bg-warning', urgent: 'bg-negative' }[urgencia]
  return (
    // Siempre apilada: el panel Fiscal es estrecho incluso en escritorio.
    <div className="flex flex-col rounded-xl border border-border bg-overlay/2 divide-y divide-border" data-testid="tira-721">
      {modelo721 && status ? (
        <Link to={enlace721} className={zona}
          aria-label={`Modelo 721: ${MODELO721_LABELS[status]}. ${modelo721.incompleto ? 'Al menos ' : ''}${formatPercent(Math.min(pct, 999), 0)} del umbral de ${formatEur(modelo721.umbral)}.${modelo721.incompleto ? ` ${pendingPricesText(modelo721.preciosPendientes)}.` : ''} Ver el Modelo 721 en Fiscal`}>
          <span className="relative">
            <Anillo pct={pct} tono={tonoAnillo} />
            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-[10px] mono font-semibold text-fg">{Math.round(Math.min(pct, 999))}%</span>
          </span>
          <span className="min-w-0 space-y-1">
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-subtle"><Scale size={12} aria-hidden="true" /> Modelo 721</span>
            {/* Sin globo dentro del enlace (sería un control anidado): los precios pendientes, en su línea. */}
            <span className={badgeClasses(status === 'obligatorio' ? 'negative' : status === 'incompleto' ? 'warning' : 'positive')}>
              {MODELO721_LABELS[status]}
            </span>
            <span aria-hidden="true" className="block text-[11px] text-fg-subtle">del umbral de {formatEur(modelo721.umbral)}</span>
            {modelo721.incompleto && <span className="block text-[11px] text-warning-ink">{pendingPricesText(modelo721.preciosPendientes)}</span>}
          </span>
        </Link>
      ) : <div className={zona}><span className="text-xs text-fg-subtle">Modelo 721: calculando</span></div>}
      {plazo && (
        <Link to="/fiscal" className={zona}
          aria-label={`Próximo plazo: ${plazo.label}. ${plazo.status === 'open' ? (plazo.days === 0 ? 'Último día' : `${dias(plazo.days)} para cerrar`) : `${plazo.opensApprox ? 'unos ' : ''}${dias(plazo.daysToOpen)} para abrir`}; abre el ${corta(plazo.opens)} y cierra el ${corta(plazo.date)}. Ver el calendario en Fiscal`}>
          <span aria-hidden="true" className="min-w-0 flex-1 space-y-1.5">
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-subtle"><CalendarClock size={12} /> Próximo plazo</span>
              <span className="text-xs mono font-semibold text-fg">
                {plazo.status === 'pending' ? `${plazo.opensApprox ? '~' : ''}${dias(plazo.daysToOpen)} para abrir` : plazo.days === 0 ? 'Último día' : `${dias(plazo.days)} para cerrar`}
              </span>
            </span>
            <span className="block text-sm font-semibold text-fg truncate">{plazo.label}</span>
            {/* Línea de tiempo de abre a cierra con el marcador de hoy; antes de abrir, el marcador se queda al principio. */}
            <span className="relative block h-1.5 rounded-full bg-overlay/8">
              <span className={`absolute inset-y-0 left-0 rounded-full ${colorPlazo}`} style={{ width: `${plazo.status === 'open' ? Math.max(2, plazo.progress) : 0}%` }} />
              <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-fg" style={{ left: `${plazo.status === 'open' ? Math.min(100, plazo.progress) : 0}%` }} />
            </span>
            <span className="flex justify-between text-[10px] text-fg-subtle mono">
              <span>abre {plazo.opensApprox ? '~' : ''}{corta(plazo.opens)}</span>
              <span>cierra {corta(plazo.date)}</span>
            </span>
          </span>
        </Link>
      )}
    </div>
  )
}
