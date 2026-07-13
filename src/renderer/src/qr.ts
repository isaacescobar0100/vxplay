import qrcode from 'qrcode-generator'

/**
 * Genera un código QR como cadena SVG (negro sobre blanco, escalable/nítido).
 * Sirve para mostrarlo en pantalla, imprimirlo o exportarlo a PDF.
 */
export function qrSvg(text: string, size = 240, margin = 2): string {
  const qr = qrcode(0, 'M') // tipo 0 = automático, corrección de errores media
  qr.addData(text)
  qr.make()
  const count = qr.getModuleCount()
  const dim = count + margin * 2
  let rects = ''
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1"/>`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#000">${rects}</g></svg>`
}
