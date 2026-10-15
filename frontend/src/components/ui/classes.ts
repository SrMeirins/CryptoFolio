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
/** `accent`: la opción activa la marca un indicador deslizante con el color de acento (cabecera, #200). */
export type SegmentedVariant = 'default' | 'accent'
export function segmentClasses(active: boolean, size: SegmentedSize = 'sm', variant: SegmentedVariant = 'default'): string {
  const state = variant === 'accent'
    ? (active ? 'relative z-10 text-brand' : 'relative z-10 text-fg-subtle hover:text-fg')
    : (active ? 'bg-background-card text-fg shadow-xs' : 'text-fg-subtle hover:text-fg')
  return [
    'whitespace-nowrap rounded-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
    'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand',
    size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs',
    state,
  ].join(' ')
}
/** Indicador deslizante de la variante `accent`; sin animación con «reducir movimiento». */
export function segmentThumbClasses(): string {
  return 'absolute top-0.5 bottom-0.5 left-0 rounded-md bg-brand/15 border border-brand/40 shadow-xs '
    + 'transition-[transform,width] duration-200 ease-out motion-reduce:transition-none pointer-events-none'
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
// ── Campos de formulario (Input, Select) ──
export type FieldSize = 'sm' | 'md'
export function fieldClasses(size: FieldSize = 'md', invalid = false, extra = ''): string {
  return twMerge([
    'w-full bg-background-tertiary border rounded-lg text-fg placeholder-fg-subtle transition-colors',
    'focus:outline-hidden focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed',
    size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
    invalid
      ? 'border-negative/60 focus:border-negative focus-visible:ring-negative/25'
      : 'border-border hover:border-fg-subtle/50 focus:border-brand focus-visible:ring-brand/25',
    extra,
  ].join(' '))
}

// ── Modal ──
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'
const MODAL_WIDTH: Record<ModalSize, string> = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }
/** Capa de fondo: en móvil el panel se ancla abajo (hoja), desde sm se centra. */
export function modalOverlayClasses(): string {
  return 'fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-xs'
}
export function modalPanelClasses(size: ModalSize = 'md', extra = ''): string {
  return twMerge([
    'w-full flex flex-col max-h-[92vh] bg-background-card border border-border shadow-2xl',
    'rounded-t-xl sm:rounded-xl focus:outline-hidden',
    MODAL_WIDTH[size],
    extra,
  ].join(' '))
}

// ── Tablas de datos ──
/** Fila de cabecera: etiquetas pequeñas en mayúsculas sobre fondo tenue. */
export function tableHeadRowClasses(extra = ''): string {
  return twMerge('text-[11px] text-fg-subtle font-medium uppercase tracking-wider border-b border-border bg-background-tertiary/30 [&_button]:uppercase', extra)
}
/** Fila de datos: hover uniforme; `interactive` si la fila se expande al pulsarla. */
export function tableRowClasses(interactive = false, expanded = false, extra = ''): string {
  return twMerge([
    'transition-colors hover:bg-background-tertiary/40',
    interactive ? 'cursor-pointer' : '',
    expanded ? 'bg-background-tertiary/40' : '',
    extra,
  ].filter(Boolean).join(' '))
}
/** Fila de totales al pie de la tabla. */
export function tableFootRowClasses(extra = ''): string {
  return twMerge('border-t-2 border-border bg-background-tertiary/20', extra)
}

// ── Estados (vacío / carga / error) ──
/** Bloque de reemplazo con forma del contenido; sin animación si el usuario reduce movimiento. */
export function skeletonClasses(extra = ''): string {
  return twMerge('block rounded-lg bg-background-tertiary animate-pulse motion-reduce:animate-none', extra)
}
export function stateClasses(compact = false, extra = ''): string {
  return twMerge(['flex flex-col items-center justify-center text-center gap-2', compact ? 'py-8' : 'py-16', extra].join(' '))
}
