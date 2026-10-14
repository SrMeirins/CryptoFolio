import { describe, expect, it } from 'vitest'
import rawConf from '../nginx.conf?raw'

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
