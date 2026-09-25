// Solo moneda de curso legal. Las stablecoins (USDT/USDC/BUSD/DAI) NO lo son
// (criterio DGT reiterado): se clasifican como otra moneda virtual (V).
const FIAT_ASSETS = new Set(['EUR', 'USD', 'GBP', 'CHF', 'BRL', 'ARS']);

// Claves oficiales AEAT: D=Dinero, V=Valores/cripto, I=Inmueble, O=Otros/sin contrapartida
export function getContrapartidaClave(activoRecibido: string | null): { clave: string; descripcion: string } {
  if (!activoRecibido)                 return { clave: 'O', descripcion: 'Sin contrapartida directa (comision/perdida)' };
  if (FIAT_ASSETS.has(activoRecibido)) return { clave: 'D', descripcion: `Moneda de curso legal (${activoRecibido})` };
  return { clave: 'V', descripcion: `Otra moneda virtual (${activoRecibido})` };
}
