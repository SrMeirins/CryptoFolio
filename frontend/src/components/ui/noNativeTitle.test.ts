import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

// Regla de lint de #495: el title nativo no llega con teclado ni al tocar, así
// que no se admite en elementos HTML. Sí en componentes (prop title) y en el
// elemento <title> de un SVG.
const eslint = new ESLint()
const errores = async (code: string) => {
  const [r] = await eslint.lintText(code, { filePath: 'src/components/__regla.tsx' })
  return r.messages.filter(m => m.ruleId === 'no-restricted-syntax')
}

describe('regla sin title nativo (#495)', () => {
  it('rechaza title en un elemento HTML', async () => {
    expect(await errores('export const A = () => <button type="button" title="Copiar">x</button>\n')).toHaveLength(1)
    expect(await errores('export const A = () => <span title={String(1)}>x</span>\n')).toHaveLength(1)
  })

  it('admite la prop title de un componente y el <title> de un SVG', async () => {
    const code = [
      'const Panel = (p: { title: string }) => <h2>{p.title}</h2>',
      'export const A = () => <><Panel title="Resumen" /><svg><title>Icono</title></svg></>',
      '',
    ].join('\n')
    expect(await errores(code)).toHaveLength(0)
  })
})
