import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryError } from './States'
import { queryErrorTitle } from './classes'
import { ApiError } from '../../api/client'

// Error de una consulta en su panel (#498).
describe('QueryError (#498)', () => {
  it('concuerda en número', () => {
    expect(queryErrorTitle('las posiciones')).toBe('No se pudieron cargar las posiciones')
    expect(queryErrorTitle('tus wallets y redes')).toBe('No se pudieron cargar tus wallets y redes')
    expect(queryErrorTitle('el P&L y el flujo de euros')).toBe('No se pudieron cargar el P&L y el flujo de euros')
    expect(queryErrorTitle('la tendencia de 7 días')).toBe('No se pudo cargar la tendencia de 7 días')
    expect(queryErrorTitle('parte de los datos fiscales')).toBe('No se pudo cargar parte de los datos fiscales')
  })

  it('dice qué hacer según el fallo y ofrece Reintentar', () => {
    const html = renderToStaticMarkup(<QueryError what="las posiciones" error={new ApiError(429, 'Too Many Requests', {})} onRetry={vi.fn()} />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('No se pudieron cargar las posiciones')
    expect(html).toContain('Espera un minuto')
    expect(html).toMatch(/<button[^>]*>.*Reintentar<\/button>/)
  })
})
