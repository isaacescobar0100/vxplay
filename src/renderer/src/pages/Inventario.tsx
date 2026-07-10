import { useEffect, useState } from 'react'
import { cop } from '../util'
import Icon from '../components/Icon'

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

  useEffect(() => {
    cargar()
    window.api.categoriasList().then((c: any) => setCategorias(c))
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
  onClose,
  onSaved,
  onCategoriaCreada
}: {
  producto: Producto
  categorias: any[]
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

  function setVar(i: number, k: keyof Variante, v: any): void {
    setForm((f) => ({
      ...f,
      variantes: f.variantes.map((x, idx) => (idx === i ? { ...x, [k]: v } : x))
    }))
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
              onChange={(e) => set('precio_compra', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Precio venta (con IVA)</label>
            <input
              type="number"
              value={form.precio_venta || ''}
              onChange={(e) => set('precio_venta', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>IVA %</label>
            <select
              value={form.iva_porcentaje}
              onChange={(e) => set('iva_porcentaje', Number(e.target.value))}
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
                  <input
                    value={v.codigo_barras ?? ''}
                    onChange={(e) => setVar(i, 'codigo_barras', e.target.value)}
                  />
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
