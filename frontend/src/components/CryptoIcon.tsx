import { useState } from 'react'

/**
 * Logo de un activo cripto vía CoinCap, con fallback a las iniciales si la
 * imagen no existe (activos poco comunes, nombres no estándar...).
 *
 * Mismo patrón duplicado hasta ahora en pages/fiscal/helpers.tsx
 * (AssetLogo) y pages/History.tsx (AssetLogo, definición local separada) —
 * pendientes de migrar a este componente compartido en sus propios turnos.
 * pages/Dashboard.tsx tiene una variante con anillo de color según
 * subida/bajada, genuinamente distinta (no es el mismo caso de uso).
 */
export function CryptoIcon({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const [error, setError] = useState(false)
  const src = `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`

  if (error) {
    return (
      <div
        className="rounded-full bg-accent-blue/10 flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <span className="text-accent-blue font-bold" style={{ fontSize: size * 0.35 }}>
          {symbol.slice(0, 2)}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-full overflow-hidden bg-background-tertiary shrink-0 flex items-center justify-center"
      style={{ width: size, height: size }}>
      <img
        src={src}
        alt={symbol}
        width={size}
        height={size}
        onError={() => setError(true)}
        className="w-full h-full object-cover"
      />
    </div>
  )
}
