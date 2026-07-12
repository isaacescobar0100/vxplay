import { useEffect, useState } from 'react'
import Icon from '../components/Icon'

export default function Configuracion(): JSX.Element {
  const [cfg, setCfg] = useState<Record<string, string>>({})
  const [guardado, setGuardado] = useState(false)
  const [impresoras, setImpresoras] = useState<{ name: string; isDefault: boolean }[]>([])
  const [backups, setBackups] = useState<{ nombre: string; fecha: string; kb: number }[]>([])
  const [nubeUltimo, setNubeUltimo] = useState<string | null>(null)
  const [nubeCargando, setNubeCargando] = useState(false)

  async function cargarBackups(): Promise<void> {
    setBackups((await window.api.backupListar()) as any[])
  }
  async function cargarNube(): Promise<void> {
    const r: any = await window.api.nubeUltimo()
    setNubeUltimo(r.fecha)
  }

  useEffect(() => {
    window.api.configGetAll().then(setCfg)
    window.api.listarImpresoras().then(setImpresoras)
    cargarBackups()
    cargarNube()
  }, [])

  async function respaldarNube(): Promise<void> {
    setNubeCargando(true)
    const r: any = await window.api.nubeSubir()
    setNubeCargando(false)
    if (r.ok) {
      await cargarNube()
      alert('Respaldo subido a la nube correctamente. ✔')
    } else {
      alert('No se pudo respaldar: ' + (r.error ?? ''))
    }
  }
  async function restaurarNube(): Promise<void> {
    if (!confirm('¿Restaurar los datos desde la nube?\n\nSe reemplazarán los datos actuales de este equipo por la última copia en la nube. La app se reiniciará.')) {
      return
    }
    const r: any = await window.api.nubeRestaurar()
    if (!r.ok) alert('No se pudo restaurar: ' + (r.error ?? ''))
    // si ok, la app se reinicia sola
  }

  async function exportar(): Promise<void> {
    const r: any = await window.api.backupExportar()
    if (r.ok) alert('Copia exportada en:\n' + r.ruta)
  }
  async function crearRespaldo(): Promise<void> {
    await window.api.backupCrear()
    await cargarBackups()
    alert('Respaldo creado correctamente.')
  }
  async function importar(): Promise<void> {
    await window.api.backupImportar() // si el usuario confirma, la app se reinicia sola
  }

  function subirLogo(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) {
      alert('La imagen es muy grande (máx. 500 KB). Usa una más pequeña.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => set('tienda_logo', reader.result as string)
    reader.readAsDataURL(file)
  }

  function set(k: string, v: string): void {
    setCfg((c) => ({ ...c, [k]: v }))
  }

  async function guardar(): Promise<void> {
    for (const [k, v] of Object.entries(cfg)) {
      await window.api.configSet(k, v ?? '')
    }
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  const central = cfg.config_central === '1'

  return (
    <div>
      <div className="page-title">Configuración</div>

      {central && (
        <div
          className="card"
          style={{ marginBottom: 16, background: 'rgba(99,102,241,.12)', border: '1px solid var(--primary)', fontSize: 13 }}
        >
          <Icon name="lock" size={15} /> Los <b>datos fiscales, DIAN y tipo de negocio</b> los gestiona el
          proveedor (VxPlay) desde el panel central. Aquí solo puedes ajustar lo operativo de tu tienda
          (logo, impresión, respaldos).
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title" style={{ marginBottom: 14 }}>
          <Icon name="store" size={18} /> Datos de la tienda
        </h3>
        <div className="field">
          <label>Tipo de negocio</label>
          <select value={cfg.tipo_negocio ?? 'ropa'} onChange={(e) => set('tipo_negocio', e.target.value)} disabled={central}>
            <option value="ropa">Tienda de ropa (con tallas y colores)</option>
            <option value="general">Tienda general (productos simples)</option>
            <option value="bar">Bar / Club (con mesas y comandas)</option>
            <option value="restaurante">Restaurante (con mesas y comandas)</option>
          </select>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Cambia qué funciones aparecen. Guarda y reinicia la app para aplicarlo.
          </p>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Nombre del negocio</label>
            <input value={cfg.tienda_nombre ?? ''} onChange={(e) => set('tienda_nombre', e.target.value)} disabled={central} />
          </div>
          <div className="field">
            <label>NIT</label>
            <input value={cfg.tienda_nit ?? ''} onChange={(e) => set('tienda_nit', e.target.value)} disabled={central} />
          </div>
          <div className="field">
            <label>Dirección</label>
            <input value={cfg.tienda_direccion ?? ''} onChange={(e) => set('tienda_direccion', e.target.value)} disabled={central} />
          </div>
          <div className="field">
            <label>Ciudad</label>
            <input value={cfg.tienda_ciudad ?? ''} onChange={(e) => set('tienda_ciudad', e.target.value)} disabled={central} />
          </div>
          <div className="field">
            <label>Teléfono</label>
            <input value={cfg.tienda_telefono ?? ''} onChange={(e) => set('tienda_telefono', e.target.value)} disabled={central} />
          </div>
          <div className="field">
            <label>IVA por defecto (%)</label>
            <input value={cfg.iva_defecto ?? '19'} onChange={(e) => set('iva_defecto', e.target.value)} />
          </div>
        </div>

        <div className="field" style={{ marginTop: 8 }}>
          <label>Logo de la tienda (aparece en el tiquete)</label>
          <div className="row" style={{ alignItems: 'center', gap: 14 }}>
            {cfg.tienda_logo ? (
              <img
                src={cfg.tienda_logo}
                alt="logo"
                style={{ maxHeight: 60, maxWidth: 120, background: '#fff', borderRadius: 6, padding: 4 }}
              />
            ) : (
              <span className="muted" style={{ fontSize: 13 }}>
                Sin logo
              </span>
            )}
            <label
              style={{
                cursor: 'pointer',
                background: 'var(--panel-2)',
                color: 'var(--text)',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Icon name="image" size={15} /> Subir logo
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={subirLogo} />
            </label>
            {cfg.tienda_logo && (
              <button className="btn-sm btn-danger" onClick={() => set('tienda_logo', '')}>
                Quitar
              </button>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Recomendado: imagen pequeña (logo en blanco/negro se ve mejor en impresora térmica). Recuerda dar <b>Guardar</b>.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title" style={{ marginBottom: 6 }}>
          <Icon name="cash" size={18} /> Respaldo en la nube
        </h3>
        <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          Tus datos se suben a la nube <b>automáticamente cada 24 horas y al cerrar caja</b>. Si el
          computador se daña, instala la app en otro, activa la misma licencia y restaura desde la nube.
        </p>
        <div style={{ marginBottom: 12, fontSize: 13 }}>
          Último respaldo en la nube:{' '}
          <b style={{ color: nubeUltimo ? 'var(--green)' : 'var(--amber)' }}>
            {nubeUltimo ?? 'aún no se ha subido'}
          </b>
        </div>
        <div className="row">
          <button className="btn-green btn-icon" onClick={respaldarNube} disabled={nubeCargando}>
            <Icon name="check" size={15} /> {nubeCargando ? 'Subiendo...' : 'Respaldar en la nube ahora'}
          </button>
          <button className="btn-danger btn-icon" onClick={restaurarNube}>
            <Icon name="undo" size={15} /> Restaurar desde la nube
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title" style={{ marginBottom: 6 }}>
          <Icon name="lock" size={18} /> Respaldo local (en este equipo)
        </h3>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          La app hace una copia de seguridad <b>automática cada vez que inicia</b> (guarda las
          últimas 15). También puedes exportar una copia a una USB o restaurar desde un archivo.
        </p>
        <div className="row" style={{ marginBottom: 14 }}>
          <button className="btn-primary btn-icon" onClick={exportar}>
            <Icon name="print" size={15} /> Exportar copia
          </button>
          <button className="btn-icon" onClick={crearRespaldo}>
            <Icon name="check" size={15} /> Crear respaldo ahora
          </button>
          <button className="btn-danger btn-icon" onClick={importar}>
            <Icon name="undo" size={15} /> Restaurar desde archivo
          </button>
        </div>
        {backups.length > 0 && (
          <div style={{ maxHeight: 160, overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Respaldo automático</th>
                  <th>Fecha</th>
                  <th className="text-right">Tamaño</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.nombre}>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {b.nombre}
                    </td>
                    <td className="muted">{b.fecha}</td>
                    <td className="text-right muted">{b.kb} KB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title" style={{ marginBottom: 6 }}>
          <Icon name="print" size={18} /> Impresión de tiquetes
        </h3>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          Modo <b>previsualizar</b>: muestra el tiquete en pantalla (puedes imprimir o guardar PDF).
          Modo <b>automático</b>: imprime solo, sin preguntar, en la impresora elegida (ideal en tienda).
        </p>
        <div className="grid-2">
          <div className="field">
            <label>Modo de impresión</label>
            <select
              value={cfg.impresion_modo ?? 'previsualizar'}
              onChange={(e) => set('impresion_modo', e.target.value)}
            >
              <option value="previsualizar">Previsualizar en pantalla</option>
              <option value="auto">Automático (imprime solo)</option>
              <option value="dialogo">Mostrar diálogo de Windows</option>
            </select>
          </div>
          <div className="field">
            <label>Impresora</label>
            <select
              value={cfg.impresora_nombre ?? ''}
              onChange={(e) => set('impresora_nombre', e.target.value)}
            >
              <option value="">Impresora por defecto de Windows</option>
              {impresoras.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} {p.isDefault ? '(por defecto)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Ancho del papel</label>
            <select value={cfg.ancho_papel ?? '58'} onChange={(e) => set('ancho_papel', e.target.value)}>
              <option value="58">58 mm (rollo pequeño)</option>
              <option value="80">80 mm (rollo grande)</option>
            </select>
          </div>
        </div>
        {impresoras.length === 0 && (
          <p className="muted" style={{ fontSize: 12 }}>
            No se detectaron impresoras instaladas. Cuando conectes la impresora térmica,
            aparecerá aquí y podrás cambiar a modo automático.
          </p>
        )}
      </div>

      {(!central || cfg.dian_habilitado === '1') && (
      <div className="card">
        <h3 className="section-title" style={{ marginBottom: 6 }}>
          <Icon name="receipt" size={18} /> Facturación electrónica DIAN
        </h3>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          Se conecta con un proveedor tecnológico autorizado por la DIAN (ej. Factus, Alegra,
          Siigo). Mientras esté deshabilitada, el sistema genera facturas <b>simuladas</b> para
          pruebas.
        </p>
        <div className="grid-2">
          <div className="field">
            <label>Proveedor</label>
            <select value={cfg.dian_proveedor ?? 'factus'} onChange={(e) => set('dian_proveedor', e.target.value)} disabled={central}>
              <option value="factus">Factus</option>
              <option value="alegra">Alegra</option>
              <option value="siigo">Siigo</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div className="field">
            <label>Ambiente</label>
            <select value={cfg.dian_ambiente ?? 'pruebas'} onChange={(e) => set('dian_ambiente', e.target.value)} disabled={central}>
              <option value="pruebas">Pruebas / Habilitación</option>
              <option value="produccion">Producción</option>
            </select>
          </div>
          <div className="field">
            <label>URL API del proveedor</label>
            <input
              value={cfg.dian_api_url ?? ''}
              onChange={(e) => set('dian_api_url', e.target.value)}
              placeholder="https://api.factus.com.co"
              disabled={central}
            />
          </div>
          <div className="field">
            <label>Token / API Key</label>
            <input
              type="password"
              value={cfg.dian_api_token ?? ''}
              onChange={(e) => set('dian_api_token', e.target.value)}
              placeholder="Bearer token del proveedor"
              disabled={central}
            />
          </div>
          <div className="field">
            <label>ID rango de numeración (opcional)</label>
            <input
              value={cfg.dian_rango_numeracion ?? ''}
              onChange={(e) => set('dian_rango_numeracion', e.target.value)}
              disabled={central}
            />
          </div>
          <div className="field">
            <label>Facturación electrónica</label>
            <select value={cfg.dian_habilitado ?? '0'} onChange={(e) => set('dian_habilitado', e.target.value)} disabled={central}>
              <option value="0">Deshabilitada (modo simulación)</option>
              <option value="1">Habilitada (emite facturas reales)</option>
            </select>
          </div>
        </div>
      </div>
      )}

      <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn-primary" onClick={guardar}>
          Guardar configuración
        </button>
        {guardado && (
          <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="check" size={16} /> Guardado
          </span>
        )}
      </div>
    </div>
  )
}
