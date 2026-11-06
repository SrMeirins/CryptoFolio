import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RefreshBar, SkeletonGroup } from './Loading'
import { Skeleton } from './States'

// Carga unificada (#494). Render estático: el estado inicial, antes del retraso.
describe('SkeletonGroup y RefreshBar (#494)', () => {
  it('el esqueleto reserva su hueco sin pintarse antes de 300 ms y anuncia qué carga', () => {
    const html = renderToStaticMarkup(<SkeletonGroup label="Cargando los lotes" className="space-y-2"><Skeleton className="h-4" /></SkeletonGroup>)
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-label="Cargando los lotes"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('data-loading="reservado"')
    expect(html).toMatch(/class="invisible\s+space-y-2"/)
    expect(html).not.toMatch(/Cargando…/)
  })

  it('la barra de recarga es decorativa y no se pinta al inicio', () => {
    const html = renderToStaticMarkup(<RefreshBar active />)
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('refresh-bar')
    expect(html).not.toContain('data-refreshing')
  })
})
