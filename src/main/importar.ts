import { dialog } from 'electron'
import * as XLSX from 'xlsx'
import { query, queryOne, getDb, transaction, persist } from './db'

/** ¿La tienda maneja IVA? (solo si tiene DIAN habilitada). */
function dianActiva(): boolean {
  return queryOne<{ valor: string }>("SELECT valor FROM config WHERE clave = 'dian_habilitado'")?.valor === '1'
}

/**
 * Importación masiva de productos desde Excel (.xlsx) o CSV.
 * Cada fila es un producto (o una variante talla/color si se repite el nombre).
 * Solo sube datos de catálogo; no toca ventas ni nada sensible.
 */

// Sinónimos de encabezados aceptados (sin tildes, en minúscula)
const CAMPOS: Record<string, string[]> = {
  nombre: ['nombre', 'producto', 'descripcion', 'name'],
  categoria: ['categoria', 'category', 'linea'],
  marca: ['marca', 'brand'],
  sku: ['sku', 'referencia', 'ref'],
  precio_compra: ['preciocompra', 'compra', 'costo'],
  precio_venta: ['precioventa', 'venta', 'precio', 'pvp'],
  iva: ['iva', 'impuesto'],
  codigo_barras: ['codigobarras', 'codigo', 'barras', 'barcode', 'ean'],
  talla: ['talla', 'size'],
  color: ['color'],
  stock: ['stock', 'cantidad', 'existencia', 'inventario'],
  stock_minimo: ['stockminimo', 'minimo', 'stockmin']
}

function normalizar(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quitar tildes
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // solo letras/números
}

/** Construye el mapa encabezado-del-archivo -> campo interno. */
function mapearEncabezados(headers: string[]): Record<string, string> {
  const mapa: Record<string, string> = {}
  for (const h of headers) {
    const n = normalizar(h)
    for (const [campo, alias] of Object.entries(CAMPOS)) {
      if (alias.includes(n)) {
        mapa[h] = campo
        break
      }
    }
  }
  return mapa
}

function num(v: any): number {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10)
  return isNaN(n) ? 0 : n
}

export interface ProductoImportado {
  nombre: string
  categoria: string | null
  marca: string | null
  sku: string | null
  precio_compra: number
  precio_venta: number
  iva_porcentaje: number
  variantes: { talla: string | null; color: string | null; codigo_barras: string | null; stock: number; stock_minimo: number }[]
}

/** Abre el diálogo, lee el archivo y devuelve los productos listos + errores. */
export async function leerImportacion(): Promise<{
  ok: boolean
  error?: string
  productos?: ProductoImportado[]
  errores?: string[]
  totalVariantes?: number
}> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Elige el archivo de productos',
    filters: [{ name: 'Excel o CSV', extensions: ['xlsx', 'xls', 'csv'] }],
    properties: ['openFile']
  })
  if (canceled || !filePaths[0]) return { ok: false, error: 'cancelado' }

  let filas: any[]
  try {
    const wb = XLSX.readFile(filePaths[0])
    const hoja = wb.Sheets[wb.SheetNames[0]]
    filas = XLSX.utils.sheet_to_json(hoja, { defval: '' })
  } catch (e: any) {
    return { ok: false, error: 'No se pudo leer el archivo. ¿Está abierto en Excel? Ciérralo e intenta de nuevo.' }
  }
  if (!filas.length) return { ok: false, error: 'El archivo no tiene filas de productos.' }

  const mapa = mapearEncabezados(Object.keys(filas[0]))
  if (!Object.values(mapa).includes('nombre')) {
    return { ok: false, error: 'No se encontró la columna "nombre". Usa la plantilla como guía.' }
  }

  const dianOn = dianActiva()
  const errores: string[] = []
  const porNombre: Record<string, ProductoImportado> = {}
  let totalVariantes = 0

  filas.forEach((fila, i) => {
    const r: any = {}
    for (const [col, campo] of Object.entries(mapa)) r[campo] = fila[col]
    const nombre = String(r.nombre ?? '').trim()
    if (!nombre) {
      errores.push(`Fila ${i + 2}: sin nombre, se omitió.`)
      return
    }
    const clave = nombre.toLowerCase()
    if (!porNombre[clave]) {
      porNombre[clave] = {
        nombre,
        categoria: String(r.categoria ?? '').trim() || null,
        marca: String(r.marca ?? '').trim() || null,
        sku: String(r.sku ?? '').trim() || null,
        precio_compra: num(r.precio_compra),
        precio_venta: num(r.precio_venta),
        iva_porcentaje: r.iva === '' || r.iva == null ? (dianOn ? 19 : 0) : num(r.iva),
        variantes: []
      }
    }
    porNombre[clave].variantes.push({
      talla: String(r.talla ?? '').trim() || null,
      color: String(r.color ?? '').trim() || null,
      codigo_barras: String(r.codigo_barras ?? '').trim() || null,
      stock: num(r.stock),
      stock_minimo: r.stock_minimo === '' || r.stock_minimo == null ? 1 : num(r.stock_minimo)
    })
    totalVariantes++
  })

  return { ok: true, productos: Object.values(porNombre), errores, totalVariantes }
}

