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
