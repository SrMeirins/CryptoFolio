import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Copias automáticas, salud y FIFO con progreso en Datos (#454). Solo
// lectura: el estado y las acciones de las copias, el guardado de ajustes y
// el FIFO se interceptan con respuestas sintéticas.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const FILES = [
  { name: 'cryptofolio-auto-20260103-100000.json', size: 2_700_000, created_at: '2026-01-03T10:00:00.000Z' },
  { name: 'cryptofolio-auto-20260102-100000.json', size: 2_650_000, created_at: '2026-01-02T10:00:00.000Z' },
]
const sum = (lots: number, gain: number) => ({ lots, openLots: 10, consumptions: 50, shortfalls: 0, netGainEur: gain })
const FIFO_SSE = [
  { phase: 'precios' }, { phase: 'fifo', done: 40, total: 80 },
  { phase: 'done', before: sum(20, 100), after: sum(22, 112.5), diff: { lots: 2, openLots: 0, consumptions: 0, shortfalls: 0, netGainEur: 12.5 }, errors: 0, warnings: 0 },
].map(e => `data: ${JSON.stringify(e)}\n\n`).join('')

interface Calls { config: Array<{ key: string; value: string }>; runs: number; downloads: Array<{ name: string; body: unknown }>; restores: string[]; reverts: number; fifo: number }

async function fakeApi(page: Page, { available = true, lastFailure = null as null | { at: string; message: string } } = {}): Promise<Calls> {
  const calls: Calls = { config: [], runs: 0, downloads: [], restores: [], reverts: 0, fifo: 0 }
  const settings = { enabled: true, frequencyHours: 24, keep: 7 }
  await page.route('**/api/settings/backup/auto', route => route.fulfill({
    json: { available, reason: available ? null : 'sin-clave', settings, files: available ? FILES : [], lastFailure },
  }))
  await page.route('**/api/settings/backup/auto/run', async route => { calls.runs++; await route.fulfill({ json: { name: FILES[0].name, rotated: 0 } }) })
  await page.route('**/api/settings/backup/auto/*/download', async route => {
    calls.downloads.push({ name: decodeURIComponent(route.request().url().split('/').at(-2) ?? ''), body: route.request().postDataJSON() })
    await route.fulfill({ json: { format: 'cryptofolio-backup', schema: 20, exported_at: FILES[0].created_at, encrypted: true } })
  })
  await page.route('**/api/settings/backup/auto/*/restore', async route => {
    calls.restores.push(decodeURIComponent(route.request().url().split('/').at(-2) ?? ''))
    await route.fulfill({ json: { restored: {}, snapshotId: '00000000-0000-4000-8000-0000000000bb', fifo: true } })
  })
  await page.route('**/api/settings/backup/snapshots', route => route.fulfill({ json: [] }))
  await page.route('**/api/settings/backup/snapshots/*/revert', async route => { calls.reverts++; await route.fulfill({ json: { reverted: true, fifo: true } }) })
  await page.route('**/api/settings/config', async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { key: string; value: string }
      calls.config.push(body)
      if (body.key === 'auto_backup_enabled') settings.enabled = body.value === 'true'
      if (body.key === 'auto_backup_frequency') settings.frequencyHours = Number(body.value)
      if (body.key === 'auto_backup_keep') settings.keep = Number(body.value)
      await route.fulfill({ json: { success: true } })
      return
    }
    try { await route.fulfill({ response: await route.fetch() }) } catch { /* navegación en curso */ }
  })
  await page.route('**/api/fifo/run/stream', async route => {
    calls.fifo++
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: FIFO_SSE })
  })
  return calls
}

const card = (page: Page) => page.getByRole('region', { name: 'Copias automáticas' })

test('ajustes de las copias automáticas: se guardan al momento con Deshacer', async ({ page }) => {
  const calls = await fakeApi(page)
  await page.goto('/settings?tab=datos')
  const c = card(page)
  await expect(c.getByRole('switch', { name: 'Hacer copias automáticas' })).toBeChecked()
  await c.getByRole('button', { name: /Frecuencia de las copias/ }).click()
  await page.getByRole('option', { name: 'Semanal' }).click()
  await expect.poll(() => calls.config).toContainEqual({ key: 'auto_backup_frequency', value: '168' })
  await page.getByRole('button', { name: 'Deshacer' }).first().click()
  await expect.poll(() => calls.config).toContainEqual({ key: 'auto_backup_frequency', value: '24' })

  await c.getByRole('button', { name: /Copias que se guardan/ }).click()
  await page.getByRole('option', { name: '14 copias' }).click()
  await expect.poll(() => calls.config).toContainEqual({ key: 'auto_backup_keep', value: '14' })
})

