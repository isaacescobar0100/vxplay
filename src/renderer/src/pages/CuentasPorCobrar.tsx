import { useEffect, useState } from 'react'
import { avisar } from '../dialogo'
import type { Usuario } from '../App'
import { cop } from '../util'
import Icon from '../components/Icon'

export default function CuentasPorCobrar({ usuarioActual }: { usuarioActual: Usuario }): JSX.Element {
  const [cuentas, setCuentas] = useState<any[]>([])
  const [abonar, setAbonar] = useState<any | null>(null)
  const [detalle, setDetalle] = useState<any | null>(null)

  async function cargar(): Promise<void> {
    setCuentas((await window.api.fiadoCuentas()) as any[])
  }
  useEffect(() => {
    cargar()
  }, [])

  const totalPorCobrar = cuentas.reduce((s, c) => s + c.saldo, 0)

  async function verDetalle(c: any): Promise<void> {
    setDetalle(await window.api.fiadoDetalle(c.id))
  }

  return (
    <div>
      <div className="page-title">Cuentas por cobrar (fiado)</div>

      <div className="stat-card" style={{ marginBottom: 16, maxWidth: 320 }}>
        <div className="stat-label">Total por cobrar</div>
        <div className="stat-value" style={{ color: totalPorCobrar > 0 ? 'var(--amber)' : 'var(--green)' }}>
          {cop(totalPorCobrar)}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {cuentas.length} cliente(s) con deuda
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th className="text-right">Fiado</th>
              <th className="text-right">Abonado</th>
              <th className="text-right">Saldo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cuentas.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                  Nadie debe nada. Las ventas con método <b>Fiado</b> aparecerán aquí.
                </td>
              </tr>
            ) : (
              cuentas.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.nombre}</b>
                  </td>
                  <td className="muted">{c.telefono ?? '—'}</td>
                  <td className="text-right">{cop(c.fiado)}</td>
                  <td className="text-right muted">{cop(c.abonado)}</td>
                  <td className="text-right" style={{ fontWeight: 700, color: 'var(--amber)' }}>
                    {cop(c.saldo)}
                  </td>
                  <td className="text-right">
                    <button className="btn-sm" onClick={() => verDetalle(c)}>
                      Ver
                    </button>{' '}
                    <button className="btn-sm btn-primary" onClick={() => setAbonar(c)}>
                      Registrar abono
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {abonar && (
        <AbonoModal
          cuenta={abonar}
          usuarioActual={usuarioActual}
          onClose={() => setAbonar(null)}
          onDone={() => {
            setAbonar(null)
            cargar()
          }}
        />
      )}
      {detalle && <DetalleModal detalle={detalle} onClose={() => setDetalle(null)} />}
    </div>
  )
}

function AbonoModal({
  cuenta,
  usuarioActual,
  onClose,
  onDone
}: {
  cuenta: any
  usuarioActual: Usuario
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const [monto, setMonto] = useState<number>(0)
  const [metodo, setMetodo] = useState('efectivo')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(): Promise<void> {
    if (monto <= 0) {
      avisar('Escribe un monto mayor a 0')
      return
    }
    setGuardando(true)
    const r: any = await window.api.fiadoAbonar({
      cliente_id: cuenta.id,
      monto,
      metodo,
      nota,
      usuario_id: usuarioActual.id
    })
    setGuardando(false)
    if (r?.ok) onDone()
    else avisar(r?.error ?? 'No se pudo registrar el abono')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <h3 style={{ marginTop: 0 }}>Abono de {cuenta.nombre}</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Saldo actual: <b style={{ color: 'var(--amber)' }}>{cop(cuenta.saldo)}</b>
        </p>
        <div className="grid-2">
          <div className="field">
            <label>Monto del abono</label>
            <input type="number" value={monto || ''} onChange={(e) => setMonto(Number(e.target.value))} autoFocus />
          </div>
          <div className="field">
            <label>Método</label>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia / Nequi / Daviplata</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Nota (opcional)</label>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: abono parcial" />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn-sm" onClick={() => setMonto(cuenta.saldo)}>
            Abonar todo ({cop(cuenta.saldo)})
          </button>
        </div>
        <div className="modal-foot">
          <button onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={guardar} disabled={guardando}>
            <Icon name="check" size={15} /> {guardando ? 'Guardando...' : 'Registrar abono'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetalleModal({ detalle, onClose }: { detalle: any; onClose: () => void }): JSX.Element {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <h3 style={{ marginTop: 0 }}>{detalle.cliente?.nombre}</h3>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div>
            Fiado total: <b>{cop(detalle.fiado)}</b>
          </div>
          <div>
            Abonado: <b>{cop(detalle.abonado)}</b> · Saldo:{' '}
            <b style={{ color: 'var(--amber)' }}>{cop(detalle.saldo)}</b>
          </div>
        </div>
        <h4 style={{ margin: '10px 0 4px' }}>Ventas fiadas</h4>
        <table>
          <tbody>
            {detalle.ventas.map((v: any) => (
              <tr key={v.id}>
                <td>{v.numero}</td>
                <td className="muted">{v.fecha}</td>
                <td className="text-right">{cop(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4 style={{ margin: '14px 0 4px' }}>Abonos</h4>
        {detalle.abonos.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>Aún no ha abonado.</p>
        ) : (
          <table>
            <tbody>
              {detalle.abonos.map((a: any) => (
                <tr key={a.id}>
                  <td className="muted">{a.fecha}</td>
                  <td>{a.metodo}</td>
                  <td className="muted">{a.nota ?? ''}</td>
                  <td className="text-right" style={{ color: 'var(--green)' }}>
                    {cop(a.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="modal-foot">
          <button className="btn-primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
