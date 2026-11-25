import { expect, test, type Page } from './base'
import { axeEstable } from './axe'

// Cabecera de Portfolio (#525): valor grande con coste y 24 h, tira de
// métricas (P&L que filtra, recuperar el coste, mayor posición que abre su
// detalle, custodia y bloqueado), subtítulo con recuentos y enlaces, la
// wallet en la URL como único filtro y el umbral de concentración en Ajustes.
// Precios simulados (todos a 10); las escrituras de la configuración se interceptan.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function preparar(page: Page) {
  const lotes = await (await page.request.get('/api/fifo/lots')).json() as { asset: string }[]
  test.skip(lotes.length === 0, 'Sin posiciones en estos datos')
  const escrituras: { key: string; value: string }[] = []
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/prices/live', r => r.fulfill({ json: Object.fromEntries([...new Set(lotes.map(l => l.asset))].map(a => [a, 10])) }))
  await page.route('**/api/settings/config', async r => {
    if (r.request().method() === 'PUT') {
      escrituras.push(r.request().postDataJSON() as { key: string; value: string })
      return r.fulfill({ json: { success: true } })
    }
    return r.continue()
  })
  return escrituras
}

const tira = (page: Page) => page.getByRole('region', { name: 'Resumen de la cartera' })

test('la cabecera muestra el valor con su coste y una tira que no repite el subtítulo; sin violaciones de axe', async ({ page }) => {
  await preparar(page)
  await page.goto('/portfolio')
  await expect(tira(page)).toBeVisible({ timeout: 15_000 })
  await expect(tira(page)).toContainText('Coste')
  for (const t of ['P&L no realizado', 'Para recuperar el coste', 'Mayor posición', 'Custodia']) await expect(tira(page)).toContainText(new RegExp(t, 'i'))
  await expect(tira(page)).toContainText(/% propia|Todo propia|Todo en exchanges/)
  // Lo del subtítulo (activos en wallets) no se repite en la tira.
  await expect(tira(page)).not.toContainText(/activos? en \d+ wallets?/)
  // Los enlaces del subtítulo son chips; el de Historial lleva allí.
  await expect(page.locator('main').getByRole('link', { name: 'Historial', exact: true })).toHaveAttribute('href', '/history')
  // El valor va en su tarjeta, con el coste en un chip.
  await expect(tira(page).getByLabel(/^Valor de la cartera:/)).toBeVisible()
  const r = await (await axeEstable(page)).include('section[aria-label="Resumen de la cartera"]').withTags(WCAG).analyze()
  expect(r.violations).toEqual([])
})

test('P&L no realizado alterna el filtro de resultado y Mayor posición abre su detalle', async ({ page }) => {
  await preparar(page)
  await page.goto('/portfolio')
  await expect(tira(page)).toBeVisible({ timeout: 15_000 })
  const resultado = page.getByRole('radiogroup', { name: 'Filtrar por resultado' })
  await tira(page).getByRole('button', { name: /^Ver P&L no realizado en la tabla/ }).click()
  await expect(resultado.getByRole('radio', { name: 'En ganancia' })).toBeChecked()
  await tira(page).getByRole('button', { name: /^Ver P&L no realizado en la tabla/ }).click()
  await expect(resultado.getByRole('radio', { name: 'En pérdida' })).toBeChecked()
  const mayor = tira(page).getByRole('button', { name: /^Ver Mayor posición en el detalle de / })
  const asset = (await mayor.getAttribute('aria-label'))!.match(/el detalle de ([A-Z0-9]+)/)![1]
  await mayor.click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: asset })).toBeVisible()
})

test('las tarjetas de wallet son el único filtro por wallet y lo llevan a la URL', async ({ page }) => {
  await preparar(page)
  await page.goto('/portfolio')
  await expect(page.getByRole('button', { name: /^Filtrar por wallet/ })).toHaveCount(0)
  const tarjeta = page.getByRole('list', { name: /^Wallets:/ }).getByRole('button', { name: /Filtrar la tabla por esta wallet$/ }).first()
  await tarjeta.waitFor({ timeout: 15_000 })
  await tarjeta.click()
  await expect(page).toHaveURL(/[?&]wallet=[0-9a-f-]{36}/)
})

test('el umbral del aviso de concentración se guarda en Ajustes > General', async ({ page }) => {
  const escrituras = await preparar(page)
  await page.goto('/settings?tab=general')
  const campo = page.getByLabel('Aviso de concentración')
  await campo.fill('5')
  await campo.press('Enter')
  await expect(page.getByRole('alert')).toContainText('porcentaje entero de 10 a 100')
  await campo.fill('55')
  await campo.press('Enter')
  await expect.poll(() => escrituras.at(-1)).toEqual({ key: 'concentracion_aviso_pct', value: '55' })
})

test('Ajustes > Wallets: color con nombre o libre y vista previa; las del sistema llevan el de su exchange', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Sin escrituras: solo se mira el panel de edición.
  await page.route('**/api/wallets/**', r => (r.request().method() === 'GET' ? r.continue() : r.fulfill({ json: { success: true } })))
  await page.goto('/settings?tab=wallets')
  const editar = page.getByRole('button', { name: /^Editar / }).first()
  await editar.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await editar.count() === 0, 'Sin wallets propias en estos datos')
  await editar.click()
  const colores = page.getByRole('radiogroup', { name: 'Color de la wallet' })
  await colores.getByRole('radio', { name: 'Negro' }).click()
  await expect(colores.getByRole('radio', { name: 'Negro' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('así se verá en Portfolio')).toBeVisible()
  await expect(page.getByLabel('Otro color')).toBeAttached()
  const r = await (await axeEstable(page)).include('[role="radiogroup"][aria-label="Color de la wallet"]').withTags(WCAG).analyze()
  expect(r.violations).toEqual([])
})
