import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Comparativa interanual y evolución mensual (#539): una fila en ancho grande,
// métrica de la comparativa, clic en año o mes hacia Operaciones, comparar con
// el año anterior y axe en ambos temas. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function abrir(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1680, height: 1050 })
  await page.goto('/fiscal')
  const metrica = page.getByRole('radiogroup', { name: 'Métrica de la comparativa' })
  await metrica.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await metrica.count() === 0, 'Menos de dos ejercicios en estos datos')
  return metrica
}

test('los dos paneles van en una fila en ancho grande', async ({ page }) => {
  await abrir(page)
  const comp = page.getByRole('heading', { name: 'Comparativa interanual' })
  const mens = page.getByRole('heading', { name: 'Evolución mensual' })
  test.skip(await mens.count() === 0, 'Ejercicio sin meses')
  // Mismo píxel de altura (la cabecera de las tarjetas tiene altura mínima
  // común); se espera a que acabe la animación de entrada de los paneles.
  await expect.poll(async () => Math.abs((await comp.boundingBox())!.y - (await mens.boundingBox())!.y)).toBeLessThan(0.5)
  expect((await mens.boundingBox())!.x).toBeGreaterThan((await comp.boundingBox())!.x + 200)
})

test('la métrica cambia la tira; un año abre sus operaciones', async ({ page }) => {
  const metrica = await abrir(page)
  await expect(page.getByText('Mejor año')).toBeVisible()
  await metrica.getByRole('radio', { name: 'Operaciones' }).click()
  await expect(page.getByText('Más operaciones')).toBeVisible()
  await metrica.getByRole('radio', { name: 'Cuota' }).click()
  await expect(page.getByText('Mayor cuota')).toBeVisible()
  const fila = page.getByRole('button', { name: /^\d{4}(, en curso, provisional)?: cuota .*Ver sus operaciones$/ }).last()
  const year = (await fila.getAttribute('aria-label'))!.slice(0, 4)
  await fila.click()
  await expect(page).toHaveURL(new RegExp(`vista=operaciones&anio=${year}$`))
})

test('un mes abre sus operaciones y se puede comparar con el año anterior', async ({ page }) => {
  await abrir(page)
  const comparar = page.getByRole('switch', { name: /^Comparar con \d{4}$/ })
  if (await comparar.count()) {
    await comparar.check({ force: true })
    await expect(comparar).toBeChecked()
    await expect(page.getByText(/^Acumulado \d{4}$/)).toBeVisible()
  }
  await expect(page.getByText('Con operaciones')).toBeVisible()
  const mes = page.getByRole('button', { name: /^Ver las operaciones de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$/ }).first()
  await mes.click()
  await expect(page).toHaveURL(/vista=operaciones&anio=\d{4}&desde=\d{4}-\d{2}-01&hasta=\d{4}-\d{2}-\d{2}/)
})

for (const theme of ['dark', 'light'] as const) {
  test(`comparativa y evolución sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await abrir(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.waitForTimeout(500)
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
