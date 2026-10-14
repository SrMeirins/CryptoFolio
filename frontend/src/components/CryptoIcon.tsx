import { useState } from 'react'
import { useAssetIcons } from '../hooks/useAssetIcons'
import { assetHue, assetInitials } from '../utils/assetInitials'

/**
 * Logo de un activo, servido por el propio backend (#201); si no hay logo,
 * iniciales con un color estable derivado del símbolo. Sin peticiones a
 * servicios externos desde el navegador.
 *
 * `ring-3`: color opcional del anillo exterior (p. ej. verde/rojo en mejores y peores).
 */
export function CryptoIcon({ symbol, size = 28, ring }: { symbol: string; size?: number; ring?: string }) {
  const icons = useAssetIcons()
  const [failed, setFailed] = useState(false)
  const key = symbol.toUpperCase()
  const version = icons[key]
  const ringStyle = ring ? { boxShadow: `0 0 0 2px ${ring}30` } : undefined

  if (version === undefined || failed) {
    const hue = assetHue(symbol)
    return (
      <div
        role="img"
        aria-label={symbol}
        className="rounded-full flex items-center justify-center shrink-0 font-bold"
        style={{
          width: size, height: size, fontSize: Math.max(10, size * 0.36),
          background: `hsl(${hue} 60% 50% / 0.18)`, color: `hsl(${hue} 65% 62%)`, ...ringStyle,
        }}
      >
        <span aria-hidden="true">{assetInitials(symbol)}</span>
      </div>
    )
  }

  return (
    <div className="rounded-full overflow-hidden bg-background-tertiary shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, ...ringStyle }}>
      <img
        src={`/api/assets/${encodeURIComponent(key)}/icon?v=${version}`}
        alt={symbol}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
    </div>
  )
}
