// Custodia automática de las wallets nativas (#545): para los exchanges que la
// app importa, dónde está la custodia de un residente en España según las
// condiciones publicadas, por fechas. Es la regla por defecto de cualquier
// usuario: no se guarda nada; si el usuario indica otra cosa, prevalece lo suyo.

export interface DatosEntidad { nombre: string; nif: string | null; pais: string | null; web: string | null }

export interface TramoAutomatico {
  /** Desde qué día vale (AAAA-MM-DD); null: desde siempre. */
  desde: string | null;
  enEspana: boolean;
  entidad: DatosEntidad;
}

export interface ReglaExchange {
  clave: 'binance' | 'bitvavo';
  exchange: string;
  /** Wallets del sistema a las que se aplica (por nombre). */
  wallets: RegExp;
  tramos: readonly TramoAutomatico[];
  fuentes: readonly { titulo: string; url: string }[];
  /** Lo que conviene revisar, si algo de la regla no es seguro. */
  nota: string | null;
}

export const REGLAS_EXCHANGE: readonly ReglaExchange[] = [
  {
    clave: 'binance',
    exchange: 'Binance',
    wallets: /^Binance /,
    tramos: [
      { desde: null, enEspana: false, entidad: { nombre: 'Binance (sociedad del grupo fuera de España)', nif: null, pais: null, web: null } },
      { desde: '2022-07-07', enEspana: true, entidad: { nombre: 'Binance Spain, S.L.', nif: 'B01929306', pais: 'ES', web: 'C/ Pinar 5, 28006 Madrid' } },
    ],
    fuentes: [
      { titulo: 'Condiciones generales de Binance para usuarios residentes en España (22 de diciembre de 2025)', url: 'https://www.binance.com/es/compliance/spain-terms-and-conditions' },
      { titulo: 'Guía de terceros sobre el registro de Binance en España (7 de julio de 2022) y el paso de las cuentas', url: 'https://www.criptohacienda.es/guia/binance-spain-sl-hacienda-2026/' },
    ],
    nota: 'Binance pasó las cuentas de residentes en España a Binance Spain de forma progresiva desde julio de 2022: la fecha de tu cuenta puede ser posterior.',
  },
  {
    clave: 'bitvavo',
    exchange: 'Bitvavo',
    wallets: /^Bitvavo$/,
    tramos: [
      { desde: null, enEspana: false, entidad: { nombre: 'Bitvavo Custody B.V.', nif: null, pais: 'NL', web: 'Keizersgracht 281, Ámsterdam' } },
    ],
    fuentes: [{ titulo: 'User Agreement de Bitvavo', url: 'https://bitvavo.com/en/terms' }],
    nota: null,
  },
];

/** Regla de una wallet del sistema por su nombre, si es de un exchange que la app importa. */
export function reglaDeWallet(w: { name: string; is_system: boolean }): ReglaExchange | null {
  return w.is_system ? REGLAS_EXCHANGE.find(r => r.wallets.test(w.name)) ?? null : null;
}
