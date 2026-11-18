import { CryptoIcon } from '../../../components/CryptoIcon'
import { InfoTooltip } from '../../../components/InfoTooltip'
import { REFERENCIAS, type Referencia } from '../../../utils/evolucionReferencia'

// «Comparar» de la evolución (#510): botones con el icono de cada moneda y una
// ayuda que explica qué significa la línea de la referencia.

export function CompararCon({ valor, onChange, estado }: {
  valor: Referencia | null
  onChange: (r: Referencia | null) => void
  /** Texto bajo los botones: qué se ve, o por qué aún no. */
  estado?: React.ReactNode
}) {
  const boton = (activo: boolean) => `inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand
    ${activo ? 'bg-background-card text-fg shadow-sm ring-1 ring-border' : 'text-fg-muted hover:text-fg'}`
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-fg-subtle" id="comparar-etiqueta">Comparar</span>
      <div role="group" aria-labelledby="comparar-etiqueta" className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-background-tertiary">
        <button type="button" aria-pressed={valor === null} onClick={() => onChange(null)} className={boton(valor === null)}>Ninguno</button>
        {REFERENCIAS.map(r => (
          <button key={r} type="button" aria-pressed={valor === r} onClick={() => onChange(r)} className={boton(valor === r)}
            aria-label={`Comparar con ${r}`}>
            <CryptoIcon symbol={r} size={14} />{r}
          </button>
        ))}
      </div>
      <InfoTooltip label="Qué muestra la comparación">
        <p>La línea naranja responde a: ¿qué tendrías si, con tus mismos depósitos y retiradas y en las mismas fechas, hubieras tenido {valor ?? 'BTC o ETH'} en lugar de tu cartera?</p>
        <p className="mt-1.5">Parte del mismo punto que tu cartera al inicio de lo visible (también con zoom) y se ve en la misma unidad: %, euros o valor.</p>
        <p className="mt-1.5 text-fg-subtle">Precios de cierre de cada día (en 24 h, cada 15 minutos) en tu moneda de visualización.</p>
      </InfoTooltip>
      {estado && <span className="text-[11px] text-fg-subtle">{estado}</span>}
    </div>
  )
}
