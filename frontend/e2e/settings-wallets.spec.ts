import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Wallets en Ajustes (#448): resumen como en Portfolio, enlaces filtrados y
// edición en panel. Solo lectura: la edición se intercepta y nunca llega a la
// base de datos real.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function interceptEdits(page: Page) {
  const puts: Array<Record<string, unknown>> = []
  await page.route(/\/api\/wallets\/[0-9a-f-]{36}$/, async route => {
    if (route.request().method() !== 'PUT') return route.fallback()
    puts.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({ json: { success: true } })
  })
  return puts
}

const firstCard = (page: Page) => page.getByRole('button', { name: /^Editar / }).first()

test('Ver en Portfolio filtra por esa wallet y el valor coincide', async ({ page }) => {
  await page.goto('/settings?tab=wallets')
  const editar = firstCard(page)
  await editar.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await editar.count() === 0, 'Sin wallets propias en estos datos')
  const name = (await editar.getAttribute('aria-label'))!.replace(/^Editar /, '')
  const card = page.getByRole('region', { name: `Wallet ${name}` })
  const valor = (await card.getByText(/€|\$/).first().innerText()).replace(/\s/g, ' ')
  await page.getByRole('link', { name: 'Ver en Portfolio' }).first().click()
  await expect(page).toHaveURL(/\/portfolio\?wallet=[0-9a-f-]{36}$/)
  await expect(page.getByRole('button', { name: new RegExp(`^Mostrando solo ${name}`) })).toBeVisible()
  // La tarjeta de Portfolio nombra la wallet con su valor: el mismo cálculo que
  // en Ajustes. Los precios en vivo se mueven entre una página y otra: margen del 0,5 %.
  const portfolioCard = page.getByRole('group', { name: 'Filtrar la tabla por wallet' }).getByRole('button', { name: new RegExp(`^${name}: `) })
  const amount = (text: string) => Number((text.match(/-?[\d.]+,\d+|-?[\d.]+/)?.[0] ?? 'NaN').replace(/\./g, '').replace(',', '.'))
  const enAjustes = amount(valor)
  const enPortfolio = amount(((await portfolioCard.getAttribute('aria-label')) ?? '').replace(`${name}: `, ''))
  expect(Math.abs(enPortfolio - enAjustes)).toBeLessThanOrEqual(Math.max(0.01, Math.abs(enAjustes) * 0.005))
})

test('Ver sus operaciones abre el Historial con esa wallet', async ({ page }) => {
  await page.goto('/settings?tab=wallets')
  const link = page.getByRole('link', { name: 'Ver sus operaciones' }).first()
  await link.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await link.count() === 0, 'Sin wallets propias en estos datos')
  await link.click()
  await expect(page).toHaveURL(/\/history\?wallet=[0-9a-f-]{36}$/)
})

test('el panel edita tipo y notas, Escape cierra y Deshacer envía el valor anterior', async ({ page }) => {
  const puts = await interceptEdits(page)
  await page.goto('/settings?tab=wallets')
  const editar = firstCard(page)
  await editar.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await editar.count() === 0, 'Sin wallets propias en estos datos')
  await editar.click()
  const panel = page.getByRole('dialog', { name: /^Editar / })
  await expect(panel.getByLabel('Nombre')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)

  await editar.click()
  await panel.getByLabel('Notas').fill('Nota de prueba e2e')
  await panel.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(panel).toHaveCount(0)
  expect(puts[0]).toMatchObject({ notes: 'Nota de prueba e2e' })
  expect(Object.keys(puts[0]).sort()).toEqual(['color', 'name', 'notes', 'type'])
  await page.getByRole('status').filter({ hasText: 'Guardado' }).getByRole('button', { name: 'Deshacer' }).click()
  await expect.poll(() => puts.length).toBe(2)
  expect(puts[1].notes).not.toBe('Nota de prueba e2e')
})

for (const theme of ['dark', 'light'] as const) {
  test(`wallets y panel de edición sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/settings?tab=wallets')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    const editar = firstCard(page)
    await editar.waitFor({ timeout: 15_000 }).catch(() => {})
    test.skip(await editar.count() === 0, 'Sin wallets propias en estos datos')
    let res = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(res.violations.map(v => v.id)).toEqual([])
    await editar.click()
    await page.waitForTimeout(400)
    res = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(res.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
