import { describe, expect, it } from 'vitest'
import { changelogBlocks, plainText } from './changelog'

// Novedades de la versión en Acerca de (#447). Datos sintéticos.
const md = `# Changelog

## [Unreleased]

- Algo sin publicar

## [1.2.0] - 2026-01-01

### Añadido

- **Importación nueva**: lee \`ficheros\` de [prueba](https://ejemplo.invalid).

#### Detalle

- Otro punto

## [1.1.0] - 2025-12-01

- Antiguo
`

describe('changelog', () => {
  it('agrupa por encabezado y deja el texto sin formato ni enlaces', () => {
    expect(changelogBlocks(md.split('## [1.1.0]')[0].split('## [1.2.0] - 2026-01-01')[1])).toEqual([
      { heading: 'Añadido', items: ['Importación nueva: lee ficheros de prueba.'] },
      { heading: 'Detalle', items: ['Otro punto'] },
    ])
  })

  it('el HTML se queda como texto: nunca se interpreta', () => {
    expect(plainText('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>')
  })
})
