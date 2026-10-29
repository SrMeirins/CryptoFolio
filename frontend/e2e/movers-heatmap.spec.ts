import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Mapa de movimientos del Dashboard (#438): con una tesela activa, el resto se
// atenúa solo en el fondo; el texto conserva su opacidad y su contraste.
// Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

for (const theme of ['dark', 'light'] as const) {
  test(`teselas atenuadas sin perder contraste (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    const tiles = page.locator('[data-heat-tile]')
    await tiles.first().waitFor({ timeout: 15_000 }).catch(() => {})
    test.skip(await tiles.count() < 2, 'Menos de dos posiciones en el mapa')
    await tiles.first().hover()
    const dimmed = page.locator('[data-heat-tile][data-dimmed]')
    await expect(dimmed.first()).toBeVisible()
    // Ni la tesela ni su texto llevan opacidad: solo la capa del fondo.
    const opacity = await dimmed.first().evaluate(el => [getComputedStyle(el).opacity, getComputedStyle(el.querySelector('.font-semibold')!).opacity])
    expect(opacity).toEqual(['1', '1'])
    await page.waitForTimeout(300)
    const { violations } = await new AxeBuilder({ page }).include('[data-heat-tile]').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
