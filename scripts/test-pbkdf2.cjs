// Verifica que el hash PBKDF2 del navegador (WebCrypto) lo valide Node (auth.ts)
const { pbkdf2Sync, timingSafeEqual, webcrypto } = require('crypto')
const subtle = webcrypto.subtle
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

// === Igual que hará el PANEL (navegador) ===
async function hashPanel(password) {
  const enc = new TextEncoder()
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const key = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256)
  return 'pbkdf2$100000$' + hex(salt) + '$' + hex(bits)
}

// === Igual que hace auth.ts en el POS (Node) ===
function verifyPOS(password, almacenado) {
  const [, iterStr, saltHex, hashHex] = almacenado.split('$')
  const esperado = Buffer.from(hashHex, 'hex')
  const calc = pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), Number(iterStr), esperado.length, 'sha256')
  return esperado.length === calc.length && timingSafeEqual(esperado, calc)
}

;(async () => {
  const h = await hashPanel('demo123')
  console.log('hash generado por el panel:', h)
  console.log('POS verifica clave correcta:', verifyPOS('demo123', h), '(debe ser true)')
  console.log('POS verifica clave errada :', verifyPOS('otraClave', h), '(debe ser false)')
})()
