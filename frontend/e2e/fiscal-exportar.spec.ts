import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Exportar el ejercicio (#547): diálogo con ejercicio, formato (con su uso) y
// secciones; descarga directa con el nombre del fichero y aviso; lo elegido se
// recuerda (también en Ajustes > Fiscal). La exportación es de solo lectura;
// las escrituras de la configuración se interceptan.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function preparar(page: Page) {
  const escrituras: { key: string; value: string }[] = []
  const guardado: Record<string, string> = {}
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/settings/config', async r => {
    if (r.request().method() === 'PUT') {
      const w = r.request().postDataJSON() as { key: string; value: string }
      escrituras.push(w)
      guardado[w.key] = w.value
      return r.fulfill({ json: { success: true } })
    }
    return r.fulfill({ json: guardado })
  })
  const years = await (await page.request.get('/api/fiscal/years')).json() as number[]
  test.skip(years.length === 0, 'Sin ejercicios en estos datos')
  return { escrituras, anio: years[0] }
}

test('el diálogo propone Excel con sus secciones; CSV y Renta Web tienen formato fijo; sin violaciones de axe', async ({ page }) => {
  const { anio } = await preparar(page)
  await page.goto(`/fiscal?anio=${anio}`)
  await page.getByRole('button', { name: 'Exportar' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Exportar el ejercicio' })
  await expect(dialogo.getByRole('radio', { name: /^Excel/ })).toBeChecked()
  await expect(dialogo.getByRole('checkbox', { name: 'Resumen' })).toBeChecked()
  await expect(dialogo.getByRole('checkbox', { name: 'Lotes FIFO consumidos' })).not.toBeChecked()
  await dialogo.getByRole('radio', { name: /^Renta Web/ }).check()
  await expect(dialogo.getByRole('checkbox', { name: 'Resumen' })).toBeDisabled()
  await expect(dialogo).toContainText('Renta Web tiene un formato fijo')
  const r = await (await axeEstable(page)).include('[role="dialog"]').withTags(WCAG).analyze()
  expect(r.violations).toEqual([])
})

test('descarga directa con el nombre del fichero, aviso al terminar y preferencias recordadas', async ({ page }) => {
  const { escrituras, anio } = await preparar(page)
  await page.goto(`/fiscal?anio=${anio}`)
  await page.getByRole('button', { name: 'Exportar' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Exportar el ejercicio' })
  await dialogo.getByRole('radio', { name: /^PDF/ }).check()
  await dialogo.getByRole('checkbox', { name: 'Lotes FIFO consumidos' }).check()
  const [descarga] = await Promise.all([page.waitForEvent('download'), dialogo.getByRole('button', { name: 'Descargar' }).click()])
  expect(descarga.suggestedFilename()).toBe(`fiscal_${anio}.pdf`)
  await expect(page.getByText('Exportación descargada')).toBeVisible()
  await expect(dialogo).toBeHidden()
  await expect.poll(() => escrituras.at(-1)).toEqual({
    key: 'export_preferencias',
    value: JSON.stringify({ formato: 'pdf', secciones: ['resumen', 'compensacion', 'activos', 'operaciones', 'rendimientos', 'lotes'] }),
  })
})

test('el CSV se descarga con su nombre sin abrir pestañas', async ({ page, context }) => {
  const { anio } = await preparar(page)
  await page.goto(`/fiscal?anio=${anio}`)
  await page.getByRole('button', { name: 'Exportar' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Exportar el ejercicio' })
  await dialogo.getByRole('radio', { name: /^CSV/ }).check()
  const [descarga] = await Promise.all([page.waitForEvent('download'), dialogo.getByRole('button', { name: 'Descargar' }).click()])
  expect(descarga.suggestedFilename()).toBe(`fiscal_${anio}.csv`)
  expect(context.pages()).toHaveLength(1)
})

test('Ajustes > Fiscal guarda el formato y las secciones que propone «Exportar»', async ({ page }) => {
  const { escrituras } = await preparar(page)
  await page.goto('/settings?tab=fiscal')
  const tarjeta = page.getByRole('region', { name: 'Exportación del ejercicio' })
  await tarjeta.getByRole('radio', { name: /^PDF/ }).check()
  await expect.poll(() => escrituras.at(-1)?.key).toBe('export_preferencias')
  expect(JSON.parse(escrituras.at(-1)!.value)).toMatchObject({ formato: 'pdf' })
})
