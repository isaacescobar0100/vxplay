import { useEffect, useRef, useState } from 'react'
import type { Usuario } from '../App'
import { cop } from '../util'
import Icon from '../components/Icon'

interface Variante {
  id: number
  talla?: string
  color?: string
  stock: number
  codigo_barras?: string
}
interface Producto {
  id: number
  nombre: string
  precio_venta: number
  iva_porcentaje: number
  variantes: Variante[]
}
export interface CartItem {
  key: string
  variante_id: number
  producto_nombre: string
  talla?: string
  color?: string
  precio_unitario: number
  iva_porcentaje: number
  cantidad: number
  stock: number
}

export default function Ventas({ usuario }: { usuario: Usuario }): JSX.Element {
  const [productos, setProductos] = useState<Producto[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [pickVariante, setPickVariante] = useState<Producto | null>(null)
  const [checkout, setCheckout] = useState(false)
  const [cajaAbierta, setCajaAbierta] = useState<boolean | null>(null)
  const [dianOn, setDianOn] = useState(false)
  const [mostrarPrecios, setMostrarPrecios] = useState(false)
  const [catSel, setCatSel] = useState<string>('')
  const codigoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar(): Promise<void> {
    const p = await window.api.productosList()
    setProductos(p as Producto[])
    const s = await window.api.cajaActual()
    setCajaAbierta(!!s)
    const cfg: any = await window.api.configGetAll()
    setDianOn(cfg.dian_habilitado === '1')
  }

  // Categorías disponibles (a partir de los productos cargados) para filtrar rápido
  const categorias = Array.from(
    new Set(productos.map((p: any) => p.categoria).filter((c) => c && String(c).trim()))
  ).sort() as string[]

  const filtrados = productos.filter(
    (p) =>
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) &&
      (!catSel || (p as any).categoria === catSel)
  )

  function agregarVariante(p: Producto, v: Variante): void {
    if (v.stock <= 0) {
      alert('Sin stock disponible')
      return
    }
    const key = 'v' + v.id
    setCart((prev) => {
      const existe = prev.find((i) => i.key === key)
      if (existe) {
        if (existe.cantidad >= v.stock) {
          alert('No hay más stock de esta variante')
          return prev
        }
        return prev.map((i) => (i.key === key ? { ...i, cantidad: i.cantidad + 1 } : i))
      }
      return [
        ...prev,
        {
          key,
          variante_id: v.id,
          producto_nombre: p.nombre,
          talla: v.talla,
          color: v.color,
          precio_unitario: p.precio_venta,
          iva_porcentaje: p.iva_porcentaje,
          cantidad: 1,
          stock: v.stock
        }
      ]
    })
    setPickVariante(null)
  }

  function clickProducto(p: Producto): void {
    const conStock = p.variantes.filter((v) => v.stock > 0)
    if (conStock.length === 0) {
      alert('Producto sin stock')
      return
    }
    if (conStock.length === 1) agregarVariante(p, conStock[0])
    else setPickVariante(p)
  }

  function cambiarCantidad(key: string, delta: number): void {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.key !== key) return i
          const nueva = i.cantidad + delta
          if (nueva > i.stock) {
            alert('No hay más stock')
            return i
          }
          return { ...i, cantidad: nueva }
        })
        .filter((i) => i.cantidad > 0)
    )
  }

  // Precio editable por línea (a veces negocian el precio, no es fijo).
  function cambiarPrecio(key: string, precio: number): void {
    setCart((prev) => prev.map((i) => (i.key === key ? { ...i, precio_unitario: Math.max(0, precio) } : i)))
  }

  async function procesarCodigo(codigo: string): Promise<void> {
    const c = (codigo || '').trim()
    if (!c) return
    const v: any = await window.api.buscarPorCodigo(c)
    if (!v) {
      alert('Código no encontrado: ' + c)
    } else {
      agregarVariante(
        {
          id: v.producto_id,
          nombre: v.producto_nombre,
          precio_venta: v.precio_venta,
          iva_porcentaje: v.iva_porcentaje,
          variantes: []
        } as Producto,
        { id: v.id, talla: v.talla, color: v.color, stock: v.stock }
      )
    }
  }

  async function buscarCodigo(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    await procesarCodigo(codigoRef.current?.value ?? '')
    if (codigoRef.current) codigoRef.current.value = ''
  }

  // Lector GLOBAL de código de barras: la pistola "teclea" muy rápido y termina
  // en Enter. Detectamos esa ráfaga en cualquier parte del POS (sin depender del
  // foco) y agregamos el producto. El tecleo humano (más lento) no se afecta.
  useEffect(() => {
    let buffer = ''
    let last = 0
    const onKey = (e: KeyboardEvent): void => {
      if (checkout || pickVariante) return // no interferir con los modales
      const now = Date.now()
      if (e.key === 'Enter') {
        if (buffer.length >= 3 && now - last < 120) {
          e.preventDefault()
          const codigo = buffer
          buffer = ''
          procesarCodigo(codigo)
        } else {
          buffer = ''
        }
        return
      }
      if (e.key.length === 1) {
        if (now - last > 120) buffer = '' // gap grande = tecleo humano → reinicia
        buffer += e.key
        if (buffer.length >= 2 && now - last < 120) e.preventDefault() // ráfaga = pistola
        last = now
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout, pickVariante])

  const subtotal = cart.reduce(
    (s, i) => s + Math.round((i.precio_unitario * i.cantidad) / (1 + i.iva_porcentaje / 100)),
    0
  )
  const iva = cart.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0) - subtotal
  const total = cart.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)

  return (
    <div className="pos">
      <div className="pos-productos">
        <div className="toolbar">
          <form onSubmit={buscarCodigo} style={{ flex: '0 0 260px' }}>
            <div className="input-icon">
              <Icon name="scan" size={16} />
              <input ref={codigoRef} className="search" placeholder="Escanear código de barras..." autoFocus />
            </div>
          </form>
          <div className="input-icon" style={{ flex: 1 }}>
            <Icon name="search" size={16} />
            <input
              className="search"
              placeholder="Buscar producto por nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {categorias.length > 0 && (
          <div className="cat-chips">
            <button
              type="button"
              className={'chip-cat' + (catSel === '' ? ' active' : '')}
              onClick={() => setCatSel('')}
            >
              Todas
            </button>
            {categorias.map((c) => (
              <button
                key={c}
                type="button"
                className={'chip-cat' + (catSel === c ? ' active' : '')}
                onClick={() => setCatSel(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {filtrados.length === 0 ? (
          <div className="card muted">
            {catSel || busqueda ? 'No hay productos que coincidan.' : (
              <>No hay productos. Agrega productos en la sección <b>Inventario</b>.</>
            )}
          </div>
        ) : (
          <div className="prod-grid">
            {filtrados.map((p) => {
              const stockTotal = p.variantes.reduce((s, v) => s + v.stock, 0)
              const nivel = stockTotal <= 0 ? 'out' : stockTotal <= 5 ? 'low' : 'ok'
              return (
                <button
                  key={p.id}
                  className={'prod-card' + (nivel === 'out' ? ' agotado' : '')}
                  onClick={() => clickProducto(p)}
                >
                  <div className="prod-top">
                    <span className="prod-name">{p.nombre}</span>
                    <span className="prod-add">+</span>
                  </div>
                  <div className="prod-price">{cop(p.precio_venta)}</div>
                  <div className="prod-meta">
                    <span className={'chip' + (nivel === 'out' ? ' out' : nivel === 'low' ? ' low' : '')}>
                      {stockTotal <= 0 ? 'Agotado' : stockTotal + ' en stock'}
                    </span>
                    {p.variantes.length > 1 && <span className="chip">{p.variantes.length} var.</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Carrito */}
      <div className="pos-cart">
        <div className="cart-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="cart" size={18} /> Venta actual ({cart.length})
          <div style={{ flex: 1 }} />
          <button
            className="btn-sm"
            onClick={() => setMostrarPrecios((v) => !v)}
            title="Mostrar u ocultar el TOTAL grande (para que el cliente no lo vea antes de tiempo)"
            style={{ fontSize: 11 }}
          >
            {mostrarPrecios ? 'Ocultar total' : 'Mostrar total'}
          </button>
        </div>
        <div className="cart-items">
          {cart.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              Agrega productos para iniciar la venta.
            </p>
          ) : (
            cart.map((i) => (
              <div key={i.key} className="cart-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{i.producto_nombre}</div>
                  <div
                    className="muted"
                    style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}
                  >
                    {[i.talla && 'T:' + i.talla, i.color].filter(Boolean).join(' · ')}
                    <span title="Precio editable: puedes cambiarlo si negocian otro valor" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      $
                      <input
                        type="number"
                        value={i.precio_unitario || ''}
                        onChange={(e) => cambiarPrecio(i.key, Number(e.target.value))}
                        onFocus={(e) => e.target.select()}
                        style={{
                          width: 74,
                          padding: '2px 6px',
                          fontSize: 12,
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          background: 'var(--panel-2)',
                          color: 'var(--text)'
                        }}
                      />
                    </span>
                  </div>
                </div>
                <button className="qty-btn" onClick={() => cambiarCantidad(i.key, -1)}>
                  −
                </button>
                <span style={{ minWidth: 20, textAlign: 'center' }}>{i.cantidad}</span>
                <button className="qty-btn" onClick={() => cambiarCantidad(i.key, 1)}>
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
          {dianOn && (
            <>
              <div className="total-line muted">
                <span>Subtotal</span>
                <span>{cop(subtotal)}</span>
              </div>
              <div className="total-line muted">
                <span>IVA</span>
                <span>{cop(iva)}</span>
              </div>
            </>
          )}
          <div className="total-line grand">
            <span>TOTAL</span>
            <span>{mostrarPrecios ? cop(total) : '••••••'}</span>
          </div>
          {cajaAbierta === false && (
            <div
              className="card"
              style={{ background: 'rgba(245,158,11,.12)', border: '1px solid var(--amber)', marginTop: 12, padding: 12, fontSize: 13 }}
            >
              <b style={{ color: 'var(--amber)' }}>Caja cerrada.</b> Abre la caja en la sección{' '}
              <b>Caja</b> para poder cobrar.
            </div>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            <button style={{ flex: 1 }} onClick={() => setCart([])} disabled={cart.length === 0}>
              Cancelar
            </button>
            <button
              className="btn-green"
              style={{ flex: 2 }}
              onClick={() => setCheckout(true)}
              disabled={cart.length === 0 || cajaAbierta === false}
            >
              Cobrar {mostrarPrecios ? cop(total) : '••••••'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal seleccionar variante */}
      {pickVariante && (
        <div className="modal-overlay" onClick={() => setPickVariante(null)}>
          <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <h2>{pickVariante.nombre}</h2>
            <p className="muted" style={{ marginBottom: 12 }}>
              Selecciona talla / color:
            </p>
            <div className="grid-2">
              {pickVariante.variantes.map((v) => (
                <button
                  key={v.id}
                  disabled={v.stock <= 0}
                  onClick={() => agregarVariante(pickVariante, v)}
                  style={{ padding: 14, textAlign: 'left' }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {[v.talla && 'Talla ' + v.talla, v.color].filter(Boolean).join(' · ') ||
                      'Estándar'}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Stock: {v.stock}
                  </div>
                </button>
              ))}
            </div>
            <div className="modal-foot">
              <button onClick={() => setPickVariante(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {checkout && (
        <Checkout
          cart={cart}
          subtotal={subtotal}
          iva={iva}
          total={total}
          usuario={usuario}
          onCancel={() => setCheckout(false)}
          onDone={() => {
            setCheckout(false)
            setCart([])
            cargar()
          }}
        />
      )}
    </div>
  )
}

// ---------- Checkout / cobro ----------
export function Checkout({
  cart,
  subtotal,
  iva,
  total,
  usuario,
  onCancel,
  onDone,
  onCrear
}: {
  cart: CartItem[]
  subtotal: number
  iva: number
  total: number
  usuario: Usuario
  onCancel: () => void
  onDone: () => void
  onCrear?: (venta: any) => Promise<any>
}): JSX.Element {
  const [metodo, setMetodo] = useState('efectivo')
  const [recibido, setRecibido] = useState<number>(0)
  const [facturarDian, setFacturarDian] = useState(false)
  const [clientes, setClientes] = useState<any[]>([])
  const [clienteId, setClienteId] = useState<number | null>(null)
  const [procesando, setProcesando] = useState(false)

  const [dianOn, setDianOn] = useState(false)
  const [fiadoOn, setFiadoOn] = useState(false)

  // Propina
  const [propinaOn, setPropinaOn] = useState(false)
  const [propinaModo, setPropinaModo] = useState('efectivo') // 'efectivo' | 'factura'
  const [propinaPct, setPropinaPct] = useState(10)
  const [propina, setPropina] = useState<number>(0)
  const [meseros, setMeseros] = useState<any[]>([])
  const [propinaMesero, setPropinaMesero] = useState<number>(usuario.id)

  useEffect(() => {
    window.api.configGetAll().then((c: any) => {
      setDianOn(c.dian_habilitado === '1')
      setFiadoOn(c.fiado_habilitado === '1')
      setPropinaOn(c.propina_habilitada === '1')
      setPropinaModo(c.propina_modo ?? 'efectivo')
      setPropinaPct(Number(c.propina_pct ?? 10) || 10)
    })
    window.api.usuariosList().then((u: any) => setMeseros(u.filter((x: any) => x.activo)))
  }, [])

  // Descuento y pago mixto
  const [descuento, setDescuento] = useState<number>(0)
  const [descPct, setDescPct] = useState<number>(0)
  const [mixto, setMixto] = useState(false)
  const [pagoEfectivo, setPagoEfectivo] = useState<number>(0)
  const [pagoTarjeta, setPagoTarjeta] = useState<number>(0)
  const [pagoTransfer, setPagoTransfer] = useState<number>(0)

  // Formulario para crear un cliente sin salir del cobro
  const [creandoCliente, setCreandoCliente] = useState(false)
  const [guardandoCliente, setGuardandoCliente] = useState(false)
  const clienteVacio = {
    tipo_documento: 'CC',
    numero_documento: '',
    nombre: '',
    telefono: '',
    email: '',
    direccion: ''
  }
  const [nuevo, setNuevo] = useState(clienteVacio)

  async function cargarClientes(): Promise<any[]> {
    const c = (await window.api.clientesList()) as any[]
    setClientes(c)
    return c
  }

  useEffect(() => {
    cargarClientes()
  }, [])

  async function guardarNuevoCliente(): Promise<void> {
    if (!nuevo.nombre.trim()) {
      alert('El nombre del cliente es obligatorio')
      return
    }
    setGuardandoCliente(true)
    const id = (await window.api.clientesSave(nuevo)) as number
    await cargarClientes()
    setClienteId(id) // seleccionar automáticamente el recién creado
    setGuardandoCliente(false)
    setCreandoCliente(false)
    setNuevo(clienteVacio)
  }

  // Total final tras descuento
  const totalFinal = Math.max(0, total - descuento)
  const ivaFinal = total > 0 ? Math.round(iva * (totalFinal / total)) : 0
  const subtotalFinal = totalFinal - ivaFinal

  // En modo 'factura' la propina se suma al total a pagar; en 'efectivo' va aparte.
  useEffect(() => {
    if (propinaOn && propinaModo === 'factura') {
      setPropina(Math.round(totalFinal * (propinaPct / 100)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propinaOn, propinaModo, propinaPct, totalFinal])

  // La propina se suma al total a pagar solo en modo 'factura' y con un único método (no mixto).
  const propinaEnFactura = propinaOn && propinaModo === 'factura' && !mixto ? propina : 0
  const pagarTotal = totalFinal + propinaEnFactura

  const cambio = Math.max(0, recibido - pagarTotal)
  const pagadoMixto = pagoEfectivo + pagoTarjeta + pagoTransfer
  const faltaMixto = Math.max(0, pagarTotal - pagadoMixto)
  const cambioMixto = Math.max(0, pagadoMixto - pagarTotal)

  async function confirmar(): Promise<void> {
    if (!mixto && metodo === 'efectivo' && recibido < pagarTotal) {
      alert('El monto recibido es menor al total')
      return
    }
    if (metodo === 'fiado' && !clienteId) {
      alert('El fiado se registra a nombre de un cliente. Elige (o crea) el cliente que queda debiendo.')
      return
    }
    if (mixto && faltaMixto > 0) {
      alert('Los pagos no cubren el total. Falta ' + cop(faltaMixto))
      return
    }

    // Construir método y lista de pagos
    let metodoPago = metodo
    let pagos: { metodo: string; monto: number }[]
    if (mixto) {
      pagos = [
        // el efectivo que queda en caja es su parte del total (sin el vuelto)
        { metodo: 'efectivo', monto: Math.max(0, pagoEfectivo - cambioMixto) },
        { metodo: 'tarjeta', monto: pagoTarjeta },
        { metodo: 'transferencia', monto: pagoTransfer }
      ].filter((p) => p.monto > 0)
      metodoPago = pagos.length > 1 ? 'mixto' : (pagos[0]?.metodo ?? 'efectivo')
    } else {
      pagos = [{ metodo, monto: totalFinal }]
    }

    // Propina a registrar: en 'factura' solo si no es mixto; en 'efectivo' es la que puso el cajero.
    const propinaFinal = propinaOn ? (propinaModo === 'factura' ? (mixto ? 0 : propina) : propina) : 0

    setProcesando(true)
    const payload = {
      usuario_id: usuario.id,
      cliente_id: clienteId,
      subtotal: subtotalFinal,
      iva: ivaFinal,
      descuento,
      total: totalFinal,
      metodo_pago: metodoPago,
      pagos,
      pago_recibido: mixto ? pagadoMixto : metodo === 'efectivo' ? recibido : metodo === 'fiado' ? 0 : pagarTotal,
      cambio: mixto ? cambioMixto : metodo === 'efectivo' ? cambio : 0,
      propina: propinaFinal,
      propina_modo: propinaModo,
      propina_mesero_id: propinaMesero,
      items: cart.map((i) => ({
        variante_id: i.variante_id,
        producto_nombre: i.producto_nombre,
        talla: i.talla,
        color: i.color,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        iva_porcentaje: i.iva_porcentaje,
        subtotal: i.precio_unitario * i.cantidad
      }))
    }

    // 1) Registrar la venta. Si falla, se avisa y se libera el botón (no se pega).
    let venta: any
    try {
      venta = onCrear ? await onCrear(payload) : await window.api.ventasCrear(payload)
    } catch (e: any) {
      setProcesando(false)
      alert('No se pudo registrar la venta:\n' + (e?.message ?? e) + '\n\nRevisa e intenta de nuevo.')
      return
    }

    // 2) DIAN (opcional, no bloquea la venta ya registrada).
    if (facturarDian) {
      try {
        const r: any = await window.api.facturarDian(venta.id)
        if (r.estado === 'rechazada' || r.estado === 'error') alert('Factura DIAN: ' + r.mensaje)
      } catch {
        alert('La venta quedó registrada, pero la factura DIAN falló. Puedes emitirla luego desde Ventas.')
      }
    }

    // 3) Imprimir (no bloquea: si la impresora falla, la venta YA quedó guardada).
    try {
      await window.api.imprimirTicket(venta.id)
    } catch {
      alert('La venta se registró, pero no se pudo imprimir el tiquete. Puedes reimprimir desde Ventas.')
    }

    setProcesando(false)
    onDone()
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 620 }}>
        <h2>Cobrar {cop(totalFinal)}</h2>
        <div className="grid-2">
          <div>
            <label>Método de pago</label>
            <select
              value={metodo}
              onChange={(e) => {
                setMetodo(e.target.value)
                if (e.target.value === 'fiado') setMixto(false)
              }}
              disabled={mixto}
            >
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia / Nequi / Daviplata</option>
              {fiadoOn && <option value="fiado">Fiado (crédito)</option>}
            </select>
          </div>
          <div>
            <label>Cliente (opcional)</label>
            <div className="row" style={{ gap: 8 }}>
              <select
                value={clienteId ?? ''}
                onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : null)}
                disabled={creandoCliente}
              >
                <option value="">Consumidor final</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.numero_documento ? `(${c.numero_documento})` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-icon"
                title="Crear nuevo cliente"
                onClick={() => setCreandoCliente((v) => !v)}
                style={{ whiteSpace: 'nowrap' }}
              >
                <Icon name={creandoCliente ? 'trash' : 'plus'} size={15} />
                {creandoCliente ? 'Cancelar' : 'Nuevo'}
              </button>
            </div>
          </div>
        </div>

        {/* Formulario rápido de nuevo cliente, sin salir del cobro */}
        {creandoCliente && (
          <div className="card" style={{ marginTop: 12, background: 'var(--bg)' }}>
            <div className="section-title" style={{ fontWeight: 600, marginBottom: 10 }}>
              <Icon name="users" size={16} /> Nuevo cliente
            </div>
            <div className="grid-3">
              <div className="field" style={{ margin: 0 }}>
                <label>Tipo doc.</label>
                <select
                  value={nuevo.tipo_documento}
                  onChange={(e) => setNuevo({ ...nuevo, tipo_documento: e.target.value })}
                >
                  <option value="CC">CC</option>
                  <option value="NIT">NIT</option>
                  <option value="CE">CE</option>
                  <option value="PP">PP</option>
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>N° documento</label>
                <input
                  value={nuevo.numero_documento}
                  onChange={(e) => setNuevo({ ...nuevo, numero_documento: e.target.value })}
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Teléfono</label>
                <input
                  value={nuevo.telefono}
                  onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
                />
              </div>
            </div>
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <label>Nombre / Razón social *</label>
              <input
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                placeholder="Nombre del cliente"
                autoFocus
              />
            </div>
            <div className="grid-2" style={{ marginTop: 10 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Email</label>
                <input
                  type="email"
                  value={nuevo.email}
                  onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
                  placeholder="correo@ejemplo.com"
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Dirección</label>
                <input
                  value={nuevo.direccion}
                  onChange={(e) => setNuevo({ ...nuevo, direccion: e.target.value })}
                  placeholder="Cra 00 # 00-00"
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-primary btn-icon" onClick={guardarNuevoCliente} disabled={guardandoCliente}>
                <Icon name="check" size={15} />
                {guardandoCliente ? 'Guardando...' : 'Guardar y usar cliente'}
              </button>
            </div>
          </div>
        )}

        {/* Descuento y pago mixto */}
        <div className="grid-2" style={{ marginTop: 12 }}>
          <div>
            <label>Descuento</label>
            <div className="row" style={{ gap: 6 }}>
              <input
                type="number"
                placeholder="$ en pesos"
                value={descuento || ''}
                min={0}
                max={total}
                onChange={(e) => {
                  setDescuento(Math.min(total, Math.max(0, Number(e.target.value))))
                  setDescPct(0)
                }}
              />
              <input
                type="number"
                placeholder="%"
                title="Descuento en porcentaje (se aplica automáticamente)"
                value={descPct || ''}
                min={0}
                max={100}
                style={{ maxWidth: 80 }}
                onChange={(e) => {
                  const pct = Math.min(100, Math.max(0, Number(e.target.value)))
                  setDescPct(pct)
                  setDescuento(Math.round((total * pct) / 100))
                }}
              />
              <button
                type="button"
                className="btn-sm"
                title="Quitar descuento"
                onClick={() => {
                  setDescuento(0)
                  setDescPct(0)
                }}
              >
                ✕
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 9 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={mixto}
                onChange={(e) => setMixto(e.target.checked)}
                disabled={metodo === 'fiado'}
              />
              Pago mixto (varios métodos)
            </label>
          </div>
        </div>

        {/* Aviso de venta fiado */}
        {metodo === 'fiado' && !mixto && (
          <div
            className="card"
            style={{ marginTop: 12, background: 'rgba(245,158,11,.12)', border: '1px solid var(--amber)', fontSize: 13 }}
          >
            <b style={{ color: 'var(--amber)' }}>Venta fiado (a crédito).</b> No entra dinero a la caja ahora: el total
            queda como <b>deuda del cliente</b>. Regístrale abonos luego en <b>Cuentas por cobrar</b>.
          </div>
        )}

        {/* Pago en efectivo (método simple) */}
        {!mixto && metodo === 'efectivo' && (
          <div style={{ marginTop: 12 }}>
            <label>Efectivo recibido (toca los billetes que entregó el cliente)</label>
            <div className="billetes">
              {[50000, 100000].map((b) => (
                <button key={b} type="button" onClick={() => setRecibido((r) => r + b)}>
                  +{cop(b)}
                </button>
              ))}
              <button type="button" className="exacto" onClick={() => setRecibido(pagarTotal)}>
                Pago exacto
              </button>
              <button type="button" className="limpiar" onClick={() => setRecibido(0)}>
                Limpiar
              </button>
            </div>

            <div className="grid-2" style={{ marginTop: 12 }}>
              <div>
                <label>Recibido</label>
                <input type="number" value={recibido || ''} onChange={(e) => setRecibido(Number(e.target.value))} />
              </div>
              <div>
                <label>{recibido >= pagarTotal ? 'Vuelto (cambio)' : 'Falta'}</label>
                <div
                  className="stat-value"
                  style={{ color: recibido >= pagarTotal ? 'var(--green)' : 'var(--red)' }}
                >
                  {recibido >= pagarTotal ? cop(cambio) : cop(pagarTotal - recibido)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pago mixto: repartir el total entre métodos */}
        {mixto && (
          <div style={{ marginTop: 12 }}>
            <label>Reparte el pago entre los métodos</label>
            <div className="grid-3">
              <div className="field" style={{ margin: 0 }}>
                <label>Efectivo</label>
                <input type="number" value={pagoEfectivo || ''} onChange={(e) => setPagoEfectivo(Number(e.target.value))} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Tarjeta</label>
                <input type="number" value={pagoTarjeta || ''} onChange={(e) => setPagoTarjeta(Number(e.target.value))} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Transf. / Nequi / Daviplata</label>
                <input type="number" value={pagoTransfer || ''} onChange={(e) => setPagoTransfer(Number(e.target.value))} />
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8, fontSize: 13 }}>
              <span className="muted">Pagado: {cop(pagadoMixto)}</span>
              {faltaMixto > 0 ? (
                <span style={{ color: 'var(--red)' }}>Falta {cop(faltaMixto)}</span>
              ) : (
                <span style={{ color: 'var(--green)' }}>Vuelto {cop(cambioMixto)}</span>
              )}
            </div>
          </div>
        )}

        {dianOn && (
          <label style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={facturarDian}
              onChange={(e) => setFacturarDian(e.target.checked)}
            />
            Emitir factura electrónica DIAN
          </label>
        )}

        {propinaOn && metodo !== 'fiado' && (
          <div className="card" style={{ marginTop: 12, background: 'var(--bg)' }}>
            <b>
              Propina{' '}
              {propinaModo === 'factura' ? '(se suma a la factura)' : '(en efectivo, la recibe el mesero)'}
            </b>
            <div className="grid-2" style={{ marginTop: 8 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Mesero</label>
                <select value={propinaMesero} onChange={(e) => setPropinaMesero(Number(e.target.value))}>
                  {meseros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Monto propina</label>
                <input type="number" value={propina || ''} onChange={(e) => setPropina(Number(e.target.value))} />
              </div>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="btn-sm"
                onClick={() => setPropina(Math.round(totalFinal * (propinaPct / 100)))}
              >
                {propinaPct}% ({cop(Math.round(totalFinal * (propinaPct / 100)))})
              </button>
              <button type="button" className="btn-sm" onClick={() => setPropina(0)}>
                Sin propina
              </button>
            </div>
            {propinaModo === 'efectivo' && propina > 0 && (
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                La recibe <b>{meseros.find((m) => m.id === propinaMesero)?.nombre ?? 'el mesero'}</b> en efectivo. No
                entra a la caja.
              </p>
            )}
          </div>
        )}

        <div className="card" style={{ marginTop: 12, background: 'var(--bg)' }}>
          {descuento > 0 && (
            <>
              <div className="total-line muted">
                <span>Subtotal</span>
                <span>{cop(total)}</span>
              </div>
              <div className="total-line" style={{ color: 'var(--amber)' }}>
                <span>Descuento</span>
                <span>−{cop(descuento)}</span>
              </div>
            </>
          )}
          {propinaEnFactura > 0 && (
            <>
              <div className="total-line muted">
                <span>Cuenta</span>
                <span>{cop(totalFinal)}</span>
              </div>
              <div className="total-line" style={{ color: 'var(--green)' }}>
                <span>Propina</span>
                <span>+{cop(propinaEnFactura)}</span>
              </div>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted">Total a pagar</span>
            <span style={{ fontSize: 22, fontWeight: 800 }}>{cop(pagarTotal)}</span>
          </div>
        </div>

        <div className="modal-foot">
          <button onClick={onCancel} disabled={procesando}>
            Cancelar
          </button>
          <button className="btn-green" onClick={confirmar} disabled={procesando}>
            {procesando ? 'Procesando...' : 'Confirmar e imprimir'}
          </button>
        </div>
      </div>
    </div>
  )
}
