import { queryOne, run, insert, getDb, persist } from './db'
import { hashPassword, verifyPassword, esHash } from './auth'
import { SUPABASE_URL, SUPABASE_ANON } from './supabase'
import { limpiarBackupsLocales } from './backup'

/**
 * Borra TODOS los datos operativos locales. Se usa al cambiar a una licencia
 * DISTINTA (otra tienda) para que no se crucen los datos entre tiendas.
 */
function limpiarDatosTienda(): void {
  const db = getDb()
  const tablas = [
    'venta_pagos', 'venta_items', 'devolucion_items', 'devoluciones', 'ventas',
    'propinas', 'abonos', 'comanda_items', 'comandas', 'mesas', 'movimientos_inventario',
    'compra_items', 'compras', 'gastos', 'proveedores', 'caja_sesiones',
    'clientes', 'variantes', 'productos', 'categorias', 'usuarios'
  ]
  for (const t of tablas) {
    try { db.run('DELETE FROM ' + t) } catch { /* la tabla puede no existir */ }
  }
  try { db.run('DELETE FROM sqlite_sequence') } catch { /* ignore */ }
  // Borrar config PROPIA de la tienda anterior (identidad, fiscal/DIAN, logo, tipo negocio,
  // y las funciones opcionales fiado/propina). Cada tienda define las suyas.
  // Se CONSERVAN: impresora/hardware del PC (impresora_nombre, ancho_papel, impresion_modo),
  // el dominio de la carta (carta_url, es el mismo para todas), y las claves de licencia (licencia_*).
  db.run(
    "DELETE FROM config WHERE clave LIKE 'tienda_%' OR clave LIKE 'dian_%' OR clave LIKE 'propina_%' OR clave IN ('tipo_negocio','config_central','fiado_habilitado')"
  )
  // usuario de respaldo por si la nueva licencia no trae credenciales
  db.run("INSERT INTO usuarios (nombre, usuario, password, rol) VALUES ('Administrador','admin',?, 'admin')", [
    hashPassword('admin123')
  ])
  persist()
  // Borrar los respaldos locales de la tienda anterior (no deben quedar en este equipo)
  limpiarBackupsLocales()
}

/**
 * Verificación de licencia contra Supabase.
 *
 * El POS le pregunta al servidor central "¿mi licencia está activa?".
 * - activa      -> funciona normal
 * - suspendida  -> se bloquea (no pagó)
 * - vencida     -> se bloquea (venció el plazo)
 * - sin internet-> período de gracia (GRACE_DAYS días) usando el último estado OK
 *
 * La anon key es pública y solo puede llamar a la función verificar_licencia.
 */

const GRACE_DAYS = 7

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

interface RespLicencia {
  estado: string // activa | suspendida | vencida | invalida
  nombre?: string
  fecha_vencimiento?: string | null
  config?: Record<string, string> | null
}

/**
 * Guarda en el config local la configuración que controla el superadmin.
 * Devuelve true si ALGO cambió respecto a lo que ya había (para refrescar la UI).
 */
function aplicarConfigCentral(config: Record<string, string> | null | undefined): boolean {
  if (!config) return false
  let cambio = false

  // Credenciales del POS definidas por el superadmin (se manejan aparte, no en config)
  const posUsuario = config.pos_usuario
  const posPassword = config.pos_password
  if (posUsuario && posPassword) sincronizarUsuarioCentral(posUsuario, posPassword)

  for (const [clave, valor] of Object.entries(config)) {
    if (clave === 'pos_usuario' || clave === 'pos_password') continue // no guardar la clave en texto
    if (valor === null || valor === undefined) continue
    if (getCfg(clave) !== String(valor)) {
      setCfg(clave, String(valor))
      cambio = true
    }
  }
  if (getCfg('config_central') !== '1') setCfg('config_central', '1')
  return cambio
}

/** Crea o actualiza el usuario admin de la tienda con las credenciales del panel. */
function sincronizarUsuarioCentral(usuario: string, password: string): void {
  // La clave del panel puede venir YA hasheada (pbkdf2$/scrypt$) o en texto plano (legado).
  const yaHasheada = esHash(password)
  const guardar = yaHasheada ? password : hashPassword(password)

  const u = queryOne<{ id: number; password: string }>('SELECT id, password FROM usuarios WHERE usuario = ?', [
    usuario
  ])
  if (!u) {
    insert('INSERT INTO usuarios (nombre, usuario, password, rol) VALUES (?,?,?,?)', [
      'Administrador',
      usuario,
      guardar,
      'admin'
    ])
  } else {
    // Actualizar solo si cambió (si viene hasheada, comparar el hash; si es texto, verificar).
    const cambio = yaHasheada ? u.password !== guardar : !verifyPassword(password, u.password)
    if (cambio) run('UPDATE usuarios SET password = ? WHERE id = ?', [guardar, u.id])
  }

  // Si la tienda usa un usuario propio (distinto de 'admin'), eliminamos el 'admin'
  // por defecto SOLO si sigue con la contraseña por defecto (nadie lo personalizó).
  // Así no queda el hueco de seguridad admin/admin123.
  if (usuario !== 'admin') {
    const porDefecto = queryOne<{ id: number; password: string }>(
      "SELECT id, password FROM usuarios WHERE usuario = 'admin'"
    )
    if (porDefecto && verifyPassword('admin123', porDefecto.password)) {
      try {
        run('DELETE FROM usuarios WHERE id = ?', [porDefecto.id])
      } catch {
        /* si tuviera ventas asociadas, se conserva */
      }
    }
  }
}

