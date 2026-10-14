// Clases de los componentes base (#199), separadas de los componentes para
// poder probarlas sin navegador y para que Fast Refresh funcione (los
// ficheros .tsx solo exportan componentes). twMerge resuelve los conflictos:
// las clases extra (p. ej. px-5 o gap-1.5) sustituyen a las del componente.
import { twMerge } from 'tailwind-merge'

// ── Button ──
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'
const BASE = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors '
  + 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:cursor-not-allowed'
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-solid text-on-brand hover:bg-brand-solid/90',
  secondary: 'bg-background-tertiary text-fg border border-border hover:border-fg-subtle',
  ghost: 'text-fg-muted hover:text-fg hover:bg-overlay/5',
  danger: 'bg-negative text-on-negative hover:bg-negative/90',
  success: 'bg-positive text-on-positive hover:bg-positive/90',
}
const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
}
export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra = ''): string {
  return twMerge(BASE, VARIANTS[variant], SIZES[size], extra)
}

// ── IconButton ──
export type IconButtonSize = 'sm' | 'md'
export type IconButtonTone = 'neutral' | 'danger' | 'positive' | 'brand'
const ICON_TONES: Record<IconButtonTone, string> = {
  neutral: 'text-fg-subtle hover:text-fg hover:bg-overlay/5',
  danger: 'text-fg-subtle hover:text-negative hover:bg-negative/10',
  positive: 'text-positive hover:bg-positive/10',
  brand: 'text-fg-subtle hover:text-brand hover:bg-brand/10',
}
export function iconButtonClasses(size: IconButtonSize = 'md', active = false, extra = '', tone: IconButtonTone = 'neutral'): string {
  return twMerge([
    'inline-flex items-center justify-center rounded-lg transition-colors shrink-0',
    'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:cursor-not-allowed',
    size === 'sm' ? 'p-1' : 'p-1.5',
    active ? 'bg-background-tertiary text-fg' : ICON_TONES[tone],
    extra,
  ].filter(Boolean).join(' '))
}

// ── Card ──
export type CardPadding = 'none' | 'sm' | 'md'
const PADDING: Record<CardPadding, string> = { none: '', sm: 'p-4', md: 'p-5' }
export function cardClasses(padding: CardPadding = 'md', extra = ''): string {
  return twMerge('bg-background-card border border-border rounded-xl', PADDING[padding], extra)
}

// ── Badge ──
export type BadgeTone = 'neutral' | 'brand' | 'info' | 'positive' | 'negative' | 'warning' | 'purple'
export type BadgeSize = 'sm' | 'md'
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-overlay/8 text-fg-muted',
  brand: 'bg-brand/12 text-brand',
  info: 'bg-info/12 text-info',
  positive: 'bg-positive/12 text-positive',
  negative: 'bg-negative/12 text-negative',
  warning: 'bg-warning/12 text-warning',
  purple: 'bg-accent-purple/12 text-accent-purple',
}
export function badgeClasses(tone: BadgeTone = 'neutral', size: BadgeSize = 'sm', extra = ''): string {
  return twMerge([
    'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
    size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
    TONES[tone], extra,
  ].filter(Boolean).join(' '))
}

// ── SegmentedControl ──
export type SegmentedSize = 'sm' | 'md'
export function segmentClasses(active: boolean, size: SegmentedSize = 'sm'): string {
  return [
    'whitespace-nowrap rounded-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
    'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand',
    size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs',
    active ? 'bg-background-card text-fg shadow-xs' : 'text-fg-subtle hover:text-fg',
  ].join(' ')
}

// ── Tabs ──
export type TabsVariant = 'pill' | 'underline'
export function tabClasses(active: boolean, variant: TabsVariant = 'pill'): string {
  const base = 'whitespace-nowrap font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'
  if (variant === 'underline') {
    return `${base} px-5 py-2.5 text-sm border-b-2 -mb-px ${active ? 'border-brand text-fg' : 'border-transparent text-fg-subtle hover:text-fg'}`
  }
  return `${base} px-2.5 py-1 text-xs rounded-lg ${active ? 'bg-brand/15 text-brand' : 'text-fg-subtle hover:text-fg'}`
}
export const tabId = (idBase: string, value: string) => `${idBase}-tab-${value}`
export const tabPanelId = (idBase: string) => `${idBase}-panel`
