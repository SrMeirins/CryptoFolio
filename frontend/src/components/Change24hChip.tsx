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
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-border text-[10px] leading-none text-gray-500 font-mono whitespace-nowrap">
            24h —
          </span>
        }>
        {change.reason}
      </InfoTooltip>
    )
  }

  const color = change.positive ? 'text-accent-green' : 'text-accent-red'
  const frame = change.positive ? 'bg-accent-green/8 border-accent-green/25' : 'bg-accent-red/8 border-accent-red/25'

  return (
    <InfoTooltip
      label="Variación 24h"
      triggerLabel={`Variación 24h: ${change.eur} (${change.pct})`}
      trigger={
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] leading-none font-mono font-semibold whitespace-nowrap ${frame} ${color}`}>
          <span aria-hidden="true">{change.positive ? '▲' : '▼'}</span>
          <span className="change24h-full">{change.eurCompact} ·</span>
          <span>{change.pctCompact}</span>
        </span>
      }>
      <p><span className={`mono font-semibold ${color}`}>{change.eur} ({change.pct})</span> en las últimas 24 horas.</p>
      {change.note}
    </InfoTooltip>
  )
}
