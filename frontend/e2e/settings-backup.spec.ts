import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Copias de seguridad en Datos (#453). Solo lectura: exportar, revisar,
// restaurar, la lista de estados previos y volver atrás se interceptan con
// respuestas sintéticas; nada llega a la base de datos.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const SNAPSHOT_ID = '00000000-0000-4000-8000-0000000000aa'

const SEALED = {
  format: 'cryptofolio-backup', schema: 20, exported_at: '2026-01-02T03:04:05.000Z', encrypted: true,
  kdf: { name: 'argon2id', salt: 'c2FsdHNhbHRzYWx0c2FsdA==', memory: 65536, iterations: 3, parallelism: 1 },
  cipher: { name: 'aes-256-gcm', iv: 'aXZpdml2aXZpdml2', tag: 'dGFndGFndGFndGFndGFnZw==' },
  payload: 'cGF5bG9hZA==',
}
const PREVIEW = {
  schema: 20, exported_at: SEALED.exported_at, encrypted: true,
  counts: { transactions: 12, wallets: 3, app_config: 2, raw_transactions: 0 },
  current: { transactions: 15, wallets: 3, app_config: 2, raw_transactions: 0 },
}

interface Calls { exports: unknown[]; previews: unknown[]; restores: unknown[]; reverts: string[] }

async function fakeBackupApi(page: Page, { snapshots = [] as unknown[] } = {}): Promise<Calls> {
  const calls: Calls = { exports: [], previews: [], restores: [], reverts: [] }
  await page.route('**/api/settings/backup', async route => {
    calls.exports.push(route.request().postDataJSON())
    await route.fulfill({ json: SEALED })
  })
  await page.route('**/api/settings/backup/preview', async route => {
    const body = route.request().postDataJSON() as { password?: string }
    calls.previews.push(body)
    if (body.password !== 'contrasena-buena') {
      await route.fulfill({ status: 400, json: { error: 'Contraseña incorrecta o copia dañada', code: 'contrasena' } })
      return
    }
    await route.fulfill({ json: PREVIEW })
  })
  await page.route('**/api/settings/backup/restore', async route => {
    calls.restores.push(route.request().postDataJSON())
    await route.fulfill({ json: { restored: PREVIEW.counts, snapshotId: SNAPSHOT_ID, fifo: true } })
  })
  await page.route('**/api/settings/backup/snapshots', route => route.fulfill({ json: snapshots }))
  await page.route('**/api/settings/backup/snapshots/*/revert', async route => {
    calls.reverts.push(route.request().url().split('/').at(-2) ?? '')
    await route.fulfill({ json: { reverted: true, fifo: true } })
  })
  return calls
}

function card(page: Page) {
  return page.getByRole('region', { name: 'Copias de seguridad' })
}

test('exportar cifrada: valida la contraseña y la envía en el cuerpo', async ({ page }) => {
  const calls = await fakeBackupApi(page)
  await page.goto('/settings?tab=datos')
  const c = card(page)
  await expect(c.getByRole('switch', { name: 'Cifrar con contraseña' })).toBeChecked()
  const submit = c.getByRole('button', { name: 'Descargar copia cifrada' })

  await c.getByLabel('Contraseña', { exact: true }).fill('corta')
  await submit.click()
  await expect(c.getByRole('alert')).toHaveText('Al menos 8 caracteres.')
  await c.getByLabel('Contraseña', { exact: true }).fill('contrasena-larga')
  await c.getByLabel('Repite la contraseña').fill('otra-distinta')
  await expect(c.getByRole('alert')).toHaveText('Las contraseñas no coinciden.')
  expect(calls.exports).toHaveLength(0)

  await c.getByLabel('Repite la contraseña').fill('contrasena-larga')
  const download = page.waitForEvent('download')
  await submit.click()
  expect((await download).suggestedFilename()).toMatch(/^cryptofolio-backup-\d{4}-\d{2}-\d{2}\.json$/)
  expect(calls.exports).toEqual([{ password: 'contrasena-larga' }])
  expect(page.url()).not.toContain('contrasena')
})

test('exportar sin cifrar: aviso claro y sin contraseña', async ({ page }) => {
  const calls = await fakeBackupApi(page)
  await page.goto('/settings?tab=datos')
  const c = card(page)
  await c.getByText('Cifrar con contraseña').click()
  await expect(c.getByRole('switch', { name: 'Cifrar con contraseña' })).not.toBeChecked()
  await expect(c.getByRole('note')).toContainText('texto legible')
  const download = page.waitForEvent('download')
  await c.getByRole('button', { name: 'Descargar copia', exact: true }).click()
  await download
  expect(calls.exports).toEqual([{}])
})

test('restaurar: contraseña, vista previa, confirmación y deshacer', async ({ page }) => {
  const calls = await fakeBackupApi(page)
  await page.goto('/settings?tab=datos')
  const c = card(page)
  await c.getByLabel('Elegir copia').setInputFiles({ name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(SEALED)) })
  const form = c.getByRole('form', { name: 'Copia elegida' })
  await expect(form).toContainText('copia.json')
  await expect(form).toContainText('cifrada')

  await form.getByLabel('Contraseña de la copia').fill('contrasena-mala')
  await form.getByRole('button', { name: 'Revisar contenido' }).click()
  await expect(form.getByRole('alert')).toHaveText('Contraseña incorrecta o copia dañada')

  await form.getByLabel('Contraseña de la copia').fill('contrasena-buena')
  await form.getByRole('button', { name: 'Revisar contenido' }).click()
  const tabla = form.getByRole('table', { name: 'Contenido de la copia frente a los datos actuales' })
  await expect(tabla.locator('[data-tabla="transactions"]')).toContainText('12')
  await expect(tabla.locator('[data-tabla="transactions"]')).toContainText('(-3)')
  await expect(tabla.locator('[data-tabla="raw_transactions"]')).toHaveCount(0)
  expect(calls.restores).toHaveLength(0)

  await form.getByRole('button', { name: 'Restaurar esta copia' }).click()
  const dialog = page.getByRole('dialog', { name: 'Restaurar la copia' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Restaurar' }).click()
  await expect.poll(() => calls.restores.length).toBe(1)
  expect(calls.restores[0]).toMatchObject({ password: 'contrasena-buena', confirm: true })

  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect.poll(() => calls.reverts).toEqual([SNAPSHOT_ID])
})

test('un fichero ajeno o del formato anterior se rechaza sin enviarlo', async ({ page }) => {
  const calls = await fakeBackupApi(page)
  await page.goto('/settings?tab=datos')
  const c = card(page)
  await c.getByLabel('Elegir copia').setInputFiles({ name: 'otro.json', mimeType: 'application/json', buffer: Buffer.from('{"hola":1}') })
  await expect(c.getByRole('alert')).toHaveText('El fichero no es una copia de CryptoFolio.')
  await c.getByLabel('Elegir copia').setInputFiles({ name: 'vieja.json', mimeType: 'application/json', buffer: Buffer.from('{"version":"1.0"}') })
  await expect(c.getByRole('alert')).toContainText('formato anterior')
  expect(calls.previews).toHaveLength(0)
})

test('con un estado previo guardado, se puede volver a él tras confirmar', async ({ page }) => {
  const calls = await fakeBackupApi(page, { snapshots: [{ id: SNAPSHOT_ID, created_at: '2026-01-03T10:00:00.000Z', schema: 20, counts: { transactions: 7 } }] })
  await page.goto('/settings?tab=datos')
  const c = card(page)
  await expect(c).toContainText('Estado anterior')
  await expect(c).toContainText('7 operaciones')
  await c.getByRole('button', { name: 'Volver al estado anterior' }).click()
  await page.getByRole('dialog', { name: 'Volver al estado anterior' }).getByRole('button', { name: 'Volver' }).click()
  await expect.poll(() => calls.reverts).toEqual([SNAPSHOT_ID])
})

for (const theme of ['dark', 'light'] as const) {
  test(`Copias de seguridad sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await fakeBackupApi(page, { snapshots: [{ id: SNAPSHOT_ID, created_at: '2026-01-03T10:00:00.000Z', schema: 20, counts: { transactions: 7 } }] })
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/settings?tab=datos')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await card(page).getByLabel('Elegir copia').setInputFiles({ name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(SEALED)) })
    await page.waitForTimeout(800)
    const { violations } = await new AxeBuilder({ page }).include('section[aria-label="Copias de seguridad"]').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
