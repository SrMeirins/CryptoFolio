import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Accesibilidad de toda la app (#356): las vistas principales, con la barra
// lateral y la cabecera común, sin violaciones WCAG 2.2 AA en ambos temas.
// Solo lee: no modifica datos.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const VIEWS = ['/', '/portfolio', '/fiscal', '/import', '/history', '/settings']

async function open(page: Page, path: string, theme: 'dark' | 'light') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
  await page.goto(path)
  await page.waitForLoadState('networkidle').catch(() => { /* el WebSocket puede mantenerla abierta */ })
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
  await page.waitForTimeout(500)
}

for (const theme of ['dark', 'light'] as const) {
  for (const path of VIEWS) {
    test(`${path} sin violaciones WCAG 2.2 AA (tema ${theme})`, async ({ page }) => {
      await open(page, path, theme)
      if (path === '/history') {
        // También la analítica abierta y una fila con su detalle (#351).
        await page.getByRole('button', { name: /Analítica de actividad/ }).click()
        await page.getByRole('button', { name: 'Expandir detalle' }).first().click()
        await page.waitForTimeout(300)
      }
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
      expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
    })
  }
}
