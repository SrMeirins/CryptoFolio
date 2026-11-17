import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Gráfico de evolución (#509): zoom con teclado, rueda y selección de tramo
// (Mayús y arrastrar), historial «Atrás», «Todo» y Escape, navegador, cruz con
// el valor y la fecha, etiqueta del último valor, línea de aportado en Valor y
// tira de métricas sobre lo visible. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function grafico(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const g = page.getByTestId('grafico-evolucion')
  await g.waitFor({ timeout: 20_000 }).catch(() => {})
  test.skip(await g.count() === 0, 'Sin historia diaria en estos datos')
  await g.scrollIntoViewIfNeeded()
  return g
}

const todo = (page: Page) => page.getByRole('button', { name: 'Todo: ver todo el rango' })
const atras = (page: Page) => page.getByRole('button', { name: 'Atrás: deshacer el último zoom' })

test('zoom con teclado: + acerca, Retroceso deshace y Escape vuelve a todo', async ({ page }) => {
  const g = await grafico(page)
  await expect(todo(page)).toBeDisabled()
  await g.focus()
  await page.keyboard.press('+')
  await expect(page).toHaveURL(/evolucion=\d{4}-\d{2}-\d{2}_(\d{4}-\d{2}-\d{2}|hoy)/)
  await expect(todo(page)).toBeEnabled()
  await page.keyboard.press('+')
  const dosVeces = page.url()
  await page.keyboard.press('Backspace')
  await expect.poll(() => page.url()).not.toBe(dosVeces)
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/evolucion=/)
  await expect(todo(page)).toBeDisabled()
  // Atrás desde «Todo» vuelve al último zoom.
  await expect(atras(page)).toBeEnabled()
  await atras(page).click()
  await expect(page).toHaveURL(/evolucion=/)
})

test('rueda y selección de tramo con Mayús; el navegador sigue la ventana', async ({ page }) => {
  const g = await grafico(page)
  const box = (await g.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2)
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200)
  await expect(page).toHaveURL(/evolucion=/)
  await todo(page).click()
  await expect(page).not.toHaveURL(/evolucion=/)
  // Mayús y arrastrar: elige un tramo.
  await page.keyboard.down('Shift')
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 6 })
  await expect(page.getByTestId('tramo-zoom')).toBeVisible()
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect(page).toHaveURL(/evolucion=\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}/)
  await expect(page.getByTestId('navegador-precio')).toBeVisible()
})

test('la rueda funciona aunque el gráfico aparezca tras preparar los históricos', async ({ page }) => {
  // Las primeras respuestas dicen que faltan cierres (se muestra el progreso) y luego, que está listo.
  let llamadas = 0
  await page.route('**/api/v1/pnl/preparacion', async route => {
    llamadas++
    if (llamadas <= 1) { await route.fulfill({ json: { completo: false, progreso: { listos: 1, total: 2 } } }); return }
    await route.fallback()
  })
  const g = await grafico(page)
  await expect.poll(() => llamadas).toBeGreaterThan(1)
  const box = (await g.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2)
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200)
  await expect(page).toHaveURL(/evolucion=/)
})

test('cruz con valor y fecha, último valor, aportado en Valor y tira de métricas', async ({ page }) => {
  const g = await grafico(page)
  await expect(page.getByTestId('ultimo-valor')).toBeVisible()
  const box = (await g.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 4 })
  await expect(page.getByTestId('cruz-evolucion')).toHaveCount(1)
  const tira = page.getByRole('list', { name: 'Métricas de lo visible en el gráfico de evolución' })
  await expect(tira.getByRole('listitem')).toHaveCount(6)
  for (const t of ['Resultado', 'Máximo', 'Mínimo', 'Aportado neto']) await expect(tira).toContainText(t)
  await page.getByRole('radio', { name: 'Valor' }).click()
  await expect(tira).toContainText('Variación del valor')
  const conmutar = page.getByRole('button', { name: 'Ocultar aportado' })
  await expect(conmutar).toHaveAttribute('aria-pressed', 'true')
  await conmutar.click()
  await expect(page.getByRole('button', { name: 'Mostrar aportado' })).toHaveAttribute('aria-pressed', 'false')
})

for (const theme of ['dark', 'light'] as const) {
  test(`gráfico de evolución sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await grafico(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.mouse.move(0, 0)
    const { violations } = await (await axeEstable(page)).include('#evolucion').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
