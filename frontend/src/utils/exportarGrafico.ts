// Exportar un gráfico (#510): el SVG de Recharts a PNG y la descarga de un
// fichero. Los colores del tema llegan como variables CSS (var(--cf-...)) que
// un SVG suelto no resuelve: se copian los estilos ya calculados de cada
// elemento a su copia antes de dibujarla en un lienzo.

/** Descarga un contenido como fichero. */
export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const PROPIEDADES = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity',
  'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline', 'visibility', 'display'] as const

/** Copia del SVG con los estilos calculados en línea (sin variables CSS). */
export function svgConEstilos(svg: SVGSVGElement): SVGSVGElement {
  const copia = svg.cloneNode(true) as SVGSVGElement
  const originales = [svg, ...svg.querySelectorAll('*')]
  const copias = [copia, ...copia.querySelectorAll('*')]
  originales.forEach((el, i) => {
    const destino = copias[i] as SVGElement | undefined
    if (!destino || !(el instanceof Element)) return
    const cs = getComputedStyle(el)
    const estilo = PROPIEDADES.map(p => `${p}:${cs.getPropertyValue(p)}`).filter(d => !d.endsWith(':')).join(';')
    destino.setAttribute('style', estilo)
  })
  const { width, height } = svg.getBoundingClientRect()
  copia.setAttribute('width', String(width))
  copia.setAttribute('height', String(height))
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return copia
}

/** PNG del SVG con un título arriba y el fondo del panel, a doble resolución. */
export async function svgAPng(svg: SVGSVGElement, { titulo, fondo, colorTexto }: { titulo: string; fondo: string; colorTexto: string }): Promise<Blob> {
  const { width, height } = svg.getBoundingClientRect()
  const escala = 2
  const cabecera = 36
  const datos = new XMLSerializer().serializeToString(svgConEstilos(svg))
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(datos)}`
  await img.decode()
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(width * escala)
  lienzo.height = Math.round((height + cabecera) * escala)
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la imagen')
  ctx.scale(escala, escala)
  ctx.fillStyle = fondo
  ctx.fillRect(0, 0, width, height + cabecera)
  ctx.fillStyle = colorTexto
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillText(titulo, 12, 23)
  ctx.drawImage(img, 0, cabecera, width, height)
  return await new Promise<Blob>((ok, mal) => lienzo.toBlob(b => (b ? ok(b) : mal(new Error('No se pudo crear la imagen'))), 'image/png'))
}
