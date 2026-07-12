import { readFileSync, writeFileSync } from 'fs'
import { queryOne, query, run, persist, getDbPath } from './db'
import { SUPABASE_URL, SUPABASE_ANON } from './supabase'

/**
 * Respaldo de la base de datos de cada tienda en la nube (Supabase Storage).
 *
 * - La tienda opera LOCAL (rápido, offline). Cuando hay internet, sube una copia
 *   de su BD al bucket 'respaldos', en la ruta {licencia}/pos-ropa.sqlite.
 * - Si el PC se daña: en un PC nuevo se activa la licencia y se restaura desde la nube.
 * - Automático: al cerrar caja y cada 24 horas.
 */

const BUCKET = 'respaldos'

function getCfg(clave: string): string | null {
  const row = queryOne<{ valor: string }>('SELECT valor FROM config WHERE clave = ?', [clave])
  return row ? row.valor : null
}
function setCfg(clave: string, valor: string): void {
  run('INSERT INTO config (clave, valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', [
    clave,
    valor
  ])
}

function rutaObjeto(licencia: string): string {
  return `${encodeURIComponent(licencia)}/pos-ropa.sqlite`
}

/** Sube la BD actual a la nube. Devuelve {ok, error?}. */
export async function subirRespaldo(): Promise<{ ok: boolean; error?: string }> {
  const licencia = getCfg('licencia_codigo')
  if (!licencia) return { ok: false, error: 'Este equipo no tiene licencia activada.' }

  try {
    persist() // asegurar que el archivo tenga lo último
    const datos = readFileSync(getDbPath())

    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${rutaObjeto(licencia)}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/octet-stream',
        'x-upsert': 'true'
      },
      body: new Uint8Array(datos)
    })
    if (!resp.ok) {
      const t = await resp.text().catch(() => '')
      return { ok: false, error: `No se pudo subir (HTTP ${resp.status}). ${t}` }
    }

    // marcar la fecha (local + en el panel)
    setCfg('licencia_ultimo_respaldo', String(Date.now()))
    fetch(`${SUPABASE_URL}/rest/v1/rpc/marcar_respaldo`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_licencia: licencia })
    }).catch(() => {})

    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Sin conexión' }
  }
}

/** Descarga el respaldo de la nube y reemplaza la BD local. Requiere reiniciar. */
export async function bajarRespaldo(licenciaManual?: string): Promise<{ ok: boolean; error?: string }> {
  const licencia = licenciaManual || getCfg('licencia_codigo')
  if (!licencia) return { ok: false, error: 'Indica la licencia de la tienda a restaurar.' }

  try {
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${rutaObjeto(licencia)}`, {
      headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON }
    })
    if (resp.status === 400 || resp.status === 404) {
      return { ok: false, error: 'No hay respaldo en la nube para esa licencia.' }
    }
    if (!resp.ok) return { ok: false, error: `Error al descargar (HTTP ${resp.status})` }

    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length < 100) return { ok: false, error: 'El respaldo descargado está vacío.' }
    writeFileSync(getDbPath(), buf)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Sin conexión' }
  }
}

/** Sube un respaldo si han pasado 24h desde el último (llamar al arrancar). */
export async function respaldoAutomatico(): Promise<void> {
  const licencia = getCfg('licencia_codigo')
  if (!licencia) return
  const ultimo = getCfg('licencia_ultimo_respaldo')
  const horas = ultimo ? (Date.now() - Number(ultimo)) / 3600000 : Infinity
  if (horas >= 24) {
    await subirRespaldo().catch(() => {})
  }
}

/** Info del último respaldo local (para mostrar en la UI). */
export function ultimoRespaldo(): { fecha: string | null } {
  const ts = getCfg('licencia_ultimo_respaldo')
  return { fecha: ts ? new Date(Number(ts)).toLocaleString('es-CO') : null }
}

/**
 * Sube a la nube un RESUMEN de ventas por día (últimos 30 días) para el
 * dashboard central del superadmin. No sube datos sensibles, solo totales.
 */
export async function subirResumen(): Promise<void> {
  const licencia = getCfg('licencia_codigo')
  if (!licencia) return
  const nombre = getCfg('tienda_nombre') ?? ''

  const filas = query<{ fecha: string; num: number; total: number }>(
    `SELECT date(fecha) as fecha, COUNT(*) as num, COALESCE(SUM(total),0) as total
     FROM ventas
     WHERE estado = 'completada' AND date(fecha) >= date('now','-30 days','localtime')
     GROUP BY date(fecha)`
  )
  const datos = filas.map((f) => ({ fecha: f.fecha, num: f.num, total: f.total }))

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/subir_resumen`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_licencia: licencia, p_nombre: nombre, p_datos: datos })
    })
  } catch {
    /* sin internet: se reintenta en el próximo ciclo */
  }
}
