// Fecha y hora de un campo `datetime-local` en la zona de la app (#378), no en
// UTC ni en la del navegador: se muestra la hora local de la operación y lo
// que se escribe se interpreta en esa misma zona. Con segundos, para no
// perderlos al editar una importada.

const formatters = new Map<string, Intl.DateTimeFormat>()
function parts(ms: number, tz: string): Record<string, string> {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    })
    formatters.set(tz, f)
  }
  return Object.fromEntries(f.formatToParts(new Date(ms)).map(p => [p.type, p.value]))
}

/** Desfase de la zona en un instante, en ms (hora local − UTC). */
function offsetAt(ms: number, tz: string): number {
  const p = parts(ms, tz)
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return wall - Math.floor(ms / 1000) * 1000
}

/** Instante ISO → «AAAA-MM-DDTHH:mm:ss» en la zona `tz` (valor del campo). */
export function toZonedInput(iso: string, tz: string): string {
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const p = parts(ms, tz)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
}

/**
 * «AAAA-MM-DDTHH:mm[:ss]» como hora local de `tz` → instante ISO (UTC).
 * Una hora inexistente por el cambio de verano se lleva a la siguiente válida;
 * una repetida en el de invierno toma la primera. '' si no es válida.
 */
export function fromZonedInput(value: string, tz: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!m) return ''
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
  if (Number.isNaN(wall) || new Date(wall).getUTCMonth() !== +m[2] - 1) return ''
  // Candidatos con el desfase de antes y de después de un posible cambio de
  // hora: vale el primero que, mostrado en la zona, da la hora escrita.
  const DAY = 86_400_000
  const before = wall - offsetAt(wall - DAY, tz)
  const after = wall - offsetAt(wall + DAY, tz)
  const target = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}`
  const valid = [before, after].filter(c => toZonedInput(new Date(c).toISOString(), tz) === target).sort((a, b) => a - b)
  // Sin candidato válido es una hora inexistente: el desfase previo la lleva a la siguiente válida.
  return new Date(valid[0] ?? before).toISOString()
}
