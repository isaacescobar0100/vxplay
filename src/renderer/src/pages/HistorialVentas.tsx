import { useEffect, useState } from 'react'
import { cop } from '../util'
import Icon from '../components/Icon'
import type { Usuario } from '../App'

export default function HistorialVentas({ usuario }: { usuario: Usuario }): JSX.Element {
  const [ventas, setVentas] = useState<any[]>([])
  const [detalle, setDetalle] = useState<any | null>(null)
  const [devolver, setDevolver] = useState<any | null>(null)

  async function cargar(): Promise<void> {
    setVentas((await window.api.ventasList(200)) as any[])
  }
  useEffect(() => {
    cargar()
  }, [])

  async function verDetalle(id: number): Promise<void> {
    setDetalle(await window.api.ventasGet(id))
  }

  async function facturar(id: number): Promise<void> {
    const r: any = await window.api.facturarDian(id)
    alert('DIAN: ' + (r.mensaje ?? r.estado))
    cargar()
    verDetalle(id)
  }

  function badgeDian(estado: string): JSX.Element {
    const map: Record<string, string> = {
      aceptada: 'badge-green',
      simulada: 'badge-amber',
      pendiente: 'badge-amber',
      rechazada: 'badge-red',
      error: 'badge-red'
    }
    return <span className={'badge ' + (map[estado] ?? 'badge-amber')}>{estado}</span>
  }

  return (
    <div>
      <div className="page-title">Historial de ventas</div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Venta</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Pago</th>
              <th className="text-right">Total</th>
              <th>DIAN</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => (
              <tr key={v.id}>
                <td>
                  <b>{v.numero}</b>
                </td>
                <td className="muted">{v.fecha}</td>
                <td>{v.cliente_nombre ?? 'Consumidor final'}</td>
                <td className="muted">{v.metodo_pago}</td>
                <td className="text-right">
                  <b>{cop(v.total)}</b>
                </td>
                <td>{badgeDian(v.dian_estado)}</td>
                <td className="text-right">
                  <button className="btn-sm" onClick={() => verDetalle(v.id)}>
                    Ver
                  </button>
                </td>
              </tr>
            ))}
            {ventas.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                  Aún no hay ventas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div className="modal-overlay" onClick={() => setDetalle(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Venta {detalle.numero}</h2>
            <p className="muted">
              {detalle.fecha} · {detalle.cliente_nombre ?? 'Consumidor final'}
            </p>
            <table style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="text-right">Cant.</th>
                  <th className="text-right">Precio</th>
                  <th className="text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(detalle.items ?? []).map((it: any) => (
                  <tr key={it.id}>
                    <td>
                      {it.producto_nombre}
                      <span className="muted">
                        {' '}
                        {[it.talla && 'T:' + it.talla, it.color].filter(Boolean).join(' ')}
                      </span>
                    </td>
                    <td className="text-right">{it.cantidad}</td>
                    <td className="text-right">{cop(it.precio_unitario)}</td>
                    <td className="text-right">{cop(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 14 }}>
              <div className="total-line muted">
                <span>Subtotal</span>
                <span>{cop(detalle.subtotal)}</span>
              </div>
              <div className="total-line muted">
                <span>IVA</span>
                <span>{cop(detalle.iva)}</span>
              </div>
              <div className="total-line grand">
                <span>TOTAL</span>
                <span>{cop(detalle.total)}</span>
              </div>
            </div>

            <div className="card" style={{ marginTop: 14, background: 'var(--bg)' }}>
              <b>Factura electrónica DIAN</b> {badgeDian(detalle.dian_estado)}
              {detalle.dian_cufe && (
                <div className="muted" style={{ fontSize: 11, marginTop: 6, wordBreak: 'break-all' }}>
                  CUFE: {detalle.dian_cufe}
                </div>
              )}
              {detalle.dian_mensaje && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {detalle.dian_mensaje}
                </div>
              )}
            </div>

            <div className="modal-foot">
              {detalle.dian_estado === 'pendiente' && (
                <button className="btn-primary" onClick={() => facturar(detalle.id)}>
                  Emitir factura DIAN
                </button>
              )}
              <button className="btn-icon" onClick={() => setDevolver(detalle)}>
                <Icon name="undo" size={15} /> Devolución
              </button>
              <button className="btn-icon" onClick={() => window.api.imprimirTicket(detalle.id)}>
                <Icon name="print" size={15} /> Reimprimir
              </button>
              <button onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {devolver && (
        <DevolucionModal
          venta={devolver}
          usuario={usuario}
          onClose={() => setDevolver(null)}
          onDone={() => {
            setDevolver(null)
            setDetalle(null)
            cargar()
          }}
        />
      )}
    </div>
  )
}

