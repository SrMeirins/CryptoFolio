import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cascada de respaldo tras Binance y CoinGecko (#337). Sin red: las fuentes se sustituyen.
const m = vi.hoisted(() => ({
  disponible: vi.fn(() => true),
  paprikaActual: vi.fn(async (): Promise<number | null> => null),
  paprikaDia: vi.fn(async (): Promise<number | null> => null),
  okxActual: vi.fn(async (): Promise<number | null> => null),
  okxDia: vi.fn(async (): Promise<number | null> => null),
  okxPermitido: vi.fn(() => true),
}));
vi.mock('./coinpaprika', () => ({ paprikaDisponible: m.disponible, precioActualPaprikaEur: m.paprikaActual, precioDiaPaprikaUsd: m.paprikaDia }));
vi.mock('./okx', () => ({ circuitoOkx: { permitido: m.okxPermitido }, precioActualOkxUsdt: m.okxActual, cierreDiaOkxUsdt: m.okxDia }));

const { precioActualRespaldo, precioDiaRespaldo } = await import('./cascada');
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

describe('cascada de respaldo', () => {
  beforeEach(() => {
    for (const f of Object.values(m)) f.mockReset();
    m.disponible.mockReturnValue(true);
    m.okxPermitido.mockReturnValue(true);
  });

  it('en vivo: CoinPaprika primero; si no lo tiene o no hay cuota, OKX en USDT convertido a EUR', async () => {
    m.paprikaActual.mockResolvedValueOnce(2);
    expect(await precioActualRespaldo('NFT', () => 0.9)).toEqual({ precio: 2, fuente: 'coinpaprika' });

    m.paprikaActual.mockResolvedValueOnce(null);
    m.okxActual.mockResolvedValueOnce(10);
    expect(await precioActualRespaldo('NFT', () => 0.9)).toEqual({ precio: 9, fuente: 'okx' });

    m.disponible.mockReturnValue(false);
    m.okxActual.mockResolvedValueOnce(10);
    expect(await precioActualRespaldo('NFT', () => 0.9)).toEqual({ precio: 9, fuente: 'okx' });
    expect(m.paprikaActual).toHaveBeenCalledTimes(2);
  });

  it('por día: último año CoinPaprika (USD) y lo anterior solo OKX, con la vela del día anterior', async () => {
    m.paprikaDia.mockResolvedValueOnce(1);
    expect(await precioDiaRespaldo('NFT', hace(30), async () => 0.92)).toEqual({ precio: 0.92, fuente: 'coinpaprika' });

    m.okxDia.mockResolvedValueOnce(2);
    expect(await precioDiaRespaldo('NFT', '2023-04-13', async () => 0.9)).toEqual({ precio: 1.8, fuente: 'okx' });
    expect(m.okxDia).toHaveBeenLastCalledWith('NFT', '2023-04-12');
    expect(m.paprikaDia).toHaveBeenCalledTimes(1);
  });

  it('un fallo de red sin otra fuente que lo resuelva se propaga; si otra lo resuelve, no', async () => {
    m.paprikaActual.mockRejectedValueOnce(new Error('CoinPaprika HTTP 429'));
    m.okxActual.mockResolvedValueOnce(1);
    expect(await precioActualRespaldo('NFT', () => 1)).toEqual({ precio: 1, fuente: 'okx' });

    m.paprikaActual.mockRejectedValueOnce(new Error('CoinPaprika HTTP 429'));
    m.okxActual.mockResolvedValueOnce(null);
    await expect(precioActualRespaldo('NFT', () => 1)).rejects.toThrow('429');

    m.okxPermitido.mockReturnValue(false);
    m.paprikaActual.mockResolvedValueOnce(null);
    expect(await precioActualRespaldo('NFT', () => 1)).toBeNull();
  });
});
