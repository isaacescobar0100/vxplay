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

const FN_URL = `${SUPABASE_URL}/functions/v1/respaldo`

/** Sube la BD actual a la nube a través de la Edge Function (con permisos de servidor). */
export async function subirRespaldo(): Promise<{ ok: boolean; error?: string }> {
  const licencia = getCfg('licencia_codigo')
  if (!licencia) return { ok: false, error: 'Este equipo no tiene licencia activada.' }

  try {
    persist() // asegurar que el archivo tenga lo último
    const datos = readFileSync(getDbPath())

    const resp = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accion: 'subir', licencia, archivo: datos.toString('base64') })
    })
    const r = await resp.json().catch(() => ({}))
    if (!resp.ok || !r.ok) return { ok: false, error: r.error ?? `No se pudo subir (HTTP ${resp.status}).` }

    setCfg('licencia_ultimo_respaldo', String(Date.now()))
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Sin conexión' }
  }
}

/** Descarga el respaldo de la nube (vía Edge Function) y reemplaza la BD local. Requiere reiniciar. */
export async function bajarRespaldo(licenciaManual?: string): Promise<{ ok: boolean; error?: string }> {
  const licencia = licenciaManual || getCfg('licencia_codigo')
  if (!licencia) return { ok: false, error: 'Indica la licencia de la tienda a restaurar.' }

  try {
    const resp = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accion: 'bajar', licencia })
    })
    const r = await resp.json().catch(() => ({}))
    if (!resp.ok || !r.ok || !r.archivo) {
      return { ok: false, error: r.error ?? 'No hay respaldo en la nube para esa licencia.' }
    }
    const buf = Buffer.from(r.archivo, 'base64')
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
 * Construye la FOTO del día para el Portal del Dueño (dashboard web de solo
 * lectura). Solo totales calculados, ningún dato sensible ni de clientes.
 */
