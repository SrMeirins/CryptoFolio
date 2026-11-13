import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Salir de Importar a medias (#497): el aviso usa el diálogo común, no
// window.confirm. Nada se importa: la vista previa es sintética y la
// confirmación se intercepta y no responde nunca, así que la importación se
// queda «en curso» sin tocar la base de datos.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const CSV = 'User ID,Time,Account,Operation,Coin,Change,Remark\n1,24-01-01 10:00:00,Spot,Buy,AAA,1,\n'

const PREVIEW = {
  validation: { valid: true, errors: [], warnings: [], info: [], detectedLanguage: 'en', unknownOperations: [], rowCount: 1, dateRange: { from: '2024-01-01', to: '2024-01-01' } },
  transactions: [{ operationType: 'BUY', timestamp: '2024-01-01T10:00:00.000Z', asset: 'AAA', amount: 1, amountNet: 1, costAsset: 'EUR', costAmount: 10, account: 'Spot', subTradeCount: 1, isNew: true, archivo: 0 }],
  duplicateCount: 0, newCount: 1, errors: [], unknownOperationSamples: {}, depositReviews: [], exchange: 'binance',
  archivos: [{ indice: 0, nombre: 'sintetico.csv', exchange: 'binance', reconocido: true, estado: 'listo', motivo: null, nuevas: 1, duplicadas: 0, repetidasEnLote: 0, rango: null }],
}

async function importacionEnCurso(page: Page) {
  // Solo lectura, salvo la vista previa sintética; la confirmación no responde.
  await page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))
  await page.route('**/api/settings/pending-deposits', r => r.fulfill({ json: [] }))
  await page.route('**/api/imports/preview', r => r.fulfill({ json: PREVIEW }))
  await page.route('**/api/imports/confirm', () => new Promise(() => {}))
  await page.goto('/import')
  await page.locator('input[type="file"][accept=".csv"]').first().setInputFiles({ name: 'sintetico.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
  // Un archivo suelto se analiza solo al elegirlo.
  await page.getByRole('button', { name: 'Confirmar e importar' }).click()
}

test('salir a medias abre el diálogo común; «Seguir aquí» se queda y «Salir» navega', async ({ page }) => {
  let nativo = false
  page.on('dialog', d => { nativo = true; void d.dismiss() })
  await importacionEnCurso(page)

  await page.getByRole('navigation').getByRole('link', { name: 'Historial' }).click()
  const dialogo = page.getByRole('dialog', { name: '¿Salir de la importación?' })
  await expect(dialogo).toBeVisible()
  await expect(dialogo.getByRole('button', { name: 'Seguir aquí' })).toBeFocused()
  await dialogo.getByRole('button', { name: 'Seguir aquí' }).click()
  await expect(dialogo).toHaveCount(0)
  await expect(page).toHaveURL(/\/import/)

  await page.getByRole('navigation').getByRole('link', { name: 'Historial' }).click()
  await page.getByRole('dialog', { name: '¿Salir de la importación?' }).getByRole('button', { name: 'Salir sin ver el resultado' }).click()
  await expect(page).toHaveURL(/\/history/)
  expect(nativo).toBe(false)
})

for (const theme of ['dark', 'light'] as const) {
  test(`diálogo de salida sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await importacionEnCurso(page)
    await page.getByRole('navigation').getByRole('link', { name: 'Historial' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const r = await (await axeEstable(page)).withTags(WCAG).include('[role="dialog"]').analyze()
    expect(r.violations).toEqual([])
  })
}
