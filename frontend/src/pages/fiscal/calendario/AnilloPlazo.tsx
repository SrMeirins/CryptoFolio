import type { FiscalHito } from '../../../api/portfolio'
import { anilloPlazo, urgencia } from '../../../utils/cicloFiscal'
import { TONO_URGENCIA } from './tonoUrgencia'

// Anillo del próximo plazo (#538): los días en el centro y, si está abierto,
// el arco con lo transcurrido del plazo. El color acompaña al texto de la
// urgencia, nunca va solo.

const R = 30, C = 2 * Math.PI * R

export function AnilloPlazo({ hito }: { hito: FiscalHito }) {
  const { numero, unidad, pct } = anilloPlazo(hito)
  const u = urgencia(hito)
  const tono = TONO_URGENCIA[u.nivel]
  return (
    <div className="relative size-[76px] shrink-0" role="img" aria-label={`${hito.titulo}: ${u.texto.toLowerCase()}`}>
      <svg viewBox="0 0 76 76" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="38" cy="38" r={R} fill="none" strokeWidth="6" className="stroke-overlay/10" />
        {pct > 0 && (
          <circle cx="38" cy="38" r={R} fill="none" strokeWidth="6" strokeLinecap="round" className={tono.trazo}
            strokeDasharray={`${(pct / 100) * C} ${C}`} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none" aria-hidden="true">
        <span className={`mono tabular-nums text-xl font-bold ${tono.texto}`}>{numero}</span>
        <span className="mt-1 text-[9px] uppercase tracking-wider text-fg-subtle text-center max-w-[56px]">{unidad}</span>
      </div>
    </div>
  )
}