function construirSnapshot(): Record<string, unknown> {
  const r = Math.round
  const dianOn = getCfg('dian_habilitado') === '1'

  const vHoy = queryOne<{ num: number; bruto: number }>(
    `SELECT COUNT(*) as num, COALESCE(SUM(total),0) as bruto
     FROM ventas WHERE estado = 'completada' AND date(fecha) = date('now','localtime')`
  )
  const devHoy = queryOne<{ ndev: number; monto: number }>(
    `SELECT COUNT(*) as ndev, COALESCE(SUM(total),0) as monto
     FROM devoluciones WHERE date(fecha) = date('now','localtime')`
  )
  const gastoHoy = queryOne<{ g: number }>(
    `SELECT COALESCE(SUM(monto),0) as g FROM gastos WHERE date(fecha) = date('now','localtime')`
  )
  // Utilidad = (ingreso base sin IVA) - costo, neteando devoluciones del día
  const util = queryOne<{ ingreso: number; costo: number }>(
    `SELECT
       COALESCE(SUM(vi.cantidad * vi.precio_unitario * 100.0 / (100 + vi.iva_porcentaje)),0) as ingreso,
       COALESCE(SUM(vi.cantidad * COALESCE(p.precio_compra,0)),0) as costo
     FROM venta_items vi
     JOIN ventas v ON v.id = vi.venta_id
     LEFT JOIN variantes va ON va.id = vi.variante_id
     LEFT JOIN productos p ON p.id = va.producto_id
     WHERE v.estado = 'completada' AND date(v.fecha) = date('now','localtime')`
  )
  const utilDev = queryOne<{ base: number; costo: number }>(
    `SELECT
       COALESCE(SUM(di.cantidad * di.precio_unitario),0) as base,
       COALESCE(SUM(di.cantidad * COALESCE(p.precio_compra,0)),0) as costo
     FROM devolucion_items di
     JOIN devoluciones d ON d.id = di.devolucion_id
     LEFT JOIN variantes va ON va.id = di.variante_id
     LEFT JOIN productos p ON p.id = va.producto_id
     WHERE date(d.fecha) = date('now','localtime')`
  )
  const mes = queryOne<{ num: number; total: number }>(
    `SELECT COUNT(*) as num, COALESCE(SUM(total),0) as total
     FROM ventas WHERE estado = 'completada'
       AND strftime('%Y-%m', fecha) = strftime('%Y-%m','now','localtime')`
  )
  const caja = queryOne<{ id: number; fecha_apertura: string; monto_inicial: number }>(
    `SELECT id, fecha_apertura, monto_inicial FROM caja_sesiones WHERE estado = 'abierta' ORDER BY id DESC LIMIT 1`
  )
  const top = query<{ nombre: string; cantidad: number; total: number }>(
    `SELECT vi.producto_nombre as nombre, SUM(vi.cantidad) as cantidad,
            SUM(vi.cantidad * vi.precio_unitario) as total
     FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
     WHERE v.estado = 'completada' AND date(v.fecha) = date('now','localtime')
     GROUP BY vi.producto_nombre ORDER BY cantidad DESC LIMIT 5`
  )
  const stockBajo = query<{ nombre: string; stock: number; minimo: number }>(
    `SELECT p.nombre ||
            CASE WHEN COALESCE(va.talla,'') <> '' OR COALESCE(va.color,'') <> ''
                 THEN ' (' || TRIM(COALESCE(va.talla,'') || ' ' || COALESCE(va.color,'')) || ')' ELSE '' END as nombre,
            va.stock, va.stock_minimo as minimo
     FROM variantes va JOIN productos p ON p.id = va.producto_id
     WHERE va.stock <= va.stock_minimo AND p.activo = 1
     ORDER BY va.stock ASC LIMIT 30`
  )
  // Utilidad del mes (para Reportes)
  const utilMes = queryOne<{ ingreso: number; costo: number }>(
    `SELECT
       COALESCE(SUM(vi.cantidad * vi.precio_unitario * 100.0 / (100 + vi.iva_porcentaje)),0) as ingreso,
       COALESCE(SUM(vi.cantidad * COALESCE(p.precio_compra,0)),0) as costo
     FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
     LEFT JOIN variantes va ON va.id = vi.variante_id
     LEFT JOIN productos p ON p.id = va.producto_id
     WHERE v.estado = 'completada' AND strftime('%Y-%m', v.fecha) = strftime('%Y-%m','now','localtime')`
  )
  // Métodos de pago del mes (para Reportes)
  const metodos = query<{ metodo: string; num: number; total: number }>(
    `SELECT vp.metodo as metodo, COUNT(DISTINCT v.id) as num, COALESCE(SUM(vp.monto),0) as total
     FROM venta_pagos vp JOIN ventas v ON v.id = vp.venta_id
     WHERE v.estado = 'completada'
       AND strftime('%Y-%m', v.fecha) = strftime('%Y-%m','now','localtime')
     GROUP BY vp.metodo ORDER BY total DESC`
  )
  // Productos más vendidos del mes (para Reportes)
  const topMes = query<{ nombre: string; cantidad: number; total: number }>(
    `SELECT vi.producto_nombre as nombre, SUM(vi.cantidad) as cantidad,
            SUM(vi.cantidad * vi.precio_unitario) as total
     FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
     WHERE v.estado = 'completada'
       AND strftime('%Y-%m', v.fecha) = strftime('%Y-%m','now','localtime')
     GROUP BY vi.producto_nombre ORDER BY cantidad DESC LIMIT 10`
  )
  // Inventario: totales + lista (para el apartado Inventario y exportar)
  const invTot = queryOne<{ items: number; unidades: number; costo: number; venta: number }>(
    `SELECT COUNT(*) as items, COALESCE(SUM(va.stock),0) as unidades,
            COALESCE(SUM(va.stock * p.precio_compra),0) as costo,
            COALESCE(SUM(va.stock * p.precio_venta),0) as venta
     FROM variantes va JOIN productos p ON p.id = va.producto_id WHERE p.activo = 1`
  )
  const invLista = query<{ nombre: string; sku: string; stock: number; compra: number; venta: number }>(
    `SELECT p.nombre ||
            CASE WHEN COALESCE(va.talla,'') <> '' OR COALESCE(va.color,'') <> ''
                 THEN ' (' || TRIM(COALESCE(va.talla,'') || ' ' || COALESCE(va.color,'')) || ')' ELSE '' END as nombre,
            COALESCE(p.sku,'') as sku, va.stock, p.precio_compra as compra, p.precio_venta as venta
     FROM variantes va JOIN productos p ON p.id = va.producto_id
     WHERE p.activo = 1 ORDER BY p.nombre LIMIT 500`
  )
  // Ventas recientes (el "monitoreo en vivo")
  const ventasRec = query<{ numero: string; fecha: string; total: number; metodo: string }>(
    `SELECT numero, fecha, total, metodo_pago as metodo FROM ventas
     WHERE estado = 'completada' ORDER BY id DESC LIMIT 25`
  )
  // Comparativos: ayer y mes pasado
  const vAyer = queryOne<{ bruto: number }>(
    `SELECT COALESCE(SUM(total),0) as bruto FROM ventas
     WHERE estado = 'completada' AND date(fecha) = date('now','-1 day','localtime')`
  )
  const devAyer = queryOne<{ monto: number }>(
    `SELECT COALESCE(SUM(total),0) as monto FROM devoluciones WHERE date(fecha) = date('now','-1 day','localtime')`
  )
  const mesPasado = queryOne<{ total: number; num: number }>(
    `SELECT COALESCE(SUM(total),0) as total, COUNT(*) as num FROM ventas
     WHERE estado = 'completada'
       AND strftime('%Y-%m', fecha) = strftime('%Y-%m','now','localtime','start of month','-1 month')`
  )
  // Cierres de caja (arqueos): esperado vs contado y diferencia (descuadres)
  const cierres = query<{
    fecha_apertura: string; fecha_cierre: string; monto_inicial: number;
    monto_esperado: number; monto_contado: number; diferencia: number; cajero: string
  }>(
    `SELECT s.fecha_apertura, s.fecha_cierre, s.monto_inicial, s.monto_esperado, s.monto_contado,
            s.diferencia, COALESCE(u.nombre,'') as cajero
     FROM caja_sesiones s LEFT JOIN usuarios u ON u.id = s.usuario_cierre_id
     WHERE s.estado = 'cerrada' ORDER BY s.id DESC LIMIT 20`
  )
  // Detalle de gastos del mes
  const gastosLista = query<{ fecha: string; concepto: string; categoria: string; metodo: string; monto: number }>(
    `SELECT fecha, concepto, COALESCE(categoria,'') as categoria, metodo, monto FROM gastos
     WHERE strftime('%Y-%m', fecha) = strftime('%Y-%m','now','localtime')
     ORDER BY id DESC LIMIT 100`
  )

  const bruto = vHoy?.bruto ?? 0
  const dev = devHoy?.monto ?? 0
  const gastos = gastoHoy?.g ?? 0
  const utilidad = r((util?.ingreso ?? 0) - (utilDev?.base ?? 0) - ((util?.costo ?? 0) - (utilDev?.costo ?? 0)))

  return {
    generado: new Date().toISOString(),
    moneda: 'COP',
    dian_on: dianOn,
    hoy: {
      ventas_num: vHoy?.num ?? 0,
      ventas_bruto: bruto,
      devoluciones: dev,
      ndev: devHoy?.ndev ?? 0,
      neto: bruto - dev,
      gastos,
      utilidad,
      ganancia_neta: utilidad - gastos
    },
    mes: {
      ventas_num: mes?.num ?? 0,
      total: mes?.total ?? 0,
      utilidad: r((utilMes?.ingreso ?? 0) - (utilMes?.costo ?? 0))
    },
    caja: caja
      ? { abierta: true, desde: caja.fecha_apertura, base: caja.monto_inicial }
      : { abierta: false },
    top,
    top_mes: topMes,
    metodos,
    stock_bajo: stockBajo,
    inventario: {
      items: invTot?.items ?? 0,
      unidades: invTot?.unidades ?? 0,
      valor_costo: invTot?.costo ?? 0,
      valor_venta: invTot?.venta ?? 0,
      lista: invLista
    },
    ventas_recientes: ventasRec,
    comparativo: {
      ayer_neto: (vAyer?.bruto ?? 0) - (devAyer?.monto ?? 0),
      mes_pasado_total: mesPasado?.total ?? 0,
      mes_pasado_num: mesPasado?.num ?? 0
    },
    cierres_caja: cierres,
    gastos_lista: gastosLista
  }
}

