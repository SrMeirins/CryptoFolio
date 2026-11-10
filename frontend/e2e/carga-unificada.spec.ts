import { expect, test, type Page } from '@playwright/test'

// Carga unificada (#494): primera carga con esqueleto, recarga con los datos
// visibles y barra fina, y nada en movimiento con «reducir movimiento».
// Solo lectura: se bloquea cualquier petición que no sea GET. Las de
// transacciones se retienen hasta que el test ha comprobado el estado
// intermedio y entonces se sueltan: con un retraso fijo, en una máquina
// cargada la respuesta llegaba antes de comprobarlo y el test fallaba a veces.

const soloLectura = (page: Page) => page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))

/** Retiene las peticiones de transacciones hasta llamar a la función que devuelve. */
async function retenerTransacciones(page: Page): Promise<() => void> {
  let soltar!: () => void
  const suelta = new Promise<void>(res => { soltar = res })
  await page.route(/\/api\/transactions\?/, async r => {
    await suelta
    await r.continue().catch(() => { /* la página pudo cerrarse antes */ })
  })
  return soltar
}

test('cambiar un filtro en Historial mantiene las filas visibles y muestra la barra', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/history')
  const filas = page.getByRole('table').locator('tbody tr')
  await expect(filas.first()).toBeVisible()
  const antes = await filas.count()

  const soltar = await retenerTransacciones(page)
  await page.getByRole('combobox', { name: /Buscar/ }).fill('AAA-sin-resultados')
  // Mientras la respuesta está retenida: mismas filas, área ocupada y barra de recarga.
  await expect(page.locator('[data-refreshing]')).toBeVisible()
  expect(await filas.count()).toBe(antes)
  await expect(page.locator('[aria-busy="true"]').filter({ has: page.getByRole('table') })).toHaveCount(1)
  // Al soltarla, la barra desaparece.
  soltar()
  await expect(page.locator('[data-refreshing]')).toHaveCount(0, { timeout: 10_000 })
})

test('primera carga: esqueleto con nombre, sin texto «Cargando…»', async ({ page }) => {
  await soloLectura(page)
  const soltar = await retenerTransacciones(page)
  await page.goto('/history')
  const esqueleto = page.getByRole('status', { name: 'Cargando las transacciones' })
  await expect(esqueleto).toHaveAttribute('data-loading', 'visible')
  // Ningún «Cargando…» en pantalla. La región viva oculta (#351) sí lo anuncia
  // al lector de pantalla mientras carga: eso es lo correcto y no cuenta.
  expect(await page.getByText('Cargando…', { exact: true }).evaluateAll(els => els.filter(e => !e.closest('.sr-only')).length)).toBe(0)
  soltar()
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 })
})

test.describe('con «reducir movimiento»', () => {
  test.use({ reducedMotion: 'reduce' })

  test('ni brillo en el esqueleto ni barra en movimiento', async ({ page }) => {
    await soloLectura(page)
    const soltar = await retenerTransacciones(page)
    await page.goto('/history')
    const esqueleto = page.getByRole('status', { name: 'Cargando las transacciones' })
    await expect(esqueleto).toHaveAttribute('data-loading', 'visible')
    const animEsqueleto = await esqueleto.locator('span').first().evaluate(el => getComputedStyle(el).animationName)
    expect(animEsqueleto).toBe('none')
    // Suelta la primera carga; la del filtro queda retenida mientras se mira la barra.
    await page.unroute(/\/api\/transactions\?/)
    soltar()
    const soltarFiltro = await retenerTransacciones(page)

    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('combobox', { name: /Buscar/ }).fill('AAA-sin-resultados')
    const barra = page.locator('[data-refreshing] .refresh-bar')
    await expect(barra).toBeVisible()
    expect(await barra.evaluate(el => getComputedStyle(el).animationName)).toBe('none')
    soltarFiltro()
  })
})
