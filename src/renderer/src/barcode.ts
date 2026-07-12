/**
 * Generador de código de barras Code39 como SVG (sin dependencias externas).
 * Code39 es leído por cualquier pistola. Codifica 0-9, A-Z y algunos símbolos.
 */

const CODE39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', A: 'wnnnnwnnw', B: 'nnwnnwnnw',
  C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn',
  G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww',
  O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn',
  S: 'nnwnnnwwn', T: 'nnnnwnwwn', U: 'wwnnnnnnw', V: 'nwwnnnnnw',
  W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', $: 'nwnwnwnnn',
  '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn'
}

/** Devuelve un SVG (string) con el código de barras del texto dado. */
export function code39Svg(texto: string, altura = 44): string {
  const limpio = (texto || '')
    .toUpperCase()
    .split('')
    .filter((c) => CODE39[c] && c !== '*')
    .join('')
  const code = '*' + limpio + '*'
  const narrow = 2
  const wide = 5
  let x = 0
  const rects: string[] = []
  for (const ch of code) {
    const pat = CODE39[ch]
    if (!pat) continue
    for (let i = 0; i < 9; i++) {
      const w = pat[i] === 'w' ? wide : narrow
      if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${w}" height="${altura}"/>`) // barra
      x += w
    }
    x += narrow // espacio entre caracteres
  }
  return `<svg viewBox="0 0 ${x} ${altura}" preserveAspectRatio="none" width="100%" height="${altura}" xmlns="http://www.w3.org/2000/svg" fill="#000">${rects.join('')}</svg>`
}
