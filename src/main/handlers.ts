import { ipcMain, dialog, app } from 'electron'
import { writeFileSync } from 'fs'
import { query, queryOne, insert, run, transaction, persist, getDb } from './db'
import { facturarVenta, probarConexion } from './dian'
import { imprimirTicket, imprimirCierre, listarImpresoras, imprimirEtiquetas, etiquetasPdf, imprimirPrecuenta } from './printer'
import { publicarCarta } from './carta'
import { leerImportacion, guardarImportacion, generarPlantilla } from './importar'
import { hashPassword, verifyPassword } from './auth'
import { crearBackupAutomatico, listarBackups, exportarDb, importarDb } from './backup'
import { estadoLicencia, estadoLicenciaRapido, activarLicencia } from './licencia'
import { subirRespaldo, bajarRespaldo, ultimoRespaldo, subirResumen } from './respaldoNube'
import type { SqlValue } from 'sql.js'

/**
 * Registra todos los canales IPC. El frontend (renderer) los invoca a traves
 * del objeto `window.api` expuesto en preload.
 */
export function registerHandlers(): void {
  // Versión de la app (para mostrarla en la interfaz)
  ipcMain.handle('app:version', () => app.getVersion())

  // ---------- LICENCIA ----------
  ipcMain.handle('licencia:estado', () => estadoLicencia())
  ipcMain.handle('licencia:estadoRapido', () => estadoLicenciaRapido())
  ipcMain.handle('licencia:activar', (_e, codigo: string) => activarLicencia(codigo))
  ipcMain.handle('licencia:cambiar', () => {
    // Recordar la licencia actual para detectar cambio de tienda al reactivar
    const actual = queryOne<{ valor: string }>("SELECT valor FROM config WHERE clave = 'licencia_codigo'")
    if (actual?.valor) {
      run(
        "INSERT INTO config (clave, valor) VALUES ('licencia_anterior', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
        [actual.valor]
      )
    }
    run(
      "DELETE FROM config WHERE clave IN ('licencia_codigo','licencia_ultimo_ok','licencia_nombre','config_central')"
    )
    return true
  })

  // ---------- RESPALDO EN LA NUBE ----------
  ipcMain.handle('nube:subir', () => subirRespaldo())
  ipcMain.handle('nube:ultimo', () => ultimoRespaldo())
  ipcMain.handle('nube:restaurar', async (_e, licencia?: string) => {
    const r = await bajarRespaldo(licencia)
    if (r.ok) {
      app.relaunch()
      app.exit(0)
    }
    return r
  })

  // ---------- AUTENTICACION ----------
  ipcMain.handle('auth:login', (_e, usuario: string, password: string) => {
    const user = queryOne<any>(
      'SELECT id, nombre, usuario, rol, password FROM usuarios WHERE usuario = ? AND activo = 1',
      [usuario]
    )
    if (!user || !verifyPassword(password, user.password)) return null
    return { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol }
  })

  // ---------- USUARIOS ----------
  ipcMain.handle('usuarios:list', () =>
    query('SELECT id, nombre, usuario, rol, activo, creado_en FROM usuarios ORDER BY nombre')
  )

  ipcMain.handle('usuarios:save', (_e, data: any) => {
    if (data.id) {
      // Actualizar; solo cambia la contraseña si se envió una nueva
      if (data.password) {
        run('UPDATE usuarios SET nombre=?, usuario=?, rol=?, activo=?, password=? WHERE id=?', [
          data.nombre,
          data.usuario,
          data.rol,
          data.activo ? 1 : 0,
          hashPassword(data.password),
          data.id
        ])
      } else {
        run('UPDATE usuarios SET nombre=?, usuario=?, rol=?, activo=? WHERE id=?', [
          data.nombre,
          data.usuario,
          data.rol,
          data.activo ? 1 : 0,
          data.id
        ])
      }
      return data.id
    }
    // Crear
    const existe = queryOne('SELECT id FROM usuarios WHERE usuario = ?', [data.usuario])
    if (existe) throw new Error('Ya existe un usuario con ese nombre de acceso')
    return insert('INSERT INTO usuarios (nombre, usuario, rol, activo, password) VALUES (?,?,?,?,?)', [
      data.nombre,
      data.usuario,
      data.rol ?? 'cajero',
      data.activo === false ? 0 : 1,
      hashPassword(data.password || '1234')
    ])
  })

  ipcMain.handle('usuarios:toggle', (_e, id: number, activo: boolean) => {
    run('UPDATE usuarios SET activo = ? WHERE id = ?', [activo ? 1 : 0, id])
    return true
  })

  ipcMain.handle('usuarios:eliminar', (_e, id: number) => {
    const u = queryOne<any>('SELECT rol FROM usuarios WHERE id = ?', [id])
    if (!u) return { ok: false, error: 'Usuario no encontrado.' }
    // No permitir borrar el último administrador (quedaría el equipo sin acceso admin)
    if (u.rol === 'admin') {
      const admins = queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin'")
      if ((admins?.n ?? 0) <= 1) return { ok: false, error: 'No puedes eliminar el último administrador.' }
    }
    // Desvincular referencias para conservar el historial (ventas, caja, etc.)
    for (const t of ['ventas', 'caja_sesiones', 'comandas', 'compras', 'gastos', 'movimientos_inventario']) {
      try {
        getDb().run(`UPDATE ${t} SET usuario_id = NULL WHERE usuario_id = ?`, [id])
      } catch {
        /* la tabla puede no tener usuario_id */
      }
    }
    try {
      run('DELETE FROM usuarios WHERE id = ?', [id])
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo eliminar (tiene registros asociados). Mejor desactívalo.' }
    }
  })

  ipcMain.handle('usuarios:cambiarPassword', (_e, id: number, actual: string, nueva: string) => {
    const user = queryOne<any>('SELECT password FROM usuarios WHERE id = ?', [id])
    if (!user || !verifyPassword(actual, user.password)) {
      return { ok: false, error: 'La contraseña actual no es correcta' }
    }
    if (!nueva || nueva.length < 4) {
      return { ok: false, error: 'La nueva contraseña debe tener al menos 4 caracteres' }
    }
    run('UPDATE usuarios SET password = ? WHERE id = ?', [hashPassword(nueva), id])
    return { ok: true }
  })

  // ---------- CONFIGURACION ----------
  ipcMain.handle('config:getAll', () => {
    const rows = query<{ clave: string; valor: string }>('SELECT clave, valor FROM config')
    const cfg: Record<string, string> = {}
    for (const r of rows) cfg[r.clave] = r.valor
    return cfg
  })

  ipcMain.handle('config:set', (_e, clave: string, valor: string) => {
    run(
      'INSERT INTO config (clave, valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor',
      [clave, valor]
    )
    return true
  })

  // Reinicia los datos de la tienda (pasar de pruebas a operación real).
  // Borra ventas y movimientos; opcionalmente productos y clientes.
  // CONSERVA usuarios y configuración (licencia, datos de la tienda, impresora).
  ipcMain.handle('tienda:reiniciarDatos', (_e, borrarCatalogo: boolean) => {
    const db = getDb()
    const operativas = [
      'venta_pagos', 'venta_items', 'devolucion_items', 'devoluciones', 'ventas',
      'propinas', 'abonos', 'comanda_items', 'comandas', 'mesas',
      'movimientos_inventario', 'compra_items', 'compras', 'gastos', 'caja_sesiones'
    ]
    for (const t of operativas) {
      try {
        db.run('DELETE FROM ' + t)
      } catch {
        /* la tabla puede no existir */
      }
    }
    if (borrarCatalogo) {
      for (const t of ['variantes', 'productos', 'categorias', 'clientes']) {
        try {
          db.run('DELETE FROM ' + t)
        } catch {
          /* ignore */
        }
      }
    }
    try {
      db.run('DELETE FROM sqlite_sequence')
    } catch {
      /* ignore */
    }
    persist()
    return { ok: true }
  })

  // ---------- CATEGORIAS ----------
  ipcMain.handle('categorias:list', () =>
    query('SELECT * FROM categorias ORDER BY nombre')
  )
  ipcMain.handle('categorias:create', (_e, nombre: string) =>
    insert('INSERT INTO categorias (nombre) VALUES (?)', [nombre])
  )

  // ---------- PRODUCTOS + VARIANTES ----------
  ipcMain.handle('productos:list', (_e, filtro?: string) => {
    const productos = filtro
      ? query(
          `SELECT p.*, c.nombre as categoria
           FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
           WHERE p.activo = 1 AND (p.nombre LIKE ? OR p.sku LIKE ?)
           ORDER BY p.nombre`,
          [`%${filtro}%`, `%${filtro}%`]
        )
      : query(
          `SELECT p.*, c.nombre as categoria
           FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
           WHERE p.activo = 1 ORDER BY p.nombre`
        )
    // adjuntar variantes
    for (const p of productos as any[]) {
      p.variantes = query('SELECT * FROM variantes WHERE producto_id = ? ORDER BY talla, color', [
        p.id
      ])
    }
    return productos
  })

  ipcMain.handle('productos:get', (_e, id: number) => {
    const p = queryOne('SELECT * FROM productos WHERE id = ?', [id]) as any
    if (p) p.variantes = query('SELECT * FROM variantes WHERE producto_id = ?', [id])
    return p
  })

  ipcMain.handle('productos:save', (_e, data: any) => {
    let productoId = data.id as number | undefined
    transaction(() => {
      if (productoId) {
        // Nota: usar getDb().run (NO run()) dentro de una transacción, porque
        // run() persiste a disco y sql.js cierra/reabre la BD, abortando la transacción.
        getDb().run(
          `UPDATE productos SET sku=?, nombre=?, categoria_id=?, marca=?,
             precio_compra=?, precio_venta=?, iva_porcentaje=? WHERE id=?`,
          [
            data.sku ?? null,
            data.nombre,
            data.categoria_id ?? null,
            data.marca ?? null,
            data.precio_compra ?? 0,
            data.precio_venta ?? 0,
            data.iva_porcentaje ?? 19,
            productoId
          ]
        )
      } else {
        getDb().run(
          `INSERT INTO productos (sku, nombre, categoria_id, marca, precio_compra, precio_venta, iva_porcentaje)
           VALUES (?,?,?,?,?,?,?)`,
          [
            data.sku ?? null,
            data.nombre,
            data.categoria_id ?? null,
            data.marca ?? null,
            data.precio_compra ?? 0,
            data.precio_venta ?? 0,
            data.iva_porcentaje ?? 19
          ]
        )
        productoId = (queryOne<{ id: number }>('SELECT last_insert_rowid() as id') as any).id
      }

      // Sincronizar variantes
      const variantes = (data.variantes ?? []) as any[]
      const idsRecibidos = variantes.filter((v) => v.id).map((v) => v.id)
      // eliminar las que ya no estan
      const existentes = query<{ id: number }>('SELECT id FROM variantes WHERE producto_id = ?', [
        productoId!
      ])
      for (const e of existentes) {
        if (!idsRecibidos.includes(e.id)) {
          getDb().run('DELETE FROM variantes WHERE id = ?', [e.id])
        }
      }
      for (const v of variantes) {
        if (v.id) {
          getDb().run(
            'UPDATE variantes SET talla=?, color=?, codigo_barras=?, stock=?, stock_minimo=? WHERE id=?',
            [v.talla ?? null, v.color ?? null, v.codigo_barras ?? null, v.stock ?? 0, v.stock_minimo ?? 0, v.id]
          )
        } else {
          getDb().run(
            'INSERT INTO variantes (producto_id, talla, color, codigo_barras, stock, stock_minimo) VALUES (?,?,?,?,?,?)',
            [productoId!, v.talla ?? null, v.color ?? null, v.codigo_barras ?? null, v.stock ?? 0, v.stock_minimo ?? 0]
          )
        }
      }
    })
    return productoId
  })

  ipcMain.handle('productos:delete', (_e, id: number) => {
    run('UPDATE productos SET activo = 0 WHERE id = ?', [id])
    return true
  })

  // Kardex: historial de movimientos de una variante
  ipcMain.handle('inventario:kardex', (_e, varianteId: number) => {
    const variante = queryOne(
      `SELECT v.*, p.nombre as producto_nombre FROM variantes v
       JOIN productos p ON p.id = v.producto_id WHERE v.id = ?`,
      [varianteId]
    )
    const movimientos = query(
      'SELECT * FROM movimientos_inventario WHERE variante_id = ? ORDER BY id DESC LIMIT 200',
      [varianteId]
    )
    return { variante, movimientos }
  })

  // Ajuste de inventario (conteo físico): fija el stock y registra el movimiento
  ipcMain.handle('inventario:ajustar', (_e, varianteId: number, nuevoStock: number, motivo: string) => {
    const actual = queryOne<{ stock: number }>('SELECT stock FROM variantes WHERE id = ?', [varianteId])
    if (!actual) throw new Error('Variante no encontrada')
    const delta = nuevoStock - actual.stock
    transaction(() => {
      getDb().run('UPDATE variantes SET stock = ? WHERE id = ?', [nuevoStock, varianteId])
      getDb().run(
        "INSERT INTO movimientos_inventario (variante_id, tipo, cantidad, motivo) VALUES (?, 'ajuste', ?, ?)",
        [varianteId, delta, motivo || 'Ajuste manual']
      )
    })
    return { ok: true, delta }
  })

  ipcMain.handle('variantes:buscarPorCodigo', (_e, codigo: string) =>
    queryOne(
      `SELECT v.*, p.nombre as producto_nombre, p.precio_venta, p.iva_porcentaje
       FROM variantes v JOIN productos p ON p.id = v.producto_id
       WHERE v.codigo_barras = ? AND p.activo = 1`,
      [codigo]
    )
  )

  // ---------- CLIENTES ----------
  ipcMain.handle('clientes:list', (_e, filtro?: string) =>
    filtro
      ? query(
          'SELECT * FROM clientes WHERE nombre LIKE ? OR numero_documento LIKE ? ORDER BY nombre',
          [`%${filtro}%`, `%${filtro}%`]
        )
      : query('SELECT * FROM clientes ORDER BY nombre LIMIT 100')
  )

  ipcMain.handle('clientes:save', (_e, data: any) => {
    if (data.id) {
      run(
        'UPDATE clientes SET tipo_documento=?, numero_documento=?, nombre=?, email=?, telefono=?, direccion=? WHERE id=?',
        [data.tipo_documento, data.numero_documento, data.nombre, data.email, data.telefono, data.direccion, data.id]
      )
      return data.id
    }
    return insert(
      'INSERT INTO clientes (tipo_documento, numero_documento, nombre, email, telefono, direccion) VALUES (?,?,?,?,?,?)',
      [data.tipo_documento ?? 'CC', data.numero_documento ?? null, data.nombre, data.email ?? null, data.telefono ?? null, data.direccion ?? null]
    )
  })

  ipcMain.handle('clientes:delete', (_e, id: number) => {
    // Cuántas ventas quedarán como "Consumidor final"
    const ventas = queryOne<{ n: number }>('SELECT COUNT(*) as n FROM ventas WHERE cliente_id = ?', [id])
    transaction(() => {
      getDb().run('UPDATE ventas SET cliente_id = NULL WHERE cliente_id = ?', [id])
      getDb().run('DELETE FROM clientes WHERE id = ?', [id])
    })
    return { ok: true, ventasAfectadas: ventas?.n ?? 0 }
  })

  // ---------- VENTAS ----------
  ipcMain.handle('ventas:crear', (_e, venta: any) => registrarVenta(venta))

  ipcMain.handle('ventas:get', (_e, id: number) => obtenerVenta(id))

  ipcMain.handle('ventas:list', (_e, limit = 100) =>
    query(
      `SELECT v.*, c.nombre as cliente_nombre,
         COALESCE((SELECT SUM(d.total) FROM devoluciones d WHERE d.venta_id = v.id), 0) as devuelto
       FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id
       ORDER BY v.id DESC LIMIT ?`,
      [limit]
    )
  )

  // Emitir factura electronica DIAN para una venta existente
  ipcMain.handle('dian:probar', () => probarConexion())

  ipcMain.handle('ventas:facturarDian', async (_e, ventaId: number) => {
    const venta = obtenerVenta(ventaId)
    const resultado = await facturarVenta(venta)
    run(
      'UPDATE ventas SET dian_estado=?, dian_cufe=?, dian_numero=?, dian_qr=?, dian_mensaje=? WHERE id=?',
      [
        resultado.estado,
        resultado.cufe ?? null,
        resultado.numero ?? null,
        resultado.qr ?? null,
        resultado.mensaje ?? null,
        ventaId
      ]
    )
    return resultado
  })

  // ---------- MESAS / COMANDAS ----------
  ipcMain.handle('mesas:list', () =>
    query(
      `SELECT m.*,
         c.id as comanda_id,
         COALESCE((SELECT SUM(ci.precio_unitario * ci.cantidad)
                   FROM comanda_items ci WHERE ci.comanda_id = c.id), 0) as total,
         COALESCE((SELECT SUM(ci.cantidad)
                   FROM comanda_items ci WHERE ci.comanda_id = c.id), 0) as items
       FROM mesas m
       LEFT JOIN comandas c ON c.mesa_id = m.id AND c.estado = 'abierta'
       ORDER BY m.orden, m.id`
    )
  )

  ipcMain.handle('mesas:crear', (_e, nombre: string, zona?: string) =>
    insert('INSERT INTO mesas (nombre, zona) VALUES (?,?)', [nombre, zona ?? null])
  )

  ipcMain.handle('mesas:eliminar', (_e, id: number) => {
    const m = queryOne<any>('SELECT estado FROM mesas WHERE id = ?', [id])
    if (m && m.estado === 'ocupada') throw new Error('No se puede eliminar una mesa ocupada')
    run('DELETE FROM mesas WHERE id = ?', [id])
    return true
  })

  ipcMain.handle('mesas:renombrar', (_e, id: number, nombre: string) => {
    run('UPDATE mesas SET nombre = ? WHERE id = ?', [String(nombre || '').trim() || 'Mesa', id])
    return true
  })

  // Libera una mesa SIN cobrar: cancela la comanda abierta y descarta sus consumos.
  ipcMain.handle('mesas:liberar', (_e, mesaId: number, motivo?: string) => {
    const comanda = queryOne<any>("SELECT id FROM comandas WHERE mesa_id = ? AND estado = 'abierta'", [mesaId])
    if (comanda) {
      run('DELETE FROM comanda_items WHERE comanda_id = ?', [comanda.id])
      run(
        "UPDATE comandas SET estado = 'cancelada', fecha_cierre = datetime('now','localtime'), notas = ? WHERE id = ?",
        [motivo ?? 'Liberada sin cobrar', comanda.id]
      )
    }
    run("UPDATE mesas SET estado = 'libre' WHERE id = ?", [mesaId])
    return true
  })

  // Obtiene la comanda abierta de una mesa (con sus items). La crea si no existe.
  ipcMain.handle('comanda:abrir', (_e, mesaId: number, usuarioId: number) => {
    let comanda = queryOne<any>("SELECT * FROM comandas WHERE mesa_id = ? AND estado = 'abierta'", [mesaId])
    if (!comanda) {
      const id = insert('INSERT INTO comandas (mesa_id, usuario_id) VALUES (?,?)', [mesaId, usuarioId ?? null])
      run("UPDATE mesas SET estado = 'ocupada' WHERE id = ?", [mesaId])
      comanda = queryOne<any>('SELECT * FROM comandas WHERE id = ?', [id])
    }
    comanda.items = query('SELECT * FROM comanda_items WHERE comanda_id = ?', [comanda.id])
    return comanda
  })

  ipcMain.handle('comanda:agregarItem', (_e, comandaId: number, item: any) => {
    insert(
      `INSERT INTO comanda_items (comanda_id, variante_id, producto_nombre, cantidad, precio_unitario, iva_porcentaje, notas)
       VALUES (?,?,?,?,?,?,?)`,
      [
        comandaId,
        item.variante_id ?? null,
        item.producto_nombre,
        item.cantidad,
        item.precio_unitario,
        item.iva_porcentaje ?? 0,
        item.notas ?? null
      ]
    )
    return query('SELECT * FROM comanda_items WHERE comanda_id = ?', [comandaId])
  })

  ipcMain.handle('comanda:cambiarCantidad', (_e, itemId: number, cantidad: number) => {
    if (cantidad <= 0) run('DELETE FROM comanda_items WHERE id = ?', [itemId])
    else run('UPDATE comanda_items SET cantidad = ? WHERE id = ?', [cantidad, itemId])
    return true
  })

  // Cobrar una comanda: la convierte en venta, cierra la comanda y libera la mesa.
  ipcMain.handle('comanda:cobrar', (_e, comandaId: number, pago: any) => {
    const comanda = queryOne<any>('SELECT * FROM comandas WHERE id = ?', [comandaId])
    if (!comanda) throw new Error('Comanda no encontrada')
    const items = query<any>('SELECT * FROM comanda_items WHERE comanda_id = ?', [comandaId])
    if (items.length === 0) throw new Error('La mesa no tiene consumos')

    const ventaItems = items.map((it) => ({
      variante_id: it.variante_id,
      producto_nombre: it.producto_nombre,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      iva_porcentaje: it.iva_porcentaje,
      subtotal: it.precio_unitario * it.cantidad
    }))

    const venta = registrarVenta({ ...pago, items: ventaItems })

    run("UPDATE comandas SET estado = 'cerrada', fecha_cierre = datetime('now','localtime'), venta_id = ? WHERE id = ?", [
      venta.id,
      comandaId
    ])
    run("UPDATE mesas SET estado = 'libre' WHERE id = ?", [comanda.mesa_id])
    return venta
  })

  // Imprime la PRECUENTA (cuenta sin cobrar). itemIds opcional = solo esa parte (cuenta dividida).
  ipcMain.handle('comanda:precuenta', (_e, comandaId: number, itemIds?: number[], parte?: { n: number; de: number }) => {
    const comanda = queryOne<any>(
      'SELECT c.*, m.nombre AS mesa_nombre FROM comandas c LEFT JOIN mesas m ON m.id = c.mesa_id WHERE c.id = ?',
      [comandaId]
    )
    if (!comanda) throw new Error('Comanda no encontrada')
    let items = query<any>('SELECT * FROM comanda_items WHERE comanda_id = ?', [comandaId])
    if (itemIds && itemIds.length) items = items.filter((i) => itemIds.includes(i.id))
    if (!items.length) throw new Error('No hay productos para la cuenta')
    const total = items.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)
    const datos = {
      mesa: comanda.mesa_nombre ?? 'Cuenta',
      fecha: new Date().toLocaleString('es-CO'),
      items,
      total,
      parte
    }
    return imprimirPrecuenta(datos, obtenerConfig())
  })

  // Cobro PARCIAL: cobra solo los productos seleccionados (dividir la cuenta).
  // Crea una venta con esos items, los quita de la comanda y, si ya no quedan, libera la mesa.
  ipcMain.handle('comanda:cobrarParcial', (_e, comandaId: number, itemIds: number[], pago: any) => {
    const comanda = queryOne<any>('SELECT * FROM comandas WHERE id = ?', [comandaId])
    if (!comanda) throw new Error('Comanda no encontrada')
    const todos = query<any>('SELECT * FROM comanda_items WHERE comanda_id = ?', [comandaId])
    const sel = todos.filter((i) => (itemIds ?? []).includes(i.id))
    if (!sel.length) throw new Error('Selecciona al menos un producto para cobrar')

    const ventaItems = sel.map((it) => ({
      variante_id: it.variante_id,
      producto_nombre: it.producto_nombre,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      iva_porcentaje: it.iva_porcentaje,
      subtotal: it.precio_unitario * it.cantidad
    }))
    const venta = registrarVenta({ ...pago, items: ventaItems })

    run(`DELETE FROM comanda_items WHERE id IN (${sel.map(() => '?').join(',')})`, sel.map((i) => i.id))
    const restantes = query<any>('SELECT id FROM comanda_items WHERE comanda_id = ?', [comandaId])
    if (!restantes.length) {
      run("UPDATE comandas SET estado = 'cerrada', fecha_cierre = datetime('now','localtime'), venta_id = ? WHERE id = ?", [
        venta.id,
        comandaId
      ])
      run("UPDATE mesas SET estado = 'libre' WHERE id = ?", [comanda.mesa_id])
    }
    return { venta, quedanItems: restantes.length }
  })

  // ---------- FIADO / CUENTAS POR COBRAR ----------
  // Clientes que deben (ventas fiadas menos abonos).
  ipcMain.handle('fiado:cuentas', () =>
    query(
      `SELECT c.id, c.nombre, c.telefono, c.numero_documento,
              COALESCE(f.total, 0) AS fiado,
              COALESCE(a.total, 0) AS abonado,
              COALESCE(f.total, 0) - COALESCE(a.total, 0) AS saldo
         FROM clientes c
         LEFT JOIN (SELECT cliente_id, SUM(total) total FROM ventas
                     WHERE metodo_pago = 'fiado' AND estado = 'completada' GROUP BY cliente_id) f ON f.cliente_id = c.id
         LEFT JOIN (SELECT cliente_id, SUM(monto) total FROM abonos GROUP BY cliente_id) a ON a.cliente_id = c.id
        WHERE COALESCE(f.total, 0) - COALESCE(a.total, 0) > 0
        ORDER BY saldo DESC`
    )
  )

  ipcMain.handle('fiado:detalle', (_e, clienteId: number) => {
    const cliente = queryOne('SELECT * FROM clientes WHERE id = ?', [clienteId])
    const ventas = query<any>(
      "SELECT id, numero, fecha, total FROM ventas WHERE cliente_id = ? AND metodo_pago = 'fiado' AND estado = 'completada' ORDER BY fecha DESC",
      [clienteId]
    )
    const abonos = query<any>('SELECT id, fecha, monto, metodo, nota FROM abonos WHERE cliente_id = ? ORDER BY fecha DESC', [
      clienteId
    ])
    const fiado = ventas.reduce((s, v) => s + v.total, 0)
    const abonado = abonos.reduce((s, a) => s + a.monto, 0)
    return { cliente, ventas, abonos, fiado, abonado, saldo: fiado - abonado }
  })

  ipcMain.handle('fiado:abonar', (_e, data: any) => {
    const monto = Math.round(Number(data.monto || 0))
    if (!data.cliente_id) return { ok: false, error: 'Falta el cliente.' }
    if (monto <= 0) return { ok: false, error: 'El monto debe ser mayor a 0.' }
    const fiado =
      queryOne<{ t: number }>(
        "SELECT COALESCE(SUM(total),0) t FROM ventas WHERE cliente_id = ? AND metodo_pago = 'fiado' AND estado = 'completada'",
        [data.cliente_id]
      )?.t ?? 0
    const abonado =
      queryOne<{ t: number }>('SELECT COALESCE(SUM(monto),0) t FROM abonos WHERE cliente_id = ?', [data.cliente_id])?.t ?? 0
    const saldo = fiado - abonado
    if (monto > saldo) return { ok: false, error: 'El abono supera el saldo pendiente (' + saldo + ').' }
    const sesion = sesionAbierta()
    insert('INSERT INTO abonos (cliente_id, sesion_id, usuario_id, metodo, monto, nota) VALUES (?,?,?,?,?,?)', [
      data.cliente_id,
      sesion?.id ?? null,
      data.usuario_id ?? null,
      data.metodo ?? 'efectivo',
      monto,
      data.nota ?? null
    ])
    return { ok: true, saldo: saldo - monto }
  })

  // ---------- IMPRESION ----------
  ipcMain.handle('imprimir:ticket', async (_e, ventaId: number) => {
    const venta = obtenerVenta(ventaId)
    const cfg = obtenerConfig()
    return imprimirTicket(venta, cfg)
  })

  ipcMain.handle('imprimir:listar', () => listarImpresoras())
  ipcMain.handle('imprimir:etiquetas', (_e, html: string) => imprimirEtiquetas(html))
  ipcMain.handle('imprimir:etiquetasPdf', (_e, html: string) => etiquetasPdf(html))

  // ---------- CARTA DIGITAL (QR por mesa) ----------
  ipcMain.handle('carta:publicar', () => publicarCarta())

  // ---------- IMPORTAR PRODUCTOS (Excel/CSV) ----------
  ipcMain.handle('productos:importarLeer', () => leerImportacion())
  ipcMain.handle('productos:importarGuardar', (_e, productos: any[]) => guardarImportacion(productos))
  ipcMain.handle('productos:plantilla', () => generarPlantilla())

  // ---------- RESPALDOS ----------
  ipcMain.handle('backup:crear', () => {
    const ruta = crearBackupAutomatico()
    return { ok: !!ruta, ruta }
  })
  ipcMain.handle('backup:listar', () => listarBackups())
  ipcMain.handle('backup:exportar', () => exportarDb())
  ipcMain.handle('backup:importar', () => importarDb())

  // ---------- CAJA (apertura / cierre / arqueo) ----------
  ipcMain.handle('caja:actual', () => sesionAbierta())

  ipcMain.handle('caja:abrir', (_e, montoInicial: number, usuarioId: number) => {
    if (sesionAbierta()) throw new Error('Ya hay una caja abierta')
    const id = insert(
      'INSERT INTO caja_sesiones (usuario_apertura_id, monto_inicial, estado) VALUES (?,?,?)',
      [usuarioId ?? null, montoInicial ?? 0, 'abierta']
    )
    return queryOne('SELECT * FROM caja_sesiones WHERE id = ?', [id])
  })

  // Resumen en vivo de la sesion (para mostrar antes de cerrar)
  ipcMain.handle('caja:resumen', (_e, sesionId?: number) => {
    const sesion = sesionId
      ? (queryOne('SELECT * FROM caja_sesiones WHERE id = ?', [sesionId]) as any)
      : (sesionAbierta() as any)
    if (!sesion) return null
    return resumenSesion(sesion)
  })

  ipcMain.handle('caja:cerrar', (_e, sesionId: number, montoContado: number, usuarioId: number, notas: string) => {
    const sesion = queryOne('SELECT * FROM caja_sesiones WHERE id = ?', [sesionId]) as any
    if (!sesion || sesion.estado === 'cerrada') throw new Error('La caja no está abierta')
    const r = resumenSesion(sesion)
    const esperado = r.efectivo_esperado
    const diferencia = (montoContado ?? 0) - esperado
    run(
      `UPDATE caja_sesiones SET fecha_cierre = datetime('now','localtime'), usuario_cierre_id = ?,
         monto_esperado = ?, monto_contado = ?, diferencia = ?, estado = 'cerrada', notas = ? WHERE id = ?`,
      [usuarioId ?? null, esperado, montoContado ?? 0, diferencia, notas ?? null, sesionId]
    )
    // Respaldo + resumen a la nube al cerrar caja (en segundo plano, no bloquea)
    subirRespaldo().catch(() => {})
    subirResumen().catch(() => {})
    return { ...r, monto_contado: montoContado, diferencia }
  })

  // Imprimir reporte de cierre (Z) de una sesión
  ipcMain.handle('caja:imprimirCierre', (_e, sesionId: number) => {
    const sesion = queryOne(
      `SELECT s.*, ua.nombre as cajero_apertura, uc.nombre as cajero_cierre
       FROM caja_sesiones s
       LEFT JOIN usuarios ua ON ua.id = s.usuario_apertura_id
       LEFT JOIN usuarios uc ON uc.id = s.usuario_cierre_id
       WHERE s.id = ?`,
      [sesionId]
    ) as any
    if (!sesion) throw new Error('Sesión no encontrada')
    const r = resumenSesion(sesion)
    const data = {
      numero: sesion.id,
      apertura: sesion.fecha_apertura,
      cierre: sesion.fecha_cierre,
      cajero_apertura: sesion.cajero_apertura,
      monto_inicial: r.monto_inicial,
      ventas_efectivo: r.ventas_efectivo,
      ventas_tarjeta: r.ventas_tarjeta,
      ventas_transferencia: r.ventas_transferencia,
      devoluciones_efectivo: r.devoluciones_efectivo,
      gastos_efectivo: r.gastos_efectivo,
      efectivo_esperado: r.efectivo_esperado,
      monto_contado: sesion.monto_contado ?? r.efectivo_esperado,
      diferencia: sesion.diferencia ?? 0,
      num_ventas: r.num_ventas,
      total_ventas: r.total_ventas
    }
    return imprimirCierre(data, obtenerConfig())
  })

  ipcMain.handle('caja:historial', (_e, limit = 50) =>
    query(
      `SELECT s.*, ua.nombre as usuario_apertura, uc.nombre as usuario_cierre
       FROM caja_sesiones s
       LEFT JOIN usuarios ua ON ua.id = s.usuario_apertura_id
       LEFT JOIN usuarios uc ON uc.id = s.usuario_cierre_id
       ORDER BY s.id DESC LIMIT ?`,
      [limit]
    )
  )

  // ---------- DEVOLUCIONES ----------
  // Cantidades ya devueltas por cada item de una venta (para no exceder)
  ipcMain.handle('devoluciones:porVenta', (_e, ventaId: number) => {
    const items = query(
      `SELECT vi.*,
         COALESCE((SELECT SUM(di.cantidad) FROM devolucion_items di WHERE di.venta_item_id = vi.id), 0) as devuelto
       FROM venta_items vi WHERE vi.venta_id = ?`,
      [ventaId]
    )
    const devoluciones = query(
      'SELECT * FROM devoluciones WHERE venta_id = ? ORDER BY id DESC',
      [ventaId]
    )
    return { items, devoluciones }
  })

  ipcMain.handle('devoluciones:crear', (_e, data: any) => {
    const sesion = sesionAbierta() as any
    let devolucionId = 0
    transaction(() => {
      const total = (data.items as any[]).reduce((s, it) => s + it.precio_unitario * it.cantidad, 0)
      getDb().run(
        `INSERT INTO devoluciones (venta_id, sesion_id, usuario_id, motivo, metodo, total)
         VALUES (?,?,?,?,?,?)`,
        [
          data.venta_id,
          sesion ? sesion.id : null,
          data.usuario_id ?? null,
          data.motivo ?? null,
          data.metodo ?? 'efectivo',
          total
        ]
      )
      devolucionId = (queryOne<{ id: number }>('SELECT last_insert_rowid() as id') as any).id

      for (const it of data.items as any[]) {
        getDb().run(
          `INSERT INTO devolucion_items (devolucion_id, venta_item_id, variante_id, producto_nombre,
             talla, color, cantidad, precio_unitario, subtotal)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            devolucionId,
            it.venta_item_id,
            it.variante_id ?? null,
            it.producto_nombre,
            it.talla ?? null,
            it.color ?? null,
            it.cantidad,
            it.precio_unitario,
            it.precio_unitario * it.cantidad
          ]
        )
        // reingresar stock
        if (it.variante_id) {
          getDb().run('UPDATE variantes SET stock = stock + ? WHERE id = ?', [it.cantidad, it.variante_id])
          getDb().run(
            "INSERT INTO movimientos_inventario (variante_id, tipo, cantidad, motivo) VALUES (?, 'devolucion', ?, ?)",
            [it.variante_id, it.cantidad, 'Devolución venta #' + data.venta_id]
          )
        }
      }
    })
    return queryOne('SELECT * FROM devoluciones WHERE id = ?', [devolucionId])
  })

  // ---------- PROVEEDORES ----------
  ipcMain.handle('proveedores:list', (_e, filtro?: string) =>
    filtro
      ? query('SELECT * FROM proveedores WHERE nombre LIKE ? OR nit LIKE ? ORDER BY nombre', [
          `%${filtro}%`,
          `%${filtro}%`
        ])
      : query('SELECT * FROM proveedores ORDER BY nombre')
  )
  ipcMain.handle('proveedores:save', (_e, data: any) => {
    if (data.id) {
      run('UPDATE proveedores SET nombre=?, nit=?, telefono=?, email=?, direccion=? WHERE id=?', [
        data.nombre,
        data.nit ?? null,
        data.telefono ?? null,
        data.email ?? null,
        data.direccion ?? null,
        data.id
      ])
      return data.id
    }
    return insert(
      'INSERT INTO proveedores (nombre, nit, telefono, email, direccion) VALUES (?,?,?,?,?)',
      [data.nombre, data.nit ?? null, data.telefono ?? null, data.email ?? null, data.direccion ?? null]
    )
  })

  // ---------- COMPRAS / ENTRADA DE MERCANCIA ----------
  ipcMain.handle('compras:crear', (_e, compra: any) => {
    let compraId = 0
    let numero = ''
    transaction(() => {
      const ultimo = queryOne<{ n: number }>('SELECT COUNT(*) as n FROM compras')
      numero = 'C' + String((ultimo?.n ?? 0) + 1).padStart(6, '0')
      const total = (compra.items as any[]).reduce((s, it) => s + it.costo_unitario * it.cantidad, 0)

      getDb().run(
        'INSERT INTO compras (numero, proveedor_id, usuario_id, total, notas) VALUES (?,?,?,?,?)',
        [numero, compra.proveedor_id ?? null, compra.usuario_id ?? null, total, compra.notas ?? null]
      )
      compraId = (queryOne<{ id: number }>('SELECT last_insert_rowid() as id') as any).id

      for (const it of compra.items as any[]) {
        getDb().run(
          `INSERT INTO compra_items (compra_id, variante_id, producto_nombre, talla, color, cantidad, costo_unitario, subtotal)
           VALUES (?,?,?,?,?,?,?,?)`,
          [
            compraId,
            it.variante_id,
            it.producto_nombre,
            it.talla ?? null,
            it.color ?? null,
            it.cantidad,
            it.costo_unitario,
            it.costo_unitario * it.cantidad
          ]
        )
        // aumentar stock y registrar movimiento
        getDb().run('UPDATE variantes SET stock = stock + ? WHERE id = ?', [it.cantidad, it.variante_id])
        getDb().run(
          "INSERT INTO movimientos_inventario (variante_id, tipo, cantidad, motivo) VALUES (?, 'entrada', ?, ?)",
          [it.variante_id, it.cantidad, 'Compra ' + numero]
        )
        // actualizar el costo del producto al último costo de compra
        getDb().run(
          'UPDATE productos SET precio_compra = ? WHERE id = (SELECT producto_id FROM variantes WHERE id = ?)',
          [it.costo_unitario, it.variante_id]
        )
      }
    })
    return queryOne('SELECT * FROM compras WHERE id = ?', [compraId])
  })

  ipcMain.handle('compras:list', (_e, limit = 100) =>
    query(
      `SELECT c.*, p.nombre as proveedor_nombre
       FROM compras c LEFT JOIN proveedores p ON p.id = c.proveedor_id
       ORDER BY c.id DESC LIMIT ?`,
      [limit]
    )
  )
  ipcMain.handle('compras:get', (_e, id: number) => {
    const c = queryOne(
      `SELECT c.*, p.nombre as proveedor_nombre FROM compras c
       LEFT JOIN proveedores p ON p.id = c.proveedor_id WHERE c.id = ?`,
      [id]
    ) as any
    if (c) c.items = query('SELECT * FROM compra_items WHERE compra_id = ?', [id])
    return c
  })

  // ---------- GASTOS / EGRESOS DE CAJA ----------
  ipcMain.handle('gastos:crear', (_e, data: any) => {
    const sesion = sesionAbierta() as any
    return insert(
      'INSERT INTO gastos (sesion_id, usuario_id, concepto, categoria, metodo, monto) VALUES (?,?,?,?,?,?)',
      [
        sesion ? sesion.id : null,
        data.usuario_id ?? null,
        data.concepto,
        data.categoria ?? null,
        data.metodo ?? 'efectivo',
        data.monto
      ]
    )
  })
  ipcMain.handle('gastos:list', (_e, sesionId?: number) =>
    sesionId
      ? query('SELECT * FROM gastos WHERE sesion_id = ? ORDER BY id DESC', [sesionId])
      : query('SELECT * FROM gastos ORDER BY id DESC LIMIT 100')
  )

  // ---------- REPORTES ----------
  ipcMain.handle('reportes:resumen', (_e, desde: string, hasta: string) => {
    const totales = queryOne(
      `SELECT COUNT(*) as num_ventas, COALESCE(SUM(total),0) as total_vendido,
              COALESCE(SUM(iva),0) as total_iva
       FROM ventas WHERE date(fecha) BETWEEN date(?) AND date(?) AND estado='completada'`,
      [desde, hasta]
    )
    const porDia = query(
      `SELECT date(fecha) as dia, COUNT(*) as ventas, SUM(total) as total
       FROM ventas WHERE date(fecha) BETWEEN date(?) AND date(?) AND estado='completada'
       GROUP BY date(fecha) ORDER BY dia`,
      [desde, hasta]
    )
    const topProductos = query(
      `SELECT vi.producto_nombre, SUM(vi.cantidad) as unidades, SUM(vi.subtotal) as total
       FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
       WHERE date(v.fecha) BETWEEN date(?) AND date(?)
       GROUP BY vi.producto_nombre ORDER BY unidades DESC LIMIT 10`,
      [desde, hasta]
    )
    const porMetodo = query(
      `SELECT metodo_pago, COUNT(*) as ventas, SUM(total) as total
       FROM ventas WHERE date(fecha) BETWEEN date(?) AND date(?) AND estado='completada'
       GROUP BY metodo_pago`,
      [desde, hasta]
    )
    // Utilidad estimada: ingreso sin IVA - costo de la mercancía vendida
    const utilidad = queryOne(
      `SELECT
         COALESCE(SUM(vi.subtotal),0) as ingreso_bruto,
         COALESCE(SUM((vi.precio_unitario * 1.0 / (1 + vi.iva_porcentaje/100.0)) * vi.cantidad),0) as ingreso_base,
         COALESCE(SUM(p.precio_compra * vi.cantidad),0) as costo
       FROM venta_items vi
       JOIN ventas v ON v.id = vi.venta_id
       LEFT JOIN variantes va ON va.id = vi.variante_id
       LEFT JOIN productos p ON p.id = va.producto_id
       WHERE date(v.fecha) BETWEEN date(?) AND date(?) AND v.estado='completada'`,
      [desde, hasta]
    ) as any
    // Utilidad "perdida" por devoluciones (se resta: el producto vuelve al stock y ya no deja ganancia)
    const utilDev = queryOne(
      `SELECT
         COALESCE(SUM((di.precio_unitario * 1.0 / (1 + COALESCE(p.iva_porcentaje,0)/100.0)) * di.cantidad),0) as base,
         COALESCE(SUM(p.precio_compra * di.cantidad),0) as costo
       FROM devolucion_items di
       JOIN devoluciones d ON d.id = di.devolucion_id
       LEFT JOIN variantes va ON va.id = di.variante_id
       LEFT JOIN productos p ON p.id = va.producto_id
       WHERE date(d.fecha) BETWEEN date(?) AND date(?)`,
      [desde, hasta]
    ) as any
    if (utilidad) {
      // Base y costo netos = ventas − devoluciones
      const baseNeta = Math.round((utilidad.ingreso_base ?? 0) - (utilDev?.base ?? 0))
      const costoNeto = Math.round((utilidad.costo ?? 0) - (utilDev?.costo ?? 0))
      utilidad.ingreso_base = baseNeta
      utilidad.costo = costoNeto
      utilidad.utilidad = Math.round(baseNeta - costoNeto)
      utilidad.margen = baseNeta > 0 ? Math.round((utilidad.utilidad / baseNeta) * 100) : 0
    }
    const devoluciones =
      queryOne<{ total: number; n: number }>(
        `SELECT COALESCE(SUM(total),0) as total, COUNT(*) as n
         FROM devoluciones WHERE date(fecha) BETWEEN date(?) AND date(?)`,
        [desde, hasta]
      ) ?? { total: 0, n: 0 }
    const neto = Number((totales as any)?.total_vendido ?? 0) - devoluciones.total

    // Fiado (ventas a crédito) vs cobrado (efectivo/tarjeta/transferencia)
    const fiado =
      queryOne<{ total: number; n: number }>(
        `SELECT COALESCE(SUM(total),0) as total, COUNT(*) as n
         FROM ventas WHERE date(fecha) BETWEEN date(?) AND date(?) AND estado='completada' AND metodo_pago='fiado'`,
        [desde, hasta]
      ) ?? { total: 0, n: 0 }
    const cobrado = Number((totales as any)?.total_vendido ?? 0) - fiado.total

    return { totales, porDia, topProductos, porMetodo, utilidad, devoluciones, neto, fiado, cobrado }
  })

  ipcMain.handle('reportes:stockBajo', () =>
    query(
      `SELECT p.nombre, v.talla, v.color, v.stock, v.stock_minimo
       FROM variantes v JOIN productos p ON p.id = v.producto_id
       WHERE v.stock <= v.stock_minimo AND p.activo = 1
       ORDER BY v.stock ASC`
    )
  )

  // ---------- EXPORTAR A EXCEL (CSV) ----------
  ipcMain.handle('reportes:exportar', async (_e, desde: string, hasta: string, detalle: boolean) => {
    const filas = detalle
      ? query(
          `SELECT v.numero, v.fecha, COALESCE(c.nombre,'Consumidor final') as cliente,
                  c.numero_documento as documento, vi.producto_nombre, vi.talla, vi.color,
                  vi.cantidad, vi.precio_unitario, vi.subtotal, v.metodo_pago, v.dian_estado
           FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
           LEFT JOIN clientes c ON c.id = v.cliente_id
           WHERE date(v.fecha) BETWEEN date(?) AND date(?) AND v.estado='completada'
           ORDER BY v.fecha, v.numero`,
          [desde, hasta]
        )
      : query(
          `SELECT v.numero, v.fecha, COALESCE(c.nombre,'Consumidor final') as cliente,
                  c.numero_documento as documento, v.metodo_pago, v.descuento,
                  v.subtotal, v.iva, v.total, v.dian_estado
           FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id
           WHERE date(v.fecha) BETWEEN date(?) AND date(?) AND v.estado='completada'
           ORDER BY v.fecha, v.numero`,
          [desde, hasta]
        )

    const cabeceras = detalle
      ? ['numero', 'fecha', 'cliente', 'documento', 'producto_nombre', 'talla', 'color', 'cantidad', 'precio_unitario', 'subtotal', 'metodo_pago', 'dian_estado']
      : ['numero', 'fecha', 'cliente', 'documento', 'metodo_pago', 'descuento', 'subtotal', 'iva', 'total', 'dian_estado']

    const esc = (v: any): string => '"' + String(v ?? '').replace(/"/g, '""') + '"'
    const lineas = [cabeceras.map((h) => esc(h)).join(';')]
    for (const f of filas as any[]) lineas.push(cabeceras.map((h) => esc(f[h])).join(';'))

    // fila de totales (solo en modo resumen)
    if (!detalle) {
      const tot = queryOne<any>(
        `SELECT COALESCE(SUM(descuento),0) d, COALESCE(SUM(subtotal),0) s, COALESCE(SUM(iva),0) i, COALESCE(SUM(total),0) t
         FROM ventas WHERE date(fecha) BETWEEN date(?) AND date(?) AND estado='completada'`,
        [desde, hasta]
      )
      lineas.push('')
      lineas.push(['"TOTALES"', '""', '""', '""', '""', esc(tot.d), esc(tot.s), esc(tot.i), esc(tot.t), '""'].join(';'))
    }

    const contenido = '﻿' + lineas.join('\r\n') // BOM para que Excel lea los acentos

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Exportar ventas a Excel',
      defaultPath: `ventas-${desde}_a_${hasta}${detalle ? '-detalle' : ''}.csv`,
      filters: [{ name: 'Excel (CSV)', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return { ok: false }
    writeFileSync(filePath, contenido, 'utf8')
    return { ok: true, ruta: filePath, filas: (filas as any[]).length }
  })
}

// ---- helpers ----

/** Crea una venta completa (usado por el POS y por el cobro de mesas). */
function registrarVenta(venta: any): any {
  const sesion = sesionAbierta()
  if (!sesion) throw new Error('CAJA_CERRADA')

  let ventaId = 0
  let numero = ''
  transaction(() => {
    const ultimo = queryOne<{ n: number }>('SELECT COUNT(*) as n FROM ventas')
    numero = 'V' + String((ultimo?.n ?? 0) + 1).padStart(6, '0')

    const propinaMonto = Math.round(Number(venta.propina ?? 0))
    const propinaModo = venta.propina_modo ?? 'factura'
    // La propina solo va DENTRO de la factura en modo 'factura'; en 'efectivo' es aparte.
    const propinaFactura = propinaModo === 'factura' ? propinaMonto : 0

    getDb().run(
      `INSERT INTO ventas (numero, cliente_id, usuario_id, sesion_id, subtotal, descuento, iva, total,
         metodo_pago, pago_recibido, cambio, propina, estado)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'completada')`,
      [
        numero,
        venta.cliente_id ?? null,
        venta.usuario_id ?? null,
        sesion.id,
        venta.subtotal,
        venta.descuento ?? 0,
        venta.iva ?? 0,
        venta.total,
        venta.metodo_pago ?? 'efectivo',
        venta.pago_recibido ?? venta.total,
        venta.cambio ?? 0,
        propinaFactura
      ]
    )
    ventaId = (queryOne<{ id: number }>('SELECT last_insert_rowid() as id') as any).id

    // Registro de la propina por mesero (para arqueo y reparto)
    if (propinaMonto > 0) {
      const enCaja = propinaModo === 'factura' && (venta.metodo_pago ?? 'efectivo') === 'efectivo' ? 1 : 0
      getDb().run(
        'INSERT INTO propinas (venta_id, sesion_id, mesero_id, usuario_id, metodo, en_caja, monto) VALUES (?,?,?,?,?,?,?)',
        [
          ventaId,
          sesion.id,
          venta.propina_mesero_id ?? venta.usuario_id ?? null,
          venta.usuario_id ?? null,
          propinaModo === 'factura' ? (venta.metodo_pago ?? 'efectivo') : 'efectivo',
          enCaja,
          propinaMonto
        ]
      )
    }

    const pagos: any[] =
      Array.isArray(venta.pagos) && venta.pagos.length
        ? venta.pagos
        : [{ metodo: venta.metodo_pago ?? 'efectivo', monto: venta.total }]
    for (const pago of pagos) {
      if (pago.monto > 0) {
        getDb().run('INSERT INTO venta_pagos (venta_id, metodo, monto) VALUES (?,?,?)', [
          ventaId,
          pago.metodo,
          pago.monto
        ])
      }
    }

    for (const item of venta.items as any[]) {
      getDb().run(
        `INSERT INTO venta_items (venta_id, variante_id, producto_nombre, talla, color,
           cantidad, precio_unitario, iva_porcentaje, subtotal)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          ventaId,
          item.variante_id ?? null,
          item.producto_nombre,
          item.talla ?? null,
          item.color ?? null,
          item.cantidad,
          item.precio_unitario,
          item.iva_porcentaje ?? 0,
          item.subtotal
        ]
      )
      if (item.variante_id) {
        getDb().run('UPDATE variantes SET stock = stock - ? WHERE id = ?', [item.cantidad, item.variante_id])
        getDb().run(
          "INSERT INTO movimientos_inventario (variante_id, tipo, cantidad, motivo) VALUES (?, 'venta', ?, ?)",
          [item.variante_id, -item.cantidad, 'Venta ' + numero]
        )
      }
    }
  })
  return obtenerVenta(ventaId)
}

