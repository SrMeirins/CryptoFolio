import { expect, test, type Page } from '@playwright/test'

// Carga unificada (#494): primera carga con esqueleto, recarga con los datos
// visibles y barra fina, y nada en movimiento con «reducir movimiento».
// Solo lectura: se bloquea cualquier petición que no sea GET, y las de
// transacciones se retrasan para ver el estado intermedio.

const soloLectura = (page: Page) => page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))

async function retrasarTransacciones(page: Page, ms = 1500) {
  await page.route(/\/api\/transactions\?/, async r => {
    await new Promise(res => setTimeout(res, ms))
    await r.continue()
  })
}

test('cambiar un filtro en Historial mantiene las filas visibles y muestra la barra', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/history')
  const filas = page.getByRole('table').locator('tbody tr')
  await expect(filas.first()).toBeVisible()
  const antes = await filas.count()

  await retrasarTransacciones(page)
  await page.getByRole('combobox', { name: /Buscar/ }).fill('AAA-sin-resultados')
  // Mientras llega la respuesta: mismas filas, área ocupada y barra de recarga.
  await expect(page.locator('[data-refreshing]')).toBeVisible()
  expect(await filas.count()).toBe(antes)
  await expect(page.locator('[aria-busy="true"]').filter({ has: page.getByRole('table') })).toHaveCount(1)
  // Al llegar, la barra desaparece.
  await expect(page.locator('[data-refreshing]')).toHaveCount(0, { timeout: 10_000 })
})

test('primera carga: esqueleto con nombre, sin texto «Cargando…»', async ({ page }) => {
  await soloLectura(page)
  await retrasarTransacciones(page)
  await page.goto('/history')
  const esqueleto = page.getByRole('status', { name: 'Cargando las transacciones' })
  await expect(esqueleto).toHaveAttribute('data-loading', 'visible')
  await expect(page.getByText('Cargando…', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 })
})

test.describe('con «reducir movimiento»', () => {
  test.use({ reducedMotion: 'reduce' })

  test('ni brillo en el esqueleto ni barra en movimiento', async ({ page }) => {
    await soloLectura(page)
    await retrasarTransacciones(page, 2500)
    await page.goto('/history')
    const esqueleto = page.getByRole('status', { name: 'Cargando las transacciones' })
    await expect(esqueleto).toHaveAttribute('data-loading', 'visible')
    const animEsqueleto = await esqueleto.locator('span').first().evaluate(el => getComputedStyle(el).animationName)
    expect(animEsqueleto).toBe('none')

    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('combobox', { name: /Buscar/ }).fill('AAA-sin-resultados')
    const barra = page.locator('[data-refreshing] .refresh-bar')
    await expect(barra).toBeVisible()
    expect(await barra.evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  })
})
