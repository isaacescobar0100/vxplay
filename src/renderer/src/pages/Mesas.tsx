import { useEffect, useState } from 'react'
import type { Usuario } from '../App'
import { cop } from '../util'
import Icon from '../components/Icon'
import { Checkout, type CartItem } from './Ventas'

export default function Mesas({ usuario }: { usuario: Usuario }): JSX.Element {
  const [mesas, setMesas] = useState<any[]>([])
  const [comanda, setComanda] = useState<any | null>(null)
  const [mesaActual, setMesaActual] = useState<any | null>(null)

  async function cargar(): Promise<void> {
    setMesas((await window.api.mesasList()) as any[])
  }
  useEffect(() => {
    cargar()
  }, [])

  async function abrirMesa(mesa: any): Promise<void> {
    const c = await window.api.comandaAbrir(mesa.id, usuario.id)
    setMesaActual(mesa)
    setComanda(c)
  }

  async function nuevaMesa(): Promise<void> {
    const nombre = String(mesas.length + 1)
    await window.api.mesasCrear('Mesa ' + nombre)
    cargar()
  }

  if (comanda) {
    return (
      <Comanda
        comandaInicial={comanda}
        mesa={mesaActual}
        usuario={usuario}
        onSalir={() => {
          setComanda(null)
          setMesaActual(null)
          cargar()
        }}
      />
    )
  }

  return (
    <div>
      <div className="toolbar">
        <div className="page-title" style={{ flex: 1, margin: 0 }}>
          Mesas
        </div>
        <button className="btn-primary btn-icon" onClick={nuevaMesa}>
          <Icon name="plus" size={16} /> Nueva mesa
        </button>
      </div>

      {mesas.length === 0 ? (
        <div className="card muted">
          No hay mesas. Crea la primera con <b>+ Nueva mesa</b>.
        </div>
      ) : (
        <div className="prod-grid">
          {mesas.map((m) => {
            const ocupada = m.estado === 'ocupada'
            return (
              <button
                key={m.id}
                className="prod-card"
                onClick={() => abrirMesa(m)}
                style={{ borderColor: ocupada ? 'var(--red)' : 'var(--green)', minHeight: 90 }}
              >
                <div style={{ fontWeight: 700, fontSize: 15 }}>{m.nombre}</div>
                <div className={'badge ' + (ocupada ? 'badge-red' : 'badge-green')} style={{ alignSelf: 'flex-start' }}>
                  {ocupada ? 'Ocupada' : 'Libre'}
                </div>
                {ocupada && <div style={{ color: '#4ade80', fontWeight: 700 }}>{cop(m.total)}</div>}
              </button>
            )
          })}
        </div>
      )}
      <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
        Verde = libre · Roja = ocupada (con cuenta abierta). Toca una mesa para tomar el pedido o cobrar.
      </p>
    </div>
  )
}

