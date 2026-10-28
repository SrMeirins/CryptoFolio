import { expect, test, type Page } from '@playwright/test'

// Preferencias de General (#446): umbral de polvo, privacidad al abrir y
// página de inicio. Solo lectura: /api/settings/config se intercepta con los
// valores de la prueba; la base de datos real no se toca.

async function withConfig(page: Page, preset: Record<string, string>) {
  const overrides: Record<string, string> = { ...preset }
  await page.route('**/api/settings/config', async route => {
    if (route.request().method() === 'PUT') {
      const { key, value } = route.request().postDataJSON() as { key: string; value: string }
      overrides[key] = value
      await route.fulfill({ json: { success: true } })
      return
    }
    const real = await route.fetch()
    await route.fulfill({ response: real, json: { ...(await real.json()), ...overrides } })
  })
}

const dustCount = async (page: Page) => {
  await page.goto('/portfolio')
  await page.getByRole('region', { name: 'Posiciones' }).waitFor({ timeout: 15_000 })
  const polvo = page.getByRole('region', { name: 'Polvo' })
  if (await polvo.count() === 0) return 0
  return Number((await polvo.getByText(/posici(ón|ones)/).innerText()).match(/^(\d+)/)![1])
}

test('el umbral de polvo cambia lo que Portfolio agrupa como polvo', async ({ page }) => {
  await withConfig(page, { dust_threshold_eur: '0' })
  const ninguno = await dustCount(page)
  await page.unrouteAll()
  await withConfig(page, { dust_threshold_eur: '1000' })
  const muchos = await dustCount(page)
  expect(ninguno).toBe(0)
  expect(muchos).toBeGreaterThan(0)
})

test('privacidad al abrir: la app arranca con los importes ocultos', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cryptofolio.privacy', '0'))
  await withConfig(page, { privacy_on_start: 'true' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Mostrar importes' })).toBeVisible()
})

test('página de inicio: al entrar por la raíz se abre la elegida; un enlace directo se respeta', async ({ page }) => {
  await withConfig(page, { start_page: '/fiscal' })
  await page.goto('/')
  await expect(page).toHaveURL(/\/fiscal$/)
  await page.goto('/history')
  await expect(page).toHaveURL(/\/history$/)
})

test('página de inicio fuera de la lista: se queda en el Dashboard', async ({ page }) => {
  await withConfig(page, { start_page: 'https://ejemplo.invalid' })
  await page.goto('/')
  await page.waitForTimeout(1500)
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
})

test('las preferencias se guardan al momento con Deshacer', async ({ page }) => {
  await withConfig(page, {})
  await page.goto('/settings?tab=general')
  const card = page.getByRole('region', { name: 'Preferencias' })
  const polvo = card.getByLabel('Umbral de polvo')
  await polvo.fill('2,5')
  await polvo.press('Enter')
  const toast = page.getByRole('status').filter({ hasText: 'Guardado' })
  await expect(toast).toContainText(/2,5\s€/)
  await toast.getByRole('button', { name: 'Deshacer' }).click()
  await expect(polvo).toHaveValue('1')
  await polvo.fill('5000')
  await polvo.press('Enter')
  await expect(card.getByRole('alert')).toContainText('Hasta 1.000')
})
