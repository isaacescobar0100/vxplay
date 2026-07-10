import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import initSqlJs, { Database, SqlValue } from 'sql.js'
import { hashPassword, esHash } from './auth'

/**
 * Capa de acceso a datos basada en sql.js (SQLite compilado a WebAssembly).
 * No requiere compilacion nativa, ideal para Windows sin build tools.
 *
 * La base de datos vive en memoria y se persiste a disco (archivo .sqlite)
 * despues de cada escritura para evitar perdida de datos.
 */

let db: Database
let dbPath: string

/** Ruta al binario .wasm de sql.js (incluido en node_modules / empaquetado). */
function resolveWasmPath(): string {
  // En desarrollo y empaquetado, sql.js expone el wasm en su carpeta dist.
  return join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
}

export async function initDatabase(): Promise<void> {
  const userDataDir = app.getPath('userData')
  if (!existsSync(userDataDir)) mkdirSync(userDataDir, { recursive: true })
  dbPath = join(userDataDir, 'pos-ropa.sqlite')

  const fileWasm = readFileSync(resolveWasmPath())
  // Copiar a un ArrayBuffer limpio para satisfacer el tipo esperado por sql.js
  const wasmBinary = new Uint8Array(fileWasm).buffer
  const SQL = await initSqlJs({ wasmBinary })

  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON;')
  createSchema()
  migrateSchema()
  seedInitialData()
  persist()
}

/** Guarda el estado actual de la base de datos en disco. */
export function persist(): void {
  if (!db) return
  const data = db.export()
  writeFileSync(dbPath, Buffer.from(data))
}

function createSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      usuario TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'cajero',
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE,
      nombre TEXT NOT NULL,
      categoria_id INTEGER REFERENCES categorias(id),
      marca TEXT,
      precio_compra INTEGER NOT NULL DEFAULT 0,
      precio_venta INTEGER NOT NULL DEFAULT 0,
      iva_porcentaje INTEGER NOT NULL DEFAULT 19,
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Cada variante es una combinacion talla/color con su propio stock y codigo de barras.
    CREATE TABLE IF NOT EXISTS variantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      talla TEXT,
      color TEXT,
      codigo_barras TEXT UNIQUE,
      stock INTEGER NOT NULL DEFAULT 0,
      stock_minimo INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo_documento TEXT NOT NULL DEFAULT 'CC',
      numero_documento TEXT,
      nombre TEXT NOT NULL,
      email TEXT,
      telefono TEXT,
      direccion TEXT,
      creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE NOT NULL,
      fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      cliente_id INTEGER REFERENCES clientes(id),
      usuario_id INTEGER REFERENCES usuarios(id),
      subtotal INTEGER NOT NULL DEFAULT 0,
      descuento INTEGER NOT NULL DEFAULT 0,
      iva INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
      pago_recibido INTEGER NOT NULL DEFAULT 0,
      cambio INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'completada',
      -- Campos de facturacion electronica DIAN
      dian_estado TEXT NOT NULL DEFAULT 'pendiente',
      dian_cufe TEXT,
      dian_numero TEXT,
      dian_qr TEXT,
      dian_mensaje TEXT
    );

    CREATE TABLE IF NOT EXISTS venta_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
      variante_id INTEGER REFERENCES variantes(id),
      producto_nombre TEXT NOT NULL,
      talla TEXT,
      color TEXT,
      cantidad INTEGER NOT NULL,
      precio_unitario INTEGER NOT NULL,
      iva_porcentaje INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL
    );

    -- Pagos de una venta (permite pago mixto: efectivo + tarjeta, etc.)
    CREATE TABLE IF NOT EXISTS venta_pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
      metodo TEXT NOT NULL,
      monto INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS movimientos_inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variante_id INTEGER NOT NULL REFERENCES variantes(id),
      tipo TEXT NOT NULL,            -- entrada | salida | ajuste | venta
      cantidad INTEGER NOT NULL,
      motivo TEXT,
      fecha TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Sesiones de caja (apertura / cierre / arqueo)
    CREATE TABLE IF NOT EXISTS caja_sesiones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_apertura_id INTEGER REFERENCES usuarios(id),
      usuario_cierre_id INTEGER REFERENCES usuarios(id),
      fecha_apertura TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      fecha_cierre TEXT,
      monto_inicial INTEGER NOT NULL DEFAULT 0,
      monto_esperado INTEGER,
      monto_contado INTEGER,
      diferencia INTEGER,
      estado TEXT NOT NULL DEFAULT 'abierta',   -- abierta | cerrada
      notas TEXT
    );

    -- Devoluciones de venta
    CREATE TABLE IF NOT EXISTS devoluciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER REFERENCES ventas(id),
      sesion_id INTEGER REFERENCES caja_sesiones(id),
      usuario_id INTEGER REFERENCES usuarios(id),
      fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      motivo TEXT,
      metodo TEXT NOT NULL DEFAULT 'efectivo',
      total INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS devolucion_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      devolucion_id INTEGER NOT NULL REFERENCES devoluciones(id) ON DELETE CASCADE,
      venta_item_id INTEGER REFERENCES venta_items(id),
      variante_id INTEGER REFERENCES variantes(id),
      producto_nombre TEXT NOT NULL,
      talla TEXT,
      color TEXT,
      cantidad INTEGER NOT NULL,
      precio_unitario INTEGER NOT NULL,
      subtotal INTEGER NOT NULL
    );

    -- Proveedores
    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      nit TEXT,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Compras / entrada de mercancía
    CREATE TABLE IF NOT EXISTS compras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT,
      proveedor_id INTEGER REFERENCES proveedores(id),
      usuario_id INTEGER REFERENCES usuarios(id),
      fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      total INTEGER NOT NULL DEFAULT 0,
      notas TEXT
    );

    CREATE TABLE IF NOT EXISTS compra_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
      variante_id INTEGER REFERENCES variantes(id),
      producto_nombre TEXT,
      talla TEXT,
      color TEXT,
      cantidad INTEGER NOT NULL,
      costo_unitario INTEGER NOT NULL,
      subtotal INTEGER NOT NULL
    );

    -- Gastos / egresos de caja
    CREATE TABLE IF NOT EXISTS gastos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sesion_id INTEGER REFERENCES caja_sesiones(id),
      usuario_id INTEGER REFERENCES usuarios(id),
      fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      concepto TEXT NOT NULL,
      categoria TEXT,
      metodo TEXT NOT NULL DEFAULT 'efectivo',
      monto INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_variantes_producto ON variantes(producto_id);
    CREATE INDEX IF NOT EXISTS idx_venta_items_venta ON venta_items(venta_id);
    CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
    CREATE INDEX IF NOT EXISTS idx_devolucion_items_dev ON devolucion_items(devolucion_id);
    CREATE INDEX IF NOT EXISTS idx_compra_items_compra ON compra_items(compra_id);
  `)
}

/** Migraciones para bases de datos ya existentes (agrega columnas nuevas). */
function migrateSchema(): void {
  const cols = query<{ name: string }>('PRAGMA table_info(ventas)')
  if (!cols.find((c) => c.name === 'sesion_id')) {
    db.run('ALTER TABLE ventas ADD COLUMN sesion_id INTEGER')
  }
}

function seedInitialData(): void {
  const count = queryOne<{ n: number }>('SELECT COUNT(*) as n FROM usuarios')
  if (count && count.n === 0) {
    run('INSERT INTO usuarios (nombre, usuario, password, rol) VALUES (?,?,?,?)', [
      'Administrador',
      'admin',
      hashPassword('admin123'),
      'admin'
    ])
  }

  // Migrar contraseñas en texto plano a hash (bases de datos antiguas)
  const planas = query<{ id: number; password: string }>(
    'SELECT id, password FROM usuarios'
  ).filter((u) => !esHash(u.password))
  for (const u of planas) {
    runNoPersist('UPDATE usuarios SET password = ? WHERE id = ?', [hashPassword(u.password), u.id])
  }
  if (planas.length) persist()

  const cfg = queryOne<{ n: number }>('SELECT COUNT(*) as n FROM config')
  if (cfg && cfg.n === 0) {
    const defaults: [string, string][] = [
      ['tienda_nombre', 'Mi Tienda de Ropa'],
      ['tienda_nit', '900000000-0'],
      ['tienda_direccion', 'Calle 00 # 00-00'],
      ['tienda_telefono', '000 0000000'],
      ['tienda_ciudad', 'Bogota D.C.'],
      ['iva_defecto', '19'],
      ['moneda', 'COP'],
      ['dian_proveedor', 'factus'],
      ['dian_ambiente', 'pruebas'], // pruebas | produccion
      ['dian_api_url', ''],
      ['dian_api_token', ''],
      ['dian_habilitado', '0'],
      ['impresion_modo', 'previsualizar'], // previsualizar | auto | dialogo
      ['impresora_nombre', ''] // vacio = impresora por defecto de Windows
    ]
    for (const [clave, valor] of defaults) {
      run('INSERT INTO config (clave, valor) VALUES (?,?)', [clave, valor])
    }
  }
}

// ---- API generica de consultas ----

export function run(sql: string, params: SqlValue[] = []): void {
  db.run(sql, params)
  persist()
}

export function runNoPersist(sql: string, params: SqlValue[] = []): void {
  db.run(sql, params)
}

/** Ejecuta un INSERT y devuelve el id generado. */
export function insert(sql: string, params: SqlValue[] = []): number {
  db.run(sql, params)
  const row = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')
  persist()
  return row ? row.id : 0
}

export function query<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T[] {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows: T[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as T)
  }
  stmt.free()
  return rows
}

export function queryOne<T = Record<string, SqlValue>>(
  sql: string,
  params: SqlValue[] = []
): T | null {
  const rows = query<T>(sql, params)
  return rows.length > 0 ? rows[0] : null
}

/** Ejecuta varias operaciones como una transaccion y persiste una sola vez. */
export function transaction(fn: () => void): void {
  db.run('BEGIN TRANSACTION;')
  try {
    fn()
    db.run('COMMIT;')
    persist()
  } catch (err) {
    db.run('ROLLBACK;')
    throw err
  }
}

export function getDb(): Database {
  return db
}

export function getDbPath(): string {
  return dbPath
}
