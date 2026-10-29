import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Logo de un activo en Ajustes (#449): de dónde sale y corrección solo para el
// logo. Solo lectura: el cambio se intercepta y no llega a la base de datos.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test('el panel del activo dice de dónde sale su logo y fija un id manual validado', async ({ page }) => {
  const puts: Array<{ url: string; body: unknown }> = []
  await page.route(/\/api\/settings\/assets\/[A-Z0-9]+\/icon-id$/, async route => {
    puts.push({ url: route.request().url(), body: route.request().postDataJSON() })
    await route.fulfill({ json: { success: true } })
  })
  await page.goto('/settings?tab=assets')
  const editar = page.getByRole('button', { name: /^Editar [A-Z0-9]+$/ }).first()
  await editar.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await editar.count() === 0, 'Sin activos en estos datos')
  const symbol = (await editar.getAttribute('aria-label'))!.replace('Editar ', '')
  await editar.click()
  await expect(page.getByText(/^(CoinGecko|Paquete de iconos|Bandera|Sin logo)/).first()).toBeVisible()

  const input = page.getByLabel(`Id de CoinGecko del logo de ${symbol}`)
  await input.fill('Mal Id')
  await expect(page.getByRole('alert').filter({ hasText: 'Solo minúsculas' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Usar este logo' })).toBeDisabled()
  await input.fill('logo-de-prueba')
  await page.getByRole('button', { name: 'Usar este logo' }).click()
  await expect.poll(() => puts.length).toBe(1)
  expect(puts[0].body).toEqual({ id: 'logo-de-prueba' })
  expect(puts[0].url).toContain(`/assets/${symbol}/icon-id`)

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await page.waitForTimeout(300)
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
})
