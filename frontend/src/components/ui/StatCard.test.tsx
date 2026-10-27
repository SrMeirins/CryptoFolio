import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Coins } from 'lucide-react'
import { StatCard, type StatCardProps } from './StatCard'

// Tarjeta de métrica común (#410). Render estático con datos sintéticos.
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`
const render = (over: Partial<StatCardProps> = {}) =>
  renderToStaticMarkup(<StatCard title="Ingresos" icon={Coins} color="var(--cf-info)" value={12.5} format={eur} {...over} />)

describe('StatCard (#410)', () => {
  it('estática: título, icono y color de la tarjeta, sin botón', () => {
    const html = render()
    expect(html).toContain('Ingresos')
    expect(html).toContain('--card:var(--cf-info)')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('data-active')
  })

  it('una cifra de texto se muestra tal cual', () => {
    expect(render({ value: 'Hace 9 meses', format: undefined })).toContain('Hace 9 meses')
  })

  it('color de la cifra por su signo', () => {
    expect(render({ tone: 'negative' })).toContain('text-negative')
    expect(render({ tone: 'positive' })).toContain('text-positive')
    expect(render()).toContain('text-fg')
  })

  it('clicable: botón con aria-pressed y nombre con la cifra y la acción', () => {
    const html = render({ onSelect: () => {}, active: true, actionLabel: 'Ver sus operaciones' })
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('data-active="true"')
    expect(html).toContain('aria-label="Ingresos: 12,50 €. Ver sus operaciones"')
  })

  it('la ayuda va fuera del botón, con su nombre por defecto o el indicado', () => {
    const html = render({ onSelect: () => {}, help: <p>Definición</p> })
    expect(html).toContain('aria-label="Cómo se calcula Ingresos"')
    expect(html).not.toMatch(/<button[^>]*aria-pressed[^>]*>(?:(?!<\/button>).)*Cómo se calcula/s)
    expect(render({ help: <p>x</p>, helpLabel: 'Qué suma Ingresos' })).toContain('aria-label="Qué suma Ingresos"')
    expect(render()).not.toContain('Cómo se calcula')
  })

  it('chip y mini gráfica solo cuando se dan; la gráfica es decorativa', () => {
    expect(render()).not.toContain('<svg viewBox="0 0 100 28"')
    const html = render({ chip: <span>24 h +1 %</span>, series: [1, 3, 2] })
    expect(html).toContain('24 h +1 %')
    expect(html).toMatch(/<svg viewBox="0 0 100 28"[^>]*aria-hidden="true"/)
    expect(render({ series: [1] })).not.toContain('<svg viewBox="0 0 100 28"')
  })

  it('cargando: esqueleto en lugar de cifra, chip y gráfica', () => {
    const html = render({ loading: true, chip: <span>chip</span>, series: [1, 2] })
    expect(html).toContain('skeleton')
    expect(html).not.toContain('chip')
    expect(html).not.toContain('<svg viewBox="0 0 100 28"')
  })

  it('entrada escalonada con su retraso', () => {
    expect(render({ delay: 120 })).toContain('animation-delay:120ms')
  })
})
