import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { queryOne, query, run, persist, getDbPath } from './db'
import { SUPABASE_URL, SUPABASE_ANON } from './supabase'
import { crearBackupAutomatico } from './backup'

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
    // Red de seguridad: respalda el estado ACTUAL antes de sobrescribirlo, para
    // poder deshacer una restauración equivocada (queda en Respaldo local).
    try {
      crearBackupAutomatico()
    } catch {
      /* si no se pudo respaldar lo actual, continuamos con la restauración */
    }
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

  // El "hoy" del Panel se calcula por la CAJA/turno actual, EXACTAMENTE como el
  // Inicio del POS (así ambos coinciden). Si la caja está cerrada, hoy = 0.
  const caja = queryOne<{ id: number; fecha_apertura: string; monto_inicial: number }>(
    `SELECT id, fecha_apertura, monto_inicial FROM caja_sesiones WHERE estado = 'abierta' ORDER BY id DESC LIMIT 1`
  )
  const sid = caja?.id ?? -1

  // Una venta devuelta COMPLETA ya no cuenta como venta (la plata se regresó),
  // igual que en el POS. Las parciales sí cuentan: esa venta sí dejó dinero.
  const cuentaVenta = (a: string): string => `CASE WHEN ${a}.total > 0 AND
      COALESCE((SELECT SUM(dd.total) FROM devoluciones dd WHERE dd.venta_id = ${a}.id), 0) >= ${a}.total
    THEN 0 ELSE 1 END`
  const mesActual = `strftime('%Y-%m','now','localtime')`

  const vHoy = queryOne<{ num: number; bruto: number }>(
    `SELECT COALESCE(SUM(${cuentaVenta('ventas')}),0) as num, COALESCE(SUM(total),0) as bruto
     FROM ventas WHERE estado = 'completada' AND sesion_id = ${sid}`
  )
  const devHoy = queryOne<{ ndev: number; monto: number }>(
    `SELECT COUNT(*) as ndev, COALESCE(SUM(total),0) as monto
     FROM devoluciones WHERE sesion_id = ${sid}`
  )
  const gastoHoy = queryOne<{ g: number }>(
    `SELECT COALESCE(SUM(monto),0) as g FROM gastos WHERE sesion_id = ${sid}`
  )
  // Utilidad = (ingreso base sin IVA) - costo, neteando devoluciones del turno
  const util = queryOne<{ ingreso: number; costo: number }>(
    `SELECT
       COALESCE(SUM(vi.cantidad * vi.precio_unitario * 100.0 / (100 + vi.iva_porcentaje)),0) as ingreso,
       COALESCE(SUM(vi.cantidad * COALESCE(p.precio_compra,0)),0) as costo
     FROM venta_items vi
     JOIN ventas v ON v.id = vi.venta_id
     LEFT JOIN variantes va ON va.id = vi.variante_id
     LEFT JOIN productos p ON p.id = va.producto_id
     WHERE v.estado = 'completada' AND v.sesion_id = ${sid}`
  )
  const utilDev = queryOne<{ base: number; costo: number }>(
    `SELECT
       COALESCE(SUM(di.cantidad * di.precio_unitario),0) as base,
       COALESCE(SUM(di.cantidad * COALESCE(p.precio_compra,0)),0) as costo
     FROM devolucion_items di
     JOIN devoluciones d ON d.id = di.devolucion_id
     LEFT JOIN variantes va ON va.id = di.variante_id
     LEFT JOIN productos p ON p.id = va.producto_id
     WHERE d.sesion_id = ${sid}`
  )
  // El mes SÍ es por calendario (para Reportes)
  const mes = queryOne<{ num: number; bruto: number }>(
    `SELECT COALESCE(SUM(${cuentaVenta('ventas')}),0) as num, COALESCE(SUM(total),0) as bruto
     FROM ventas WHERE estado = 'completada'
       AND strftime('%Y-%m', fecha) = ${mesActual}`
  )
  const devMes = queryOne<{ monto: number }>(
    `SELECT COALESCE(SUM(total),0) as monto FROM devoluciones
     WHERE strftime('%Y-%m', fecha) = ${mesActual}`
  )
  // Ventas por día (30 días) para el gráfico del Panel. Va DENTRO del snapshot
  // (que se reemplaza entero en cada subida) para que al reiniciar quede vacío.
  // Las devoluciones restan del día de su venta (se fechan con ella).
  const ventasDias = query<{ fecha: string; total: number }>(
    `SELECT fecha, SUM(total) as total FROM (
       SELECT date(fecha) as fecha, total as total FROM ventas
       WHERE estado = 'completada' AND date(fecha) >= date('now','-30 days','localtime')
       UNION ALL
       SELECT date(fecha), -total FROM devoluciones
       WHERE date(fecha) >= date('now','-30 days','localtime')
     ) GROUP BY fecha ORDER BY fecha`
  )
  // "Más vendidos" descuenta lo devuelto: si volvió al estante, no se vendió.
  const top = query<{ nombre: string; cantidad: number; total: number }>(
    `SELECT nombre, SUM(cantidad) as cantidad, SUM(total) as total FROM (
       SELECT vi.producto_nombre as nombre, vi.cantidad as cantidad,
              vi.cantidad * vi.precio_unitario as total
       FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
       WHERE v.estado = 'completada' AND v.sesion_id = ${sid}
       UNION ALL
       SELECT di.producto_nombre, -di.cantidad, -di.cantidad * di.precio_unitario
       FROM devolucion_items di JOIN devoluciones d ON d.id = di.devolucion_id
       WHERE d.sesion_id = ${sid}
     ) GROUP BY nombre HAVING SUM(cantidad) > 0
     ORDER BY cantidad DESC LIMIT 5`
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
  // Utilidad del mes (para Reportes), neteando las devoluciones del mes
  const utilMes = queryOne<{ ingreso: number; costo: number }>(
    `SELECT
       COALESCE(SUM(vi.cantidad * vi.precio_unitario * 100.0 / (100 + vi.iva_porcentaje)),0) as ingreso,
       COALESCE(SUM(vi.cantidad * COALESCE(p.precio_compra,0)),0) as costo
     FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
     LEFT JOIN variantes va ON va.id = vi.variante_id
     LEFT JOIN productos p ON p.id = va.producto_id
     WHERE v.estado = 'completada' AND strftime('%Y-%m', v.fecha) = ${mesActual}`
  )
  const utilDevMes = queryOne<{ base: number; costo: number }>(
    `SELECT
       COALESCE(SUM(di.cantidad * di.precio_unitario),0) as base,
       COALESCE(SUM(di.cantidad * COALESCE(p.precio_compra,0)),0) as costo
     FROM devolucion_items di JOIN devoluciones d ON d.id = di.devolucion_id
     LEFT JOIN variantes va ON va.id = di.variante_id
     LEFT JOIN productos p ON p.id = va.producto_id
     WHERE strftime('%Y-%m', d.fecha) = ${mesActual}`
  )
  // Métodos de pago del mes (para Reportes). Cada devolución resta por el medio
  // por el que se devolvió la plata.
  const metodos = query<{ metodo: string; num: number; total: number }>(
    `SELECT metodo, SUM(num) as num, SUM(total) as total FROM (
       SELECT vp.metodo as metodo,
              COUNT(DISTINCT CASE WHEN ${cuentaVenta('v')} = 1 THEN v.id END) as num,
              COALESCE(SUM(vp.monto),0) as total
       FROM venta_pagos vp JOIN ventas v ON v.id = vp.venta_id
       WHERE v.estado = 'completada' AND strftime('%Y-%m', v.fecha) = ${mesActual}
       GROUP BY vp.metodo
       UNION ALL
       SELECT d.metodo, 0, -COALESCE(SUM(d.total),0)
       FROM devoluciones d WHERE strftime('%Y-%m', d.fecha) = ${mesActual}
       GROUP BY d.metodo
     ) GROUP BY metodo HAVING SUM(total) > 0 ORDER BY total DESC`
  )
  /**
   * Ventas por vendedor (quien atendió), netas de devoluciones. La devolución se
   * le descuenta a quien hizo la venta original.
   * Recibe los filtros ya escritos con el alias que usa cada tabla.
   */
  const sqlVendedores = (fVentas: string, fV: string, fDev: string): string => `
    SELECT vendedor, SUM(ventas) as ventas, SUM(total) as total, SUM(base) as base, SUM(costo) as costo
    FROM (
      SELECT COALESCE(u.nombre,'(sin vendedor)') as vendedor,
             ${cuentaVenta('ventas')} as ventas, ventas.total as total, 0 as base, 0 as costo
      FROM ventas LEFT JOIN usuarios u ON u.id = COALESCE(ventas.vendedor_id, ventas.usuario_id)
      WHERE ventas.estado = 'completada' AND ${fVentas}
      UNION ALL
      SELECT COALESCE(u.nombre,'(sin vendedor)'), 0, 0,
             vi.cantidad * vi.precio_unitario * 100.0 / (100 + vi.iva_porcentaje),
             vi.cantidad * COALESCE(pr.precio_compra,0)
      FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
      LEFT JOIN usuarios u ON u.id = COALESCE(v.vendedor_id, v.usuario_id)
      LEFT JOIN variantes va ON va.id = vi.variante_id
      LEFT JOIN productos pr ON pr.id = va.producto_id
      WHERE v.estado = 'completada' AND ${fV}
      UNION ALL
      SELECT COALESCE(u.nombre,'(sin vendedor)'), 0, -d.total,
             -di.cantidad * di.precio_unitario,
             -di.cantidad * COALESCE(pr.precio_compra,0)
      FROM devolucion_items di JOIN devoluciones d ON d.id = di.devolucion_id
      LEFT JOIN ventas v ON v.id = d.venta_id
      LEFT JOIN usuarios u ON u.id = COALESCE(v.vendedor_id, v.usuario_id)
      LEFT JOIN variantes va ON va.id = di.variante_id
      LEFT JOIN productos pr ON pr.id = va.producto_id
      WHERE ${fDev}
    ) GROUP BY vendedor
    HAVING SUM(ventas) > 0 OR SUM(total) <> 0
    ORDER BY total DESC`

  const limpiarVend = (filas: any[]): any[] =>
    filas.map((f) => ({
      nombre: f.vendedor,
      ventas: f.ventas,
      total: r(f.total),
      utilidad: r((f.base ?? 0) - (f.costo ?? 0))
    }))

  const vendedoresHoy = limpiarVend(
    query<any>(sqlVendedores(`ventas.sesion_id = ${sid}`, `v.sesion_id = ${sid}`, `d.sesion_id = ${sid}`))
  )
  const vendedoresMes = limpiarVend(
    query<any>(
      sqlVendedores(
        `strftime('%Y-%m', ventas.fecha) = ${mesActual}`,
        `strftime('%Y-%m', v.fecha) = ${mesActual}`,
        `strftime('%Y-%m', d.fecha) = ${mesActual}`
      )
    )
  )

  // Productos más vendidos del mes (para Reportes), descontando devoluciones
  const topMes = query<{ nombre: string; cantidad: number; total: number }>(
    `SELECT nombre, SUM(cantidad) as cantidad, SUM(total) as total FROM (
       SELECT vi.producto_nombre as nombre, vi.cantidad as cantidad,
              vi.cantidad * vi.precio_unitario as total
       FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
       WHERE v.estado = 'completada' AND strftime('%Y-%m', v.fecha) = ${mesActual}
       UNION ALL
       SELECT di.producto_nombre, -di.cantidad, -di.cantidad * di.precio_unitario
       FROM devolucion_items di JOIN devoluciones d ON d.id = di.devolucion_id
       WHERE strftime('%Y-%m', d.fecha) = ${mesActual}
     ) GROUP BY nombre HAVING SUM(cantidad) > 0
     ORDER BY cantidad DESC LIMIT 10`
  )
  // Inventario: totales + lista (para el apartado Inventario y exportar)
  const invTot = queryOne<{ items: number; unidades: number; costo: number; venta: number }>(
    `SELECT COUNT(*) as items, COALESCE(SUM(va.stock),0) as unidades,
            COALESCE(SUM(va.stock * p.precio_compra),0) as costo,
            COALESCE(SUM(va.stock * p.precio_venta),0) as venta
     FROM variantes va JOIN productos p ON p.id = va.producto_id WHERE p.activo = 1`
  )
  const invLista = query<{ nombre: string; sku: string; stock: number; compra: number; venta: number; fecha: string }>(
    `SELECT p.nombre ||
            CASE WHEN COALESCE(va.talla,'') <> '' OR COALESCE(va.color,'') <> ''
                 THEN ' (' || TRIM(COALESCE(va.talla,'') || ' ' || COALESCE(va.color,'')) || ')' ELSE '' END as nombre,
            COALESCE(p.sku,'') as sku, va.stock, p.precio_compra as compra, p.precio_venta as venta,
            COALESCE((SELECT MIN(m.fecha) FROM movimientos_inventario m
                      WHERE m.variante_id = va.id AND m.tipo = 'entrada'), p.creado_en) as fecha
     FROM variantes va JOIN productos p ON p.id = va.producto_id
     WHERE p.activo = 1 ORDER BY p.nombre LIMIT 500`
  )
  // Ventas recientes (el "monitoreo en vivo") — historial amplio para paginar/filtrar.
  // `devuelto` permite marcar la venta y mostrar el neto en el Panel.
  const ventasRec = query<{ numero: string; fecha: string; total: number; metodo: string; devuelto: number }>(
    `SELECT numero, fecha, total, metodo_pago as metodo,
            COALESCE((SELECT SUM(dd.total) FROM devoluciones dd WHERE dd.venta_id = ventas.id),0) as devuelto
     FROM ventas WHERE estado = 'completada' ORDER BY id DESC LIMIT 300`
  )
  // Detalle de ventas (una fila por producto) para exportar TODO desde el Panel.
  // `devuelto` = unidades de esa línea que el cliente regresó.
  const ventasDet = query<{
    numero: string; fecha: string; cliente: string; metodo: string; producto: string;
    talla: string; color: string; cantidad: number; precio_unitario: number; subtotal: number;
    total_venta: number; devuelto: number
  }>(
    `SELECT v.numero, v.fecha, COALESCE(c.nombre,'Consumidor final') as cliente, v.metodo_pago as metodo,
            vi.producto_nombre as producto, COALESCE(vi.talla,'') as talla, COALESCE(vi.color,'') as color,
            vi.cantidad, vi.precio_unitario, vi.subtotal, v.total as total_venta,
            COALESCE((SELECT SUM(di.cantidad) FROM devolucion_items di WHERE di.venta_item_id = vi.id),0) as devuelto
     FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
     LEFT JOIN clientes c ON c.id = v.cliente_id
     WHERE v.estado = 'completada' ORDER BY v.id DESC LIMIT 2000`
  )
  // Comparativos: ayer y mes pasado
  const vAyer = queryOne<{ bruto: number }>(
    `SELECT COALESCE(SUM(total),0) as bruto FROM ventas
     WHERE estado = 'completada' AND date(fecha) = date('now','-1 day','localtime')`
  )
  const devAyer = queryOne<{ monto: number }>(
    `SELECT COALESCE(SUM(total),0) as monto FROM devoluciones WHERE date(fecha) = date('now','-1 day','localtime')`
  )
  const mesAnterior = `strftime('%Y-%m','now','localtime','start of month','-1 month')`
  const mesPasado = queryOne<{ total: number; num: number }>(
    `SELECT COALESCE(SUM(total),0) as total, COALESCE(SUM(${cuentaVenta('ventas')}),0) as num FROM ventas
     WHERE estado = 'completada' AND strftime('%Y-%m', fecha) = ${mesAnterior}`
  )
  const devMesPasado = queryOne<{ monto: number }>(
    `SELECT COALESCE(SUM(total),0) as monto FROM devoluciones
     WHERE strftime('%Y-%m', fecha) = ${mesAnterior}`
  )
  // Cierres de caja (arqueos): esperado vs contado y diferencia (descuadres)
  const cierres = query<{
    fecha_apertura: string; fecha_cierre: string; monto_inicial: number;
    monto_esperado: number; monto_contado: number; diferencia: number; cajero: string
  }>(
    `SELECT s.fecha_apertura, s.fecha_cierre, s.monto_inicial, s.monto_esperado, s.monto_contado,
            s.diferencia, COALESCE(u.nombre,'') as cajero
     FROM caja_sesiones s LEFT JOIN usuarios u ON u.id = s.usuario_cierre_id
     WHERE s.estado = 'cerrada' ORDER BY s.id DESC LIMIT 150`
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
    // Version del POS que subio la foto: sirve para ver desde el superadmin
    // que tiendas quedaron atrasadas sin tener que preguntarle a cada una.
    version: app.getVersion(),
    dian_on: dianOn,
    hoy: {
      ventas_num: vHoy?.num ?? 0,
      ventas_bruto: bruto,
      devoluciones: dev,
      ndev: devHoy?.ndev ?? 0,
      // Las ventas no pueden ser negativas: si una devolución de otro turno deja
      // el neto en negativo, se muestra 0.
      neto: Math.max(0, bruto - dev),
      gastos,
      // La utilidad SÍ puede ir en negativo: si el turno cerró en pérdida el
      // dueño tiene que verlo, no un $0 que lo tape.
      utilidad,
      ganancia_neta: utilidad - gastos
    },
    mes: {
      ventas_num: mes?.num ?? 0,
      // `total` es el NETO del mes (ventas − devoluciones), que es lo que muestra
      // el Panel; el bruto queda aparte por si se necesita el desglose.
      total: Math.max(0, (mes?.bruto ?? 0) - (devMes?.monto ?? 0)),
      bruto: mes?.bruto ?? 0,
      devoluciones: devMes?.monto ?? 0,
      utilidad: r(
        (utilMes?.ingreso ?? 0) - (utilDevMes?.base ?? 0) - ((utilMes?.costo ?? 0) - (utilDevMes?.costo ?? 0))
      )
    },
    caja: caja
      ? { abierta: true, desde: caja.fecha_apertura, base: caja.monto_inicial }
      : { abierta: false },
    top,
    top_mes: topMes,
    vendedores_hoy: vendedoresHoy,
    vendedores_mes: vendedoresMes,
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
    ventas_detalle: ventasDet,
    ventas_dias: ventasDias,
    comparativo: {
      ayer_neto: (vAyer?.bruto ?? 0) - (devAyer?.monto ?? 0),
      mes_pasado_total: Math.max(0, (mesPasado?.total ?? 0) - (devMesPasado?.monto ?? 0)),
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

  // `num` no cuenta las ventas devueltas por completo (igual que el resto del sistema)
  const ventasDia = query<{ fecha: string; num: number; total: number }>(
    `SELECT date(fecha) as fecha,
            COALESCE(SUM(CASE WHEN ventas.total > 0 AND
              COALESCE((SELECT SUM(dd.total) FROM devoluciones dd WHERE dd.venta_id = ventas.id),0) >= ventas.total
            THEN 0 ELSE 1 END),0) as num,
            COALESCE(SUM(total),0) as total
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
