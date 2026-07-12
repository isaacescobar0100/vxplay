const fs = require('fs'), path = require('path'), os = require('os'), initSqlJs = require('sql.js')
;(async () => {
  const wasm = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  const SQL = await initSqlJs({ wasmBinary: new Uint8Array(wasm).buffer })
  const db = new SQL.Database(fs.readFileSync(path.join(os.homedir(), 'AppData', 'Roaming', 'pos-ropa', 'pos-ropa.sqlite')))
  const val = (s) => { const r = db.exec(s); return r.length ? r[0].values[0][0] : null }
  console.log('Licencia activa en el POS:', val("SELECT valor FROM config WHERE clave='licencia_codigo'"))
  console.log('Tipo negocio local:', val("SELECT valor FROM config WHERE clave='tipo_negocio'"))
  console.log('--- Usuarios en la base local ---')
  const u = db.exec("SELECT usuario, rol, activo, substr(password,1,7) as p FROM usuarios")
  if (u.length) for (const r of u[0].values) console.log('  usuario:', r[0], '| rol:', r[1], '| activo:', r[2], '| pass:', r[3] + '...')
})()
