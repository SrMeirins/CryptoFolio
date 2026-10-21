import { describe, expect, it } from 'vitest';
import { direccionValida, normalizarDireccion, txHashValido } from './direccion';
import { redDeBinance } from './redesBinance';
import { esHistorialRetiradas, parseHistorialRetiradas, parseVariosHistoriales, type RetiradaBinance } from './historialRetiradas';
import { emparejarRetiradas } from './emparejar';
import { redDeActivo, resolverDestinos, type Red } from './resolverDestinos';
import type { ParsedTransaction } from '../types';

// Direcciones de retiro (#320). Datos sintéticos: ninguna dirección es real.
const EVM = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const HEADER = 'Time,Coin,Network,Amount,Fee,Address,TXID,Status';
const csv = (rows: string[]) => Buffer.from(`\uFEFF${[HEADER, ...rows].join('\n')}`, 'utf8');

describe('dirección', () => {
  it('lista blanca de caracteres: rechaza HTML, espacios y vacíos', () => {
    expect(direccionValida(' rSintetica1234 ')).toBe('rSintetica1234');
    expect(direccionValida('0.0.123456')).toBe('0.0.123456');
    expect(direccionValida('<img src=x onerror=alert(1)>')).toBeNull();
    expect(direccionValida('dir con espacios')).toBeNull();
    expect(direccionValida('')).toBeNull();
    expect(direccionValida('a'.repeat(129))).toBeNull();
  });

  it('las EVM se comparan sin mayúsculas; el resto, exactas', () => {
    expect(normalizarDireccion(EVM)).toBe(EVM.toLowerCase());
    expect(normalizarDireccion('rAbCdSintetica')).toBe('rAbCdSintetica');
  });

  it('hash on-chain válido; texto arbitrario no', () => {
    expect(txHashValido('0x' + 'a'.repeat(64))).toBe('0x' + 'a'.repeat(64));
    expect(txHashValido('Internal transfer')).toBeNull();
  });

  it('traduce las redes de Binance y deja sin red las desconocidas', () => {
    expect(redDeBinance('BSC')).toBe('BNB Chain');
    expect(redDeBinance('statemint')).toBe('Polkadot Asset Hub');
    expect(redDeBinance('DOT')).toBeNull();
    expect(redDeBinance(undefined)).toBeNull();
  });
});

describe('historial de retiradas de Binance', () => {
  it('detecta el formato por sus cabeceras', () => {
    expect(esHistorialRetiradas(csv([]))).toBe(true);
    expect(esHistorialRetiradas(Buffer.from('User ID,Time,Account,Operation,Coin,Change,Remark\n'))).toBe(false);
  });

  it('solo las completadas, con importe bruto = Amount + Fee', () => {
    const r = parseHistorialRetiradas(csv([
      `2024-03-01 10:00:00,XRP,XRP,10,0.2,rSintetica1234,${'b'.repeat(64)},Completed`,
      '2024-03-02 10:00:00,XRP,XRP,5,0.2,rSintetica1234,,Cancelled',
      '2024-03-03 10:00:00,ETH,ETH,1,0.001,<script>,Internal transfer,Completed',
    ]));
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ coin: 'XRP', network: 'XRP', address: 'rSintetica1234', txHash: 'b'.repeat(64) });
    expect(r[0].bruto).toBeCloseTo(10.2, 10);
    expect(r[0].fee).toBeCloseTo(0.2, 10);
    expect(r[0].timestamp.toISOString()).toBe('2024-03-01T10:00:00.000Z');
    expect(r[1]).toMatchObject({ address: null, txHash: null });
  });

  it('varios historiales solapados se unen sin repetir retiradas (#326)', () => {
    const fila = (d: string) => `2024-03-0${d} 10:00:00,XRP,XRP,10,0.2,rSintetica1234,${'b'.repeat(64)},Completed`;
    const r = parseVariosHistoriales([csv([fila('1'), fila('2')]), csv([fila('2'), fila('3')])]);
    expect(r.map(x => x.timestamp.getUTCDate())).toEqual([1, 2, 3]);
  });

  it('un CSV con otras columnas falla con un mensaje claro', () => {
    expect(() => parseHistorialRetiradas(Buffer.from('a,b\n1,2'))).toThrow(/columnas esperadas/);
  });
});

const w = (coin: string, bruto: number, iso: string, address = 'rSintetica1234'): RetiradaBinance =>
  ({ coin, network: coin, bruto, timestamp: new Date(iso), address, txHash: null });

