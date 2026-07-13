import { randomBytes, scryptSync, pbkdf2Sync, timingSafeEqual } from 'crypto'

/**
 * Hash de contraseñas.
 * - Usuarios locales: scrypt (Node).           Formato: scrypt$<saltHex>$<hashHex>
 * - Usuarios del panel: PBKDF2-SHA256.          Formato: pbkdf2$<iter>$<saltHex>$<hashHex>
 *   (PBKDF2 se puede calcular igual en el navegador (panel) y en Node (POS),
 *    así la clave del panel viaja YA hasheada y nunca en texto plano.)
 */

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function esHash(valor: string): boolean {
  return typeof valor === 'string' && (valor.startsWith('scrypt$') || valor.startsWith('pbkdf2$'))
}

export function verifyPassword(password: string, almacenado: string): boolean {
  if (!esHash(almacenado)) {
    // Compatibilidad con contraseñas antiguas en texto plano
    return password === almacenado
  }
  if (almacenado.startsWith('pbkdf2$')) {
    const [, iterStr, saltHex, hashHex] = almacenado.split('$')
    const esperado = Buffer.from(hashHex, 'hex')
    const calculado = pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), Number(iterStr) || 100000, esperado.length, 'sha256')
    return esperado.length === calculado.length && timingSafeEqual(esperado, calculado)
  }
  // scrypt$
  const [, saltHex, hashHex] = almacenado.split('$')
  const salt = Buffer.from(saltHex, 'hex')
  const esperado = Buffer.from(hashHex, 'hex')
  const calculado = scryptSync(password, salt, 64)
  return esperado.length === calculado.length && timingSafeEqual(esperado, calculado)
}
