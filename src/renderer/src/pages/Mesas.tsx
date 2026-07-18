import { useEffect, useState } from 'react'
import { avisar, confirmar } from '../dialogo'
import type { Usuario } from '../App'
import { cop, CARTA_BASE_URL } from '../util'
import Icon from '../components/Icon'
import { Checkout, type CartItem } from './Ventas'
import { qrSvg } from '../qr'

export default function Mesas({ usuario }: { usuario: Usuario }): JSX.Element {
  const [mesas, setMesas] = useState<any[]>([])
  const [comanda, setComanda] = useState<any | null>(null)
  const [mesaActual, setMesaActual] = useState<any | null>(null)
  const [renombrar, setRenombrar] = useState<any | null>(null)
  const [liberar, setLiberar] = useState<any | null>(null)
  const [qrMesa, setQrMesa] = useState<any | null>(null)
  const [cfg, setCfg] = useState<Record<string, string>>({})
  const esAdmin = usuario.rol === 'admin'

  async function cargar(): Promise<void> {
    setMesas((await window.api.mesasList()) as any[])
  }
  useEffect(() => {
    cargar()
    window.api.configGetAll().then(setCfg)
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

  async function eliminarMesa(m: any): Promise<void> {
    if (!(await confirmar('¿Eliminar ' + m.nombre + '?'))) return
    try {
      await window.api.mesasEliminar(m.id)
      cargar()
    } catch (e: any) {
      avisar(e?.message ?? 'No se pudo eliminar')
    }
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
              <div
                key={m.id}
                className="card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  borderColor: ocupada ? 'var(--red)' : 'var(--green)',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <button
                  onClick={() => abrirMesa(m)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    textAlign: 'left',
                    padding: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    minHeight: 84
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{m.nombre}</div>
                  <div
                    className={'badge ' + (ocupada ? 'badge-red' : 'badge-green')}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {ocupada ? 'Ocupada' : 'Libre'}
                  </div>
                  {ocupada && (
                    <div style={{ color: '#4ade80', fontWeight: 700 }}>
                      {cop(m.total)}{' '}
                      <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
                        · {m.items} ítem{m.items === 1 ? '' : 's'}
                      </span>
                    </div>
                  )}
                </button>
                <div
                  style={{
                    display: 'flex',
                    borderTop: '1px solid var(--border)',
                    background: 'rgba(255,255,255,.02)'
                  }}
                >
                  <MesaAccion titulo="Código QR de la carta" onClick={() => setQrMesa(m)} icon="qr" />
                  <MesaAccion titulo="Renombrar" onClick={() => setRenombrar(m)} icon="edit" />
                  {ocupada ? (
                    esAdmin && <MesaAccion titulo="Liberar sin cobrar" onClick={() => setLiberar(m)} icon="lock" danger />
                  ) : (
                    <MesaAccion titulo="Eliminar mesa" onClick={() => eliminarMesa(m)} icon="trash" danger />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
        Verde = libre · Roja = ocupada (con cuenta abierta). Toca una mesa para tomar el pedido o cobrar.
        {esAdmin && ' Liberar descarta la cuenta sin vender (solo admin).'}
      </p>

      {renombrar && (
        <RenombrarModal
          mesa={renombrar}
          onClose={() => setRenombrar(null)}
          onDone={() => {
            setRenombrar(null)
            cargar()
          }}
        />
      )}
      {liberar && (
        <LiberarModal
          mesa={liberar}
          onClose={() => setLiberar(null)}
          onDone={() => {
            setLiberar(null)
            cargar()
          }}
        />
      )}
      {qrMesa && (
        <QrModal
          mesa={qrMesa}
          base={CARTA_BASE_URL}
          licencia={cfg.licencia_codigo ?? ''}
          tienda={cfg.tienda_nombre ?? ''}
          onClose={() => setQrMesa(null)}
        />
      )}
    </div>
  )
}

/** Extrae solo el dominio (https://host) aunque peguen la URL completa con ruta o parámetros. */
function baseOrigin(raw: string): string {
  let s = (raw || '').trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  try {
    return new URL(s).origin
  } catch {
    return s.replace(/\/.*$/, '').replace(/\/+$/, '')
  }
}

// ---------- Modal de código QR de la mesa ----------
function QrModal({
  mesa,
  base,
  licencia,
  tienda,
  onClose
}: {
  mesa: any
  base: string
  licencia: string
  tienda: string
  onClose: () => void
}): JSX.Element {
  // Toma solo el dominio (origin) aunque el usuario pegue la URL completa con ruta/params.
  const dominio = baseOrigin(base)
  const falta = !dominio || !licencia
  const url = `${dominio}/carta.html?t=${encodeURIComponent(licencia)}&m=${encodeURIComponent(mesa.nombre)}`
  const svg = falta ? '' : qrSvg(url, 240)

  function hoja(): string {
    return `<div style="text-align:center;font-family:Segoe UI,sans-serif;padding:24px;page-break-inside:avoid">
      ${tienda ? `<div style="font-size:22px;font-weight:800;margin-bottom:2px">${tienda}</div>` : ''}
      <div style="font-size:16px;color:#334155;margin-bottom:14px">${mesa.nombre}</div>
      <div style="display:inline-block;padding:12px;border:2px solid #000;border-radius:12px">${svg}</div>
      <div style="font-size:18px;font-weight:700;margin-top:14px">Escanea y mira la carta</div>
      <div style="font-size:13px;color:#64748b;margin-top:4px">Apunta la cámara de tu celular al código</div>
    </div>`
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420, textAlign: 'center' }}>
        <h3 style={{ marginTop: 0 }}>QR de la carta — {mesa.nombre}</h3>
        {falta ? (
          <div
            className="card"
            style={{ background: 'rgba(245,158,11,.12)', border: '1px solid var(--amber)', fontSize: 13, textAlign: 'left' }}
          >
            <b style={{ color: 'var(--amber)' }}>Falta configurar la carta.</b> Ve a <b>Configuración → Carta digital</b>,
            escribe tu dominio de Vercel y presiona <b>Publicar carta</b>. Luego vuelve aquí para generar el QR.
          </div>
        ) : (
          <>
            <div
              style={{ display: 'inline-block', background: '#fff', padding: 12, borderRadius: 12 }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p className="muted" style={{ fontSize: 11, wordBreak: 'break-all', marginTop: 8 }}>{url}</p>
          </>
        )}
        <div className="modal-foot" style={{ marginTop: 16 }}>
          <button onClick={onClose}>Cerrar</button>
          <button className="btn-icon" disabled={falta} onClick={() => window.api.etiquetasPdf(hoja())}>
            <Icon name="image" size={15} /> Descargar PDF
          </button>
          <button className="btn-primary btn-icon" disabled={falta} onClick={() => window.api.imprimirEtiquetas(hoja())}>
            <Icon name="print" size={15} /> Imprimir
          </button>
        </div>
      </div>
    </div>
  )
}

function MesaAccion({
  titulo,
  onClick,
  icon,
  danger
}: {
  titulo: string
  onClick: () => void
  icon: 'edit' | 'trash' | 'lock' | 'qr'
  danger?: boolean
}): JSX.Element {
  return (
    <button
      title={titulo}
      onClick={onClick}
      style={{
        flex: 1,
        background: 'none',
        border: 'none',
        color: danger ? 'var(--red)' : 'var(--muted)',
        padding: '9px 0',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'center'
      }}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

function RenombrarModal({ mesa, onClose, onDone }: { mesa: any; onClose: () => void; onDone: () => void }): JSX.Element {
  const [nombre, setNombre] = useState(mesa.nombre)
  async function guardar(): Promise<void> {
    await window.api.mesasRenombrar(mesa.id, nombre)
    onDone()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 360 }}>
        <h3 style={{ marginTop: 0 }}>Renombrar mesa</h3>
        <label>Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button style={{ flex: 1 }} onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" style={{ flex: 1 }} onClick={guardar}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

function LiberarModal({ mesa, onClose, onDone }: { mesa: any; onClose: () => void; onDone: () => void }): JSX.Element {
  const [motivo, setMotivo] = useState('')
  async function confirmar(): Promise<void> {
    await window.api.mesasLiberar(mesa.id, motivo || 'Liberada sin cobrar')
    onDone()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <h3 style={{ marginTop: 0, color: 'var(--red)' }}>Liberar {mesa.nombre} sin cobrar</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Se <b>descartan los consumos</b> de esta mesa (no se registra venta) y queda libre. Úsalo solo si el cliente se
          fue sin consumir o fue un error.
        </p>
        <label>Motivo (opcional)</label>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: cliente se retiró" autoFocus />
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button style={{ flex: 1 }} onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-danger" style={{ flex: 1 }} onClick={confirmar}>
            Sí, liberar
          </button>
        </div>
      </div>
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
  const [dividir, setDividir] = useState(false)
  const [sel, setSel] = useState<number[]>([])
  const [checkoutParcial, setCheckoutParcial] = useState(false)
  const comandaId = comandaInicial.id

  function toggleSel(id: number): void {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  useEffect(() => {
    window.api.productosList().then((p: any) => setProductos(p))
    window.api.cajaActual().then((s: any) => setCajaAbierta(!!s))
  }, [])

  const filtrados = productos.filter((p) => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  async function agregar(p: any): Promise<void> {
    const v = (p.variantes ?? [])[0]
    if (!v) {
      avisar('El producto no tiene variante/stock configurado')
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

  const aCart = (arr: any[]): CartItem[] =>
    arr.map((it) => ({
      key: 'ci' + it.id,
      variante_id: it.variante_id,
      producto_nombre: it.producto_nombre,
      precio_unitario: it.precio_unitario,
      iva_porcentaje: it.iva_porcentaje || 0,
      cantidad: it.cantidad,
      stock: 99999
    }))
  const cart = aCart(items)

  // Selección para dividir la cuenta
  const itemsSel = items.filter((i) => sel.includes(i.id))
  const totalSel = itemsSel.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)
  const subtotalSel = itemsSel.reduce(
    (s, i) => s + Math.round((i.precio_unitario * i.cantidad) / (1 + (i.iva_porcentaje || 0) / 100)),
    0
  )
  const ivaSel = totalSel - subtotalSel

  async function trasCobroParcial(): Promise<void> {
    const nuevos = (await recargarItems()) as any[]
    setItems(nuevos)
    setSel([])
    setCheckoutParcial(false)
    if (!nuevos.length) onSalir() // se cobró todo → mesa liberada
  }

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
        <div className="cart-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="mesa" size={18} /> {mesa?.nombre} — Cuenta
        </div>
        <div className="cart-items">
          {items.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              Toca productos para agregarlos a la cuenta de esta mesa.
            </p>
          ) : (
            items.map((i) => (
              <div
                key={i.id}
                className="cart-item"
                onClick={dividir ? () => toggleSel(i.id) : undefined}
                style={{
                  cursor: dividir ? 'pointer' : 'default',
                  background: dividir && sel.includes(i.id) ? 'rgba(34,197,94,.14)' : undefined
                }}
              >
                {dividir && (
                  <input
                    type="checkbox"
                    checked={sel.includes(i.id)}
                    onChange={() => toggleSel(i.id)}
                    style={{ width: 18, height: 18 }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{i.producto_nombre}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {cop(i.precio_unitario)}
                  </div>
                </div>
                {!dividir && (
                  <>
                    <button className="qty-btn" onClick={() => cambiar(i, -1)}>
                      −
                    </button>
                    <span style={{ minWidth: 20, textAlign: 'center' }}>{i.cantidad}</span>
                    <button className="qty-btn" onClick={() => cambiar(i, 1)}>
                      +
                    </button>
                  </>
                )}
                {dividir && <span style={{ minWidth: 20, textAlign: 'center' }}>x{i.cantidad}</span>}
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

          {/* Imprimir la cuenta acumulada (precuenta) y activar el modo dividir */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="btn-icon"
              style={{ flex: 1 }}
              disabled={items.length === 0}
              onClick={() => window.api.comandaPrecuenta(comandaId)}
              title="Imprime la cuenta con todos los productos, sin cobrar"
            >
              <Icon name="print" size={15} /> Imprimir cuenta
            </button>
            <button
              className={dividir ? 'btn-primary' : ''}
              style={{ flex: 1 }}
              disabled={items.length === 0}
              onClick={() => {
                setDividir((d) => !d)
                setSel([])
              }}
            >
              {dividir ? 'Cancelar dividir' : 'Dividir cuenta'}
            </button>
          </div>

          {dividir ? (
            <>
              <p className="muted" style={{ fontSize: 12, margin: '10px 0 6px' }}>
                Selecciona los productos de esta parte. Seleccionados: <b>{itemsSel.length}</b> · {cop(totalSel)}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ flex: 1 }}
                  disabled={sel.length === 0}
                  onClick={() => window.api.comandaPrecuenta(comandaId, sel)}
                >
                  <Icon name="print" size={14} /> Imprimir parte
                </button>
                <button
                  className="btn-green"
                  style={{ flex: 1 }}
                  disabled={sel.length === 0 || cajaAbierta === false}
                  onClick={() => setCheckoutParcial(true)}
                >
                  Cobrar parte {cop(totalSel)}
                </button>
              </div>
            </>
          ) : (
            <button
              className="btn-green"
              style={{ width: '100%', marginTop: 10 }}
              disabled={items.length === 0 || cajaAbierta === false}
              onClick={() => setCheckout(true)}
            >
              Cobrar todo {cop(total)}
            </button>
          )}
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

      {checkoutParcial && (
        <Checkout
          cart={aCart(itemsSel)}
          subtotal={subtotalSel}
          iva={ivaSel}
          total={totalSel}
          usuario={usuario}
          onCancel={() => setCheckoutParcial(false)}
          onCrear={async (payload) => {
            const r: any = await window.api.comandaCobrarParcial(comandaId, sel, payload)
            return r.venta // Checkout imprime el ticket con venta.id
          }}
          onDone={trasCobroParcial}
        />
      )}
    </div>
  )
}
