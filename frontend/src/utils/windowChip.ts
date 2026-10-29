import { formatMoney, type Currency } from './format'
import { timezoneLabel } from './timezoneLabel'

// Chip de variación con su ventana de tiempo visible (#247): «Hoy» (desde las
// 00:00 de Madrid, sin depósitos ni retiradas; la cifra del calendario) frente
// a «24 h» (respecto al precio de hace 24 horas). Antes, una tarjeta decía
// «Hoy: …» y la otra solo mostraba un chip sin etiqueta, y parecían cifras
// contradictorias.

export type ChipWindow = 'today' | '24h'
export type ChipTone = 'positive' | 'negative' | 'neutral'

export const WINDOW_LABELS: Record<ChipWindow, { label: string; title: string; help: string }> = {
  today: {
    label: 'Hoy',
    title: 'P&L de hoy',
    // Getter: el texto sigue la zona actual de la aplicación (#390).
    get help() { return `Desde las 00:00 (${timezoneLabel()}), sin contar depósitos ni retiradas. Es la misma cifra que el día de hoy del calendario.` },
  },
  '24h': {
    label: '24 h',
    title: 'Variación 24 h',
    help: 'Respecto al precio de hace 24 horas (ventana móvil), con las cantidades que tienes ahora.',
  },
}

/** Tono por signo; los importes por debajo de medio céntimo son neutros. */
export function toneOf(n: number, epsilon = 0.005): ChipTone {
  return n > epsilon ? 'positive' : n < -epsilon ? 'negative' : 'neutral'
}

export interface TodayChip {
  tone: ChipTone
  text: string   // «+12,35 €»
  aria: string   // «Hoy: +12,35 €»
}

/** Chip «Hoy» de la tarjeta de P&L no realizado; null mientras no hay dato. */
export function todayChip(todayPnl: number | null, currency: Currency): TodayChip | null {
  if (todayPnl === null) return null
  const rounded = Math.round(todayPnl * 100) / 100
  const tone = toneOf(rounded)
  const text = `${tone === 'positive' ? '+' : ''}${formatMoney(tone === 'neutral' ? 0 : rounded, currency)}`
  return { tone, text, aria: `${WINDOW_LABELS.today.label}: ${text}` }
}
