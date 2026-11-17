import { expect, test } from '@playwright/test'
import { axeEstable } from './axe'

// Selector de rango común de los gráficos (#508): mismos nombres en Evolución
// y en el detalle de activo, saltos de año, «Ir a hoy» con T, «Hasta hoy» y
// el rango guardado en la URL. Las teclas no actúan en campos de texto.
// Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const NOMBRES = ['7 d', '30 d', '90 d', '6 m', '1 a', 'Este año', 'Todo']

async function evolucion(page: import('@playwright/test').Page, ruta = '/') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(ruta)
  const sel = page.getByRole('group', { name: 'Rango del gráfico de evolución' })
  await sel.waitFor({ timeout: 15_000 })
  return sel
}

test('Evolución: nombres comunes y el rango se guarda en la URL', async ({ page }) => {
  const sel = await evolucion(page)
  const textos = (await sel.getByRole('radio').allTextContents()).map(t => t.trim())
  expect(textos).toEqual(['24 h', ...NOMBRES])
  await expect(sel.getByRole('radio', { name: 'Toda la historia' })).toHaveAttribute('aria-checked', 'true')
  await sel.getByRole('radio', { name: 'Últimos 30 días' }).click()
  await expect(page).toHaveURL(/[?&]evolucion=30d\b/)
  await page.reload()
  await expect(page.getByRole('group', { name: 'Rango del gráfico de evolución' }).getByRole('radio', { name: 'Últimos 30 días' }))
    .toHaveAttribute('aria-checked', 'true')
  // Volver al rango por defecto quita el parámetro.
  await page.getByRole('group', { name: 'Rango del gráfico de evolución' }).getByRole('radio', { name: 'Toda la historia' }).click()
  await expect(page).not.toHaveURL(/evolucion=/)
})

test('saltos de año y «Ir a hoy» con botones y con teclado, nunca en campos de texto', async ({ page }) => {
  const sel = await evolucion(page)
  const anterior = sel.getByRole('button', { name: /^Año anterior/ })
  test.skip(await anterior.isDisabled(), 'Sin historia del año anterior en estos datos')
  const anio = new Date().getFullYear()
  await anterior.click()
  await expect(page).toHaveURL(new RegExp(`evolucion=${anio - 1}-01-01_${anio - 1}-12-31`))
  await expect(page.getByText(`Del 1 ene ${anio - 1} al 31 dic ${anio - 1}`)).toBeVisible()
  // T con el foco fuera de campos: misma duración, terminando hoy.
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await page.keyboard.press('t')
  await expect(page).toHaveURL(/evolucion=\d{4}-\d{2}-\d{2}_hoy/)
  // Av Pág no salta al año siguiente si el foco está en un campo de texto.
  const url = page.url()
  const campo = page.getByRole('button', { name: /Rango|Elegir/ }).first()
  await campo.focus().catch(() => {})
  await page.evaluate(() => {
    const i = document.createElement('input'); i.id = 'campo-prueba'; document.body.appendChild(i); i.focus()
  })
  await page.keyboard.press('PageUp')
  await page.keyboard.press('t')
  expect(page.url()).toBe(url)
})

test('«Hasta hoy» dentro del calendario: elegido el inicio, cierra el rango en hoy y se mantiene al día', async ({ page }) => {
  const sel = await evolucion(page)
  await sel.getByRole('button', { name: /^Rango$/ }).click()
  const cal = page.getByRole('dialog', { name: 'Elegir rango de fechas' })
  // Primer día del mes que muestra el calendario como inicio.
  await cal.getByRole('button', { name: '1', exact: true }).first().click()
  await cal.getByRole('button', { name: 'Hasta hoy' }).click()
  await expect(page).toHaveURL(/evolucion=\d{4}-\d{2}-01_hoy/)
  await expect(page.getByText(/^Desde el 1 .+ hasta hoy$/)).toBeVisible()
  // Fuera del calendario ya no hay botón «Ir a hoy» ni casilla.
  await expect(sel.getByRole('button', { name: 'Ir a hoy' })).toHaveCount(0)
  await expect(sel.getByRole('checkbox')).toHaveCount(0)
})

test('un valor de URL no válido se ignora', async ({ page }) => {
  const sel = await evolucion(page, '/?evolucion=nada')
  await expect(sel.getByRole('radio', { name: 'Toda la historia' })).toHaveAttribute('aria-checked', 'true')
})

test('el detalle de activo usa el mismo selector y el zoom es un rango personalizado', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/portfolio')
  await page.getByRole('radio', { name: 'Por activo' }).click()
  const boton = page.locator('tbody tr[data-row-key]').getByRole('button', { name: /^Detalle de / }).first()
  await boton.waitFor({ timeout: 15_000 })
  await boton.click()
  const sel = page.getByRole('dialog').getByRole('group', { name: 'Rango del gráfico de precio' })
  await sel.waitFor({ timeout: 15_000 })
  const textos = (await sel.getByRole('radio').allTextContents()).map(t => t.trim())
  expect(textos).toEqual(NOMBRES)
  const grafico = page.getByRole('dialog').getByTestId('grafico-precio')
  test.skip(await grafico.count() === 0, 'Sin histórico de precios para este activo')
  const box = (await grafico.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200)
  await expect(page).toHaveURL(/rango-activo=\d{4}-\d{2}-\d{2}_(\d{4}-\d{2}-\d{2}|hoy)/)
  await page.getByRole('dialog').getByRole('button', { name: 'Restablecer la vista del gráfico' }).click()
  await expect(page).not.toHaveURL(/rango-activo=/)
})

for (const theme of ['dark', 'light'] as const) {
  test(`selector de rango sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    const anio = new Date().getFullYear()
    await evolucion(page, `/?evolucion=${anio - 1}-01-01_${anio - 1}-03-31`)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.mouse.move(0, 0)
    const { violations } = await (await axeEstable(page)).include('[data-testid="range-selector"]').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
