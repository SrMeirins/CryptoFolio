import { describe, expect, it } from 'vitest'
import { explorerLink, isSafeLink } from './externalLink'

// Enlaces externos (#471), con datos sintéticos.
describe('isSafeLink', () => {
  it('solo http y https con host y sin credenciales', () => {
    expect(isSafeLink('https://etherscan.io/address/0xSINTETICA')).toBe(true)
    expect(isSafeLink('http://explorador.local:8080/a')).toBe(true)
    for (const u of ['javascript:alert(1)', 'file:///etc/passwd', 'smb://s/x', 'data:text/html,x', 'https://u:p@x.org/', 'no url', '', null, undefined]) {
      expect(isSafeLink(u), String(u)).toBe(false)
    }
  })
})

describe('explorerLink', () => {
  it('rellena el marcador codificado o usa la URL propia tal cual', () => {
    expect(explorerLink('https://x.org/address/{address}', '{address}', '0xSINT')).toBe('https://x.org/address/0xSINT')
    expect(explorerLink('https://x.org/tx/{tx_hash}', '{tx_hash}', 'a/../b')).toBe('https://x.org/tx/a%2F..%2Fb')
    expect(explorerLink('https://mi-explorador.org/a/0xSINT', '{address}', '0xSINT')).toBe('https://mi-explorador.org/a/0xSINT')
  })

  it('sin URL, sin valor o con un esquema peligroso no hay enlace', () => {
    expect(explorerLink(null, '{address}', 'x')).toBeNull()
    expect(explorerLink('https://x.org/{address}', '{address}', '')).toBeNull()
    expect(explorerLink('javascript:alert(1)//{address}', '{address}', 'x')).toBeNull()
    expect(explorerLink('file:///home/{address}', '{address}', 'x')).toBeNull()
  })
})
