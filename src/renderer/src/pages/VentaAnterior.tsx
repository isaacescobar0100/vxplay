import { useEffect, useState } from 'react'
import type { Usuario } from '../App'
import { cop } from '../util'
import Icon from '../components/Icon'

interface Opc {
  variante_id: number
  etiqueta: string
  producto_nombre: string
  talla?: string
  color?: string
  precio: number
  stock: number
}

/** Fecha (YYYY-MM-DD) local. */
function localISO(offsetDias = 0): string {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  d.setDate(d.getDate() + offsetDias)
  return d.toISOString().slice(0, 10)
}

export default function VentaAnterior({ usuario }: { usuario: Usuario }): JSX.Element {
  const [opciones, setOpciones] = useState<Opc[]>([])
  const [items, setItems] = useState<any[]>([])
  const [fecha, setFecha] = useState(localISO(-1)) // ayer por defecto
  const [clientes, setClientes] = useState<any[]>([])
  const [clienteId, setClienteId] = useState<number | null>(null)
  const [metodo, setMetodo] = useState('efectivo')
  const [procesando, setProcesando] = useState(false)
  const [ok, setOk] = useState<string | null>(null)

  async function cargarOpciones(): Promise<void> {
    const prods = (await window.api.productosList()) as any[]
    const opc: Opc[] = []
    for (const p of prods) {
      for (const v of p.variantes ?? []) {
        opc.push({
          variante_id: v.id,
          producto_nombre: p.nombre,
          talla: v.talla,
          color: v.color,
          precio: p.precio_venta ?? 0,
          stock: v.stock,
          etiqueta: `${p.nombre} ${[v.talla && 'T:' + v.talla, v.color].filter(Boolean).join(' ')}`.trim()
        })
      }
    }
    setOpciones(opc)
  }

  useEffect(() => {
    cargarOpciones()
    window.api.clientesList().then((c: any) => setClientes(c))
  }, [])

  function agregarLinea(): void {
    if (opciones.length === 0) {
      alert('Primero crea productos en Inventario')
      return
    }
    const f = opciones[0]
    setItems((prev) => [
      ...prev,
      {
        variante_id: f.variante_id,
        producto_nombre: f.producto_nombre,
        talla: f.talla,
        color: f.color,
        cantidad: 1,
        precio_unitario: f.precio
      }
    ])
  }

  function setLinea(i: number, campo: string, valor: any): void {
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== i) return it
        if (campo === 'variante_id') {
          const o = opciones.find((x) => x.variante_id === Number(valor))!
          return {
            ...it,
            variante_id: o.variante_id,
            producto_nombre: o.producto_nombre,
            talla: o.talla,
            color: o.color,
            precio_unitario: it.precio_unitario || o.precio
          }
        }
        return { ...it, [campo]: valor }
      })
    )
  }

  const total = items.reduce((s, it) => s + it.precio_unitario * it.cantidad, 0)

  async function registrar(): Promise<void> {
    if (items.length === 0) {
      alert('Agrega al menos un producto')
      return
    }
    if (!fecha) {
      alert('Elige la fecha de la venta')
      return
    }
    if (!confirm(`¿Registrar esta venta con fecha ${fecha} por ${cop(total)}?\n\nDescontará el stock y quedará en el historial con esa fecha.`)) {
      return
    }
    setProcesando(true)
    const payload = {
      fecha,
      cliente_id: clienteId,
      usuario_id: usuario.id,
      metodo_pago: metodo,
      subtotal: total,
      iva: 0,
      total,
      items: items.map((it) => ({
        variante_id: it.variante_id,
        producto_nombre: it.producto_nombre,
        talla: it.talla,
        color: it.color,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        iva_porcentaje: 0,
        subtotal: it.precio_unitario * it.cantidad
      }))
    }
    const r: any = await window.api.ventasCrearAnterior(payload)
    setProcesando(false)
    if (r?.numero) {
      setOk(`Venta ${r.numero} registrada con fecha ${fecha} por ${cop(r.total)}. ✔`)
      setItems([])
      setClienteId(null)
      cargarOpciones() // refresca el stock mostrado
    } else {
      alert('No se pudo registrar la venta.')
    }
  }

  return (
    <div>
      <div className="page-title">Registrar venta anterior</div>
      <p className="muted" style={{ marginTop: -6, marginBottom: 16, fontSize: 13 }}>
        Para cargar ventas de <b>días pasados</b> (antes de usar el POS). Se guardan en el <b>Historial</b> con su fecha
        real, cuentan en los reportes y <b>descuentan el stock</b>. No afectan la caja de hoy. Para las ventas del día
        usa <b>Punto de Venta</b>.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid-3">
          <div className="field" style={{ margin: 0 }}>
            <label>Fecha de la venta</label>
            <input type="date" value={fecha} max={localISO(0)} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Cliente (opcional)</label>
            <select value={clienteId ?? ''} onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Consumidor final</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Método de pago</label>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia / Nequi / Daviplata</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <label>Productos vendidos</label>
        <table style={{ marginBottom: 8 }}>
          <thead>
            <tr>
              <th>Producto / variante</th>
              <th style={{ width: 90 }}>Cantidad</th>
              <th style={{ width: 130 }}>Precio unit.</th>
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
                        {o.etiqueta} — stock {o.stock}
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
                    value={it.precio_unitario || ''}
                    onChange={(e) => setLinea(i, 'precio_unitario', Number(e.target.value))}
                  />
                </td>
                <td className="text-right">{cop(it.precio_unitario * it.cantidad)}</td>
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
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                  Agrega los productos de esta venta.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <button className="btn-sm btn-icon" onClick={agregarLinea}>
          <Icon name="plus" size={14} /> Agregar producto
        </button>

        <div
          className="card"
          style={{ marginTop: 12, background: 'var(--bg)', display: 'flex', justifyContent: 'space-between' }}
        >
          <span className="muted">Total de la venta</span>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{cop(total)}</span>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
          <button className="btn-green btn-icon" onClick={registrar} disabled={procesando || items.length === 0}>
            <Icon name="check" size={15} /> {procesando ? 'Registrando...' : 'Registrar venta'}
          </button>
          {ok && (
            <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={16} /> {ok}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
