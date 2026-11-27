import { db } from '../../db/client';
import { claveMaestraDisponible, decryptApiKey, encryptApiKey } from '../walletSync/apiKeyCrypto';
import { configurarCoinGecko, PlanCoinGecko } from '../prices/coingeckoClient';
import { comprobarClave, Comprobacion } from './comprobar';
import { SERVICIOS, Servicio, ServicioId, servicioPorId } from './servicios';

// Estado y gestión de las claves de API (versión 1.0, Ajustes, Conexiones).
// Las de red viven en network_api_keys (las usa walletSync); la de CoinGecko,
// en claves_servicio. Nunca se devuelve ningún carácter de una clave.

export type EstadoClave = 'configurada' | 'entorno' | 'sin_configurar' | 'ilegible';

export interface EstadoServicio {
  id: ServicioId;
  nombre: string;
  red: string | null;
  enlace: string;
  estado: EstadoClave;
  actualizada: string | null;
  plan: PlanCoinGecko | null;
  /** Direcciones de wallet de esa red (0 en CoinGecko). */
  direcciones: number;
}

interface Fila { cifrada: Buffer; iv: Buffer; actualizada: Date; plan: PlanCoinGecko | null }

async function filaDe(s: Servicio): Promise<Fila | null> {
  const { rows } = s.red
    ? await db.query(
      `SELECT k.api_key_encrypted AS cifrada, k.api_key_iv AS iv, k.updated_at AS actualizada, NULL AS plan
         FROM network_api_keys k JOIN networks n ON n.id = k.network_id WHERE n.name = $1`, [s.red])
    : await db.query(
      `SELECT api_key_encrypted AS cifrada, api_key_iv AS iv, updated_at AS actualizada, plan
         FROM claves_servicio WHERE servicio = $1`, [s.id]);
  return rows[0] ?? null;
}

function descifrar(fila: Fila): string | null {
  try {
    return decryptApiKey(fila.cifrada, fila.iv);
  } catch {
    return null; // otra clave maestra o datos dañados
  }
}

async function direccionesDe(red: string | null): Promise<number> {
  if (!red) return 0;
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM wallet_addresses a JOIN networks n ON n.id = a.network_id WHERE n.name = $1`, [red]);
  return rows[0].n;
}

export async function estadoServicios(): Promise<{ claveMaestra: boolean; servicios: EstadoServicio[] }> {
  const servicios = await Promise.all(SERVICIOS.map(async (s): Promise<EstadoServicio> => {
    const fila = await filaDe(s);
    const estado: EstadoClave = fila
      ? (descifrar(fila) === null ? 'ilegible' : 'configurada')
      : (process.env[s.variableEntorno] ? 'entorno' : 'sin_configurar');
    return {
      id: s.id, nombre: s.nombre, red: s.red, enlace: s.enlace, estado,
      actualizada: fila ? fila.actualizada.toISOString() : null,
      plan: s.id === 'coingecko' ? (fila?.plan ?? 'demo') : null,
      direcciones: await direccionesDe(s.red),
    };
  }));
  return { claveMaestra: claveMaestraDisponible(), servicios };
}

/** Recarga en el cliente de CoinGecko la clave guardada (o la del entorno si no hay). */
export async function cargarClaveCoinGecko(): Promise<void> {
  const fila = await filaDe(servicioPorId('coingecko'));
  const clave = fila ? descifrar(fila) : null;
  configurarCoinGecko(clave ? { clave, plan: fila!.plan ?? 'demo' } : null);
}

export class ClaveRechazada extends Error {}
export class SinClaveMaestra extends Error {}

/** Comprueba y guarda una clave; si el servicio la rechaza, no se guarda. */
export async function guardarClave(id: ServicioId, clave: string, plan: PlanCoinGecko = 'demo'): Promise<Comprobacion> {
  if (!claveMaestraDisponible()) throw new SinClaveMaestra('No hay clave maestra para cifrar las claves de API.');
  const comprobacion = await comprobarClave(id, clave, plan);
  if (comprobacion === 'rechazada') throw new ClaveRechazada('El servicio rechaza esta clave.');
  const { encrypted, iv } = encryptApiKey(clave);
  const s = servicioPorId(id);
  if (s.red) {
    await db.query(
      `INSERT INTO network_api_keys (network_id, api_key_encrypted, api_key_iv, updated_at)
       SELECT id, $2, $3, clock_timestamp() FROM networks WHERE name = $1
       ON CONFLICT (network_id) DO UPDATE SET api_key_encrypted = $2, api_key_iv = $3, updated_at = clock_timestamp()`,
      [s.red, encrypted, iv]);
  } else {
    await db.query(
      `INSERT INTO claves_servicio (servicio, api_key_encrypted, api_key_iv, plan, updated_at)
       VALUES ($1, $2, $3, $4, clock_timestamp())
       ON CONFLICT (servicio) DO UPDATE SET api_key_encrypted = $2, api_key_iv = $3, plan = $4, updated_at = clock_timestamp()`,
      [id, encrypted, iv, plan]);
    await cargarClaveCoinGecko();
  }
  return comprobacion;
}

export async function quitarClave(id: ServicioId): Promise<void> {
  const s = servicioPorId(id);
  if (s.red) {
    await db.query(`DELETE FROM network_api_keys k USING networks n WHERE n.id = k.network_id AND n.name = $1`, [s.red]);
  } else {
    await db.query(`DELETE FROM claves_servicio WHERE servicio = $1`, [id]);
    await cargarClaveCoinGecko();
  }
}

/** Prueba la clave en uso (guardada o del entorno). null si no hay ninguna. */
export async function probarClave(id: ServicioId): Promise<Comprobacion | 'ilegible' | null> {
  const s = servicioPorId(id);
  const fila = await filaDe(s);
  if (fila) {
    const clave = descifrar(fila);
    return clave === null ? 'ilegible' : comprobarClave(id, clave, fila.plan ?? 'demo');
  }
  const delEntorno = process.env[s.variableEntorno];
  return delEntorno ? comprobarClave(id, delEntorno) : null;
}
