import { CalendarCheck, CalendarPlus, CalendarRange, CalendarX } from 'lucide-react'
import { cardClasses } from '../../components/ui'
import { LineaTiempo } from './LineaTiempo'
import { ExchangeBadge } from './ExchangeBadge'
import { textoEncaje } from './coberturaVista'
import type { CambioEncaje, CoberturaExchange, TipoEncaje } from './types'

const ICONO: Record<TipoEncaje, { icon: typeof CalendarCheck; clase: string }> = {
  primera: { icon: CalendarPlus, clase: 'text-brand' },
  rellena: { icon: CalendarCheck, clase: 'text-positive' },
  rellena_parte: { icon: CalendarRange, clase: 'text-info' },
  deja_hueco: { icon: CalendarX, clase: 'text-warning' },
  al_dia: { icon: CalendarCheck, clase: 'text-positive' },
  avanza: { icon: CalendarPlus, clase: 'text-info' },
}

// Encaje del lote en la cobertura (#328): la línea de tiempo con los archivos
// nuevos resaltados y qué rellenan, qué huecos dejan y si te ponen al día.
export function EncajeCard({ cobertura, cambios }: { cobertura: CoberturaExchange[]; cambios: CambioEncaje[] }) {
  if (cobertura.length === 0) return null
  return (
    <section aria-labelledby="encaje-titulo" className={cardClasses('md', 'space-y-4')}>
      <h2 id="encaje-titulo" className="text-sm font-medium text-fg">Cómo encaja en tu historial</h2>
      <LineaTiempo coberturas={cobertura} />
      {cambios.length > 0 ? (
        <ul className="space-y-1.5">
          {cambios.map((x, i) => {
            const { icon: Icon, clase } = ICONO[x.tipo]
            return (
              <li key={i} className="flex items-start gap-2 text-xs text-fg-muted">
                <Icon size={13} className={`shrink-0 mt-0.5 ${clase}`} aria-hidden="true" />
                <ExchangeBadge exchange={x.exchange} size={14} />
                <span>{textoEncaje(x)}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-fg-muted">Encaja sin dejar huecos nuevos.</p>
      )}
    </section>
  )
}
