import { expect, test } from './base'
import { axeEstable } from './axe'
import { abrirOpcionesVista } from './historyHelpers'

// Resumen del Historial (#403, #553): el margen se incluye o excluye en
// Opciones de vista y va a la URL; el aviso del resumen lo cambia con un
// enlace; cada tarjeta explica qué suma y lleva su chip de operaciones.
// Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test('el margen se cambia en Opciones de vista, con el teclado, y va a la URL', async ({ page }) => {
  await page.goto('/history?margen=excluido')
  await abrirOpcionesVista(page)
  const sw = page.getByRole('dialog', { name: 'Opciones de vista' }).getByRole('switch', { name: 'Incluir margen en el resumen' })
  await expect(sw).not.toBeChecked()
  await sw.focus()
  await page.keyboard.press('Space')
  await expect(sw).toBeChecked()
  await expect(page).toHaveURL(/[?&]margen=incluido/)
  await page.keyboard.press('Space')
  await expect(page).not.toHaveURL(/margen=incluido/)
  // Ya no hay interruptor junto al resumen.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: /Resumen/ }).getByRole('switch')).toHaveCount(0)
})

test('el aviso del margen lo incluye o lo excluye con su enlace', async ({ page }) => {
  await page.goto('/history?margen=excluido')
  const incluir = page.getByRole('button', { name: 'Incluirlas' })
  await incluir.waitFor({ timeout: 10_000 }).catch(() => { /* sin margen en estos datos */ })
  test.skip(await incluir.count() === 0, 'Sin operaciones de margen en estos datos')
  await incluir.click()
  await expect(page).toHaveURL(/[?&]margen=incluido/)
  await page.getByRole('button', { name: 'Excluirlas' }).click()
  await expect(page).not.toHaveURL(/margen=incluido/)
})

for (const theme of ['dark', 'light'] as const) {
  test(`tarjetas del resumen con su chip sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/history')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(page.getByRole('button', { name: /^Invertido: .*Ver sus operaciones$/ })).toBeVisible()
    await page.mouse.move(0, 0)
    const { violations } = await (await axeEstable(page)).include('section[aria-labelledby="historial-resumen"]').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}

test('cada tarjeta explica qué suma', async ({ page }) => {
  await page.goto('/history')
  for (const t of ['Invertido', 'Retirado', 'Ventas', 'Ingresos', 'Comisiones']) {
    await expect(page.getByRole('button', { name: `Qué suma ${t}` })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Qué suma Ventas' }).focus()
  await expect(page.getByRole('tooltip')).toContainText('Valor de lo vendido')
  await expect(page.getByRole('tooltip')).toContainText('A stablecoin')
})
