/**
 * Rellena la app con datos de demostración: clientes + historial de ventas
 * usando los 2 productos existentes. Descuenta stock y registra movimientos.
 * Uso: node scripts/seed-demo.cjs
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const initSqlJs = require('sql.js')

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'pos-ropa', 'pos-ropa.sqlite')

async function main() {
  const wasm = fs.readFileSync(
    path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  )
  const SQL = await initSqlJs({ wasmBinary: new Uint8Array(wasm).buffer })
  if (!fs.existsSync(dbPath)) {
    console.error('No existe la BD. Abre la app y ejecuta antes seed-productos.cjs')
    process.exit(1)
  }
  const db = new SQL.Database(fs.readFileSync(dbPath))

  const one = (sql, params = []) => {
    const r = db.exec(sql, params)
    return r.length ? r[0].values[0][0] : null
  }

  // ---------- CLIENTES ----------
  if (one('SELECT COUNT(*) FROM clientes') === 0) {
    const clientes = [
      ['CC', '1020304050', 'Laura Gómez', 'laura.gomez@email.com', '3001234567', 'Cra 15 #45-20'],
      ['CC', '1122334455', 'Carlos Ramírez', 'carlos.r@email.com', '3109876543', 'Calle 80 #12-34'],
      ['NIT', '900123456', 'Distribuidora El Éxito S.A.S', 'compras@exito.com', '6014567890', 'Av 68 #24-10'],
      ['CC', '52011223', 'María Fernanda Ruiz', 'mafe.ruiz@email.com', '3205558877', 'Cll 100 #8-15'],
      ['CE', '987654', 'John Smith', 'john.smith@email.com', '3011112233', 'Cra 7 #70-30']
    ]
    for (const c of clientes) {
      db.run(
        'INSERT INTO clientes (tipo_documento, numero_documento, nombre, email, telefono, direccion) VALUES (?,?,?,?,?,?)',
        c
      )
    }
    console.log('✓ 5 clientes creados')
  } else {
    console.log('· Ya había clientes, no se duplican')
  }

  // ---------- VENTAS ----------
  if (one('SELECT COUNT(*) FROM ventas') > 0) {
    console.log('· Ya hay ventas registradas; no se generan de nuevo para evitar duplicados.')
    fs.writeFileSync(dbPath, Buffer.from(db.export()))
    return
  }

  // Mapa de variantes por clave "producto|talla|color"
  const vres = db.exec(
    `SELECT v.id, v.talla, v.color, p.nombre, p.precio_venta, p.iva_porcentaje
     FROM variantes v JOIN productos p ON p.id = v.producto_id`
  )[0]
  const V = {}
  for (const row of vres.values) {
    const [id, talla, color, nombre, precio, iva] = row
    V[`${nombre}|${talla}|${color}`] = { id, talla, color, nombre, precio, iva }
  }
  const CAM = (t, c) => V[`Camiseta Básica Algodón|${t}|${c}`]
  const JEAN = (t, c) => V[`Jean Slim Fit|${t}|${c}`]

  // clientes ids
  const cliIds = db.exec('SELECT id FROM clientes ORDER BY id')[0].values.map((r) => r[0])
  const C = (i) => cliIds[i] // i base 0

  // Definición de ventas: [fecha, clienteIdx|null, metodo, dian, items:[{v, qty}]]
  const ventas = [
    ['2026-06-26 10:15:00', 0, 'efectivo', false, [{ v: CAM('M', 'Blanco'), qty: 2 }]],
    ['2026-06-27 16:40:00', null, 'tarjeta', false, [{ v: JEAN('32', 'Azul'), qty: 1 }, { v: CAM('M', 'Negro'), qty: 1 }]],
    ['2026-06-28 11:05:00', 1, 'efectivo', false, [{ v: CAM('S', 'Blanco'), qty: 1 }]],
    ['2026-06-30 09:30:00', 2, 'transferencia', true, [{ v: CAM('M', 'Negro'), qty: 3 }, { v: JEAN('34', 'Azul'), qty: 2 }]],
    ['2026-07-01 18:20:00', null, 'efectivo', false, [{ v: CAM('L', 'Negro'), qty: 1 }]],
    ['2026-07-02 14:00:00', 3, 'tarjeta', false, [{ v: JEAN('30', 'Azul'), qty: 1 }]],
    ['2026-07-03 12:45:00', 0, 'efectivo', false, [{ v: CAM('M', 'Blanco'), qty: 2 }, { v: CAM('S', 'Blanco'), qty: 1 }]],
    ['2026-07-04 17:10:00', null, 'efectivo', false, [{ v: JEAN('32', 'Azul'), qty: 2 }]],
    ['2026-07-05 13:25:00', 4, 'tarjeta', true, [{ v: CAM('M', 'Negro'), qty: 1 }, { v: JEAN('30', 'Azul'), qty: 1 }]],
    ['2026-07-06 10:50:00', 1, 'efectivo', false, [{ v: CAM('L', 'Negro'), qty: 2 }]],
    ['2026-07-07 15:30:00', null, 'tarjeta', false, [{ v: CAM('M', 'Blanco'), qty: 1 }]],
    ['2026-07-08 11:15:00', 3, 'efectivo', true, [{ v: JEAN('34', 'Azul'), qty: 1 }, { v: CAM('S', 'Blanco'), qty: 2 }]],
    ['2026-07-09 09:40:00', 0, 'efectivo', false, [{ v: CAM('M', 'Negro'), qty: 2 }]],
    ['2026-07-09 17:55:00', null, 'tarjeta', false, [{ v: JEAN('32', 'Azul'), qty: 1 }, { v: CAM('M', 'Blanco'), qty: 1 }]]
  ]

  let n = 0
  for (const [fecha, cliIdx, metodo, dian, items] of ventas) {
    n++
    const numero = 'V' + String(n).padStart(6, '0')
    const total = items.reduce((s, it) => s + it.v.precio * it.qty, 0)
    const base = items.reduce((s, it) => s + Math.round((it.v.precio * it.qty) / (1 + it.v.iva / 100)), 0)
    const iva = total - base
    const pago = metodo === 'efectivo' ? Math.ceil(total / 1000) * 1000 : total
    const cambio = pago - total

    let dianEstado = 'pendiente', cufe = null, dnum = null, qr = null, mensaje = null
    if (dian) {
      dianEstado = 'simulada'
      cufe = 'SIM-' + numero + '-' + (1000 + n).toString(36).toUpperCase()
      dnum = 'SETP' + numero
      qr = 'https://catalogo-vpfe.dian.gov.co/document/simulado'
      mensaje = 'Factura simulada (modo pruebas).'
    }

    db.run(
      `INSERT INTO ventas (numero, fecha, cliente_id, usuario_id, subtotal, descuento, iva, total,
         metodo_pago, pago_recibido, cambio, estado, dian_estado, dian_cufe, dian_numero, dian_qr, dian_mensaje)
       VALUES (?,?,?,?,?,?,?,?,?,?,?, 'completada', ?,?,?,?,?)`,
      [numero, fecha, cliIdx === null ? null : C(cliIdx), 1, base, 0, iva, total,
        metodo, pago, cambio, dianEstado, cufe, dnum, qr, mensaje]
    )
    const ventaId = one('SELECT last_insert_rowid()')

    for (const it of items) {
      const lineTotal = it.v.precio * it.qty
      db.run(
        `INSERT INTO venta_items (venta_id, variante_id, producto_nombre, talla, color, cantidad, precio_unitario, iva_porcentaje, subtotal)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [ventaId, it.v.id, it.v.nombre, it.v.talla, it.v.color, it.qty, it.v.precio, it.v.iva, lineTotal]
      )
      db.run('UPDATE variantes SET stock = stock - ? WHERE id = ?', [it.qty, it.v.id])
      db.run(
        "INSERT INTO movimientos_inventario (variante_id, tipo, cantidad, motivo, fecha) VALUES (?, 'venta', ?, ?, ?)",
        [it.v.id, -it.qty, 'Venta ' + numero, fecha]
      )
    }
  }
  console.log(`✓ ${n} ventas generadas (con descuento de stock y facturas DIAN simuladas)`)

  fs.writeFileSync(dbPath, Buffer.from(db.export()))
  console.log('Base de datos guardada.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
