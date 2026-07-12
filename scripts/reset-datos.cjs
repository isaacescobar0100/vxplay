/**
 * Limpia TODOS los datos operativos locales para empezar pruebas desde cero.
 * Conserva: usuarios (admin) y la configuración base.
 * Borra: productos, ventas, mesas, comandas, clientes, compras, caja, licencia, etc.
 * Uso: node scripts/reset-datos.cjs
 */
const fs = require('fs'), path = require('path'), os = require('os'), initSqlJs = require('sql.js')
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'pos-ropa', 'pos-ropa.sqlite')

;(async () => {
  const wasm = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  const SQL = await initSqlJs({ wasmBinary: new Uint8Array(wasm).buffer })
  if (!fs.existsSync(dbPath)) { console.error('No existe la BD'); process.exit(1) }
  const db = new SQL.Database(fs.readFileSync(dbPath))

  const tablas = [
    'venta_pagos', 'venta_items', 'devolucion_items', 'devoluciones', 'ventas',
    'comanda_items', 'comandas', 'mesas',
    'movimientos_inventario', 'compra_items', 'compras', 'gastos', 'proveedores',
    'caja_sesiones', 'clientes', 'variantes', 'productos', 'categorias'
  ]
  for (const t of tablas) {
    try { db.run('DELETE FROM ' + t) } catch (e) { console.log('  (omito ' + t + ')') }
  }
  // Reiniciar los contadores de ID (autoincrement)
  try { db.run('DELETE FROM sqlite_sequence') } catch (e) {}

  // Borrar la licencia y la marca de config central (para re-activar limpio)
  db.run("DELETE FROM config WHERE clave IN ('licencia_codigo','licencia_ultimo_ok','licencia_nombre','config_central')")

  fs.writeFileSync(dbPath, Buffer.from(db.export()))
  console.log('✓ Datos operativos borrados. Se conservó el usuario admin y la config base.')
  console.log('✓ Licencia limpiada: al abrir, el POS pedirá activación de nuevo.')
})()