/**
 * Sube a la nube el RESUMEN de ventas (últimos 30 días) + la FOTO del día para
 * el panel superadmin y el Portal del Dueño. No sube datos sensibles, solo totales.
 */
export async function subirResumen(): Promise<void> {
  const licencia = getCfg('licencia_codigo')
  if (!licencia) return
  const nombre = getCfg('tienda_nombre') ?? ''

  const ventasDia = query<{ fecha: string; num: number; total: number }>(
    `SELECT date(fecha) as fecha, COUNT(*) as num, COALESCE(SUM(total),0) as total
     FROM ventas
     WHERE estado = 'completada' AND date(fecha) >= date('now','-30 days','localtime')
     GROUP BY date(fecha)`
  )
  // Devoluciones por día (monto y cantidad) para el neto y el conteo
  const devDia = query<{ fecha: string; dev: number; ndev: number }>(
    `SELECT date(fecha) as fecha, COALESCE(SUM(total),0) as dev, COUNT(*) as ndev
     FROM devoluciones
     WHERE date(fecha) >= date('now','-30 days','localtime')
     GROUP BY date(fecha)`
  )
  const devMap: Record<string, { dev: number; ndev: number }> = {}
  for (const d of devDia) devMap[d.fecha] = { dev: d.dev, ndev: d.ndev }
  const datos = ventasDia.map((f) => ({
    fecha: f.fecha,
    num: f.num,
    total: f.total, // bruto
    dev: devMap[f.fecha]?.dev ?? 0, // monto devuelto del día
    ndev: devMap[f.fecha]?.ndev ?? 0 // cantidad de devoluciones del día
  }))

  let snapshot: Record<string, unknown> | null = null
  try {
    snapshot = construirSnapshot()
  } catch {
    /* si algo falla al calcular la foto, subimos igual el resumen de 30 días */
  }

  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: 'Bearer ' + SUPABASE_ANON,
    'Content-Type': 'application/json'
  }
  try {
    // Resumen por día → tabla resumen_ventas (panel superadmin). Sin cambios.
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/subir_resumen`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_licencia: licencia, p_nombre: nombre, p_datos: datos })
    })
    // Foto del día → tabla portal_tienda (Portal del Dueño).
    if (snapshot) {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/subir_snapshot`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_licencia: licencia, p_nombre: nombre, p_snapshot: snapshot })
      })
    }
  } catch {
    /* sin internet: se reintenta en el próximo ciclo */
  }
}