// ---------- Vista de una comanda (cuenta de la mesa) ----------
function Comanda({
  comandaInicial,
  mesa,
  usuario,
  onSalir
}: {
  comandaInicial: any
  mesa: any
  usuario: Usuario
  onSalir: () => void
}): JSX.Element {
  const [items, setItems] = useState<any[]>(comandaInicial.items ?? [])
  const [productos, setProductos] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [checkout, setCheckout] = useState(false)
  const [cajaAbierta, setCajaAbierta] = useState<boolean | null>(null)
  const comandaId = comandaInicial.id

  useEffect(() => {
    window.api.productosList().then((p: any) => setProductos(p))
    window.api.cajaActual().then((s: any) => setCajaAbierta(!!s))
  }, [])

  const filtrados = productos.filter((p) => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  async function agregar(p: any): Promise<void> {
    const v = (p.variantes ?? [])[0]
    if (!v) {
      alert('El producto no tiene variante/stock configurado')
      return
    }
    const existe = items.find((i) => i.variante_id === v.id)
    if (existe) {
      await window.api.comandaCambiarCantidad(existe.id, existe.cantidad + 1)
    } else {
      await window.api.comandaAgregarItem(comandaId, {
        variante_id: v.id,
        producto_nombre: p.nombre,
        cantidad: 1,
        precio_unitario: p.precio_venta,
        iva_porcentaje: p.iva_porcentaje
      })
    }
    setItems((await recargarItems()) as any[])
  }

  async function cambiar(item: any, delta: number): Promise<void> {
    await window.api.comandaCambiarCantidad(item.id, item.cantidad + delta)
    setItems((await recargarItems()) as any[])
  }

  async function recargarItems(): Promise<any[]> {
    const c = await window.api.comandaAbrir(mesa.id, usuario.id)
    return (c as any).items ?? []
  }

  const total = items.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)
  const subtotal = items.reduce(
    (s, i) => s + Math.round((i.precio_unitario * i.cantidad) / (1 + (i.iva_porcentaje || 0) / 100)),
    0
  )
  const iva = total - subtotal

  const cart: CartItem[] = items.map((it) => ({
    key: 'ci' + it.id,
    variante_id: it.variante_id,
    producto_nombre: it.producto_nombre,
    precio_unitario: it.precio_unitario,
    iva_porcentaje: it.iva_porcentaje || 0,
    cantidad: it.cantidad,
    stock: 99999
  }))

  return (
    <div className="pos">
      <div className="pos-productos">
        <div className="toolbar">
          <button className="btn-icon" onClick={onSalir}>
            ← Volver a mesas
          </button>
          <input
            className="search"
            placeholder="Buscar producto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        {filtrados.length === 0 ? (
          <div className="card muted">No hay productos. Créalos en Inventario.</div>
        ) : (
          <div className="prod-grid">
            {filtrados.map((p) => (
              <button key={p.id} className="prod-card" onClick={() => agregar(p)}>
                <div className="prod-name">{p.nombre}</div>
                <div className="prod-price">{cop(p.precio_venta)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pos-cart">
        <div className="cart-header">🍽️ {mesa?.nombre} — Cuenta</div>
        <div className="cart-items">
          {items.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              Toca productos para agregarlos a la cuenta de esta mesa.
            </p>
          ) : (
            items.map((i) => (
              <div key={i.id} className="cart-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{i.producto_nombre}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {cop(i.precio_unitario)}
                  </div>
                </div>
                <button className="qty-btn" onClick={() => cambiar(i, -1)}>
                  −
                </button>
                <span style={{ minWidth: 20, textAlign: 'center' }}>{i.cantidad}</span>
                <button className="qty-btn" onClick={() => cambiar(i, 1)}>
                  +
                </button>
                <div style={{ minWidth: 70, textAlign: 'right', fontWeight: 600 }}>
                  {cop(i.precio_unitario * i.cantidad)}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="cart-foot">
          <div className="total-line grand">
            <span>TOTAL</span>
            <span>{cop(total)}</span>
          </div>
          {cajaAbierta === false && (
            <div
              className="card"
              style={{ background: 'rgba(245,158,11,.12)', border: '1px solid var(--amber)', marginTop: 12, padding: 12, fontSize: 13 }}
            >
              <b style={{ color: 'var(--amber)' }}>Caja cerrada.</b> Abre la caja para poder cobrar.
            </div>
          )}
          <button
            className="btn-green"
            style={{ width: '100%', marginTop: 14 }}
            disabled={items.length === 0 || cajaAbierta === false}
            onClick={() => setCheckout(true)}
          >
            Cobrar {cop(total)}
          </button>
        </div>
      </div>

      {checkout && (
        <Checkout
          cart={cart}
          subtotal={subtotal}
          iva={iva}
          total={total}
          usuario={usuario}
          onCancel={() => setCheckout(false)}
          onCrear={(payload) => window.api.comandaCobrar(comandaId, payload)}
          onDone={onSalir}
        />
      )}
    </div>
  )
}
