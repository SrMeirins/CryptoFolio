import { describe, expect, it } from 'vitest'
import rawConf from '../nginx.conf?raw'
import rawHeaders from '../security-headers.conf?raw'

// La configuración de nginx de producción no se ejecuta en CI; este test
// protege las reglas de compresión (#188) frente a cambios accidentales.
const conf = rawConf.split('\n').filter((line: string) => !line.trim().startsWith('#')).join('\n')

const directive = (name: string) => conf.match(new RegExp(`^\\s*${name}\\s+([^;]+);`, 'm'))?.[1].trim()

describe('nginx.conf — compresión', () => {
  it('comprime JSON de la API y assets de texto, también lo que llega por proxy', () => {
    expect(directive('gzip')).toBe('on')
    expect(directive('gzip_proxied')).toBe('any')
    expect(directive('gzip_types')?.split(/\s+/)).toEqual(expect.arrayContaining(['application/json', 'application/javascript', 'text/css']))
  })

  it('no comprime el stream SSE del import (retendría los eventos)', () => {
    expect(directive('gzip_types')).not.toContain('text/event-stream')
    expect(conf).toMatch(/location \/api\/ \{[^}]*proxy_buffering off;/)
  })

  it('no comprime respuestas pequeñas', () => {
    expect(Number(directive('gzip_min_length'))).toBeGreaterThanOrEqual(256)
  })
})

describe('nginx.conf — cabeceras de seguridad sin duplicar en /api/ (#192)', () => {
  const stripComments = (text: string) => text.split('\n').filter((l: string) => !l.trim().startsWith('#')).join('\n')
  const added = [...stripComments(rawHeaders).matchAll(/^\s*add_header\s+([\w-]+)/gm)].map(m => m[1].toLowerCase())
  const apiBlock = conf.match(/location \/api\/ \{([^}]*)\}/)?.[1] ?? ''
  const hidden = [...apiBlock.matchAll(/proxy_hide_header\s+([\w-]+);/g)].map(m => m[1].toLowerCase())

  it('oculta del backend cada cabecera que nginx ya añade', () => {
    expect(added.length).toBeGreaterThan(0)
    expect(hidden.sort()).toEqual([...added].sort())
  })

  it('valores al menos tan estrictos como los del backend', () => {
    const headers = stripComments(rawHeaders)
    expect(headers).toMatch(/Referrer-Policy "no-referrer"/)
    expect(headers).toMatch(/X-Frame-Options "DENY"/)
    expect(headers).toMatch(/form-action 'self'/)
    expect(headers).toMatch(/frame-ancestors 'none'/)
  })
})
