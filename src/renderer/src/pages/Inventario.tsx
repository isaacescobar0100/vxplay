import { useEffect, useState } from 'react'
import { cop } from '../util'
import Icon from '../components/Icon'
import { code39Svg } from '../barcode'

interface Variante {
  id?: number
  talla: string
  color: string
  codigo_barras: string
  stock: number
  stock_minimo: number
}
interface Producto {
  id?: number
  sku: string
  nombre: string
  categoria_id: number | null
  marca: string
  precio_compra: number
  precio_venta: number
  iva_porcentaje: number
  variantes: Variante[]
}

export const productoVacio: Producto = {
  sku: '',
  nombre: '',
  categoria_id: null,
  marca: '',
  precio_compra: 0,
  precio_venta: 0,
  iva_porcentaje: 19,
  variantes: []
}
const vacio = productoVacio

export default function Inventario(): JSX.Element {
  const [productos, setProductos] = useState<any[]>([])
  const [filtro, setFiltro] = useState('')
  const [editando, setEditando] = useState<Producto | null>(null)
  const [stockDe, setStockDe] = useState<any | null>(null)
  const [categorias, setCategorias] = useState<any[]>([])
  const [tipoNegocio, setTipoNegocio] = useState('ropa')
  const [etiquetas, setEtiquetas] = useState(false)
  const [importar, setImportar] = useState(false)

  useEffect(() => {
    cargar()
    window.api.categoriasList().then((c: any) => setCategorias(c))
    window.api.configGetAll().then((c: any) => setTipoNegocio(c.tipo_negocio ?? 'ropa'))
  }, [])

  async function cargar(): Promise<void> {
    const p = await window.api.productosList(filtro || undefined)
    setProductos(p as any[])
  }

  useEffect(() => {
    const t = setTimeout(cargar, 250)
    return () => clearTimeout(t)
  }, [filtro])

  async function eliminar(p: any): Promise<void> {
    if (!confirm(`¿Eliminar el producto "${p.nombre}"?\n\nDejará de aparecer en el catálogo, pero se conserva en el historial de ventas.`)) {
      return
    }
    await window.api.productosDelete(p.id)
    cargar()
  }

  return (
    <div>
      <div className="page-title">Inventario</div>
      <div className="toolbar">
        <div className="input-icon" style={{ flex: 1 }}>
          <Icon name="search" size={16} />
          <input
            className="search"
            placeholder="Buscar por nombre o SKU..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </div>
        <button className="btn-icon" onClick={() => setEtiquetas(true)}>
          <Icon name="scan" size={16} /> Etiquetas
        </button>
        <button className="btn-icon" onClick={() => setImportar(true)}>
          <Icon name="box" size={16} /> Importar Excel
        </button>
        <button
          className="btn-primary btn-icon"
          onClick={() => setEditando({ ...vacio, variantes: [] })}
        >
          <Icon name="plus" size={16} /> Nuevo producto
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>SKU</th>
              <th className="text-right">P. Venta</th>
              <th className="text-right">Stock total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => {
              const stock = (p.variantes ?? []).reduce((s: number, v: any) => s + v.stock, 0)
              return (
                <tr key={p.id}>
                  <td>
                    <b>{p.nombre}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {(p.variantes ?? [])
                        .map((v: any) =>
                          [v.talla, v.color].filter(Boolean).join('/')
                        )
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                  </td>
                  <td className="muted">{p.categoria ?? '—'}</td>
                  <td className="muted">{p.sku ?? '—'}</td>
                  <td className="text-right">{cop(p.precio_venta)}</td>
                  <td className="text-right">
                    <span className={'badge ' + (stock <= 3 ? 'badge-red' : 'badge-green')}>
                      {stock}
                    </span>
                  </td>
                  <td className="text-right">
                    <button className="btn-sm" onClick={() => setStockDe(p)}>
                      Stock
                    </button>{' '}
                    <button className="btn-sm" onClick={() => setEditando(p)}>
                      Editar
                    </button>{' '}
                    <button
                      className="btn-sm btn-danger"
                      title="Eliminar producto"
                      onClick={() => eliminar(p)}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {productos.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                  No hay productos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editando && (
        <ProductoModal
          producto={editando}
          categorias={categorias}
          esRopa={tipoNegocio === 'ropa'}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null)
            cargar()
          }}
          onCategoriaCreada={() => window.api.categoriasList().then((c: any) => setCategorias(c))}
        />
      )}

      {stockDe && (
        <StockModal
          producto={stockDe}
          onClose={() => setStockDe(null)}
          onChanged={cargar}
        />
      )}

      {etiquetas && <EtiquetasModal onClose={() => setEtiquetas(false)} />}
      {importar && (
        <ImportarModal
          onClose={() => setImportar(false)}
          onImportado={() => {
            setImportar(false)
            cargar()
            window.api.categoriasList().then((c: any) => setCategorias(c))
          }}
        />
      )}
    </div>
  )
}

