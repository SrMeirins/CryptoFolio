// Regla anti-aplicación del art. 33.5 LIRPF: una pérdida no es computable si se
// recompra el mismo activo en los 2 meses anteriores/posteriores a la venta.
// Su aplicación exacta a criptoactivos tiene incertidumbre doctrinal, así que
// aquí solo se DETECTA para avisar; no cambia ningún cálculo.
export interface Adquisicion {
  asset: string;
  fecha: Date;
  lotId: string;
}

function mesesDesplazado(fecha: Date, meses: number): Date {
  const r = new Date(fecha);
  r.setUTCMonth(r.getUTCMonth() + meses);
  return r;
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
