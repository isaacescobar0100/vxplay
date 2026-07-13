// Edge Function "respaldo" — sube/baja el respaldo de cada tienda con permisos de servidor.
// El POS la llama con la anon key + su licencia; la función valida la licencia y usa el
// service_role (nunca sale del servidor) para tocar el Storage. Así `anon` no accede al bucket.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'respaldos'
const OBJ = 'pos-ropa.sqlite'

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey)

    let body: any
    try {
      body = await req.json()
    } catch {
      return json({ ok: false, error: 'Cuerpo inválido' }, 400)
    }
    const { accion, licencia, archivo } = body ?? {}
    if (!licencia) return json({ ok: false, error: 'Falta la licencia' }, 400)

    const { data: tienda } = await admin.from('tiendas').select('estado').eq('licencia', licencia).maybeSingle()
    if (!tienda) return json({ ok: false, error: 'Licencia no válida' }, 403)
    if (tienda.estado && tienda.estado !== 'activa') {
      return json({ ok: false, error: 'La licencia no está activa' }, 403)
    }

    const path = `${licencia}/${OBJ}`

    if (accion === 'subir') {
      if (!archivo) return json({ ok: false, error: 'Falta el archivo' }, 400)
      const bytes = fromBase64(archivo)
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(path, bytes, { upsert: true, contentType: 'application/octet-stream' })
      if (error) return json({ ok: false, error: error.message }, 500)
      // marcar la fecha de respaldo (si la función existe); no debe tumbar el respaldo si falla
      try {
        await admin.rpc('marcar_respaldo', { p_licencia: licencia })
      } catch (_) {
        // ignorar
      }
      return json({ ok: true })
    }

    if (accion === 'bajar') {
      const { data, error } = await admin.storage.from(BUCKET).download(path)
      if (error || !data) return json({ ok: false, error: 'No hay respaldo en la nube para esa licencia' }, 404)
      const buf = new Uint8Array(await data.arrayBuffer())
      return json({ ok: true, archivo: toBase64(buf) })
    }

    return json({ ok: false, error: 'Acción inválida' }, 400)
  } catch (e) {
    return json({ ok: false, error: 'Error interno: ' + (e instanceof Error ? e.message : String(e)) }, 500)
  }
})