describe('emparejamiento', () => {
  it('mismo activo, importe exacto y hora entre 0 y 60 min después', () => {
    const m = emparejarRetiradas(
      [{ key: 'a', asset: 'XRP', amount: 10.2, timestamp: new Date('2024-03-01T10:05:00Z') }],
      [w('XRP', 10.2, '2024-03-01T10:00:00Z')],
    );
    expect(m.get('a')?.address).toBe('rSintetica1234');
  });

  it('fuera de ventana, antes de la solicitud o con otro importe no empareja', () => {
    const retiradas = [w('XRP', 10.2, '2024-03-01T10:00:00Z')];
    const intento = (amount: number, iso: string, asset = 'XRP') =>
      emparejarRetiradas([{ key: 'a', asset, amount, timestamp: new Date(iso) }], retiradas).size;
    expect(intento(10.2, '2024-03-01T11:00:01Z')).toBe(0);
    expect(intento(10.2, '2024-03-01T09:59:59Z')).toBe(0);
    expect(intento(10.3, '2024-03-01T10:05:00Z')).toBe(0);
    expect(intento(10.2, '2024-03-01T10:05:00Z', 'ETH')).toBe(0);
  });

  it('ambiguo: dos retiros iguales cercanos se reparten uno a uno por cercanía', () => {
    const m = emparejarRetiradas(
      [
        { key: 'a', asset: 'XRP', amount: 5, timestamp: new Date('2024-03-01T10:02:00Z') },
        { key: 'b', asset: 'XRP', amount: 5, timestamp: new Date('2024-03-01T10:31:00Z') },
      ],
      [w('XRP', 5, '2024-03-01T10:00:00Z', 'rPrimera1234'), w('XRP', 5, '2024-03-01T10:30:00Z', 'rSegunda1234')],
    );
    expect(m.get('a')?.address).toBe('rPrimera1234');
    expect(m.get('b')?.address).toBe('rSegunda1234');
  });
});

const REDES: Red[] = [
  { id: 'n-xrp', name: 'XRP Ledger', nativeAsset: 'XRP', tokens: [] },
  { id: 'n-eth', name: 'Ethereum', nativeAsset: 'ETH', tokens: ['LINK', 'USDC'] },
  { id: 'n-sol', name: 'Solana', nativeAsset: 'SOL', tokens: ['USDC'] },
];
const tx = (asset: string, amount: number, iso: string, hash: string, op: ParsedTransaction['operationType'] = 'WITHDRAW'): ParsedTransaction =>
  ({ operationType: op, timestamp: new Date(iso), asset, amount, amountNet: amount, account: 'Spot', subTradeCount: 1, rawRowHashes: [hash] });

describe('resolverDestinos', () => {
  it('red de un activo: la nativa, o la única red con ese token', () => {
    expect(redDeActivo('XRP', REDES)?.id).toBe('n-xrp');
    expect(redDeActivo('LINK', REDES)?.id).toBe('n-eth');
    expect(redDeActivo('USDC', REDES)).toBeNull();
  });

  it('Bitvavo: dirección de la columna Address y red deducida, sin hash', () => {
    const { destinos, resumen } = resolverDestinos('bitvavo',
      [tx('LINK', 1, '2024-03-01T10:00:00Z', 'h1'), tx('XRP', 1, '2024-03-01T10:00:00Z', 'h2'), tx('XRP', 1, '2024-03-01T10:00:00Z', 'h3', 'BUY')],
      [{ hash: 'h1', record: { Address: EVM } }, { hash: 'h2', record: { Address: '<b>x</b>' } }, { hash: 'h3', record: { Address: 'rSintetica1234' } }],
      REDES, null);
    expect(resumen).toBeNull();
    expect([...destinos.keys()]).toEqual(['h1']);
    expect(destinos.get('h1')).toEqual({ address: EVM, networkId: 'n-eth', network: 'Ethereum', txHash: null, fee: null });
  });

  it('Binance: sin historial de retiradas no hay destinos; con él, empareja y resume', () => {
    const txs = [tx('XRP', 10.2, '2024-03-01T10:05:00Z', 'h1'), tx('XRP', 3, '2024-03-02T10:05:00Z', 'h2')];
    expect(resolverDestinos('binance', txs, [], REDES, null).destinos.size).toBe(0);
    const { destinos, resumen } = resolverDestinos('binance', txs, [], REDES, [w('XRP', 10.2, '2024-03-01T10:00:00Z')]);
    expect(destinos.get('h1')).toMatchObject({ address: 'rSintetica1234', networkId: 'n-xrp', fee: null });
    expect(resumen).toEqual({ filas: 1, emparejadas: 1, retiros: 2 });
  });
});

describe('comisión de red (#335)', () => {
  it('separa la comisión del importe; sin comisión, ya separada o mayor que el retiro, no cambia', async () => {
    const { conComision } = await import('./comision');
    const base = tx('XRP', 10.2, '2024-03-01T10:00:00Z', 'h');
    expect(conComision(base, 0.2)).toMatchObject({ amount: 10, amountNet: 10, feeAsset: 'XRP', feeAmount: 0.2 });
    expect(conComision(base, null)).toBe(base);
    expect(conComision({ ...base, feeAmount: 0.1, feeAsset: 'XRP' }, 0.2).feeAmount).toBe(0.1);
    expect(conComision(base, 11)).toBe(base);
  });
});
