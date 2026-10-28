import type { Page } from '@playwright/test'

/** Despliega «Más filtros» del Historial (#414) si está plegado. */
export async function abrirMasFiltros(page: Page): Promise<void> {
  const boton = page.getByRole('button', { name: /^Más filtros/ })
  if (await boton.getAttribute('aria-expanded') !== 'true') await boton.click()
}
