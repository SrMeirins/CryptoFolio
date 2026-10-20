import { describe, expect, it } from 'vitest';
import { detectarExchange } from './exchanges';

// Autodetección del exchange por las cabeceras (#318). Datos sintéticos.
const buf = (s: string) => Buffer.from(s, 'utf-8');

describe('detectarExchange', () => {
  it('Binance en inglés y en español', () => {
    expect(detectarExchange(buf('User ID,Time,Account,Operation,Coin,Change,Remark\n1,2024-01-01 10:00:00,Spot,Deposit,BTC,1,'))).toEqual({ exchange: 'binance', idioma: 'en' });
    expect(detectarExchange(buf('ID de usuario,Tiempo,Cuenta,Operación,Moneda,Cambio,Observación\n1,2024-01-01 10:00:00,Spot,Deposit,BTC,1,')).exchange).toBe('binance');
  });
  it('Binance con BOM', () => {
    expect(detectarExchange(buf('﻿User ID,Time,Account,Operation,Coin,Change,Remark\n1,2024-01-01 10:00:00,Spot,Deposit,BTC,1,')).exchange).toBe('binance');
  });
  it('Bitvavo', () => {
    const header = 'Timezone,Date,Time,Type,Currency,Amount,Quote Currency,Quote Price,Received / Paid Currency,Received / Paid Amount,Fee currency,Fee amount,Status,Transaction ID,Address';
    expect(detectarExchange(buf(`${header}\nEurope/Madrid,2026-06-25,10:00:00,buy,BTC,0.001,EUR,60000,EUR,-60,EUR,0.1,Completed,abc,`))).toEqual({ exchange: 'bitvavo', idioma: 'en' });
  });
  it('desconocido', () => {
    expect(detectarExchange(buf('col1,col2\n1,2'))).toEqual({ exchange: null, idioma: 'unknown' });
  });
});
