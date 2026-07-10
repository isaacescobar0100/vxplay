const fs = require('fs'), path = require('path'), os = require('os'), initSqlJs = require('sql.js')
;(async () => {
  const wasm = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  const SQL = await initSqlJs({ wasmBinary: new Uint8Array(wasm).buffer })
  const db = new SQL.Database(fs.readFileSync(path.join(os.homedir(), 'AppData', 'Roaming', 'pos-ropa', 'pos-ropa.sqlite')))
  const tablas = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0].values.map((r) => r[0])
  const esperadas = ['proveedores', 'compras', 'compra_items', 'gastos', 'venta_pagos']
  console.log('Tablas nuevas presentes:')
  for (const t of esperadas) console.log('  ' + t + ':', tablas.includes(t) ? 'SÍ ✔' : 'NO ✗')
  const admin = db.exec("SELECT usuario, substr(password,1,7) as p, rol FROM usuarios")[0]
  console.log('Usuarios:')
  for (const r of admin.values) console.log('  ' + r[0] + ' | password: ' + r[1] + '... | rol: ' + r[2])
  console.log('Contraseña cifrada:', admin.values[0][1] === 'scrypt$' ? 'SÍ ✔ (ya no es texto plano)' : 'NO ✗')

  // backups
  const bdir = path.join(os.homedir(), 'AppData', 'Roaming', 'pos-ropa', 'backups')
  const nb = fs.existsSync(bdir) ? fs.readdirSync(bdir).filter((f) => f.endsWith('.sqlite')).length : 0
  console.log('Respaldos automáticos creados:', nb)
})()