// ---------- Modal de importación de productos (Excel/CSV) ----------
function ImportarModal({ onClose, onImportado }: { onClose: () => void; onImportado: () => void }): JSX.Element {
  const [preview, setPreview] = useState<any | null>(null)
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  async function descargarPlantilla(): Promise<void> {
    const r: any = await window.api.productosPlantilla()
    if (r?.ok) alert('Plantilla guardada en:\n' + r.ruta)
  }

  async function elegirArchivo(): Promise<void> {
    setCargando(true)
    const r: any = await window.api.productosImportarLeer()
    setCargando(false)
    if (!r?.ok) {
      if (r?.error && r.error !== 'cancelado') alert(r.error)
      return
    }
    setPreview(r)
  }

  async function confirmar(): Promise<void> {
    setGuardando(true)
    const r: any = await window.api.productosImportarGuardar(preview.productos)
    setGuardando(false)
    if (r?.ok) {
      alert(
        `Importación lista:\n• ${r.creados} productos creados\n• ${r.variantes} variantes\n• ${r.categoriasNuevas} categorías nuevas` +
          (r.omitidos ? `\n• ${r.omitidos} omitidos (SKU ya existía)` : '')
      )
      onImportado()
    } else {
      alert('No se pudo importar.')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <h2>Importar productos desde Excel</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Sube un archivo <b>.xlsx</b> o <b>.csv</b>. Columnas: <code>nombre, categoria, marca, sku, precio_compra,
          precio_venta, iva, codigo_barras, talla, color, stock, stock_minimo</code>. Solo <b>nombre</b> es obligatorio.
          Si repites el mismo nombre con distinta talla/color, se crean como variantes del mismo producto.
        </p>

        {!preview ? (
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn-icon" onClick={descargarPlantilla}>
              <Icon name="image" size={15} /> Descargar plantilla
            </button>
            <button className="btn-primary btn-icon" onClick={elegirArchivo} disabled={cargando}>
              <Icon name="box" size={15} /> {cargando ? 'Leyendo...' : 'Elegir archivo'}
            </button>
          </div>
        ) : (
          <>
            <div className="card" style={{ background: 'var(--bg)', marginTop: 8 }}>
              <b>{preview.productos.length}</b> productos · <b>{preview.totalVariantes}</b> variantes listos para importar.
              {preview.errores?.length > 0 && (
                <div style={{ color: 'var(--amber)', fontSize: 12, marginTop: 6 }}>
                  {preview.errores.length} avisos:
                  <ul style={{ margin: '4px 0 0 18px' }}>
                    {preview.errores.slice(0, 5).map((e: string, i: number) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 10 }}>
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Categoría</th>
                    <th className="text-right">Venta</th>
                    <th className="text-right">Variantes</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.productos.slice(0, 50).map((p: any, i: number) => (
                    <tr key={i}>
                      <td>{p.nombre}</td>
                      <td className="muted">{p.categoria ?? '—'}</td>
                      <td className="text-right">{cop(p.precio_venta)}</td>
                      <td className="text-right muted">{p.variantes.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="modal-foot">
          <button onClick={onClose}>Cancelar</button>
          {preview && (
            <button className="btn-primary btn-icon" onClick={confirmar} disabled={guardando}>
              <Icon name="check" size={15} /> {guardando ? 'Importando...' : `Importar ${preview.productos.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- Modal de etiquetas de código de barras ----------
function EtiquetasModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [items, setItems] = useState<any[]>([])
  const [cant, setCant] = useState<Record<number, number>>({})
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    window.api.productosList().then((prods: any[]) => {
      const lista: any[] = []
      for (const p of prods) {
        for (const v of p.variantes ?? []) {
          if (v.codigo_barras) {
            lista.push({
              id: v.id,
              codigo: v.codigo_barras,
              nombre: p.nombre,
              detalle: [v.talla && 'T:' + v.talla, v.color].filter(Boolean).join(' '),
              precio: p.precio_venta
            })
          }
        }
      }
      setItems(lista)
    })
  }, [])

  const filtrados = items.filter((i) => i.nombre.toLowerCase().includes(filtro.toLowerCase()))
  const totalEtiquetas = Object.values(cant).reduce((s, n) => s + (n || 0), 0)

  function construirHtml(): string {
    const partes: string[] = []
    for (const it of items) {
      const n = cant[it.id] ?? 0
      for (let k = 0; k < n; k++) {
        partes.push(`
          <div class="etq">
            <div class="nom">${it.nombre}${it.detalle ? ' ' + it.detalle : ''}</div>
            <div class="precio">${cop(it.precio)}</div>
            ${code39Svg(it.codigo, 40)}
            <div class="cod">${it.codigo}</div>
          </div>`)
      }
    }
    return partes.join('')
  }

  async function imprimir(): Promise<void> {
    const html = construirHtml()
    if (!html) {
      alert('Indica cuántas etiquetas de al menos un producto.')
      return
    }
    await window.api.imprimirEtiquetas(html)
  }

  async function descargarPdf(): Promise<void> {
    const html = construirHtml()
    if (!html) {
      alert('Indica cuántas etiquetas de al menos un producto.')
      return
    }
    const r: any = await window.api.etiquetasPdf(html)
    if (r.ok) alert('Etiquetas guardadas en:\n' + r.ruta)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">
          <Icon name="scan" size={20} /> Imprimir etiquetas de código de barras
        </h2>
        <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          Indica cuántas etiquetas de cada producto quieres. Solo aparecen los que tienen{' '}
          <b>código de barras</b> registrado.
        </p>
        <div className="input-icon" style={{ marginBottom: 10 }}>
          <Icon name="search" size={16} />
          <input placeholder="Buscar producto..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
        <div style={{ maxHeight: 340, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Código</th>
                <th className="text-right">Etiquetas</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((it) => (
                <tr key={it.id}>
                  <td>
                    {it.nombre} <span className="muted">{it.detalle}</span>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {it.codigo}
                  </td>
                  <td className="text-right">
                    <input
                      type="number"
                      style={{ width: 70, textAlign: 'right' }}
                      value={cant[it.id] || ''}
                      min={0}
                      onChange={(e) => setCant((c) => ({ ...c, [it.id]: Number(e.target.value) }))}
                    />
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                    Ningún producto tiene código de barras. Regístralos en Editar → "Cód. barras".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="modal-foot">
          <button onClick={onClose}>Cerrar</button>
          <button className="btn-icon" onClick={descargarPdf} disabled={totalEtiquetas === 0}>
            <Icon name="image" size={15} /> Descargar PDF
          </button>
          <button className="btn-primary btn-icon" onClick={imprimir} disabled={totalEtiquetas === 0}>
            <Icon name="print" size={15} /> Imprimir {totalEtiquetas > 0 ? `(${totalEtiquetas})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Modal de Stock: Kardex + ajuste ----------
function StockModal({
  producto,
  onClose,
  onChanged
}: {
  producto: any
  onClose: () => void
  onChanged: () => void
}): JSX.Element {
  const [variantes, setVariantes] = useState<any[]>(producto.variantes ?? [])
  const [ajustes, setAjustes] = useState<Record<number, number>>({})
  const [motivo, setMotivo] = useState('Conteo físico')
  const [kardexDe, setKardexDe] = useState<any | null>(null)
  const [kardex, setKardex] = useState<any[]>([])

  async function recargar(): Promise<void> {
    const p: any = await window.api.productosGet(producto.id)
    setVariantes(p.variantes ?? [])
    onChanged()
  }

  async function ajustar(v: any): Promise<void> {
    const nuevo = ajustes[v.id]
    if (nuevo == null || nuevo === v.stock) {
      alert('Escribe el nuevo stock (diferente al actual)')
      return
    }
    await window.api.inventarioAjustar(v.id, nuevo, motivo || 'Ajuste manual')
    setAjustes((a) => {
      const copia = { ...a }
      delete copia[v.id]
      return copia
    })
    await recargar()
  }

  async function verKardex(v: any): Promise<void> {
    const r: any = await window.api.inventarioKardex(v.id)
    setKardexDe(v)
    setKardex(r.movimientos)
  }

  const tipoLabel: Record<string, string> = {
    entrada: 'Entrada (compra)',
    venta: 'Venta',
    devolucion: 'Devolución',
    ajuste: 'Ajuste',
    salida: 'Salida'
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 680 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">
          <Icon name="box" size={20} /> Stock — {producto.nombre}
        </h2>

        {!kardexDe ? (
          <>
            <p className="muted" style={{ marginBottom: 12 }}>
              Ajusta el stock tras un conteo físico, o mira el historial de movimientos (Kardex).
            </p>
            <div className="field" style={{ maxWidth: 320 }}>
              <label>Motivo del ajuste</label>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: conteo físico, merma, robo"
              />
            </div>
            <table>
              <thead>
                <tr>
                  <th>Variante</th>
                  <th className="text-right">Stock actual</th>
                  <th className="text-right">Nuevo stock</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {variantes.map((v) => (
                  <tr key={v.id}>
                    <td>{[v.talla && 'T:' + v.talla, v.color].filter(Boolean).join(' · ') || 'Estándar'}</td>
                    <td className="text-right">
                      <span className={'badge ' + (v.stock <= (v.stock_minimo ?? 0) ? 'badge-red' : 'badge-green')}>
                        {v.stock}
                      </span>
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        style={{ width: 90, textAlign: 'right' }}
                        value={ajustes[v.id] ?? ''}
                        placeholder={String(v.stock)}
                        onChange={(e) =>
                          setAjustes((a) => ({ ...a, [v.id]: Number(e.target.value) }))
                        }
                      />
                    </td>
                    <td className="text-right">
                      <button className="btn-sm btn-primary" onClick={() => ajustar(v)}>
                        Ajustar
                      </button>{' '}
                      <button className="btn-sm" onClick={() => verKardex(v)}>
                        Kardex
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="modal-foot">
              <button onClick={onClose}>Cerrar</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: 8 }}>
              Movimientos de{' '}
              <b>
                {[kardexDe.talla && 'T:' + kardexDe.talla, kardexDe.color].filter(Boolean).join(' ') ||
                  'Estándar'}
              </b>{' '}
              · Stock actual: <b>{kardexDe.stock}</b>
            </p>
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th className="text-right">Cantidad</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {kardex.map((m) => (
                    <tr key={m.id}>
                      <td className="muted">{m.fecha}</td>
                      <td>{tipoLabel[m.tipo] ?? m.tipo}</td>
                      <td className="text-right" style={{ color: m.cantidad >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {m.cantidad >= 0 ? '+' : ''}
                        {m.cantidad}
                      </td>
                      <td className="muted">{m.motivo}</td>
                    </tr>
                  ))}
                  {kardex.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                        Sin movimientos registrados para esta variante.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="modal-foot">
              <button onClick={() => setKardexDe(null)}>← Volver</button>
              <button onClick={onClose}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function ProductoModal({
  producto,
  categorias,
  esRopa = true,
  onClose,
  onSaved,
  onCategoriaCreada
}: {
  producto: Producto
  categorias: any[]
  esRopa?: boolean
  onClose: () => void
  onSaved: () => void
  onCategoriaCreada: () => void
}): JSX.Element {
  const [form, setForm] = useState<Producto>({
    ...producto,
    variantes: producto.variantes?.length
      ? producto.variantes.map((v: any) => ({ ...v }))
      : [{ talla: '', color: '', codigo_barras: '', stock: 0, stock_minimo: 1 }]
  })
  const [agregandoCat, setAgregandoCat] = useState(false)
  const [catNombre, setCatNombre] = useState('')

  function set<K extends keyof Producto>(k: K, v: Producto[K]): void {
    setForm((f) => ({ ...f, [k]: v }))
  }

  // Autocálculo del precio de venta con IVA. Se activa mientras el usuario no lo
  // haya escrito a mano. Si borra el campo, se vuelve a activar.
  const [ventaAuto, setVentaAuto] = useState((producto?.precio_venta ?? 0) === 0)
  const calcVenta = (compra: number, iva: number): number => Math.round(compra * (1 + (iva || 0) / 100))

  function onPrecioCompra(v: number): void {
    setForm((f) => ({ ...f, precio_compra: v, ...(ventaAuto ? { precio_venta: calcVenta(v, f.iva_porcentaje) } : {}) }))
  }
  function onIva(v: number): void {
    setForm((f) => ({ ...f, iva_porcentaje: v, ...(ventaAuto ? { precio_venta: calcVenta(f.precio_compra, v) } : {}) }))
  }
  function onPrecioVenta(v: number): void {
    setVentaAuto(v === 0) // si lo dejan vacío, vuelve al autocálculo
    set('precio_venta', v)
  }

  function setVar(i: number, k: keyof Variante, v: any): void {
    setForm((f) => ({
      ...f,
      variantes: f.variantes.map((x, idx) => (idx === i ? { ...x, [k]: v } : x))
    }))
  }

  // Genera un código de barras numérico único (para productos sin código)
  function generarCodigo(i: number): void {
    const codigo = String(Date.now()).slice(-10) + String(i)
    setVar(i, 'codigo_barras', codigo)
  }

  function addVar(): void {
    setForm((f) => ({
      ...f,
      variantes: [...f.variantes, { talla: '', color: '', codigo_barras: '', stock: 0, stock_minimo: 1 }]
    }))
  }

  function delVar(i: number): void {
    setForm((f) => ({ ...f, variantes: f.variantes.filter((_, idx) => idx !== i) }))
  }

  async function crearCategoria(): Promise<void> {
    if (!catNombre.trim()) return
    const id = await window.api.categoriasCreate(catNombre.trim())
    onCategoriaCreada()
    set('categoria_id', id as number)
    setCatNombre('')
    setAgregandoCat(false)
  }

  async function guardar(): Promise<void> {
    if (!form.nombre.trim()) {
      alert('El nombre es obligatorio')
      return
    }
    await window.api.productosSave(form)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{form.id ? 'Editar producto' : 'Nuevo producto'}</h2>

        <div className="field">
          <label>Nombre *</label>
          <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} autoFocus />
        </div>

        <div className="grid-2">
          <div className="field">
            <label>SKU / Referencia</label>
            <input value={form.sku ?? ''} onChange={(e) => set('sku', e.target.value)} />
          </div>
          <div className="field">
            <label>Marca</label>
            <input value={form.marca ?? ''} onChange={(e) => set('marca', e.target.value)} />
          </div>
        </div>

        <div className="grid-3">
          <div className="field">
            <label>Precio compra</label>
            <input
              type="number"
              value={form.precio_compra || ''}
              onChange={(e) => onPrecioCompra(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Precio venta (con IVA)</label>
            <input
              type="number"
              value={form.precio_venta || ''}
              onChange={(e) => onPrecioVenta(Number(e.target.value))}
            />
            {ventaAuto && form.precio_compra > 0 && (
              <span className="muted" style={{ fontSize: 11 }}>
                Auto: compra + {form.iva_porcentaje}% IVA. Puedes cambiarlo.
              </span>
            )}
          </div>
          <div className="field">
            <label>IVA %</label>
            <select
              value={form.iva_porcentaje}
              onChange={(e) => onIva(Number(e.target.value))}
            >
              <option value={0}>0% (excluido)</option>
              <option value={5}>5%</option>
              <option value={19}>19%</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Categoría</label>
          {agregandoCat ? (
            <div className="row">
              <input
                value={catNombre}
                onChange={(e) => setCatNombre(e.target.value)}
                placeholder="Nombre de la nueva categoría"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && crearCategoria()}
              />
              <button className="btn-sm btn-primary btn-icon" onClick={crearCategoria}>
                <Icon name="check" size={14} /> Crear
              </button>
              <button className="btn-sm" onClick={() => setAgregandoCat(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="row">
              <select
                value={form.categoria_id ?? ''}
                onChange={(e) => set('categoria_id', e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <button className="btn-sm btn-icon" onClick={() => setAgregandoCat(true)}>
                <Icon name="plus" size={14} /> Categoría
              </button>
            </div>
          )}
        </div>

        {esRopa ? (
          <>
            <label style={{ marginTop: 8 }}>Variantes (talla / color / stock)</label>
            <table style={{ marginBottom: 8 }}>
              <thead>
                <tr>
                  <th>Talla</th>
                  <th>Color</th>
                  <th>Cód. barras</th>
                  <th>Stock</th>
                  <th>Mín.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {form.variantes.map((v, i) => (
                  <tr key={i}>
                    <td>
                      <input value={v.talla ?? ''} onChange={(e) => setVar(i, 'talla', e.target.value)} />
                    </td>
                    <td>
                      <input value={v.color ?? ''} onChange={(e) => setVar(i, 'color', e.target.value)} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          value={v.codigo_barras ?? ''}
                          onChange={(e) => setVar(i, 'codigo_barras', e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-sm"
                          title="Generar código automático"
                          style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}
                          onClick={() => generarCodigo(i)}
                        >
                          Gen
                        </button>
                      </div>
                    </td>
                    <td style={{ width: 80 }}>
                      <input
                        type="number"
                        value={v.stock || ''}
                        onChange={(e) => setVar(i, 'stock', Number(e.target.value))}
                      />
                    </td>
                    <td style={{ width: 70 }}>
                      <input
                        type="number"
                        value={v.stock_minimo || ''}
                        onChange={(e) => setVar(i, 'stock_minimo', Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <button
                        className="btn-sm btn-danger"
                        onClick={() => delVar(i)}
                        title="Eliminar variante"
                        style={{ display: 'inline-flex', padding: '6px 8px' }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn-sm btn-icon" onClick={addVar}>
              <Icon name="plus" size={14} /> Agregar variante
            </button>
          </>
        ) : (
          // Modo simple (bar/restaurante/general): un solo stock, sin tallas/colores
          <div className="grid-3">
            <div className="field">
              <label>Código de barras</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={form.variantes[0]?.codigo_barras ?? ''}
                  onChange={(e) => setVar(0, 'codigo_barras', e.target.value)}
                />
                <button
                  type="button"
                  className="btn-sm"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={() => generarCodigo(0)}
                >
                  Generar
                </button>
              </div>
            </div>
            <div className="field">
              <label>Stock actual</label>
              <input
                type="number"
                value={form.variantes[0]?.stock || ''}
                onChange={(e) => setVar(0, 'stock', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Stock mínimo</label>
              <input
                type="number"
                value={form.variantes[0]?.stock_minimo || ''}
                onChange={(e) => setVar(0, 'stock_minimo', Number(e.target.value))}
              />
            </div>
          </div>
        )}

        <div className="modal-foot">
          <button onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={guardar}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
