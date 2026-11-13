import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Custodia de los exchanges para el 721 en Ajustes (#545): la tarjeta de
// Ajustes > Fiscal (una fila por exchange con sus subcuentas) y la línea de
// cada wallet de exchange en Ajustes > Wallets. Datos sintéticos; las
// escrituras se interceptan.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function preparar(page: Page) {
  const wallets = await (await page.request.get('/api/wallets')).json() as { id: string; name: string }[]
  const spot = wallets.find(w => w.name === 'Binance Spot')
  const funding = wallets.find(w => w.name === 'Binance Funding')
  test.skip(!spot || !funding, 'Sin las wallets nativas de Binance')
  const auto = { enEspana: true, entidad: { nombre: 'Ejemplo Spain SL', nif: null, pais: 'ES', web: null }, origen: 'automatico', desde: '2022-07-07', filaId: null, regla: 'binance' }
  const custodia = {
    reglas: [{ clave: 'binance', exchange: 'Binance', tramos: [], fuentes: [], nota: null }],
    wallets: [
      { walletId: spot!.id, nombre: 'Binance Spot', regla: 'binance', hoy: auto, filas: [] },
      { walletId: funding!.id, nombre: 'Binance Funding', regla: 'binance', hoy: auto, filas: [] },
      { walletId: 'w-propia', nombre: 'Exchange propio', regla: null, hoy: { enEspana: null, entidad: null, origen: 'desconocido', desde: null, filaId: null, regla: null }, filas: [] },
    ],
  }
  const escrituras: string[] = []
  // Sin animaciones de entrada: axe mide la pantalla asentada.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/fiscal/custodia**', async r => {
    if (r.request().method() !== 'GET') { escrituras.push(`${r.request().method()} ${new URL(r.request().url()).pathname}`); return r.fulfill({ json: { ok: true } }) }
    return r.fulfill({ json: custodia })
  })
  return { escrituras, spot: spot!.id }
}

test('Ajustes > Fiscal: una fila por exchange con sus subcuentas, su estado y cómo se sabe', async ({ page }) => {
  await preparar(page)
  await page.goto('/settings?tab=fiscal')
  const card = page.getByRole('region', { name: 'Custodia de tus exchanges (Modelo 721)' })
  const filas = card.getByRole('list', { name: 'Custodia por exchange' }).getByRole('listitem')
  await expect(filas).toHaveCount(2)
  await expect(filas.nth(0)).toContainText('Binance (2 subcuentas)')
  await expect(filas.nth(0)).toContainText('En España: no computa (Ejemplo Spain SL)')
  await expect(filas.nth(0)).toContainText('Automático, según las condiciones de Binance')
  await expect(filas.nth(1)).toContainText('No se sabe: computa por prudencia')
  await expect(filas.nth(1).getByRole('button', { name: 'Cambiar la custodia de Exchange propio' })).toHaveText('Indicar')
  await filas.nth(0).getByRole('button', { name: 'Cambiar la custodia de Binance' }).click()
  await expect(page.getByRole('dialog', { name: 'Custodia de Binance' })).toContainText('Se aplica a sus 2 wallets')
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).last().click()
  const r = await new AxeBuilder({ page }).include('section[aria-label="Custodia de tus exchanges (Modelo 721)"]').withTags(WCAG).analyze()
  expect(r.violations).toEqual([])
})

test('Ajustes > Wallets: cada wallet nativa dice su custodia y se puede cambiar', async ({ page }) => {
  const { escrituras, spot } = await preparar(page)
  await page.goto('/settings?tab=wallets')
  await page.getByText(/wallets del sistema$/).click()
  const fila = page.getByRole('group', { name: 'Wallet del sistema Binance Spot' })
  await expect(fila).toContainText(/Custodia \(Modelo 721\):\s*En España: no computa \(Ejemplo Spain SL\)\. Automático, según las condiciones de Binance/)
  await fila.getByRole('button', { name: 'Cambiar la custodia de Binance Spot' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Custodia de Binance' })
  await dialogo.getByRole('radio', { name: 'Fuera de España' }).check()
  await dialogo.getByRole('button', { name: 'Guardar' }).click()
  await expect.poll(() => escrituras.length).toBe(2)
  expect(escrituras).toContain(`PUT /api/fiscal/custodia/${spot}`)
  const r = await new AxeBuilder({ page }).include('[role="group"][aria-label="Wallet del sistema Binance Spot"]').withTags(WCAG).analyze()
  expect(r.violations).toEqual([])
})