function obtenerVenta(id: number): any {
  const venta = queryOne(
    `SELECT v.*, c.nombre as cliente_nombre, c.numero_documento as cliente_documento,
            c.tipo_documento as cliente_tipo_doc, c.direccion as cliente_direccion,
            c.telefono as cliente_telefono, c.email as cliente_email,
            COALESCE((SELECT SUM(d.total) FROM devoluciones d WHERE d.venta_id = v.id), 0) as devuelto
     FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id WHERE v.id = ?`,
    [id]
  ) as any
  if (venta) {
    venta.items = query('SELECT * FROM venta_items WHERE venta_id = ?', [id])
  }
  return venta
}

function obtenerConfig(): Record<string, string> {
  const rows = query<{ clave: string; valor: string }>('SELECT clave, valor FROM config')
  const cfg: Record<string, string> = {}
  for (const r of rows) cfg[r.clave] = r.valor
  return cfg
}

/** Devuelve la sesion de caja abierta, o null si no hay ninguna. */
function sesionAbierta(): any {
  return queryOne("SELECT * FROM caja_sesiones WHERE estado = 'abierta' ORDER BY id DESC LIMIT 1")
}

/** Calcula el arqueo de una sesion: ventas, devoluciones y efectivo esperado. */
function resumenSesion(sesion: any): any {
  // Ingresos por método a partir de los pagos reales (soporta pago mixto)
  const pagosPorMetodo = query<{ metodo: string; total: number }>(
    `SELECT vp.metodo, COALESCE(SUM(vp.monto),0) as total
     FROM venta_pagos vp JOIN ventas v ON v.id = vp.venta_id
     WHERE v.sesion_id = ? AND v.estado = 'completada' GROUP BY vp.metodo`,
    [sesion.id]
  )
  const ventasEfectivo = pagosPorMetodo.find((m) => m.metodo === 'efectivo')?.total ?? 0
  const ventasTarjeta = pagosPorMetodo.find((m) => m.metodo === 'tarjeta')?.total ?? 0
  const ventasTransfer = pagosPorMetodo.find((m) => m.metodo === 'transferencia')?.total ?? 0

  const totales = queryOne<{ n: number; total: number }>(
    "SELECT COUNT(*) as n, COALESCE(SUM(total),0) as total FROM ventas WHERE sesion_id = ? AND estado='completada'",
    [sesion.id]
  )

  const devEfectivo =
    queryOne<{ t: number }>(
      "SELECT COALESCE(SUM(total),0) as t FROM devoluciones WHERE sesion_id = ? AND metodo = 'efectivo'",
      [sesion.id]
    )?.t ?? 0
  const devTotal =
    queryOne<{ t: number }>('SELECT COALESCE(SUM(total),0) as t FROM devoluciones WHERE sesion_id = ?', [
      sesion.id
    ])?.t ?? 0

  const gastosEfectivo =
    queryOne<{ t: number }>(
      "SELECT COALESCE(SUM(monto),0) as t FROM gastos WHERE sesion_id = ? AND metodo = 'efectivo'",
      [sesion.id]
    )?.t ?? 0
  const gastosTotal =
    queryOne<{ t: number }>('SELECT COALESCE(SUM(monto),0) as t FROM gastos WHERE sesion_id = ?', [
      sesion.id
    ])?.t ?? 0

  const abonosEfectivo =
    queryOne<{ t: number }>(
      "SELECT COALESCE(SUM(monto),0) as t FROM abonos WHERE sesion_id = ? AND metodo = 'efectivo'",
      [sesion.id]
    )?.t ?? 0
  const abonosTotal =
    queryOne<{ t: number }>('SELECT COALESCE(SUM(monto),0) as t FROM abonos WHERE sesion_id = ?', [sesion.id])?.t ?? 0

  // Propinas: las que entraron al cajón (en_caja=1) suman al efectivo esperado (pero son para repartir);
  // el total incluye también las que el mesero se quedó (en_caja=0).
  const propinasEnCaja =
    queryOne<{ t: number }>('SELECT COALESCE(SUM(monto),0) as t FROM propinas WHERE sesion_id = ? AND en_caja = 1', [
      sesion.id
    ])?.t ?? 0
  const propinasTotal =
    queryOne<{ t: number }>('SELECT COALESCE(SUM(monto),0) as t FROM propinas WHERE sesion_id = ?', [sesion.id])?.t ?? 0
  const propinasPorMesero = query<{ mesero: string; total: number }>(
    `SELECT COALESCE(u.nombre,'(sin mesero)') as mesero, COALESCE(SUM(pr.monto),0) as total
       FROM propinas pr LEFT JOIN usuarios u ON u.id = pr.mesero_id
      WHERE pr.sesion_id = ? GROUP BY pr.mesero_id ORDER BY total DESC`,
    [sesion.id]
  )

  const efectivoEsperado =
    (sesion.monto_inicial ?? 0) + ventasEfectivo + abonosEfectivo + propinasEnCaja - devEfectivo - gastosEfectivo

  return {
    sesion,
    num_ventas: totales?.n ?? 0,
    total_ventas: totales?.total ?? 0,
    ventas_efectivo: ventasEfectivo,
    ventas_tarjeta: ventasTarjeta,
    ventas_transferencia: ventasTransfer,
    devoluciones_efectivo: devEfectivo,
    devoluciones_total: devTotal,
    gastos_efectivo: gastosEfectivo,
    gastos_total: gastosTotal,
    abonos_efectivo: abonosEfectivo,
    abonos_total: abonosTotal,
    propinas_en_caja: propinasEnCaja,
    propinas_total: propinasTotal,
    propinas_por_mesero: propinasPorMesero,
    monto_inicial: sesion.monto_inicial ?? 0,
    efectivo_esperado: efectivoEsperado
  }
}
