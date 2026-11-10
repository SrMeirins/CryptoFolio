import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../../../components/Toast'
import { EstadoDeclaracion } from './EstadoDeclaracion'
import type { Declaracion } from '../../../api/portfolio'

// Estado de la declaración por pasos (#542). Datos sintéticos.
const d = (tipo: Declaracion['tipo'], p: Partial<Declaracion> = {}): Declaracion =>
  ({ ejercicio: 2025, tipo, declaradoEn: '2026-05-01T10:00:00.000Z', cifras: { neto: 100, cuota: 19, operaciones: 3 }, ...p })
// Texto visible, sin las etiquetas, más los nombres accesibles (aria-label) de los títulos.
const texto = (html: string) => [...html.matchAll(/aria-label="([^"]*)"/g)].map(m => m[1]).join(' | ') + ' || ' + html.replace(/<[^>]+>/g, '')
const render = (declaraciones: Declaracion[], porRevisar = 0, obligado721: boolean | null = false) => texto(renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <ToastProvider>
      <EstadoDeclaracion year={2025} declaraciones={declaraciones} datos={{ porRevisar, preciosPendientes: [] }}
        obligado721={obligado721} onVerRevisar={() => {}} onModelo721={() => {}} />
    </ToastProvider>
  </QueryClientProvider>,
))

describe('EstadoDeclaracion (#542)', () => {
  it('cuatro pasos con su estado también en texto', () => {
    const html = render([])
    for (const t of ['Datos completos: hecho', 'Revisado: pendiente', 'Renta presentada: pendiente', 'Modelo 721: no obligatorio: no hace falta presentarlo']) {
      expect(html).toContain(t)
    }
    expect(html).toContain('Marcar como revisado')
    expect(html).toContain('1 de 3 pasos')
    expect(html).toContain('Marcar como presentada')
  })

  it('datos incompletos: enlaza a las operaciones por revisar', () => {
    const html = render([], 3)
    expect(html).toContain('Datos completos: pendiente')
    expect(html).toContain('3 operaciones con la clave por revisar')
  })

  it('la diferencia aparece si las cifras actuales difieren de las declaradas', () => {
    expect(render([d('renta')])).not.toContain('frente a las cifras actuales')
    const html = render([d('renta', { cambios: [{ campo: 'neto', declarado: 100, actual: 150 }] })])
    expect(html).toContain('Renta presentada: hecho, pero las cifras han cambiado')
    expect(html).toContain('Declarado el 1 may 2026 frente a las cifras actuales')
    expect(html).toMatch(/Neto \(ha cambiado\)100,00\s€150,00\s€\+50,00\s€/)
    expect(html).toContain('Actualizar')
  })

  it('presentado: fecha y acción para quitar la marca', () => {
    const html = render([d('revision'), d('renta')])
    expect(html).toContain('Presentada el 1 may 2026. Las cifras coinciden.')
    expect(html.match(/Quitar marca/g)).toHaveLength(2)
  })
})
