import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Tarjetas de Portfolio con StatCard (#417): una wallet filtra la tabla con
// teclado y su estado activo se anuncia; axe en ambos temas. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

for (const theme of ['dark', 'light'] as const) {
  test(`una wallet filtra la tabla con teclado, sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/portfolio')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    const group = page.getByRole('group', { name: 'Filtrar la tabla por wallet' })
    const card = group.getByRole('button', { name: /Filtrar la tabla por esta wallet$/ }).first()
    await card.waitFor({ timeout: 15_000 }).catch(() => {})
    test.skip(await card.count() === 0, 'Sin wallets con estos datos')
    await card.focus()
    await page.keyboard.press('Enter')
    const activeCard = group.getByRole('button', { name: /Quitar el filtro de la tabla$/ })
    await expect(activeCard).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: /^Mostrando solo/ })).toBeVisible()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(400)
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
    // Otra vez: quita el filtro.
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: /^Mostrando solo/ })).toHaveCount(0)
  })
}
