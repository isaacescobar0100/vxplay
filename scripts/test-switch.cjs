// Prueba local: simula el cambio de licencia (cambiar + limpiarDatosTienda + activar)
// sobre una COPIA de la base real, y verifica que NO queden datos/logo de la tienda anterior.
const fs = require('fs'), path = require('path'), os = require('os'), initSqlJs = require('sql.js')
;(async () => {
  const wasm = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  const SQL = await initSqlJs({ wasmBinary: new Uint8Array(wasm).buffer })
  const src = path.join(os.homedir(), 'AppData', 'Roaming', 'pos-ropa', 'pos-ropa.sqlite')
  const db = new SQL.Database(fs.readFileSync(src)) // copia en memoria, no se guarda

  const val = (s) => { const r = db.exec(s); return r.length ? r[0].values[0][0] : null }
  const nuevo = 'ROPA-001'
  console.log('ANTES  -> licencia:', val("SELECT valor FROM config WHERE clave='licencia_codigo'"),
    '| tienda:', val("SELECT valor FROM config WHERE clave='tienda_nombre'"),
    '| logo?', val("SELECT CASE WHEN valor<>'' THEN 'SÍ' ELSE 'no' END FROM config WHERE clave='tienda_logo'"),
    '| tipo:', val("SELECT valor FROM config WHERE clave='tipo_negocio'"))

  // (1) licencia:cambiar
  const actual = val("SELECT valor FROM config WHERE clave='licencia_codigo'")
  if (actual) db.run("INSERT INTO config (clave,valor) VALUES ('licencia_anterior',?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor", [actual])
  db.run("DELETE FROM config WHERE clave IN ('licencia_codigo','licencia_ultimo_ok','licencia_nombre','config_central')")

  // (2) activar licencia distinta -> limpiarDatosTienda()
  const anterior = val("SELECT valor FROM config WHERE clave='licencia_anterior'") || actual
  if (anterior && anterior !== nuevo) {
    const tablas = ['venta_pagos','venta_items','devolucion_items','devoluciones','ventas','comanda_items','comandas','mesas','movimientos_inventario','compra_items','compras','gastos','proveedores','caja_sesiones','clientes','variantes','productos','categorias','usuarios']
    for (const t of tablas) { try { db.run('DELETE FROM ' + t) } catch {} }
    try { db.run('DELETE FROM sqlite_sequence') } catch {}
    db.run("DELETE FROM config WHERE clave LIKE 'tienda_%' OR clave LIKE 'dian_%' OR clave LIKE 'propina_%' OR clave IN ('tipo_negocio','config_central','fiado_habilitado')")
    db.run("INSERT INTO usuarios (nombre,usuario,password,rol) VALUES ('Administrador','admin','x','admin')")
  }
  db.run("DELETE FROM config WHERE clave='licencia_anterior'")
  db.run("INSERT INTO config (clave,valor) VALUES ('licencia_codigo',?)", [nuevo])

  console.log('DESPUÉS-> licencia:', val("SELECT valor FROM config WHERE clave='licencia_codigo'"),
    '| tienda:', val("SELECT valor FROM config WHERE clave='tienda_nombre'") ?? '(borrado)',
    '| logo?', (val("SELECT valor FROM config WHERE clave='tienda_logo'") ? 'SÍ (CRUCE!)' : 'no (ok)'),
    '| tipo:', val("SELECT valor FROM config WHERE clave='tipo_negocio'") ?? '(borrado)')
  console.log('        productos:', val('SELECT COUNT(*) FROM productos'), '| usuarios:', val('SELECT COUNT(*) FROM usuarios'))
  console.log('\nConfig que sobrevive:')
  const rows = db.exec('SELECT clave FROM config ORDER BY clave')
  if (rows.length) console.log('  ' + rows[0].values.map(r => r[0]).join(', '))
})()
