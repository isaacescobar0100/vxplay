import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

/**
 * Hash de contraseñas con scrypt (incluido en Node, sin dependencias nativas).
 * Formato almacenado: scrypt$<saltHex>$<hashHex>
 */

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function esHash(valor: string): boolean {
  return typeof valor === 'string' && valor.startsWith('scrypt$')
}

export function verifyPassword(password: string, almacenado: string): boolean {
  if (!esHash(almacenado)) {
    // Compatibilidad con contraseñas antiguas en texto plano
    return password === almacenado
  }
  const [, saltHex, hashHex] = almacenado.split('$')
  const salt = Buffer.from(saltHex, 'hex')
  const esperado = Buffer.from(hashHex, 'hex')
  const calculado = scryptSync(password, salt, 64)
  return esperado.length === calculado.length && timingSafeEqual(esperado, calculado)
}
