import { useEffect, useState } from 'react'
import { avisar, confirmar } from '../dialogo'
import type { Usuario } from '../App'
import { cop } from '../util'
import Icon from '../components/Icon'
import { ProductoModal, productoVacio } from './Inventario'

interface VarianteOpc {
  variante_id: number
  etiqueta: string
  producto_nombre: string
  talla?: string
  color?: string
  costo: number
}

/** Fecha de hoy en formato YYYY-MM-DD según la hora local (no UTC). */
function hoyLocal(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export default function Compras({ usuario }: { usuario: Usuario }): JSX.Element {
  const [compras, setCompras] = useState<any[]>([])
  const [nuevaCompra, setNuevaCompra] = useState(false)
  const [verProveedores, setVerProveedores] = useState(false)
  const [detalle, setDetalle] = useState<any | null>(null)
  const [editar, setEditar] = useState<any | null>(null)

  async function cargar(): Promise<void> {
    setCompras((await window.api.comprasList(100)) as any[])
  }

  async function borrar(c: any): Promise<void> {
    if (
      !(await confirmar(
        `¿Borrar la entrada ${c.numero} por ${cop(c.total)}?\n\nSe descontará del stock la mercancía que había sumado. Esta acción no se puede deshacer.`
      ))
    ) {
      return
    }
    await window.api.comprasEliminar(c.id)
    cargar()
  }
  useEffect(() => {
    cargar()
  }, [])

  return (
    <div>
      <div className="page-title">Compras / Entrada de mercancía</div>
      <div className="toolbar">
        <p className="muted" style={{ flex: 1 }}>
          Registra la mercancía que llega para <b>aumentar el stock</b> y guardar el costo por
          proveedor.
        </p>
        <button className="btn-icon" onClick={() => setVerProveedores(true)}>
          <Icon name="store" size={16} /> Proveedores
        </button>
        <button className="btn-primary btn-icon" onClick={() => setNuevaCompra(true)}>
          <Icon name="plus" size={16} /> Registrar entrada
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th className="text-right">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {compras.map((c) => (
              <tr key={c.id}>
                <td>
                  <b>{c.numero}</b>
                </td>
                <td className="muted">{c.fecha}</td>
                <td>{c.proveedor_nombre ?? '—'}</td>
                <td className="text-right">
                  <b>{cop(c.total)}</b>
                </td>
                <td className="text-right" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn-sm" onClick={async () => setDetalle(await window.api.comprasGet(c.id))}>
                    Ver
                  </button>{' '}
                  <button className="btn-sm" onClick={async () => setEditar(await window.api.comprasGet(c.id))}>
                    Editar
                  </button>{' '}
                  <button className="btn-sm btn-danger" title="Borrar entrada" onClick={() => borrar(c)}>
                    <Icon name="trash" size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {compras.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                  Aún no has registrado compras.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {nuevaCompra && (
        <CompraModal
          usuario={usuario}
          onClose={() => setNuevaCompra(false)}
          onDone={() => {
            setNuevaCompra(false)
            cargar()
          }}
        />
      )}
      {editar && (
        <CompraModal
          usuario={usuario}
          edicion={editar}
          onClose={() => setEditar(null)}
          onDone={() => {
            setEditar(null)
            cargar()
          }}
        />
      )}
      {verProveedores && <ProveedoresModal onClose={() => setVerProveedores(false)} />}
      {detalle && (
        <div className="modal-overlay" onClick={() => setDetalle(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Compra {detalle.numero}</h2>
            <p className="muted">
              {detalle.fecha} · {detalle.proveedor_nombre ?? 'Sin proveedor'}
            </p>
            <table style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="text-right">Cant.</th>
                  <th className="text-right">Costo</th>
                  <th className="text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(detalle.items ?? []).map((it: any) => (
                  <tr key={it.id}>
                    <td>
                      {it.producto_nombre}
                      <span className="muted"> {[it.talla, it.color].filter(Boolean).join(' ')}</span>
                    </td>
                    <td className="text-right">{it.cantidad}</td>
                    <td className="text-right">{cop(it.costo_unitario)}</td>
                    <td className="text-right">{cop(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="total-line grand">
              <span>TOTAL</span>
              <span>{cop(detalle.total)}</span>
            </div>
            {detalle.notas && <p className="muted" style={{ marginTop: 8 }}>Notas: {detalle.notas}</p>}
            <div className="modal-foot">
              <button onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Modal registrar compra / entrada de mercancía ----------
function CompraModal({
  usuario,
  edicion,
  onClose,
  onDone
}: {
  usuario: Usuario
  edicion?: any
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const [proveedores, setProveedores] = useState<any[]>([])
  const [proveedorId, setProveedorId] = useState<number | null>(edicion?.proveedor_id ?? null)
  const [opciones, setOpciones] = useState<VarianteOpc[]>([])
  const [items, setItems] = useState<any[]>(
    edicion
      ? (edicion.items ?? []).map((it: any) => ({
          variante_id: it.variante_id,
          producto_nombre: it.producto_nombre,
          talla: it.talla,
          color: it.color,
          cantidad: it.cantidad,
          costo_unitario: it.costo_unitario
        }))
      : []
  )
  const [notas, setNotas] = useState(edicion?.notas ?? '')
  const [fecha, setFecha] = useState(edicion ? (edicion.fecha ?? '').slice(0, 10) || hoyLocal() : hoyLocal())
  const [procesando, setProcesando] = useState(false)
  const [categorias, setCategorias] = useState<any[]>([])
  const [nuevoProducto, setNuevoProducto] = useState(false)
  const [creandoProv, setCreandoProv] = useState(false)
  const [nuevoProv, setNuevoProv] = useState({ nombre: '', nit: '', telefono: '' })

  async function cargarProveedores(): Promise<void> {
    setProveedores((await window.api.proveedoresList()) as any[])
  }

  async function guardarProveedor(): Promise<void> {
    if (!nuevoProv.nombre.trim()) {
      avisar('El nombre del proveedor es obligatorio')
      return
    }
    const id = (await window.api.proveedoresSave(nuevoProv)) as number
    await cargarProveedores()
    setProveedorId(id)
    setNuevoProv({ nombre: '', nit: '', telefono: '' })
    setCreandoProv(false)
  }

  async function cargarOpciones(): Promise<void> {
    const prods = (await window.api.productosList()) as any[]
    const opc: VarianteOpc[] = []
    for (const p of prods) {
      for (const v of p.variantes ?? []) {
        opc.push({
          variante_id: v.id,
          producto_nombre: p.nombre,
          talla: v.talla,
          color: v.color,
          costo: p.precio_compra ?? 0,
          etiqueta: `${p.nombre} ${[v.talla && 'T:' + v.talla, v.color].filter(Boolean).join(' ')}`.trim()
        })
      }
    }
    setOpciones(opc)
  }

  useEffect(() => {
    window.api.proveedoresList().then((p: any) => setProveedores(p))
    window.api.categoriasList().then((c: any) => setCategorias(c))
    cargarOpciones()
  }, [])

  function agregarLinea(): void {
    if (opciones.length === 0) {
      avisar('Primero crea productos en Inventario')
      return
    }
    const first = opciones[0]
    setItems((prev) => [
      ...prev,
      {
        variante_id: first.variante_id,
        producto_nombre: first.producto_nombre,
        talla: first.talla,
        color: first.color,
        cantidad: 1,
        costo_unitario: first.costo
      }
    ])
  }

  function setLinea(i: number, campo: string, valor: any): void {
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== i) return it
        if (campo === 'variante_id') {
          const opc = opciones.find((o) => o.variante_id === Number(valor))!
          return {
            ...it,
            variante_id: opc.variante_id,
            producto_nombre: opc.producto_nombre,
            talla: opc.talla,
            color: opc.color,
            costo_unitario: it.costo_unitario || opc.costo
          }
        }
        return { ...it, [campo]: valor }
      })
    )
  }

  const total = items.reduce((s, it) => s + it.costo_unitario * it.cantidad, 0)

  async function guardar(): Promise<void> {
    if (items.length === 0) {
      avisar('Agrega al menos un producto')
      return
    }
    setProcesando(true)
    const payload = { proveedor_id: proveedorId, usuario_id: usuario.id, notas, fecha, items }
    try {
      if (edicion) await window.api.comprasActualizar(edicion.id, payload)
      else await window.api.comprasCrear(payload)
    } catch (e: any) {
      setProcesando(false)
      avisar('No se pudo guardar la entrada:\n' + (e?.message ?? e))
      return
    }
    setProcesando(false)
    avisar(edicion ? 'Entrada actualizada. El stock se ajustó.' : 'Entrada registrada. El stock fue actualizado.')
    onDone()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 720 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">
          <Icon name="box" size={20} /> {edicion ? 'Editar entrada de mercancía' : 'Registrar entrada de mercancía'}
        </h2>
        <div className="field">
          <label>Proveedor</label>
          <div className="row" style={{ gap: 8 }}>
            <select
              value={proveedorId ?? ''}
              onChange={(e) => setProveedorId(e.target.value ? Number(e.target.value) : null)}
              disabled={creandoProv}
            >
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-icon"
              style={{ whiteSpace: 'nowrap' }}
              onClick={() => setCreandoProv((v) => !v)}
            >
              <Icon name={creandoProv ? 'trash' : 'plus'} size={15} />
              {creandoProv ? 'Cancelar' : 'Nuevo'}
            </button>
          </div>
          {creandoProv && (
            <div className="card" style={{ marginTop: 10, background: 'var(--bg)' }}>
              <div className="grid-3">
                <div className="field" style={{ margin: 0 }}>
                  <label>Nombre *</label>
                  <input
                    value={nuevoProv.nombre}
                    onChange={(e) => setNuevoProv({ ...nuevoProv, nombre: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>NIT</label>
                  <input
                    value={nuevoProv.nit}
                    onChange={(e) => setNuevoProv({ ...nuevoProv, nit: e.target.value })}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Teléfono</label>
                  <input
                    value={nuevoProv.telefono}
                    onChange={(e) => setNuevoProv({ ...nuevoProv, telefono: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button className="btn-primary btn-icon" onClick={guardarProveedor}>
                  <Icon name="check" size={15} /> Guardar y usar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="field">
          <label>Fecha de la entrada</label>
          <input
            type="date"
            value={fecha}
            max={hoyLocal()}
            onChange={(e) => setFecha(e.target.value || hoyLocal())}
            style={{ maxWidth: 200 }}
          />
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Déjala en hoy para una entrada normal. Elige una <b>fecha anterior</b> para cargar inventario de días
            pasados (útil al empezar a usar el POS con mercancía que ya tenías).
          </p>
        </div>

        <label>Productos que llegan</label>
        <table>
          <thead>
            <tr>
              <th>Producto / variante</th>
              <th style={{ width: 90 }}>Cantidad</th>
              <th style={{ width: 120 }}>Costo unit.</th>
              <th className="text-right">Subtotal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>
                  <select value={it.variante_id} onChange={(e) => setLinea(i, 'variante_id', e.target.value)}>
                    {opciones.map((o) => (
                      <option key={o.variante_id} value={o.variante_id}>
                        {o.etiqueta}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    value={it.cantidad || ''}
                    min={1}
                    onChange={(e) => setLinea(i, 'cantidad', Number(e.target.value))}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={it.costo_unitario || ''}
                    onChange={(e) => setLinea(i, 'costo_unitario', Number(e.target.value))}
                  />
                </td>
                <td className="text-right">{cop(it.costo_unitario * it.cantidad)}</td>
                <td>
                  <button
                    className="btn-sm btn-danger"
                    style={{ padding: '6px 8px' }}
                    onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn-sm btn-icon" onClick={agregarLinea}>
            <Icon name="plus" size={14} /> Agregar producto
          </button>
          <button className="btn-sm btn-icon" onClick={() => setNuevoProducto(true)}>
            <Icon name="shirt" size={14} /> Crear producto nuevo
          </button>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Notas (opcional)</label>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="N° de factura del proveedor, etc." />
        </div>

        <div
          className="card"
          style={{ marginTop: 8, background: 'var(--bg)', display: 'flex', justifyContent: 'space-between' }}
        >
          <span className="muted">Total de la compra</span>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{cop(total)}</span>
        </div>

        <div className="modal-foot">
          <button onClick={onClose} disabled={procesando}>
            Cancelar
          </button>
          <button className="btn-green btn-icon" onClick={guardar} disabled={procesando}>
            <Icon name="check" size={15} />{' '}
            {procesando ? 'Guardando...' : edicion ? 'Guardar cambios' : 'Registrar y sumar stock'}
          </button>
        </div>
      </div>

      {nuevoProducto && (
        <ProductoModal
          producto={{ ...productoVacio, variantes: [] }}
          categorias={categorias}
          onClose={() => setNuevoProducto(false)}
          onSaved={async () => {
            setNuevoProducto(false)
            await cargarOpciones()
          }}
          onCategoriaCreada={() => window.api.categoriasList().then((c: any) => setCategorias(c))}
        />
      )}
    </div>
  )
}

// ---------- Modal proveedores ----------
function ProveedoresModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [lista, setLista] = useState<any[]>([])
  const [editando, setEditando] = useState<any | null>(null)

  async function cargar(): Promise<void> {
    setLista((await window.api.proveedoresList()) as any[])
  }
  useEffect(() => {
    cargar()
  }, [])

  async function guardar(): Promise<void> {
    if (!editando.nombre?.trim()) {
      avisar('El nombre es obligatorio')
      return
    }
    await window.api.proveedoresSave(editando)
    setEditando(null)
    cargar()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 600 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">
          <Icon name="store" size={20} /> Proveedores
        </h2>
        {editando ? (
          <div>
            <div className="field">
              <label>Nombre / Razón social *</label>
              <input
                value={editando.nombre ?? ''}
                onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                autoFocus
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>NIT</label>
                <input
                  value={editando.nit ?? ''}
                  onChange={(e) => setEditando({ ...editando, nit: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Teléfono</label>
                <input
                  value={editando.telefono ?? ''}
                  onChange={(e) => setEditando({ ...editando, telefono: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Email</label>
                <input
                  value={editando.email ?? ''}
                  onChange={(e) => setEditando({ ...editando, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Dirección</label>
                <input
                  value={editando.direccion ?? ''}
                  onChange={(e) => setEditando({ ...editando, direccion: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-foot">
              <button onClick={() => setEditando(null)}>Volver</button>
              <button className="btn-primary" onClick={guardar}>
                Guardar
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button
              className="btn-primary btn-icon"
              style={{ marginBottom: 12 }}
              onClick={() => setEditando({ nombre: '', nit: '', telefono: '', email: '', direccion: '' })}
            >
              <Icon name="plus" size={15} /> Nuevo proveedor
            </button>
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>NIT</th>
                  <th>Teléfono</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.nombre}</b>
                    </td>
                    <td className="muted">{p.nit}</td>
                    <td className="muted">{p.telefono}</td>
                    <td className="text-right">
                      <button className="btn-sm" onClick={() => setEditando(p)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                      Sin proveedores todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="modal-foot">
              <button onClick={onClose}>Cerrar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
