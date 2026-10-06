// Regla anti-aplicación del art. 33.5 LIRPF: una pérdida no es computable si se
// recompra el mismo activo en los 2 meses anteriores/posteriores a la venta.
// Su aplicación exacta a criptoactivos tiene incertidumbre doctrinal, así que
// aquí solo se DETECTA para avisar; no cambia ningún cálculo.
export interface Adquisicion {
  asset: string;
  fecha: Date;
  lotId: string;
}

// setUTCMonth() desborda de forma inconsistente al desplazar meses desde un
// día que no existe en el mes destino (ej. 31-ene -2 meses "debería" caer en
// 30-nov, pero sin clampar desborda a 1-dic; 31-dic +2 meses desborda a
// 3-mar en vez de 28-feb) — la ventana resultante queda más estrecha o más
// ancha de lo debido según el caso. Clampamos al último día válido del mes
// destino en vez de dejar que JS normalice el overflow.
function mesesDesplazado(fecha: Date, meses: number): Date {
  const year  = fecha.getUTCFullYear();
  const month = fecha.getUTCMonth() + meses;
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    year, month, Math.min(fecha.getUTCDate(), lastDayOfTargetMonth),
    fecha.getUTCHours(), fecha.getUTCMinutes(), fecha.getUTCSeconds(), fecha.getUTCMilliseconds()
  ));
}

export function hayRecompra(
  asset: string,
  fechaVenta: Date,
  lotIdVendido: string,
  adquisiciones: Adquisicion[]
): boolean {
  const desde = mesesDesplazado(fechaVenta, -2).getTime();
  const hasta = mesesDesplazado(fechaVenta, 2).getTime();
  return adquisiciones.some(a =>
    a.asset === asset && a.lotId !== lotIdVendido &&
    a.fecha.getTime() >= desde && a.fecha.getTime() <= hasta
  );
}
