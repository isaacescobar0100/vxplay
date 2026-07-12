import { useEffect, useState } from 'react'
import type { Usuario } from '../App'
import { cop, hoyISO } from '../util'
import Icon from '../components/Icon'

function ymd(d: Date): string {
  const o = d.getTimezoneOffset()
  return new Date(d.getTime() - o * 60000).toISOString().slice(0, 10)
}

// Últimos 7 días (etiqueta corta + fecha ISO)
function ultimos7(): { iso: string; label: string }[] {
  const arr: { iso: string; label: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    arr.push({ iso: ymd(d), label: d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '') })
  }
  return arr
}

export default function Inicio({
  usuario,
  irA
}: {
  usuario: Usuario
  irA: (v: string) => void
}): JSX.Element {
  const [data, setData] = useState<any>(null)
  const [semana, setSemana] = useState<any>(null)
  const [caja, setCaja] = useState<any | null>(null)
  const [stockBajo, setStockBajo] = useState<any[]>([])

  useEffect(() => {
    const hoy = hoyISO()
    const dias = ultimos7()
    window.api.reportesResumen(hoy, hoy).then(setData)
    window.api.reportesResumen(dias[0].iso, hoy).then(setSemana)
    window.api.cajaActual().then(setCaja)
    window.api.reportesStockBajo().then((s: any) => setStockBajo(s))
  }, [])

  const t = data?.totales
  const u = data?.utilidad

  // Datos para el gráfico de ventas por día (rellena los 7 días, incluso los de $0)
  const porDiaMap: Record<string, number> = {}
  for (const d of semana?.porDia ?? []) porDiaMap[d.dia] = d.total
  const dias = ultimos7().map((d) => ({ label: d.label, total: porDiaMap[d.iso] ?? 0 }))
  const maxDia = Math.max(1, ...dias.map((d) => d.total))

  const top = (semana?.topProductos ?? []).slice(0, 5)
  const maxTop = Math.max(1, ...top.map((p: any) => p.unidades))

  const metodos = semana?.porMetodo ?? []
  const totalMetodos = Math.max(1, metodos.reduce((s: number, m: any) => s + m.total, 0))
  const colorMetodo: Record<string, string> = {
    efectivo: 'var(--green)',
    tarjeta: 'var(--primary)',
    transferencia: 'var(--amber)'
  }

  return (
    <div>
      <div className="page-title">Hola, {usuario.nombre} 👋</div>
      <p className="muted" style={{ marginTop: -12, marginBottom: 20 }}>
        Resumen de hoy · {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      {/* Estado de caja */}
      <div
        className="card"
        style={{
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderLeft: `4px solid ${caja ? 'var(--green)' : 'var(--amber)'}`
        }}
      >
        <div className="section-title" style={{ margin: 0 }}>
          <Icon name="cash" size={18} />
          {caja ? (
            <span>
              Caja <b style={{ color: 'var(--green)' }}>abierta</b> — fondo inicial {cop(caja.monto_inicial)}
            </span>
          ) : (
            <span>
              Caja <b style={{ color: 'var(--amber)' }}>cerrada</b> — ábrela para poder vender
            </span>
          )}
        </div>
        <button className="btn-primary" onClick={() => irA('caja')}>
          Ir a Caja
        </button>
      </div>

      {/* Métricas del día */}
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Ventas de hoy {data?.devoluciones?.total > 0 ? '(neto)' : ''}</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {cop(data?.devoluciones?.total > 0 ? data?.neto : t?.total_vendido)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {t?.num_ventas ?? 0} ventas
            {data?.devoluciones?.total > 0 && (
              <> · bruto {cop(t?.total_vendido)} − devol. {cop(data?.devoluciones?.total)}</>
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Utilidad estimada hoy</div>
          <div className="stat-value">{cop(u?.utilidad)}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Margen {u?.margen ?? 0}%
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Productos con stock bajo</div>
          <div className="stat-value" style={{ color: stockBajo.length ? 'var(--red)' : 'var(--green)' }}>
            {stockBajo.length}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {stockBajo.length ? 'necesitan reposición' : 'todo en orden'}
          </div>
        </div>
      </div>

      {/* Gráfico: ventas de los últimos 7 días */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title">
          <Icon name="chart" size={18} /> Ventas de los últimos 7 días
        </h3>
        <div className="chart-dias">
          {dias.map((d, i) => (
            <div className="chart-col" key={i}>
              <div className="chart-val">{d.total > 0 ? cop(d.total) : ''}</div>
              <div className="chart-bar-wrap">
                <div
                  className="chart-bar"
                  style={{ height: `${(d.total / maxDia) * 100}%` }}
                  title={`${d.label}: ${cop(d.total)}`}
                />
              </div>
              <div className="chart-dia">{d.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start', marginBottom: 20 }}>
        {/* Top productos */}
        <div className="card" style={{ flex: 1 }}>
          <h3 className="section-title">
            <Icon name="trophy" size={18} /> Más vendidos (7 días)
          </h3>
          {top.length === 0 ? (
            <p className="muted">Sin ventas esta semana.</p>
          ) : (
            <div className="hbars">
              {top.map((p: any, i: number) => (
                <div className="hbar-row" key={i}>
                  <div className="hbar-name" title={p.producto_nombre}>
                    {p.producto_nombre}
                  </div>
                  <div className="hbar-track">
                    <div
                      className="hbar-fill"
                      style={{ width: `${(p.unidades / maxTop) * 100}%`, background: 'var(--primary)' }}
                    />
                  </div>
                  <div className="hbar-val">{p.unidades} u</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Métodos de pago */}
        <div className="card" style={{ flex: 1 }}>
          <h3 className="section-title">
            <Icon name="card" size={18} /> Ventas por método (7 días)
          </h3>
          {metodos.length === 0 ? (
            <p className="muted">Sin ventas esta semana.</p>
          ) : (
            <div className="hbars">
              {metodos.map((m: any, i: number) => (
                <div className="hbar-row" key={i}>
                  <div className="hbar-name" style={{ textTransform: 'capitalize' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: colorMetodo[m.metodo_pago] ?? 'var(--muted)',
                        marginRight: 6
                      }}
                    />
                    {m.metodo_pago}
                  </div>
                  <div className="hbar-track">
                    <div
                      className="hbar-fill"
                      style={{
                        width: `${(m.total / totalMetodos) * 100}%`,
                        background: colorMetodo[m.metodo_pago] ?? 'var(--muted)'
                      }}
                    />
                  </div>
                  <div className="hbar-val">{cop(m.total)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title">Accesos rápidos</h3>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn-green btn-icon" onClick={() => irA('ventas')}>
            <Icon name="cart" size={16} /> Vender
          </button>
          <button className="btn-icon" onClick={() => irA('historial')}>
            <Icon name="receipt" size={16} /> Ventas
          </button>
          {usuario.rol === 'admin' && (
            <>
              <button className="btn-icon" onClick={() => irA('inventario')}>
                <Icon name="shirt" size={16} /> Inventario
              </button>
              <button className="btn-icon" onClick={() => irA('compras')}>
                <Icon name="box" size={16} /> Compras
              </button>
              <button className="btn-icon" onClick={() => irA('reportes')}>
                <Icon name="chart" size={16} /> Reportes
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stock bajo */}
      {stockBajo.length > 0 && (
        <div className="card">
          <h3 className="section-title">
            <Icon name="alert" size={18} /> Productos por reponer
          </h3>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Talla</th>
                <th>Color</th>
                <th className="text-right">Stock</th>
              </tr>
            </thead>
            <tbody>
              {stockBajo.slice(0, 8).map((s, i) => (
                <tr key={i}>
                  <td>{s.nombre}</td>
                  <td>{s.talla}</td>
                  <td>{s.color}</td>
                  <td className="text-right">
                    <span className="badge badge-red">{s.stock}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
