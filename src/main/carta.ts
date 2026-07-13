import { query, queryOne } from './db'
import { SUPABASE_URL, SUPABASE_ANON } from './supabase'

/**
 * Publica la carta (menú) de esta tienda en la nube para que los clientes la vean
 * al escanear el QR de la mesa. Sube los productos a Supabase con la licencia como llave.
 * No expone datos sensibles: solo nombre, precio y categoría.
 */
export async function publicarCarta(): Promise<{ ok: boolean; count?: number; error?: string }> {
  const licRow = queryOne<{ valor: string }>("SELECT valor FROM config WHERE clave = 'licencia_codigo'")
  const licencia = licRow?.valor
  if (!licencia) return { ok: false, error: 'No hay una licencia activa en esta tienda.' }

  const productos = query<{ id: number; nombre: string; precio: number; categoria: string | null }>(
    `SELECT p.id, p.nombre, p.precio_venta AS precio, c.nombre AS categoria
       FROM productos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
      ORDER BY c.nombre IS NULL, c.nombre, p.nombre`
  )

  const payload = productos.map((p, i) => ({
    id: p.id,
    nombre: p.nombre,
    precio: p.precio,
    categoria: p.categoria ?? null,
    disponible: true,
    orden: i
  }))

  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/sync_carta', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_licencia: licencia, p_productos: payload })
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return { ok: false, error: 'Error del servidor (' + resp.status + '). ' + txt.slice(0, 120) }
    }
    return { ok: true, count: payload.length }
  } catch {
    return { ok: false, error: 'Sin conexión a internet. Conéctate para publicar la carta.' }
  }
}