/** Inserta los productos importados (crea categorías nuevas por nombre). Omite SKUs ya existentes. */
export function guardarImportacion(productos: ProductoImportado[]): {
  ok: boolean
  creados: number
  variantes: number
  omitidos: number
  categoriasNuevas: number
} {
  let creados = 0
  let variantes = 0
  let omitidos = 0
  let categoriasNuevas = 0
  const cacheCat: Record<string, number> = {}

  function categoriaId(nombre: string | null): number | null {
    if (!nombre) return null
    const clave = nombre.toLowerCase()
    if (cacheCat[clave]) return cacheCat[clave]
    const existe = queryOne<{ id: number }>('SELECT id FROM categorias WHERE lower(nombre) = ?', [clave])
    if (existe) {
      cacheCat[clave] = existe.id
      return existe.id
    }
    getDb().run('INSERT INTO categorias (nombre) VALUES (?)', [nombre])
    const id = (queryOne<{ id: number }>('SELECT last_insert_rowid() as id') as any).id
    cacheCat[clave] = id
    categoriasNuevas++
    return id
  }

  transaction(() => {
    for (const p of productos) {
      // Evitar duplicar por SKU
      if (p.sku) {
        const dup = queryOne<{ id: number }>('SELECT id FROM productos WHERE sku = ?', [p.sku])
        if (dup) {
          omitidos++
          continue
        }
      }
      const catId = categoriaId(p.categoria)
      getDb().run(
        `INSERT INTO productos (sku, nombre, categoria_id, marca, precio_compra, precio_venta, iva_porcentaje)
         VALUES (?,?,?,?,?,?,?)`,
        [p.sku, p.nombre, catId, p.marca, p.precio_compra, p.precio_venta, p.iva_porcentaje]
      )
      const productoId = (queryOne<{ id: number }>('SELECT last_insert_rowid() as id') as any).id
      creados++
      const vars = p.variantes.length ? p.variantes : [{ talla: null, color: null, codigo_barras: null, stock: 0, stock_minimo: 1 }]
      for (const v of vars) {
        getDb().run(
          'INSERT INTO variantes (producto_id, talla, color, codigo_barras, stock, stock_minimo) VALUES (?,?,?,?,?,?)',
          [productoId, v.talla, v.color, v.codigo_barras, v.stock, v.stock_minimo]
        )
        variantes++
      }
    }
  })
  persist()
  return { ok: true, creados, variantes, omitidos, categoriasNuevas }
}

/** Genera y guarda una plantilla .xlsx con las columnas y ejemplos según el tipo de negocio. */
export async function generarPlantilla(): Promise<{ ok: boolean; ruta?: string }> {
  const tipo = queryOne<{ valor: string }>("SELECT valor FROM config WHERE clave = 'tipo_negocio'")?.valor ?? 'ropa'
  const EJ = 'EJEMPLO (borra esta fila) - '

  let filas: any[]
  if (tipo === 'bar' || tipo === 'restaurante') {
    filas = [
      { nombre: EJ + 'Cerveza', categoria: 'Bebidas', marca: '', sku: 'BEB-001', precio_compra: 2500, precio_venta: 4000, iva: 19, codigo_barras: '', talla: '', color: '', stock: 48, stock_minimo: 12 },
      { nombre: EJ + 'Picada', categoria: 'Comida', marca: '', sku: 'COM-001', precio_compra: 15000, precio_venta: 30000, iva: 8, codigo_barras: '', talla: '', color: '', stock: 0, stock_minimo: 0 }
    ]
  } else if (tipo === 'ropa') {
    // Mismo nombre en 2 filas con distinta talla/color => un producto con 2 variantes
    filas = [
      { nombre: EJ + 'Camiseta', categoria: 'Ropa', marca: 'Genérica', sku: 'CAM-001', precio_compra: 12000, precio_venta: 25000, iva: 19, codigo_barras: '7700000000017', talla: 'M', color: 'Negro', stock: 10, stock_minimo: 2 },
      { nombre: EJ + 'Camiseta', categoria: 'Ropa', marca: 'Genérica', sku: 'CAM-001', precio_compra: 12000, precio_venta: 25000, iva: 19, codigo_barras: '7700000000024', talla: 'L', color: 'Blanco', stock: 8, stock_minimo: 2 }
    ]
  } else {
    filas = [
      { nombre: EJ + 'Producto 1', categoria: 'General', marca: '', sku: 'PRD-001', precio_compra: 5000, precio_venta: 9000, iva: 19, codigo_barras: '', talla: '', color: '', stock: 20, stock_minimo: 5 }
    ]
  }
  // Sin DIAN no se maneja IVA: quitar esa columna de la plantilla
  if (!dianActiva()) filas.forEach((f) => delete f.iva)

  const ws = XLSX.utils.json_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Productos')

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Guardar plantilla de productos',
    defaultPath: 'plantilla-productos-vxplay.xlsx',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  })
  if (canceled || !filePath) return { ok: false }
  XLSX.writeFile(wb, filePath)
  return { ok: true, ruta: filePath }
}
