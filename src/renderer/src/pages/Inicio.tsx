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
  const [fiadoOn, setFiadoOn] = useState(false)
  const [tiendaNombre, setTiendaNombre] = useState('')

  const cerosResumen = {
    totales: { num_ventas: 0, total_vendido: 0, total_iva: 0 },
    devoluciones: { total: 0, n: 0 },
    utilidad: { utilidad: 0, margen: 0, costo: 0, ingreso_base: 0 },
    gastos: { total: 0, n: 0 },
    fiado: { total: 0, n: 0 },
    cobrado: 0,
    neto: 0
  }

  useEffect(() => {
    const hoy = hoyISO()
    const dias = ultimos7()
    ;(async () => {
      const caja: any = await window.api.cajaActual()
      setCaja(caja)
      // Las tarjetas del resumen reflejan la CAJA/turno actual: si está cerrada, quedan en cero.
      if (caja) setData(await window.api.reportesResumen(hoy, hoy, caja.id))
      else setData(cerosResumen)
    })()
    window.api.reportesResumen(dias[0].iso, hoy).then(setSemana) // gráfico 7 días (histórico)
    window.api.reportesStockBajo().then((s: any) => setStockBajo(s))
    window.api.configGetAll().then((c: any) => {
      setFiadoOn(c.fiado_habilitado === '1')
      setTiendaNombre(c.tienda_nombre ?? '')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const t = data?.totales
  const u = data?.utilidad
  // ¿La caja abierta se abrió un día anterior? (para recordar cerrarla y cuadrar)
  const cajaOtroDia =
    caja && typeof caja.fecha_apertura === 'string' && caja.fecha_apertura.slice(0, 10) < hoyISO()

  // Datos para el gráfico de ventas por día (rellena los 7 días, incluso los de $0)
  const porDiaMap: Record<string, number> = {}
  for (const d of semana?.porDia ?? []) porDiaMap[d.dia] = d.total
  const dias = ultimos7().map((d) => ({ label: d.label, total: porDiaMap[d.iso] ?? 0 }))
  const maxDia = Math.max(1, ...dias.map((d) => d.total))

  const top = (semana?.topProductos ?? []).slice(0, 5)
  const maxTop = Math.max(1, ...top.map((p: any) => p.unidades))

  return (
    <div>
      <div className="page-title">Hola, {tiendaNombre || usuario.nombre}</div>
      <p className="muted" style={{ marginTop: -12, marginBottom: 20 }}>
        {caja ? 'Resumen de la caja actual' : 'Caja cerrada — el resumen empieza al abrir la caja'} ·{' '}
        {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
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

      {/* Recordatorio: caja abierta desde un día anterior */}
      {cajaOtroDia && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            background: 'rgba(245,158,11,.12)',
            border: '1px solid var(--amber)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12
          }}
        >
          <div style={{ fontSize: 13 }}>
            <b style={{ color: 'var(--amber)' }}>⚠️ Esta caja lleva abierta desde el {caja.fecha_apertura?.slice(0, 10)}.</b>{' '}
            Ciérrala para cuadrar el turno y que el resumen empiece de cero. (Los valores de arriba suman todo
            lo acumulado desde esa fecha.)
          </div>
          <button className="btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={() => irA('caja')}>
            Cerrar caja
          </button>
        </div>
      )}

      {/* Métricas del día */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 16,
          marginBottom: 20
        }}
      >
        {fiadoOn ? (
          <>
            <div className="stat-card">
              <div className="stat-label">Ventas cobradas hoy</div>
              <div className="stat-value" style={{ color: 'var(--green)' }}>
                {cop(data?.cobrado ?? 0)}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {(t?.num_ventas ?? 0) - (data?.fiado?.n ?? 0)} venta(s) pagada(s) · efectivo/tarjeta/transf.
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Fiado de hoy (por cobrar)</div>
              <div className="stat-value" style={{ color: 'var(--amber)' }}>
                {cop(data?.fiado?.total ?? 0)}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {data?.fiado?.n ?? 0} venta(s) a crédito · no entró a caja
              </div>
            </div>
          </>
        ) : (
          <div className="stat-card">
            <div className="stat-label">Ventas de hoy {data?.devoluciones?.total > 0 ? '(neto)' : ''}</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>
              {cop(data?.devoluciones?.total > 0 ? data?.neto : t?.total_vendido)}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {t?.num_ventas ?? 0} ventas
            </div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-label">Devoluciones de hoy</div>
          <div
            className="stat-value"
            style={{ color: (data?.devoluciones?.total ?? 0) > 0 ? 'var(--red)' : 'var(--green)' }}
          >
            {cop(data?.devoluciones?.total ?? 0)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {(data?.devoluciones?.n ?? 0) > 0
              ? `${data?.devoluciones?.n} devolución(es)`
              : 'sin devoluciones'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Utilidad estimada hoy</div>
          <div className="stat-value">{cop(u?.utilidad)}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Margen {u?.margen ?? 0}%
            {(data?.gastos?.total ?? 0) > 0 && <> · neta {cop(data?.gananciaNeta ?? 0)}</>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Gastos de hoy</div>
          <div
            className="stat-value"
            style={{ color: (data?.gastos?.total ?? 0) > 0 ? 'var(--red)' : 'var(--green)' }}
          >
            {cop(data?.gastos?.total ?? 0)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {(data?.gastos?.n ?? 0) > 0 ? `${data?.gastos?.n} egreso(s)` : 'sin gastos'}
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
