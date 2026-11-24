import type { Page } from '@playwright/test'

/** Despliega el panel «Filtros» del Historial (#414, #552) si está plegado. */
export async function abrirMasFiltros(page: Page): Promise<void> {
  const boton = page.getByRole('button', { name: /^Filtros(,|$)/ })
  if (await boton.getAttribute('aria-expanded') !== 'true') await boton.click()
}

/** Abre las opciones de vista del Historial (#552). */
export async function abrirOpcionesVista(page: Page): Promise<void> {
  const boton = page.getByRole('button', { name: 'Opciones de vista' })
  if (await boton.getAttribute('aria-expanded') !== 'true') await boton.click()
}
