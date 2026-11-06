import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Comisión de red en traspasos propios (#532). Solo lectura: guardar el ajuste
// y recalcular el FIFO se interceptan; la base de datos real no se toca.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function fakeBackend(page: Page) {
  const calls = { put: [] as string[], fifo: 0 }
  let criterio = 'transmision'
  await page.route('**/api/settings/config', async route => {
    const req = route.request()
    if (req.method() === 'PUT') {
      const { key, value } = req.postDataJSON() as { key: string; value: string }
      if (key === 'fifo_comision_red_traspaso') { calls.put.push(value); criterio = value }
      return route.fulfill({ json: { success: true } })
    }
    const real = await route.fetch()
    await route.fulfill({ response: real, json: { ...(await real.json()), fifo_comision_red_traspaso: criterio } })
  })
  await page.route('**/api/fifo/run', route => {
    calls.fifo++
    return route.fulfill({ json: { success: true, lotsCreated: 0, lotsConsumed: 0, totalGainEur: 0, totalLossEur: 0, errors: [], warnings: [], pendingWithdrawals: 0, shortfalls: [] } })
  })
  return calls
}

const grupo = (page: Page) => page.getByRole('radiogroup', { name: 'Criterio de la comisión de red' })

test('cancelar no cambia nada; confirmar guarda, recalcula y ofrece Deshacer', async ({ page }) => {
  const calls = await fakeBackend(page)
  await page.goto('/settings?tab=fiscal')
  await expect(grupo(page).getByRole('radio', { name: 'Transmisión' })).toBeChecked()

  await grupo(page).getByRole('radio', { name: 'Sumar al coste' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Cambiar el criterio de la comisión de red' })
  await expect(dialogo).toContainText('Se recalculará el FIFO.')
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
  expect(calls.put).toEqual([])
  await expect(grupo(page).getByRole('radio', { name: 'Transmisión' })).toBeChecked()

  await grupo(page).getByRole('radio', { name: 'Sumar al coste' }).click()
  await page.getByRole('button', { name: 'Cambiar el criterio y recalcular' }).click()
  await expect(grupo(page).getByRole('radio', { name: 'Sumar al coste' })).toBeChecked()
  expect(calls.put).toEqual(['coste'])
  expect(calls.fifo).toBe(1)

  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(grupo(page).getByRole('radio', { name: 'Transmisión' })).toBeChecked()
  expect(calls.put).toEqual(['coste', 'transmision'])
  expect(calls.fifo).toBe(2)
})

for (const theme of ['dark', 'light'] as const) {
  test(`tarjeta y diálogo sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await fakeBackend(page)
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/settings?tab=fiscal')
    await grupo(page).getByRole('radio', { name: 'Sumar al coste' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const r = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(r.violations).toEqual([])
  })
}
