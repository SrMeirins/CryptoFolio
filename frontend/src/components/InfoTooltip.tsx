import { useState } from 'react'

export function InfoTooltip({ label, children, direction = 'down' }: {
  label: string
  children: React.ReactNode
  direction?: 'up' | 'down'
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}>
      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-semibold cursor-default select-none transition-all duration-150 ${
        visible
          ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/50'
          : 'bg-white/5 text-gray-600 border border-white/10 hover:border-white/20 hover:text-gray-400'
      }`}>
        ?
      </span>

      {visible && (
        <div className={`absolute left-1/2 -translate-x-1/2 z-[100] w-64 pointer-events-none ${
          direction === 'down' ? 'top-full mt-2.5' : 'bottom-full mb-2.5'
        }`}>
          {direction === 'down' && (
            <div className="flex justify-center -mb-px">
              <div className="w-2.5 h-2.5 rotate-45 border-l border-t border-white/10 bg-gray-950/90 backdrop-blur-xl" />
            </div>
          )}
          <div className="relative rounded-xl border border-white/10 bg-gray-950/90 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-4 animate-slide-in">
            <div className="absolute inset-x-0 top-0 h-px rounded-t-xl bg-gradient-to-r from-transparent via-accent-blue/40 to-transparent" />
            <p className="text-[10px] font-semibold tracking-widest text-accent-blue/80 uppercase mb-2">{label}</p>
            <div className="text-[11px] text-gray-300 leading-relaxed space-y-2">{children}</div>
          </div>
          {direction === 'up' && (
            <div className="flex justify-center -mt-px">
              <div className="w-2.5 h-2.5 rotate-45 border-r border-b border-white/10 bg-gray-950/90 backdrop-blur-xl" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
