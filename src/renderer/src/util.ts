/**
 * Dominio fijo de la carta digital (el panel/web en Vercel). Es el mismo para todas
 * las tiendas, por eso va aquí y NO se edita desde el POS (evita errores de link).
 * Si algún día cambia el dominio, se cambia solo aquí y se publica una versión.
 */
export const CARTA_BASE_URL = 'https://vxplay.vercel.app'

/** Formatea un numero como pesos colombianos. */
export function cop(n: number | undefined | null): string {
  return '$' + Number(n || 0).toLocaleString('es-CO')
}

/** Fecha de hoy en formato YYYY-MM-DD (hora local). */
export function hoyISO(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  const local = new Date(d.getTime() - off * 60000)
  return local.toISOString().slice(0, 10)
}
