import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Notice } from './Notice'
import { NOTICE_LABEL, noticeClasses, type NoticeTipo } from './classes'

// Aviso común (#493). Render estático con textos sintéticos.
const TIPOS: NoticeTipo[] = ['aviso', 'consejo', 'informacion']

describe('Notice (#493)', () => {
  it.each(TIPOS)('tipo %s: anuncia el tipo como texto y lleva un icono decorativo', tipo => {
    const html = renderToStaticMarkup(<Notice tipo={tipo}>Texto de prueba</Notice>)
    expect(html).toContain(`<span class="sr-only">${NOTICE_LABEL[tipo]}: </span>`)
    expect(html).toContain('Texto de prueba')
    expect(html).toContain(`data-notice="${tipo}"`)
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
  })

  it('cada tipo tiene su propio tono de borde y fondo', () => {
    const tonos = TIPOS.map(t => noticeClasses(t))
    expect(new Set(tonos).size).toBe(3)
    expect(tonos[0]).toContain('border-warning/30')
    expect(tonos[1]).toContain('border-brand/30')
    expect(tonos[2]).toContain('border-info/30')
  })

  it('con título, el tipo se lee en el título y el título puede ser un encabezado', () => {
    const html = renderToStaticMarkup(<Notice tipo="aviso" title="Conviene revisar" titleAs="h3">Detalle</Notice>)
    expect(html).toMatch(/<h3[^>]*><span class="sr-only">Aviso: <\/span>Conviene revisar<\/h3>/)
    expect(html.match(/sr-only/g)).toHaveLength(1)
  })

  it('sin role por defecto; solo es región viva si se pide', () => {
    expect(renderToStaticMarkup(<Notice tipo="informacion">x</Notice>)).not.toContain('role=')
    expect(renderToStaticMarkup(<Notice tipo="aviso" role="status">x</Notice>)).toContain('role="status"')
  })

  it('la acción se muestra junto al texto', () => {
    const html = renderToStaticMarkup(<Notice tipo="consejo" action={<button type="button">Hacerlo</button>}>Texto</Notice>)
    expect(html).toContain('<button type="button">Hacerlo</button>')
  })

  it('compacto reduce el relleno', () => {
    expect(noticeClasses('aviso', true)).toContain('py-2')
    expect(noticeClasses('aviso')).toContain('py-3')
  })
})
