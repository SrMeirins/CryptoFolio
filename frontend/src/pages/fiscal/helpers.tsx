import { useState } from 'react'
import { formatEur } from '../../utils/format'

export const PNL_THRESHOLD = 0.005

export function pnlBg(val: number) {
  if (val > 0) return 'bg-accent-green/5 border-accent-green/20'
  if (val < 0) return 'bg-accent-red/5 border-accent-red/20'
  return 'bg-background-tertiary border-border'
}

export const TRAMOS = [
  { hasta: 6_000,    tipo: 19, label: '0 – 6.000 €' },
  { hasta: 50_000,   tipo: 21, label: '6.001 – 50.000 €' },
  { hasta: 200_000,  tipo: 23, label: '50.001 – 200.000 €' },
  { hasta: 300_000,  tipo: 27, label: '200.001 – 300.000 €' },
  { hasta: Infinity, tipo: 28, label: '> 300.000 €' },
]

export function calcularTramos(base: number): { tramo: string; tipo: number; cuota: number }[] {
  if (base <= 0) return []
  const result = []
  let restante = base
  let anterior = 0
  for (const t of TRAMOS) {
    if (restante <= 0) break
    const tramo = Math.min(restante, t.hasta - anterior)
    if (tramo > 0) result.push({ tramo: t.label, tipo: t.tipo, cuota: tramo * (t.tipo / 100) })
    restante -= tramo
    anterior = t.hasta
  }
  return result
}

export function tramoActivo(base: number): number {
  for (const t of TRAMOS) {
    if (base <= t.hasta) return t.tipo
  }
  return 28
}

export function AssetLogo({ symbol, size = 24 }: { symbol: string; size?: number }) {
  const [ok, setOk] = useState(true)
  const url = `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`
  if (ok) {
    return (
      <img
        src={url}
        alt={symbol}
        width={size}
        height={size}
        className="rounded-full"
        onError={() => setOk(false)}
      />
    )
  }
  return (
    <div
      className="rounded-full bg-background-tertiary flex items-center justify-center text-xs font-bold text-gray-300"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {symbol.slice(0, 2)}
    </div>
  )
}

export function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number; name?: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-background-card border border-border rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className={`font-bold mono ${(p.value ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
          {p.name && <span className="text-gray-500 font-normal mr-1">{p.name}</span>}
          {(p.value ?? 0) >= 0 ? '+' : ''}{formatEur(p.value ?? 0)}
        </p>
      ))}
    </div>
  )
}
