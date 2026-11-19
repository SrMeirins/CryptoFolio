import { Link } from 'react-router-dom'
import { AnimatedNumber } from '../../../components/AnimatedNumber'
import { InfoTooltip } from '../../../components/InfoTooltip'
import { formatEur } from '../../../utils/format'

// Héroe del panel Fiscal (#515): ganancia o pérdida realizada del ejercicio
// (lleva a Fiscal) e IRPF estimado (lleva a Planificar o, en un ejercicio
// cerrado, a su Resumen), cada una con su desglose en la ayuda.

// Sin signo lo que redondea a cero: nunca «−0,00 €».
const signed = (n: number) => `${n >= 0.005 ? '+' : n <= -0.005 ? '−' : ''}${formatEur(Math.abs(n))}`
const fila = (k: string, v: string) => <div className="flex justify-between gap-4"><dt className="text-fg-subtle">{k}</dt><dd className="mono">{v}</dd></div>

export function HeroeFiscal({ year, enCurso, gainLoss, gains, losses, ops, rendimientos, base, compensado, tax, enlaces }: {
  year: number
  enCurso: boolean
  gainLoss: number
  gains: number
  losses: number
  ops: number
  /** Rendimientos del capital (staking, lending) del ejercicio; null mientras carga. */
  rendimientos: number | null
  /** Base del ahorro tras compensar; null mientras carga. */
  base: number | null
  compensado: number
  tax: number | null
  enlaces: { resultado: string; irpf: string }
}) {
  const enlace = 'block rounded-lg -mx-1 px-1 hover:bg-overlay/4 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap" data-testid="heroe-fiscal">
      <div>
        <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-fg-subtle">
          Ganancia o pérdida {year}
          <InfoTooltip label="Desglose de la ganancia o pérdida">
            <dl className="space-y-0.5 min-w-52">
              {fila('Ganancias', signed(gains))}
              {fila('Pérdidas', signed(-Math.abs(losses)))}
              {fila('Operaciones', String(ops))}
            </dl>
            <p className="mt-1.5 text-fg-subtle">Ganancias y pérdidas patrimoniales realizadas (ventas y permutas) del ejercicio, sin rendimientos del staking ni compensación de años anteriores.</p>
          </InfoTooltip>
        </p>
        <Link to={enlaces.resultado} aria-label={`Ganancia o pérdida de ${year}: ${signed(gainLoss)}. Ver el ejercicio en Fiscal`} className={enlace}>
          <span className={`mono text-3xl font-bold tracking-tight leading-tight ${gainLoss >= 0 ? 'text-positive-ink' : 'text-negative-ink'}`}>
            <AnimatedNumber value={gainLoss} countUp format={signed} />
          </span>
        </Link>
      </div>
      <div className="text-right">
        <p className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wider text-fg-subtle">
          IRPF estimado
          <InfoTooltip label="Desglose del IRPF estimado">
            <dl className="space-y-0.5 min-w-56 text-left">
              {fila('Ganancia o pérdida', signed(gainLoss))}
              {rendimientos !== null && fila('Rendimientos', signed(rendimientos))}
              {compensado > 0.01 && fila('Pérdidas compensadas', `−${formatEur(compensado)}`)}
              {base !== null && fila('Base del ahorro', formatEur(Math.max(0, base)))}
              {tax !== null && fila('Cuota estimada', formatEur(tax))}
            </dl>
            <p className="mt-1.5 text-fg-subtle text-left">Con la escala del ahorro de {year}. Es una estimación: la cuota final depende del resto de tu declaración.</p>
          </InfoTooltip>
        </p>
        <Link to={enlaces.irpf} aria-label={`IRPF estimado de ${year}: ${tax === null ? 'calculando' : formatEur(tax)}. ${enCurso ? 'Planificar el ejercicio en Fiscal' : 'Ver la cuota en el Resumen de Fiscal'}`} className={enlace}>
          <span className="mono text-xl font-semibold text-fg leading-tight">{tax === null ? '—' : formatEur(tax)}</span>
        </Link>
        {compensado > 0.01 && <p className="text-[11px] text-fg-subtle">tras compensar pérdidas</p>}
      </div>
    </div>
  )
}
