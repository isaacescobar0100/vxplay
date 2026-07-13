// Prueba local del pipeline de importación: crea un .xlsx, lo lee y agrupa por nombre.
const XLSX = require('xlsx')
const path = require('path'), os = require('os')

const filas = [
  { nombre: 'Camiseta', categoria: 'Ropa', sku: 'CAM-1', precio_compra: '12.000', precio_venta: '25.000', iva: 19, talla: 'M', color: 'Negro', stock: 10 },
  { nombre: 'Camiseta', categoria: 'Ropa', sku: 'CAM-1', precio_venta: '25.000', talla: 'L', color: 'Blanco', stock: 8 },
  { nombre: 'Cerveza Aguila', categoria: 'Bebidas', precio_venta: '4.000', stock: 48 },
  { nombre: '', precio_venta: '999' } // fila sin nombre -> debe dar aviso
]

const tmp = path.join(os.tmpdir(), 'test-import.xlsx')
const ws = XLSX.utils.json_to_sheet(filas)
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Productos')
XLSX.writeFile(wb, tmp)
console.log('Escrito:', tmp)

const wb2 = XLSX.readFile(tmp)
const rows = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { defval: '' })
console.log('Leídas', rows.length, 'filas')

const num = (v) => { const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10); return isNaN(n) ? 0 : n }
const porNombre = {}, errores = []
rows.forEach((r, i) => {
  const nombre = String(r.nombre ?? '').trim()
  if (!nombre) { errores.push(`Fila ${i + 2}: sin nombre`); return }
  const k = nombre.toLowerCase()
  if (!porNombre[k]) porNombre[k] = { nombre, categoria: r.categoria || null, precio_venta: num(r.precio_venta), variantes: [] }
  porNombre[k].variantes.push({ talla: r.talla || null, color: r.color || null, stock: num(r.stock) })
})
console.log('\nProductos agrupados:')
for (const p of Object.values(porNombre)) console.log(`  ${p.nombre} | ${p.categoria} | venta ${p.precio_venta} | ${p.variantes.length} variante(s)`, p.variantes.map(v => `${v.talla||''}${v.color?'/'+v.color:''}:${v.stock}`).join(', '))
console.log('\nAvisos:', errores)
