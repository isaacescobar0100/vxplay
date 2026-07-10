/**
 * Inserta 2 productos de ejemplo (con variantes talla/color) en la base de datos.
 * Uso: node scripts/seed-productos.cjs
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
    console.error('No se encontró la base de datos en', dbPath, '- abre la app al menos una vez.')
    process.exit(1)
  }
  const db = new SQL.Database(fs.readFileSync(dbPath))

  // Categoría "Ropa" (crear si no existe)
  db.run("INSERT OR IGNORE INTO categorias (nombre) VALUES ('Ropa')")
  const catId = db.exec("SELECT id FROM categorias WHERE nombre='Ropa'")[0].values[0][0]

  function crearProducto(p, variantes) {
    db.run(
      `INSERT INTO productos (sku, nombre, categoria_id, marca, precio_compra, precio_venta, iva_porcentaje)
       VALUES (?,?,?,?,?,?,?)`,
      [p.sku, p.nombre, catId, p.marca, p.precio_compra, p.precio_venta, 19]
    )
    const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0]
    for (const v of variantes) {
      db.run(
        `INSERT INTO variantes (producto_id, talla, color, codigo_barras, stock, stock_minimo)
         VALUES (?,?,?,?,?,?)`,
        [id, v.talla, v.color, v.codigo, v.stock, 2]
      )
    }
    console.log(`✓ Producto creado: ${p.nombre} (id ${id}) con ${variantes.length} variantes`)
  }

  crearProducto(
    { sku: 'CAM-001', nombre: 'Camiseta Básica Algodón', marca: 'GenéricaWear', precio_compra: 18000, precio_venta: 39900 },
    [
      { talla: 'S', color: 'Blanco', codigo: '7700000000011', stock: 10 },
      { talla: 'M', color: 'Blanco', codigo: '7700000000028', stock: 15 },
      { talla: 'M', color: 'Negro', codigo: '7700000000035', stock: 12 },
      { talla: 'L', color: 'Negro', codigo: '7700000000042', stock: 8 }
    ]
  )

  crearProducto(
    { sku: 'JEAN-001', nombre: 'Jean Slim Fit', marca: 'DenimCo', precio_compra: 45000, precio_venta: 89900 },
    [
      { talla: '30', color: 'Azul', codigo: '7700000000059', stock: 6 },
      { talla: '32', color: 'Azul', codigo: '7700000000066', stock: 9 },
      { talla: '34', color: 'Azul', codigo: '7700000000073', stock: 5 }
    ]
  )

  fs.writeFileSync(dbPath, Buffer.from(db.export()))
  console.log('Base de datos guardada en', dbPath)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