/**
 * Sube el resumen con "debounce": si se llama varias veces seguidas (varias
 * ventas rápidas), agrupa y sube una sola vez unos segundos después. Así el
 * Portal del Dueño se actualiza casi en vivo sin saturar la red.
 */
let temporizadorResumen: ReturnType<typeof setTimeout> | null = null
export function programarResumen(): void {
  if (temporizadorResumen) clearTimeout(temporizadorResumen)
  temporizadorResumen = setTimeout(() => {
    temporizadorResumen = null
    subirResumen().catch(() => {})
  }, 4000)
}

/**
 * Guarda (o borra, si va vacía) la CLAVE del Portal del Dueño en la nube.
 * La clave viaja por HTTPS y se almacena hasheada (bcrypt) en Supabase; el POS
 * nunca la guarda en texto plano, solo recuerda que ya está configurada.
 */
export async function guardarClavePortal(clave: string): Promise<{ ok: boolean; error?: string }> {
  const licencia = getCfg('licencia_codigo')
  if (!licencia) return { ok: false, error: 'Este equipo no tiene licencia activada.' }
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/guardar_clave_portal`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_licencia: licencia, p_clave: clave ?? '' })
    })
    if (!resp.ok) return { ok: false, error: 'No se pudo guardar (revisa tu internet).' }
    setCfg('portal_clave_set', clave && clave.length > 0 ? '1' : '0')
    // Sube una foto inicial para que el portal ya tenga datos que mostrar.
    subirResumen().catch(() => {})
    return { ok: true }
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo cuando tengas internet.' }
  }
}