// ---------- Modal de devolución ----------
function DevolucionModal({
  venta,
  usuario,
  onClose,
  onDone
}: {
  venta: any
  usuario: Usuario
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const [items, setItems] = useState<any[]>([])
  const [devueltasPrevias, setDevueltasPrevias] = useState<any[]>([])
  const [cantidades, setCantidades] = useState<Record<number, number>>({})
  const [motivo, setMotivo] = useState('')
  const [metodo, setMetodo] = useState(venta.metodo_pago ?? 'efectivo')
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    window.api.devolucionesPorVenta(venta.id).then((r: any) => {
      setItems(r.items)
      setDevueltasPrevias(r.devoluciones)
    })
  }, [venta.id])

  function maxDevolver(it: any): number {
    return it.cantidad - it.devuelto
  }
  function setCant(id: number, v: number, max: number): void {
    setCantidades((c) => ({ ...c, [id]: Math.max(0, Math.min(max, v)) }))
  }

  const totalDevolver = items.reduce(
    (s, it) => s + (cantidades[it.id] ?? 0) * it.precio_unitario,
    0
  )
  const hayAlgo = totalDevolver > 0

  async function confirmar(): Promise<void> {
    const aDevolver = items
      .filter((it) => (cantidades[it.id] ?? 0) > 0)
      .map((it) => ({
        venta_item_id: it.id,
        variante_id: it.variante_id,
        producto_nombre: it.producto_nombre,
        talla: it.talla,
        color: it.color,
        cantidad: cantidades[it.id],
        precio_unitario: it.precio_unitario
      }))
    if (aDevolver.length === 0) return
    setProcesando(true)
    await window.api.devolucionesCrear({
      venta_id: venta.id,
      usuario_id: usuario.id,
      motivo,
      metodo,
      items: aDevolver
    })
    setProcesando(false)
    alert(`Devolución registrada por ${cop(totalDevolver)}. El stock fue reingresado.`)
    onDone()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">
          <Icon name="undo" size={20} /> Devolución — Venta {venta.numero}
        </h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Selecciona las cantidades a devolver. El stock se reingresa automáticamente.
        </p>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th className="text-right">Vendido</th>
              <th className="text-right">Ya devuelto</th>
              <th className="text-right">Devolver</th>
              <th className="text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const max = maxDevolver(it)
              return (
                <tr key={it.id}>
                  <td>
                    {it.producto_nombre}
                    <span className="muted"> {[it.talla && 'T:' + it.talla, it.color].filter(Boolean).join(' ')}</span>
                  </td>
                  <td className="text-right">{it.cantidad}</td>
                  <td className="text-right muted">{it.devuelto}</td>
                  <td className="text-right">
                    <input
                      type="number"
                      style={{ width: 70, textAlign: 'right' }}
                      value={cantidades[it.id] || ''}
                      min={0}
                      max={max}
                      disabled={max === 0}
                      onChange={(e) => setCant(it.id, Number(e.target.value), max)}
                    />
                  </td>
                  <td className="text-right">{cop((cantidades[it.id] ?? 0) * it.precio_unitario)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="grid-2" style={{ marginTop: 14 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Motivo</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: talla equivocada" />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Reembolso por</label>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>
        </div>

        <div
          className="card"
          style={{ marginTop: 14, background: 'var(--bg)', display: 'flex', justifyContent: 'space-between' }}
        >
          <span className="muted">Total a devolver</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--red)' }}>{cop(totalDevolver)}</span>
        </div>

        {devueltasPrevias.length > 0 && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Esta venta ya tiene {devueltasPrevias.length} devolución(es) previa(s).
          </p>
        )}

        <div className="modal-foot">
          <button onClick={onClose} disabled={procesando}>
            Cancelar
          </button>
          <button className="btn-danger btn-icon" onClick={confirmar} disabled={!hayAlgo || procesando}>
            <Icon name="undo" size={15} /> {procesando ? 'Procesando...' : 'Registrar devolución'}
          </button>
        </div>
      </div>
    </div>
  )
}
