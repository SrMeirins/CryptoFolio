import { WindowChip } from './WindowChip'

// Chip de variación de 24 h de la tarjeta «Valor» (#152, #247). Contenido
// según el ancho de la propia tarjeta (container query en index.css):
// completo «24 h ▲ +146 € · +1,2 %» si hay sitio; compacto «24 h ▲ +1,2 %»
// si no. El tooltip siempre da el detalle completo.

// Variación de 24h de la tarjeta Valor (#210). Nunca se oculta: sin dato se
// muestra «24h —» con el motivo (#147).
export type Change24h =
  | {
      kind: 'value'
      eur: string          // detalle completo, p. ej. "-202,57 €"
      pct: string          // detalle completo, p. ej. "-2.03%"
      eurCompact: string   // chip, p. ej. "-203 €"
      pctCompact: string   // chip, p. ej. "-2.0%"
      positive: boolean
      note?: React.ReactNode
    }
  | { kind: 'unavailable'; reason: string }
export function Change24hChip({ change }: { change: Change24h }) {
  if (change.kind === 'unavailable') {
    return (
      <WindowChip window="24h" tone="neutral" triggerLabel="Variación 24 h no disponible" tooltip={<p>{change.reason}</p>}>
        —
      </WindowChip>
    )
  }

  const color = change.positive ? 'text-positive' : 'text-negative'
  return (
    <WindowChip window="24h" tone={change.positive ? 'positive' : 'negative'}
      triggerLabel={`Variación 24 h: ${change.eur} (${change.pct})`}
      tooltip={<>
        <p><span className={`mono font-semibold ${color}`}>{change.eur} ({change.pct})</span> en las últimas 24 horas.</p>
        {change.note}
      </>}>
      <span aria-hidden="true">{change.positive ? '▲' : '▼'} </span>
      <span className="change24h-full">{change.eurCompact} · </span>
      <span>{change.pctCompact}</span>
    </WindowChip>
  )
}
