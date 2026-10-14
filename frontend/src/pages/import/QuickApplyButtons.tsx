// Botones de aplicación rápida — "Aplicar a todos" en el header de WithdrawalDestinations
export function QuickApplyButtons({ coldWallets, onApply }: {
  coldWallets: { id: string; name: string; color: string }[]
  onApply: (dest: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-xs text-fg-subtle self-center mr-1">Aplicar a todos:</span>
      <button
        type="button"
        onClick={() => onApply('__lost__')}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-negative/10 hover:bg-negative/20 border border-negative/30 rounded-lg text-xs font-medium text-negative transition-colors"
      >
        💀 Pérdida de acceso
      </button>
      <button
        type="button"
        onClick={() => onApply('__external__')}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-overlay/30 hover:bg-overlay/50 border border-border/30 rounded-lg text-xs font-medium text-fg transition-colors"
      >
        📱 Mi wallet no registrada
      </button>
      <button
        type="button"
        onClick={() => onApply('__gift__')}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-brand/10 hover:bg-brand/20 border border-brand/30 rounded-lg text-xs font-medium text-brand transition-colors"
      >
        🎁 Regalo / pago
      </button>
      {coldWallets.slice(0, 2).map(w => (
        <button
          key={w.id}
          type="button"
          onClick={() => onApply(w.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-positive/10 hover:bg-positive/20 border border-positive/30 rounded-lg text-xs font-medium text-positive transition-colors"
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
          {w.name}
        </button>
      ))}
    </div>
  )
}
