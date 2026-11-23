import { getAllLivePrices, getAllOpen24Prices, getLivePrice, onPriceUpdate } from '../prices/liveFeed';
import { cantidadesAbiertas, listarAlertas, rearmar, registrarDisparo } from './alertasRepo';
import { crearEvaluador } from './evaluador';

// Instancia del evaluador de alertas (#519) conectada al feed de precios en
// vivo y a la base de datos. Se inicia al arrancar el servidor.

export const evaluadorAlertas = crearEvaluador(
  { precio: getLivePrice, todos: getAllLivePrices, hace24: getAllOpen24Prices },
  { listar: listarAlertas, registrarDisparo, rearmar, cantidades: cantidadesAbiertas },
  m => console.error(`[ALERTAS] ${m}`),
);

const CARTERA_CADA_MS = 60_000;
let iniciado = false;

export function iniciarAlertas(): void {
  if (iniciado) return;
  iniciado = true;
  void evaluadorAlertas.recargar();
  onPriceUpdate(cambios => { void evaluadorAlertas.alCambiarPrecios(cambios.keys()); });
  setInterval(() => { void evaluadorAlertas.revisarCartera(); }, CARTERA_CADA_MS).unref();
}
