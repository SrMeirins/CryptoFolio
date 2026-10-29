import { describe, expect, it } from 'vitest';
import { explorerUrl } from './transactionDetail';

// URL del explorador de bloques (#373): las plantillas de red pueden venir del
// usuario, así que solo se admiten http(s) y el valor se codifica.
describe('explorerUrl', () => {
  it('sustituye el marcador codificando el valor', () => {
    expect(explorerUrl('https://xrpscan.com/tx/{tx_hash}', '{tx_hash}', 'ABC 123/x')).toBe('https://xrpscan.com/tx/ABC%20123%2Fx');
    expect(explorerUrl('https://etherscan.io/address/{address}', '{address}', '0xabc')).toBe('https://etherscan.io/address/0xabc');
  });

  it('rechaza esquemas que no son http(s), plantillas sin marcador o valores vacíos', () => {
    expect(explorerUrl('javascript:alert(1)//{tx_hash}', '{tx_hash}', 'x')).toBeNull();
    expect(explorerUrl('data:text/html,{tx_hash}', '{tx_hash}', 'x')).toBeNull();
    expect(explorerUrl('https://x.org/tx/', '{tx_hash}', 'x')).toBeNull();
    expect(explorerUrl('https://x.org/tx/{tx_hash}', '{tx_hash}', null)).toBeNull();
    expect(explorerUrl(null, '{tx_hash}', 'x')).toBeNull();
  });

  it('un valor no puede romper la URL hacia otro sitio', () => {
    expect(explorerUrl('https://x.org/tx/{tx_hash}', '{tx_hash}', '@evil.com')).toBe('https://x.org/tx/%40evil.com');
  });
});
