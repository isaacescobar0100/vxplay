const fs = require('fs'), path = require('path'), os = require('os'), initSqlJs = require('sql.js')
;(async () => {
  const wasm = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  const SQL = await initSqlJs({ wasmBinary: new Uint8Array(wasm).buffer })
  const db = new SQL.Database(fs.readFileSync(path.join(os.homedir(), 'AppData', 'Roaming', 'pos-ropa', 'pos-ropa.sqlite')))
  const val = (s) => db.exec(s)[0].values[0][0]
  const cop = (n) => '$' + Number(n).toLocaleString('es-CO')
  console.log('Clientes:', val('SELECT COUNT(*) FROM clientes'))
  console.log('Ventas:', val('SELECT COUNT(*) FROM ventas'))
  console.log('Items vendidos:', val('SELECT SUM(cantidad) FROM venta_items'))
  console.log('Total vendido:', cop(val('SELECT SUM(total) FROM ventas')))
  console.log('IVA recaudado:', cop(val('SELECT SUM(iva) FROM ventas')))
  console.log('Facturas DIAN simuladas:', val("SELECT COUNT(*) FROM ventas WHERE dian_estado='simulada'"))
  console.log('--- Stock restante ---')
  for (const r of db.exec('SELECT p.nombre, v.talla, v.color, v.stock FROM variantes v JOIN productos p ON p.id = v.producto_id')[0].values) {
    console.log(`  ${r[0]} ${r[1]}/${r[2]}: ${r[3]}`)
  }
})()
