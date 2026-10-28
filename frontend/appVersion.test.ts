import { describe, expect, it } from 'vitest'
import { changelogSection } from './appVersion'

// Sección del CHANGELOG de una versión para Acerca de (#447). Datos sintéticos.
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

describe('changelogSection', () => {
  it('extrae solo la sección de la versión indicada', () => {
    const s = changelogSection(md, '1.2.0')
    expect(s).toContain('Importación nueva')
    expect(s).not.toContain('Antiguo')
    expect(s).not.toContain('sin publicar')
    expect(changelogSection(md, '9.9.9')).toBe('')
  })

})
