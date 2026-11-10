import type { FiscalHito } from '../api/portfolio'
import { formatFiscalDate } from './fiscalTable'

// «Añadir al calendario» (#538): .ics (RFC 5545). Cada plazo es un evento de día completo en su último día, con
// alarmas 30 y 7 días antes, igual que los avisos de la campana. Las fechas son
// días de calendario (VALUE=DATE, sin hora ni zona): ya vienen calculadas en la
// zona de la app, así que el día no cambia al importarlo en otra zona.
// Solo salen el nombre del plazo y sus fechas: nunca cifras.

/** Plazos que se añaden: los que no han pasado; el 721 solo si puede haber obligación. */
export function plazosParaCalendario(ciclo: readonly FiscalHito[]): FiscalHito[] {
  return ciclo.filter(h => h.estado !== 'pasado' && !(h.id === 'modelo721' && h.obligado === false))
}

const compacta = (dia: string) => dia.replaceAll('-', '')
/** Día siguiente (AAAA-MM-DD): el fin de un evento de día completo es exclusivo. */
export function diaSiguiente(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export const tituloEvento = (h: FiscalHito) => `Último día: ${h.titulo}`
export function descripcionEvento(h: FiscalHito): string {
  const desde = h.inicioAproximado ? `de principios de abril (hacia el ${formatFiscalDate(h.desde)})` : `del ${formatFiscalDate(h.desde)}`
  return `Plazo: ${desde} al ${formatFiscalDate(h.hasta)}. Fechas habituales: la AEAT publica cada año el calendario oficial. Aviso de CryptoFolio.`
}

// Texto de una propiedad: se escapan la barra invertida, «;», «,» y los saltos de línea.
const escapar = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// Líneas de 75 octetos como máximo; la continuación empieza con un espacio.
// Se corta por caracteres, nunca en medio de uno de varios bytes (UTF-8).
const enc = new TextEncoder()
export function plegar(linea: string): string {
  const partes: string[] = []
  let actual = '', bytes = 0
  for (const ch of linea) {
    const n = enc.encode(ch).length
    const limite = partes.length === 0 ? 75 : 74
    if (bytes + n > limite) { partes.push(actual); actual = ''; bytes = 0 }
    actual += ch; bytes += n
  }
  partes.push(actual)
  return partes.join('\r\n ')
}

const sello = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function buildIcs(plazos: readonly FiscalHito[], ahora: Date = new Date()): string {
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CryptoFolio//Plazos fiscales//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Plazos fiscales']
  for (const h of plazos) {
    lineas.push(
      'BEGIN:VEVENT',
      `UID:${h.id}-${h.ejercicio}@cryptofolio`,
      `DTSTAMP:${sello(ahora)}`,
      `DTSTART;VALUE=DATE:${compacta(h.hasta)}`,
      `DTEND;VALUE=DATE:${compacta(diaSiguiente(h.hasta))}`,
      `SUMMARY:${escapar(tituloEvento(h))}`,
      `DESCRIPTION:${escapar(descripcionEvento(h))}`,
      'TRANSP:TRANSPARENT',
      ...[30, 7].flatMap(d => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapar(`${h.titulo}: quedan ${d} días`)}`, `TRIGGER:-P${d}D`, 'END:VALARM']),
      'END:VEVENT',
    )
  }
  lineas.push('END:VCALENDAR')
  return lineas.map(plegar).join('\r\n') + '\r\n'
}
