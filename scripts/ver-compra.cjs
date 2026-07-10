const fs = require('fs'), path = require('path'), os = require('os'), initSqlJs = require('sql.js')
;(async () => {
  const wasm = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  const SQL = await initSqlJs({ wasmBinary: new Uint8Array(wasm).buffer })
  const db = new SQL.Database(fs.readFileSync(path.join(os.homedir(), 'AppData', 'Roaming', 'pos-ropa', 'pos-ropa.sqlite')))
  const q = (s) => { const r = db.exec(s); return r.length ? r[0] : { columns: [], values: [] } }
  console.log('=== Última compra ===')
  const items = q("SELECT producto_nombre, talla, color, cantidad, costo_unitario FROM compra_items ORDER BY id DESC LIMIT 5")
  for (const r of items.values) console.log(`  ${r[0]} ${r[1] || ''}/${r[2] || ''}  -> +${r[3]} uds  a $${r[4]} c/u`)
  console.log('\n=== Movimientos de inventario tipo "entrada" (compras) ===')
  const mov = q("SELECT tipo, cantidad, motivo, fecha FROM movimientos_inventario WHERE tipo='entrada' ORDER BY id DESC LIMIT 5")
  for (const r of mov.values) console.log(`  ${r[3]}  ${r[0]}  +${r[1]}  (${r[2]})`)
})()
