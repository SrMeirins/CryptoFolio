import type { ReactNode } from 'react'
import { PANEL_INFO } from '../../constants/dashboardPaneles'
import type { PanelId } from '../../utils/dashboardDiseno'

// Miniatura esquemática de cada panel del Dashboard (#521): su forma (curva,
// barras, anillo, calendario, lista…) en el color del panel, para reconocerlo
// de un vistazo en el modo Personalizar. Decorativa: el nombre va al lado.

const FORMAS: Record<PanelId, ReactNode> = {
  resumen: (
    <>
      {[0, 1, 2, 3, 4].map(i => (
        <rect key={i} x={3 + i * 15.2} y="10" width="13" height="28" rx="2.5" stroke="none" fill="currentColor" opacity={[0.85, 0.5, 0.35, 0.5, 0.3][i]} />
      ))}
      <path d="M5 30 L8 27 L11 28 L14 22" fill="none" strokeWidth="1.6" stroke="var(--cf-bg-card)" strokeLinecap="round" />
    </>
  ),
  metas: (
    <>
      {[14, 40, 66].map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy="24" r="9" fill="none" strokeWidth="3.5" opacity="0.22" />
          <circle cx={cx} cy="24" r="9" fill="none" strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={`${[42, 28, 52][i]} 60`} transform={`rotate(-90 ${cx} 24)`} />
        </g>
      ))}
    </>
  ),
  variacion: (
    <>
      {[[4, 6, 30, 18, 0.9], [36, 6, 18, 18, 0.55], [56, 6, 20, 10, 0.35], [56, 18, 20, 6, 0.7], [4, 26, 18, 16, 0.4], [24, 26, 26, 16, 0.75], [52, 26, 24, 16, 0.25]].map(([x, y, w, h, o]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="2" stroke="none" fill="currentColor" opacity={o} />
      ))}
    </>
  ),
  evolucion: (
    <>
      <path d="M4 38 L16 30 L26 33 L38 20 L50 24 L62 12 L76 8 L76 44 L4 44 Z" stroke="none" fill="currentColor" opacity="0.18" />
      <path d="M4 38 L16 30 L26 33 L38 20 L50 24 L62 12 L76 8" fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="76" cy="8" r="2.8" stroke="none" fill="currentColor" />
    </>
  ),
  rendimiento: (
    <>
      {Array.from({ length: 18 }, (_, i) => {
        const o = [0.8, 0.3, 0.55, 0.9, 0.2, 0.6, 0.4, 0.75, 0.25, 0.5, 0.85, 0.35, 0.65, 0.2, 0.7, 0.45, 0.9, 0.3][i]
        return <rect key={i} x={4 + (i % 6) * 12.5} y={7 + Math.floor(i / 6) * 12} width="10.5" height="10" rx="2" stroke="none" fill="currentColor" opacity={o} />
      })}
    </>
  ),
  'pnl-diario': (
    <>
      <line x1="4" y1="26" x2="76" y2="26" strokeWidth="1" opacity="0.35" />
      {[[-10], [6], [-14], [12], [8], [-6], [16], [-4], [10], [-12], [14], [6]].map(([h], i) => (
        <rect key={i} x={5 + i * 6} y={h > 0 ? 26 - h : 26} width="4" height={Math.abs(h)} rx="1" stroke="none" fill="currentColor" opacity={h > 0 ? 0.9 : 0.4} />
      ))}
    </>
  ),
  distribucion: (
    <>
      <circle cx="24" cy="24" r="14" fill="none" strokeWidth="7" opacity="0.22" />
      <circle cx="24" cy="24" r="14" fill="none" strokeWidth="7" strokeDasharray="44 88" transform="rotate(-90 24 24)" />
      <circle cx="24" cy="24" r="14" fill="none" strokeWidth="7" strokeDasharray="20 88" strokeDashoffset="-46" transform="rotate(-90 24 24)" opacity="0.6" />
      {[12, 22, 32].map((y, i) => <rect key={y} x="46" y={y} width={[28, 20, 14][i]} height="5" rx="2.5" stroke="none" fill="currentColor" opacity={[0.9, 0.6, 0.35][i]} />)}
    </>
  ),
  fiscal: (
    <>
      <rect x="4" y="8" width="34" height="9" rx="2" stroke="none" fill="currentColor" opacity="0.9" />
      <rect x="4" y="21" width="72" height="5" rx="2.5" stroke="none" fill="currentColor" opacity="0.22" />
      <rect x="4" y="21" width="46" height="5" rx="2.5" stroke="none" fill="currentColor" opacity="0.75" />
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={4 + i * 6.1} y={32} width="4.6" height="9" rx="1" stroke="none" fill="currentColor" opacity={[0.3, 0.5, 0.2, 0.7, 0.4, 0.9, 0.3, 0.6, 0.2, 0.5, 0.8, 0.4][i]} />)}
    </>
  ),
  actividad: (
    <>
      {[9, 21, 33].map((y, i) => (
        <g key={y}>
          <circle cx="9" cy={y} r="4" stroke="none" fill="currentColor" opacity={[0.9, 0.6, 0.4][i]} />
          <rect x="18" y={y - 3} width={[40, 32, 46][i]} height="6" rx="3" stroke="none" fill="currentColor" opacity="0.3" />
          <rect x="66" y={y - 3} width="10" height="6" rx="3" stroke="none" fill="currentColor" opacity="0.7" />
        </g>
      ))}
    </>
  ),
  ingresos: (
    <>
      {[8, 12, 10, 16, 14, 20, 18, 24, 22, 28].map((h, i) => (
        <g key={i}>
          <rect x={5 + i * 7.2} y={42 - h} width="5" height={h * 0.6} rx="1" stroke="none" fill="currentColor" opacity="0.9" />
          <rect x={5 + i * 7.2} y={42 - h * 0.4} width="5" height={h * 0.4} rx="1" stroke="none" fill="currentColor" opacity="0.4" />
        </g>
      ))}
    </>
  ),
}

export function MiniaturaPanel({ id, apagada = false, className = '' }: { id: PanelId; apagada?: boolean; className?: string }) {
  const { color } = PANEL_INFO[id]
  return (
    <span aria-hidden="true" className={`flex items-center justify-center rounded-lg border border-border/60 overflow-hidden transition-opacity ${apagada ? 'opacity-35 grayscale' : ''} ${className}`}
      style={{ backgroundColor: `color-mix(in srgb, ${color} 7%, transparent)`, color }}>
      <svg viewBox="0 0 80 48" className="size-full p-1" stroke="currentColor">{FORMAS[id]}</svg>
    </span>
  )
}