test('lista: descargar pide contraseña y restaurar confirma y ofrece Deshacer', async ({ page }) => {
  const calls = await fakeApi(page)
  await page.goto('/settings?tab=datos')
  const lista = card(page).getByRole('list', { name: 'Copias automáticas' })
  await expect(lista.getByRole('listitem')).toHaveCount(2)
  await expect(lista.getByRole('listitem').first()).toContainText('Última')

  await lista.getByRole('button', { name: /^Descargar la copia del 03\/01\/2026/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Descargar copia' })
  await dialog.getByLabel('Contraseña', { exact: true }).fill('contrasena-larga')
  await dialog.getByLabel('Repite la contraseña').fill('contrasena-larga')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Descargar cifrada' }).click()
  expect((await download).suggestedFilename()).toBe('cryptofolio-backup-2026-01-03.json')
  expect(calls.downloads).toEqual([{ name: FILES[0].name, body: { password: 'contrasena-larga' } }])

  await lista.getByRole('button', { name: /^Restaurar la copia del 02\/01\/2026/ }).click()
  await page.getByRole('dialog', { name: 'Restaurar la copia automática' }).getByRole('button', { name: 'Restaurar' }).click()
  await expect.poll(() => calls.restores).toEqual([FILES[1].name])
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect.poll(() => calls.reverts).toBe(1)
})

test('hacer copia ahora, y el aviso de la última fallida', async ({ page }) => {
  const calls = await fakeApi(page, { lastFailure: { at: '2026-01-03T11:00:00.000Z', message: 'No queda espacio en el disco.' } })
  await page.goto('/settings?tab=datos')
  const c = card(page)
  await expect(c.getByRole('alert')).toContainText('No queda espacio en el disco. Las anteriores se conservan.')
  await c.getByRole('button', { name: 'Hacer copia ahora' }).click()
  await expect.poll(() => calls.runs).toBe(1)
})

test('sin clave del equipo: explica el motivo y no deja activarlas', async ({ page }) => {
  await fakeApi(page, { available: false })
  await page.goto('/settings?tab=datos')
  const c = card(page)
  await expect(c.getByRole('note')).toContainText('WALLET_SYNC_ENCRYPTION_KEY')
  await expect(c.getByRole('switch', { name: 'Hacer copias automáticas' })).toBeDisabled()
  await expect(c.getByRole('button', { name: 'Hacer copia ahora' })).toHaveCount(0)
})

test('FIFO con progreso: resumen antes y después', async ({ page }) => {
  const calls = await fakeApi(page)
  await page.goto('/settings?tab=datos')
  const m = page.getByRole('region', { name: 'Mantenimiento' })
  await m.getByRole('button', { name: 'Ejecutar' }).click()
  const tabla = m.getByRole('table', { name: 'Estado FIFO antes y después de recalcular' })
  await expect(tabla.locator('[data-fifo="lots"]')).toContainText('+2')
  await expect(tabla.locator('[data-fifo="consumptions"]')).toContainText('Sin cambios')
  await expect(tabla.locator('[data-fifo="netGainEur"]')).toContainText('112,50')
  expect(calls.fifo).toBe(1)
})

test('salud de los datos en las estadísticas', async ({ page }) => {
  await fakeApi(page)
  await page.goto('/settings?tab=datos')
  const salud = page.getByRole('group', { name: 'Salud de los datos' })
  for (const t of ['Tamaño en disco', 'Última importación', 'Último FIFO', 'Última copia']) await expect(salud).toContainText(t)
})

for (const theme of ['dark', 'light'] as const) {
  test(`Datos sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await fakeApi(page)
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/settings?tab=datos')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.getByRole('region', { name: 'Mantenimiento' }).getByRole('button', { name: 'Ejecutar' }).click()
    await page.getByRole('table', { name: 'Estado FIFO antes y después de recalcular' }).waitFor()
    await page.waitForTimeout(800)
    const { violations } = await new AxeBuilder({ page }).include('main').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
