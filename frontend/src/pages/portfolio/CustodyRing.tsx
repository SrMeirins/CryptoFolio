// Mini anillo de custodia (#283, #525): autocustodia en color de marca y
// exchanges en ámbar. Decorativo: la cifra va siempre en texto al lado.

export function CustodyRing({ selfPct }: { selfPct: number }) {
  const r = 9
  const c = 2 * Math.PI * r
  const self = (Math.min(100, Math.max(0, selfPct)) / 100) * c
  return (
    <svg viewBox="0 0 24 24" className="size-7 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="4" className="stroke-warning/80" />
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="4" className="stroke-brand transition-[stroke-dasharray] duration-500"
        strokeDasharray={`${self} ${c}`} strokeLinecap={self > 0 && self < c ? 'round' : 'butt'} />
    </svg>
  )
}
