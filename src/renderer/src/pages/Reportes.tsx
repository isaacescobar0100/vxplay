import { useEffect, useState } from 'react'
import { cop, hoyISO } from '../util'
import Icon from '../components/Icon'

function ymd(d: Date): string {
  const o = d.getTimezoneOffset()
  return new Date(d.getTime() - o * 60000).toISOString().slice(0, 10)
}

export default function Reportes(): JSX.Element {
  const [desde, setDesde] = useState(hoyISO())
  const [hasta, setHasta] = useState(hoyISO())
  const [data, setData] = useState<any>(null)
  const [stockBajo, setStockBajo] = useState<any[]>([])
  const [exportando, setExportando] = useState(false)
  const [fiadoOn, setFiadoOn] = useState(false)
  const [dianOn, setDianOn] = useState(false)

  async function cargarRango(d1: string, d2: string): Promise<void> {
    setData(await window.api.reportesResumen(d1, d2))
    setStockBajo((await window.api.reportesStockBajo()) as any[])
  }
  async function cargar(): Promise<void> {
    await cargarRango(desde, hasta)
  }

  function periodo(tipo: 'dia' | 'semana' | 'mes' | 'ano'): void {
    const hoy = new Date()
    let ini = new Date(hoy)
    if (tipo === 'dia') ini = hoy
    else if (tipo === 'semana') {
      const dow = (hoy.getDay() + 6) % 7 // lunes = 0
      ini = new Date(hoy)
      ini.setDate(hoy.getDate() - dow)
    } else if (tipo === 'mes') ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    else if (tipo === 'ano') ini = new Date(hoy.getFullYear(), 0, 1)
    const d1 = ymd(ini)
    const d2 = ymd(hoy)
    setDesde(d1)
    setHasta(d2)
    cargarRango(d1, d2)
  }

  async function exportar(detalle: boolean): Promise<void> {
    setExportando(true)
    const r: any = await window.api.reportesExportar(desde, hasta, detalle)
    setExportando(false)
    if (r.ok) alert(`Exportado ${r.filas} registros a:\n${r.ruta}\n\nÁbrelo con Excel.`)
  }

  useEffect(() => {
    cargar()
    window.api.configGetAll().then((c: any) => {
      setFiadoOn(c.fiado_habilitado === '1')
      setDianOn(c.dian_habilitado === '1')
    })
  }, [])

  const t = data?.totales

  return (
    <div>
      <div className="page-title">Reportes</div>

      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <div className="btn-group" style={{ display: 'flex', gap: 6 }}>
          <button className="btn-sm" onClick={() => periodo('dia')}>
            Hoy
          </button>
          <button className="btn-sm" onClick={() => periodo('semana')}>
            Semana
          </button>
          <button className="btn-sm" onClick={() => periodo('mes')}>
            Mes
          </button>
          <button className="btn-sm" onClick={() => periodo('ano')}>
            Año
          </button>
        </div>
        <div>
          <label>Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <button className="btn-primary" style={{ alignSelf: 'flex-end' }} onClick={cargar}>
          Generar
        </button>
        <div style={{ flex: 1 }} />
        <button
          className="btn-green btn-icon"
          style={{ alignSelf: 'flex-end' }}
          onClick={() => exportar(false)}
          disabled={exportando}
          title="Exportar resumen de ventas a Excel"
        >
          <Icon name="print" size={15} /> Exportar Excel
        </button>
        <button
          className="btn-icon"
          style={{ alignSelf: 'flex-end' }}
          onClick={() => exportar(true)}
          disabled={exportando}
          title="Exportar detalle producto por producto"
        >
          Detalle
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 20
        }}
      >
        <div className="stat-card">
          <div className="stat-label">Devoluciones</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>
            −{cop(data?.devoluciones?.total)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{data?.devoluciones?.n ?? 0} devoluciones</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ventas netas</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {cop(data?.neto)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {t?.num_ventas ?? 0} ventas{dianOn ? ` · IVA ${cop(t?.total_iva)}` : ''}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Utilidad estimada</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {cop(data?.utilidad?.utilidad)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Margen {data?.utilidad?.margen ?? 0}%
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Costo de mercancía vendida</div>
          <div className="stat-value">{cop(data?.utilidad?.costo)}</div>
        </div>
        {dianOn && (
          <div className="stat-card">
            <div className="stat-label">Ingreso sin IVA</div>
            <div className="stat-value">{cop(data?.utilidad?.ingreso_base)}</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-label">Gastos / egresos</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>
            −{cop(data?.gastos?.total)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{data?.gastos?.n ?? 0} egreso(s)</div>
        </div>
        {fiadoOn && (
          <div className="stat-card">
            <div className="stat-label">Fiado (por cobrar)</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>
              {cop(data?.fiado?.total)}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{data?.fiado?.n ?? 0} venta(s) a crédito</div>
          </div>
        )}
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 1 }}>
          <h3 className="section-title">
            <Icon name="trophy" size={18} /> Productos más vendidos
          </h3>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th className="text-right">Unid.</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(data?.topProductos ?? []).map((p: any, i: number) => (
                <tr key={i}>
                  <td>{p.producto_nombre}</td>
                  <td className="text-right">{p.unidades}</td>
                  <td className="text-right">{cop(p.total)}</td>
                </tr>
              ))}
              {(data?.topProductos ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    Sin datos en el período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 className="section-title">
          <Icon name="alert" size={18} /> Stock bajo (reponer)
        </h3>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Talla</th>
              <th>Color</th>
              <th className="text-right">Stock</th>
              <th className="text-right">Mínimo</th>
            </tr>
          </thead>
          <tbody>
            {stockBajo.map((s, i) => (
              <tr key={i}>
                <td>{s.nombre}</td>
                <td>{s.talla}</td>
                <td>{s.color}</td>
                <td className="text-right">
                  <span className="badge badge-red">{s.stock}</span>
                </td>
                <td className="text-right muted">{s.stock_minimo}</td>
              </tr>
            ))}
            {stockBajo.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--green)' }}>
                    <Icon name="check" size={16} /> Todo el inventario está por encima del mínimo.
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
