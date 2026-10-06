// Botones de aplicación rápida — "Aplicar a todos" en el header de WithdrawalDestinations
export function QuickApplyButtons({ coldWallets, onApply }: {
  coldWallets: { id: string; name: string; color: string }[]
  onApply: (dest: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-xs text-gray-500 self-center mr-1">Aplicar a todos:</span>
      <button
        type="button"
        onClick={() => onApply('__lost__')}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-red/10 hover:bg-accent-red/20 border border-accent-red/30 rounded-lg text-xs font-medium text-accent-red transition-colors"
      >
        💀 Pérdida de acceso
      </button>
      <button
        type="button"
        onClick={() => onApply('__external__')}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/30 hover:bg-gray-700/50 border border-gray-600/30 rounded-lg text-xs font-medium text-gray-300 transition-colors"
      >
        📱 Mi wallet no registrada
      </button>
      <button
        type="button"
        onClick={() => onApply('__gift__')}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-blue/10 hover:bg-accent-blue/20 border border-accent-blue/30 rounded-lg text-xs font-medium text-accent-blue transition-colors"
      >
        🎁 Regalo / pago
      </button>
      {coldWallets.slice(0, 2).map(w => (
        <button
          key={w.id}
          type="button"
          onClick={() => onApply(w.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-green/10 hover:bg-accent-green/20 border border-accent-green/30 rounded-lg text-xs font-medium text-accent-green transition-colors"
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
          {w.name}
        </button>
      ))}
    </div>
  )
}
