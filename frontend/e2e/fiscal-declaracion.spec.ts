import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Estado de la declaración por pasos (#542): marcar con confirmación y
// Deshacer, declarado frente a actual y enlace a las operaciones por revisar.
// Las marcas se simulan en el navegador: el test no escribe en la base.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const anio = new Date().getFullYear() - 1

interface Marca { ejercicio: number; tipo: string; declaradoEn: string; cifras: Record<string, number>; cambios?: unknown[] }

/** Simula /fiscal/declaraciones y sus escrituras con un estado en memoria. */
async function simular(page: Page, inicial: Marca[] = []) {
  let marcas = [...inicial]
  await page.route('**/api/fiscal/declaraciones', r => r.fulfill({ json: marcas }))
  await page.route(/\/api\/fiscal\/\d{4}\/declaracion\/[a-z0-9]+(\/restaurar)?$/, async r => {
    const url = new URL(r.request().url())
    const [, , , ej, , tipo, extra] = url.pathname.split('/')
    const ejercicio = Number(ej)
    if (r.request().method() === 'DELETE') {
      const previa = marcas.find(m => m.ejercicio === ejercicio && m.tipo === tipo)
      marcas = marcas.filter(m => m !== previa)
      return r.fulfill({ json: { ok: true, previa } })
    }
    const body = extra === 'restaurar' ? r.request().postDataJSON() as Pick<Marca, 'declaradoEn' | 'cifras'>
      : { declaradoEn: '2026-05-01T10:00:00.000Z', cifras: { neto: 100, cuota: 19, operaciones: 3 } }
    const nueva = { ejercicio, tipo, ...body, cambios: [] }
    marcas = [...marcas.filter(m => !(m.ejercicio === ejercicio && m.tipo === tipo)), nueva]
    return r.fulfill({ json: nueva })
  })
}

async function abrir(page: Page) {
  await page.goto(`/fiscal?anio=${anio}`)
  const panel = page.getByRole('heading', { name: `Estado de la declaración ${anio}` })
  await panel.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await panel.count() === 0, 'Sin ejercicio cerrado en estos datos')
}

test('marcar como revisado pide confirmación y Deshacer devuelve el estado anterior', async ({ page }) => {
  await simular(page)
  await abrir(page)
  const pasos = page.getByRole('list', { name: `Pasos de la declaración de ${anio}` })
  await expect(pasos.getByRole('heading', { name: 'Revisado: pendiente' })).toBeVisible()
  await pasos.getByRole('button', { name: 'Marcar como revisado' }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toBeVisible()
  await dialogo.getByRole('button', { name: 'Marcar como revisado' }).click()
  await expect(pasos.getByRole('heading', { name: 'Revisado: hecho' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(pasos.getByRole('heading', { name: 'Revisado: pendiente' })).toBeVisible()
})

test('quitar la marca y deshacerlo deja la fecha original', async ({ page }) => {
  await simular(page, [{ ejercicio: anio, tipo: 'renta', declaradoEn: '2025-06-02T09:00:00.000Z', cifras: { neto: 100 }, cambios: [] }])
  await abrir(page)
  const pasos = page.getByRole('list', { name: `Pasos de la declaración de ${anio}` })
  await expect(pasos.getByText(/^Presentada el 2 jun 2025/)).toBeVisible()
  await pasos.getByRole('button', { name: 'Quitar marca' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Quitar la marca' }).click()
  await expect(pasos.getByRole('heading', { name: 'Renta presentada: pendiente' })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(pasos.getByText(/^Presentada el 2 jun 2025/)).toBeVisible()
})

test('si las cifras cambiaron tras presentar, la tabla declarado frente a actual', async ({ page }) => {
  await simular(page, [{ ejercicio: anio, tipo: 'renta', declaradoEn: '2025-06-02T09:00:00.000Z', cifras: { neto: 100, cuota: 19 },
    cambios: [{ campo: 'neto', declarado: 100, actual: 150 }] }])
  await abrir(page)
  const tabla = page.getByRole('table', { name: /^Declarado el 2 jun 2025 frente a las cifras actuales$/ })
  await expect(tabla.getByRole('row', { name: /^Neto \(ha cambiado\) 100,00\s€ 150,00\s€ \+50,00\s€$/ })).toBeVisible()
})

test('el enlace de datos por revisar abre Operaciones filtrada', async ({ page }) => {
  await simular(page)
  await abrir(page)
  const enlace = page.getByRole('button', { name: /operaci(ón|ones) con la clave por revisar$/ })
  test.skip(await enlace.count() === 0, 'Sin operaciones por revisar en estos datos')
  await enlace.click()
  await expect(page).toHaveURL(/vista=operaciones&anio=\d{4}&revisar=1/)
  await expect(page.getByRole('button', { name: /Clave por revisar/, pressed: true })).toBeVisible()
})

for (const theme of ['dark', 'light'] as const) {
  test(`estado de la declaración sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await simular(page, [{ ejercicio: anio, tipo: 'renta', declaradoEn: '2025-06-02T09:00:00.000Z', cifras: { neto: 100 },
      cambios: [{ campo: 'neto', declarado: 100, actual: 150 }] }])
    await abrir(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.waitForTimeout(300)
    const { violations } = await (await axeEstable(page)).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
