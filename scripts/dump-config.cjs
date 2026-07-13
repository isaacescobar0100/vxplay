const fs = require('fs'), path = require('path'), os = require('os'), initSqlJs = require('sql.js')
;(async () => {
  const wasm = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  const SQL = await initSqlJs({ wasmBinary: new Uint8Array(wasm).buffer })
  const db = new SQL.Database(fs.readFileSync(path.join(os.homedir(), 'AppData', 'Roaming', 'pos-ropa', 'pos-ropa.sqlite')))
  const rows = db.exec('SELECT clave, valor FROM config ORDER BY clave')
  console.log('=== TODA LA CONFIG ===')
  if (rows.length) for (const r of rows[0].values) {
    const v = String(r[1] ?? '')
    console.log('  ' + r[0] + ' = ' + (v.length > 60 ? v.slice(0, 40) + '…(' + v.length + ' chars)' : v))
  }
  console.log('=== conteos ===')
  const c = (s) => { const r = db.exec(s); return r.length ? r[0].values[0][0] : 0 }
  console.log('  productos:', c('SELECT COUNT(*) FROM productos'), '| usuarios:', c('SELECT COUNT(*) FROM usuarios'))
})()
