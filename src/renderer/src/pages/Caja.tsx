import { useEffect, useState } from 'react'
import type { Usuario } from '../App'
import { cop } from '../util'
import Icon from '../components/Icon'

export default function Caja({ usuario }: { usuario: Usuario }): JSX.Element {
  const [sesion, setSesion] = useState<any | null>(null)
  const [resumen, setResumen] = useState<any | null>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [montoInicial, setMontoInicial] = useState<number>(0)
  const [montoContado, setMontoContado] = useState<number>(0)
  const [notas, setNotas] = useState('')
  const [cargando, setCargando] = useState(false)
  const [gastos, setGastos] = useState<any[]>([])
  const [gasto, setGasto] = useState({ concepto: '', categoria: '', metodo: 'efectivo', monto: 0 })

  async function cargar(): Promise<void> {
    const s = await window.api.cajaActual()
    setSesion(s)
    if (s) {
      setResumen(await window.api.cajaResumen((s as any).id))
      setGastos((await window.api.gastosList((s as any).id)) as any[])
    } else {
      setResumen(null)
      setGastos([])
    }
    setHistorial((await window.api.cajaHistorial(30)) as any[])
  }

  async function registrarGasto(): Promise<void> {
    if (!gasto.concepto.trim() || gasto.monto <= 0) {
      alert('Indica el concepto y un monto válido')
      return
    }
    await window.api.gastosCrear({ ...gasto, usuario_id: usuario.id })
    setGasto({ concepto: '', categoria: '', metodo: 'efectivo', monto: 0 })
    await cargar()
  }

  useEffect(() => {
    cargar()
  }, [])

  async function abrir(): Promise<void> {
    setCargando(true)
    await window.api.cajaAbrir(montoInicial, usuario.id)
    setMontoInicial(0)
    await cargar()
    setCargando(false)
  }

  async function cerrar(): Promise<void> {
    if (!confirm('¿Cerrar la caja? No podrás registrar más ventas hasta abrir una nueva.')) return
    const sesionId = sesion.id
    setCargando(true)
    const r: any = await window.api.cajaCerrar(sesionId, montoContado, usuario.id, notas)
    setCargando(false)
    const dif = r.diferencia
    alert(
      `Caja cerrada.\nEfectivo esperado: ${cop(r.efectivo_esperado)}\nContado: ${cop(
        montoContado
      )}\nDiferencia: ${dif === 0 ? 'Cuadró exacto ✔' : (dif > 0 ? 'Sobrante ' : 'Faltante ') + cop(Math.abs(dif))}`
    )
    if (confirm('¿Imprimir el reporte de cierre (Z)?')) {
      await window.api.cajaImprimirCierre(sesionId)
    }
    setMontoContado(0)
    setNotas('')
    await cargar()
  }

  const diferencia = resumen ? montoContado - resumen.efectivo_esperado : 0

  return (
    <div>
      <div className="page-title">Caja</div>

      {!sesion ? (
        // ---------- CAJA CERRADA: abrir ----------
        <div className="card" style={{ maxWidth: 460 }}>
          <h3 className="section-title">
            <Icon name="lock" size={18} /> Caja cerrada
          </h3>
          <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
            Para empezar a vender, abre la caja indicando el <b>fondo inicial</b> (el efectivo con
            el que arranca el día para dar cambio).
          </p>
          <div className="field">
            <label>Fondo inicial (base en efectivo)</label>
            <input
              type="number"
              value={montoInicial || ''}
              onChange={(e) => setMontoInicial(Number(e.target.value))}
              autoFocus
            />
          </div>
          <button className="btn-green btn-icon" onClick={abrir} disabled={cargando}>
            <Icon name="cash" size={16} /> {cargando ? 'Abriendo...' : 'Abrir caja'}
          </button>
        </div>
      ) : (
        // ---------- CAJA ABIERTA: arqueo + cierre ----------
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="card" style={{ flex: 1 }}>
            <h3 className="section-title">
              <Icon name="cash" size={18} /> Caja abierta
            </h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Abierta por {sesion.usuario_apertura_id === usuario.id ? 'ti' : 'otro usuario'} el{' '}
              {sesion.fecha_apertura}
            </p>
            {resumen && (
              <table>
                <tbody>
                  <tr>
                    <td>Fondo inicial</td>
                    <td className="text-right">{cop(resumen.monto_inicial)}</td>
                  </tr>
                  <tr>
                    <td>
                      Ventas en efectivo <span className="muted">({resumen.num_ventas} ventas totales)</span>
                    </td>
                    <td className="text-right" style={{ color: 'var(--green)' }}>
                      + {cop(resumen.ventas_efectivo)}
                    </td>
                  </tr>
                  <tr>
                    <td>Devoluciones en efectivo</td>
                    <td className="text-right" style={{ color: 'var(--red)' }}>
                      − {cop(resumen.devoluciones_efectivo)}
                    </td>
                  </tr>
                  <tr>
                    <td>Gastos / egresos en efectivo</td>
                    <td className="text-right" style={{ color: 'var(--red)' }}>
                      − {cop(resumen.gastos_efectivo)}
                    </td>
                  </tr>
                  <tr style={{ fontWeight: 700 }}>
                    <td>Efectivo esperado en caja</td>
                    <td className="text-right">{cop(resumen.efectivo_esperado)}</td>
                  </tr>
                  <tr>
                    <td className="muted">Ventas con tarjeta (no van en caja)</td>
                    <td className="text-right muted">{cop(resumen.ventas_tarjeta)}</td>
                  </tr>
                  <tr>
                    <td className="muted">Ventas por transferencia</td>
                    <td className="text-right muted">{cop(resumen.ventas_transferencia)}</td>
                  </tr>
                  <tr style={{ fontWeight: 700 }}>
                    <td>Total vendido en la sesión</td>
                    <td className="text-right">{cop(resumen.total_ventas)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            <button className="btn-sm" style={{ marginTop: 12 }} onClick={cargar}>
              Actualizar
            </button>
          </div>

          <div className="card" style={{ flex: 1 }}>
            <h3 className="section-title">
              <Icon name="lock" size={18} /> Cerrar caja (arqueo)
            </h3>
            <div className="field">
              <label>Efectivo contado en la caja</label>
              <input
                type="number"
                value={montoContado || ''}
                onChange={(e) => setMontoContado(Number(e.target.value))}
                placeholder="Cuenta el dinero físico y escríbelo aquí"
              />
            </div>
            {resumen && montoContado > 0 && (
              <div
                className="card"
                style={{
                  background: 'var(--bg)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 12
                }}
              >
                <span>Diferencia</span>
                <b
                  style={{
                    color: diferencia === 0 ? 'var(--green)' : diferencia > 0 ? 'var(--amber)' : 'var(--red)'
                  }}
                >
                  {diferencia === 0
                    ? 'Cuadra exacto ✔'
                    : (diferencia > 0 ? 'Sobrante ' : 'Faltante ') + cop(Math.abs(diferencia))}
                </b>
              </div>
            )}
            <div className="field">
              <label>Notas (opcional)</label>
              <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones del cierre" />
            </div>
            <button className="btn-danger btn-icon" onClick={cerrar} disabled={cargando}>
              <Icon name="lock" size={16} /> {cargando ? 'Cerrando...' : 'Cerrar caja'}
            </button>
          </div>
        </div>
      )}

      {/* Gastos / egresos de la sesión */}
      {sesion && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 className="section-title">
            <Icon name="cash" size={18} /> Gastos / egresos de caja
          </h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Registra salidas de dinero (domicilios, pagos, retiros…). Los gastos en efectivo se
            descuentan del arqueo.
          </p>
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 2, margin: 0, minWidth: 180 }}>
              <label>Concepto</label>
              <input
                value={gasto.concepto}
                onChange={(e) => setGasto({ ...gasto, concepto: e.target.value })}
                placeholder="Ej: pago domicilio"
              />
            </div>
            <div className="field" style={{ flex: 1, margin: 0, minWidth: 120 }}>
              <label>Categoría</label>
              <input
                value={gasto.categoria}
                onChange={(e) => setGasto({ ...gasto, categoria: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            <div className="field" style={{ flex: 1, margin: 0, minWidth: 120 }}>
              <label>Método</label>
              <select value={gasto.metodo} onChange={(e) => setGasto({ ...gasto, metodo: e.target.value })}>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1, margin: 0, minWidth: 120 }}>
              <label>Monto</label>
              <input
                type="number"
                value={gasto.monto || ''}
                onChange={(e) => setGasto({ ...gasto, monto: Number(e.target.value) })}
              />
            </div>
            <button className="btn-primary btn-icon" onClick={registrarGasto}>
              <Icon name="plus" size={15} /> Agregar
            </button>
          </div>

          {gastos.length > 0 && (
            <table style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Categoría</th>
                  <th>Método</th>
                  <th className="text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id}>
                    <td className="muted">{g.fecha}</td>
                    <td>{g.concepto}</td>
                    <td className="muted">{g.categoria}</td>
                    <td className="muted">{g.metodo}</td>
                    <td className="text-right" style={{ color: 'var(--red)' }}>
                      −{cop(g.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Historial de sesiones */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3 className="section-title">
          <Icon name="receipt" size={18} /> Historial de cajas
        </h3>
        <table>
          <thead>
            <tr>
              <th>Apertura</th>
              <th>Cierre</th>
              <th>Cajero</th>
              <th className="text-right">Fondo</th>
              <th className="text-right">Esperado</th>
              <th className="text-right">Contado</th>
              <th className="text-right">Diferencia</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {historial.map((s) => (
              <tr key={s.id}>
                <td className="muted">{s.fecha_apertura}</td>
                <td className="muted">{s.fecha_cierre ?? '—'}</td>
                <td>{s.usuario_apertura ?? '—'}</td>
                <td className="text-right">{cop(s.monto_inicial)}</td>
                <td className="text-right">{s.monto_esperado != null ? cop(s.monto_esperado) : '—'}</td>
                <td className="text-right">{s.monto_contado != null ? cop(s.monto_contado) : '—'}</td>
                <td className="text-right">
                  {s.diferencia != null ? (
                    <span
                      className={
                        'badge ' +
                        (s.diferencia === 0 ? 'badge-green' : s.diferencia > 0 ? 'badge-amber' : 'badge-red')
                      }
                    >
                      {s.diferencia === 0 ? 'OK' : cop(s.diferencia)}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <span className={'badge ' + (s.estado === 'abierta' ? 'badge-amber' : 'badge-green')}>
                    {s.estado}
                  </span>
                </td>
                <td className="text-right">
                  <button
                    className="btn-sm btn-icon"
                    title="Imprimir cierre Z"
                    onClick={() => window.api.cajaImprimirCierre(s.id)}
                  >
                    <Icon name="print" size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {historial.length === 0 && (
              <tr>
                <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                  Aún no hay sesiones de caja.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
