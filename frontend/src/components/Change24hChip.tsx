import { InfoTooltip } from './InfoTooltip'
import type { Change24h } from './MetricCard'

// Chip de variación de 24h en la cabecera de la tarjeta "Valor" (#152).
// Contenido según el ancho de la propia tarjeta (container query en index.css):
// completo "▲ +146 € · +1,2%" si hay sitio; compacto "▲ +1,2%" si no. El
// tooltip siempre da el detalle completo. El signo se indica con flecha y
// texto, no solo con color.
export function Change24hChip({ change }: { change: Change24h }) {
  if (change.kind === 'unavailable') {
    return (
      <InfoTooltip
        label="Variación 24h no disponible"
        trigger={
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-lg border border-border text-xs leading-none text-fg-subtle mono whitespace-nowrap">
            24h —
          </span>
        }>
        {change.reason}
      </InfoTooltip>
    )
  }

  const color = change.positive ? 'text-positive' : 'text-negative'
  const frame = change.positive ? 'bg-positive/8 border-positive/25' : 'bg-negative/8 border-negative/25'

  return (
    <InfoTooltip
      label="Variación 24h"
      triggerLabel={`Variación 24h: ${change.eur} (${change.pct})`}
      trigger={
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-xs leading-none mono font-semibold whitespace-nowrap ${frame} ${color}`}>
          <span aria-hidden="true">{change.positive ? '▲' : '▼'}</span>
          <span className="change24h-full">{change.eurCompact} ·</span>
          <span>{change.pctCompact}</span>
        </span>
      }>
      <p><span className={`mono font-semibold ${color}`}>{change.eur} ({change.pct})</span> en las últimas 24 horas.</p>
      {change.note}
      <p className="mt-1.5 text-fg-subtle">Ventana móvil de 24 h; el día de hoy del calendario de P&L cuenta desde las 00:00 y descuenta depósitos y retiradas.</p>
    </InfoTooltip>
  )
}
