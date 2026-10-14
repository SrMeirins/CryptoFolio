import { useId, useState } from 'react'

export function InfoTooltip({ label, children, direction = 'down', trigger, triggerLabel }: {
  label: string
  children: React.ReactNode
  direction?: 'up' | 'down'
  // Contenido visible del disparador en lugar del "?" (p. ej. el chip de 24h).
  trigger?: React.ReactNode
  // Nombre accesible del disparador; por defecto, `label`.
  triggerLabel?: string
}) {
  const [visible, setVisible] = useState(false)
  const tooltipId = useId()

  return (
    <div className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}>
      {trigger ? (
        <button
          type="button"
          aria-label={triggerLabel ?? label}
          aria-describedby={visible ? tooltipId : undefined}
          onFocus={() => setVisible(true)}
          onBlur={() => setVisible(false)}
          className="cursor-default rounded-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
          {trigger}
        </button>
      ) : (
      <button
        type="button"
        aria-label={label}
        aria-describedby={visible ? tooltipId : undefined}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-xs font-semibold cursor-default select-none transition-all duration-150 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${
          visible
            ? 'bg-brand/20 text-brand border border-brand/50'
            : 'bg-overlay/5 text-fg-subtle border border-overlay/10 hover:border-overlay/20 hover:text-fg-muted'
        }`}>
        ?
      </button>
      )}

      {visible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`absolute left-1/2 -translate-x-1/2 z-100 w-64 pointer-events-none ${
            direction === 'down' ? 'top-full mt-2.5' : 'bottom-full mb-2.5'
          }`}>
          {direction === 'down' && (
            <div className="flex justify-center -mb-px">
              <div className="w-2.5 h-2.5 rotate-45 border-l border-t border-overlay/10 bg-tooltip/90 backdrop-blur-xl" />
            </div>
          )}
          <div className="relative rounded-xl border border-overlay/10 bg-tooltip/90 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-4 animate-slide-in">
            <div className="absolute inset-x-0 top-0 h-px rounded-t-xl bg-linear-to-r from-transparent via-brand/40 to-transparent" />
            <p className="text-[11px] font-semibold tracking-widest text-brand/80 uppercase mb-2">{label}</p>
            <div className="text-xs text-fg leading-relaxed space-y-2">{children}</div>
          </div>
          {direction === 'up' && (
            <div className="flex justify-center -mt-px">
              <div className="w-2.5 h-2.5 rotate-45 border-r border-b border-overlay/10 bg-tooltip/90 backdrop-blur-xl" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
