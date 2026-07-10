const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js')
;(async () => {
  const wasm = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  const SQL = await initSqlJs({ wasmBinary: new Uint8Array(wasm).buffer })

  function nuevaDb() {
    const db = new SQL.Database()
    db.run('CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT)')
    db.run("INSERT INTO productos (id, nombre) VALUES (1, 'Original')")
    return db
  }
  const persist = (db) => db.export() // replica: export cierra/reabre en sql.js

  // PATRÓN BUGGY: persist() en medio de la transacción
  {
    const db = nuevaDb()
    db.run('BEGIN TRANSACTION;')
    try {
      db.run("UPDATE productos SET nombre='EDITADO' WHERE id=1")
      persist(db) // <-- guardar a mitad
      db.run('COMMIT;')
      persist(db)
    } catch (e) {
      console.log('BUGGY lanzó error:', e.message)
    }
    const val = db.exec('SELECT nombre FROM productos WHERE id=1')[0].values[0][0]
    console.log('BUGGY resultado:', val, val === 'EDITADO' ? '(guardó ✔)' : '(NO guardó ✗)')
  }

  // PATRÓN CORREGIDO: persist() solo al final
  {
    const db = nuevaDb()
    db.run('BEGIN TRANSACTION;')
    try {
      db.run("UPDATE productos SET nombre='EDITADO' WHERE id=1")
      db.run('COMMIT;')
      persist(db) // <-- guardar al final
    } catch (e) {
      console.log('CORREGIDO lanzó error:', e.message)
    }
    const val = db.exec('SELECT nombre FROM productos WHERE id=1')[0].values[0][0]
    console.log('CORREGIDO resultado:', val, val === 'EDITADO' ? '(guardó ✔)' : '(NO guardó ✗)')
  }
})()