/** Consulta a Supabase. Devuelve null si NO hay internet / falla la red. */
async function consultar(codigo: string): Promise<RespLicencia | null> {
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/verificar_licencia', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_licencia: codigo })
    })
    if (!resp.ok) return { estado: 'invalida' }
    const data = (await resp.json()) as any[]
    if (Array.isArray(data) && data.length > 0) return data[0] as RespLicencia
    return { estado: 'invalida' } // licencia no encontrada
  } catch {
    return null // sin internet
  }
}

export interface EstadoLicencia {
  activa: boolean
  necesitaActivacion?: boolean
  offline?: boolean
  motivo?: string
  nombre?: string
  estado?: string
  configCambio?: boolean // true si la config central cambió (para refrescar la UI)
}

/**
 * Estado INMEDIATO desde la cache local (sin internet), para arrancar rápido.
 * - Sin licencia -> pide activación.
 * - Con licencia validada hace poco (dentro del período de gracia) -> activa al instante.
 * - Con licencia pero sin validación reciente -> null (hay que consultar al servidor).
 */
export function estadoLicenciaRapido(): EstadoLicencia | null {
  const codigo = getCfg('licencia_codigo')
  if (!codigo) return { activa: false, necesitaActivacion: true }
  const ultimo = getCfg('licencia_ultimo_ok')
  if (ultimo) {
    const dias = (Date.now() - Number(ultimo)) / 86400000
    if (dias <= GRACE_DAYS) {
      return { activa: true, offline: true, nombre: getCfg('licencia_nombre') ?? undefined }
    }
  }
  return null // no hay validación reciente: esperar al servidor
}

/** Estado actual de la licencia de esta instalación. */
export async function estadoLicencia(): Promise<EstadoLicencia> {
  const codigo = getCfg('licencia_codigo')
  if (!codigo) return { activa: false, necesitaActivacion: true }

  const res = await consultar(codigo)

  // Sin internet: aplicar período de gracia
  if (res === null) {
    const ultimo = getCfg('licencia_ultimo_ok')
    if (ultimo) {
      const dias = (Date.now() - Number(ultimo)) / 86400000
      if (dias <= GRACE_DAYS) {
        return { activa: true, offline: true, nombre: getCfg('licencia_nombre') ?? undefined }
      }
    }
    return {
      activa: false,
      motivo: 'No se pudo verificar la licencia (sin conexión). Conéctate a internet para continuar.'
    }
  }

  // Siempre que haya respuesta con config, sincronizarla (aunque esté suspendida)
  const configCambio = aplicarConfigCentral(res.config)

  if (res.estado === 'activa') {
    setCfg('licencia_ultimo_ok', String(Date.now()))
    if (res.nombre) setCfg('licencia_nombre', res.nombre)
    return { activa: true, nombre: res.nombre, configCambio }
  }

  const motivos: Record<string, string> = {
    suspendida: 'Tu servicio está suspendido. Comunícate con el proveedor para reactivarlo.',
    vencida: 'Tu licencia venció. Comunícate con el proveedor para renovarla.',
    invalida: 'La licencia no es válida.'
  }
  return { activa: false, estado: res.estado, motivo: motivos[res.estado] ?? 'Licencia no activa.', configCambio }
}

/** Activa la instalación con un código de licencia. */
export async function activarLicencia(codigo: string): Promise<{ ok: boolean; error?: string; nombre?: string }> {
  const limpio = (codigo || '').trim()
  if (!limpio) return { ok: false, error: 'Escribe el código de licencia.' }

  const res = await consultar(limpio)
  if (res === null) return { ok: false, error: 'Sin conexión a internet. Conéctate para activar.' }

  if (res.estado === 'activa') {
    // Si se activa una licencia DISTINTA (otra tienda), limpiar los datos de la anterior
    const anterior = getCfg('licencia_anterior') ?? getCfg('licencia_codigo')
    if (anterior && anterior !== limpio) {
      limpiarDatosTienda()
    }
    run("DELETE FROM config WHERE clave = 'licencia_anterior'")
    setCfg('licencia_codigo', limpio)
    setCfg('licencia_ultimo_ok', String(Date.now()))
    if (res.nombre) setCfg('licencia_nombre', res.nombre)
    aplicarConfigCentral(res.config) // aplica config + usuario de la NUEVA tienda
    return { ok: true, nombre: res.nombre }
  }
  if (res.estado === 'invalida') return { ok: false, error: 'Código de licencia no encontrado.' }
  return { ok: false, error: 'La licencia está ' + res.estado + '.' }
}
