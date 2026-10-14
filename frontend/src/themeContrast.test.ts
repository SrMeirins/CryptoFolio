import { describe, expect, it } from 'vitest'
import css from './index.css?raw'
import { contrastRatio } from './utils/contrast'

// Contraste de la paleta del tema (#198): cada color de texto sobre cada
// fondo, en ambos temas, debe alcanzar WCAG AA para texto normal (4,5:1).

function themeVars(selector: RegExp): Record<string, string> {
  const block = css.match(selector)?.[1] ?? ''
  return Object.fromEntries([...block.matchAll(/--cf-([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map(m => [m[1], m[2]]))
}

const THEMES = {
  oscuro: themeVars(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/),
  claro: themeVars(/:root\[data-theme='light'\]\s*\{([^}]*)\}/),
}

const TEXTS = ['fg', 'fg-muted', 'fg-subtle', 'brand', 'positive', 'negative', 'warning', 'info']
const BACKGROUNDS = ['bg-primary', 'bg-secondary', 'bg-card', 'bg-tertiary']

describe('contraste de la paleta (#198)', () => {
  for (const [theme, vars] of Object.entries(THEMES)) {
    it(`tema ${theme}: define todos los colores`, () => {
      for (const name of [...TEXTS, ...BACKGROUNDS]) expect(vars[name], `--cf-${name}`).toBeDefined()
    })

    for (const text of TEXTS) {
      for (const bg of BACKGROUNDS) {
        it(`tema ${theme}: ${text} sobre ${bg} ≥ 4,5:1`, () => {
          expect(contrastRatio(vars[text], vars[bg])).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
  }
})

describe('texto sobre fondos sólidos (#198)', () => {
  for (const [theme, vars] of Object.entries(THEMES)) {
    it(`tema ${theme}: on-brand sobre brand-solid ≥ 4,5:1 (botones primarios)`, () => {
      expect(contrastRatio(vars['on-brand'], vars['brand-solid'])).toBeGreaterThanOrEqual(4.5)
    })
    for (const [fg, bg] of [['on-warning', 'warning'], ['on-positive', 'positive'], ['on-negative', 'negative']]) {
      it(`tema ${theme}: ${fg} sobre ${bg} ≥ 4,5:1 (botones sólidos)`, () => {
        expect(contrastRatio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})

describe('contrastRatio', () => {
  it('blanco sobre negro es 21:1 y un color consigo mismo 1:1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5)
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5)
  })
})
