import { useEffect, useState } from 'react'
import Login from './pages/Login'
import Ventas from './pages/Ventas'
import Inventario from './pages/Inventario'
import Clientes from './pages/Clientes'
import Reportes from './pages/Reportes'
import Configuracion from './pages/Configuracion'
import HistorialVentas from './pages/HistorialVentas'
import Caja from './pages/Caja'
import Usuarios from './pages/Usuarios'
import Compras from './pages/Compras'
import VentaAnterior from './pages/VentaAnterior'
import Inicio from './pages/Inicio'
import Mesas from './pages/Mesas'
import CuentasPorCobrar from './pages/CuentasPorCobrar'
import Icon, { type IconName } from './components/Icon'
import { DialogHost, avisar, confirmar } from './dialogo'

export interface Usuario {
  id: number
  nombre: string
  usuario: string
  rol: string
}

type Vista =
  | 'inicio'
  | 'ventas'
  | 'mesas'
  | 'caja'
  | 'historial'
  | 'ventaanterior'
  | 'inventario'
  | 'compras'
  | 'clientes'
  | 'fiado'
  | 'reportes'
  | 'usuarios'
  | 'config'

// `roles` = qué roles la ven; `tipos` = en qué tipos de negocio aparece (si se omite, en todos).
// `flag` = clave de config que debe estar en '1' para que aparezca (funciones opcionales).
// `opera` = registra movimientos, así que se oculta en modo consulta (licencia vencida).
const NAV: {
  key: Vista; label: string; icon: IconName; roles?: string[]; tipos?: string[]; flag?: string; opera?: boolean
}[] = [
  { key: 'inicio', label: 'Inicio', icon: 'home' },
  { key: 'mesas', label: 'Mesas', icon: 'mesa', tipos: ['bar', 'restaurante'], opera: true },
  { key: 'ventas', label: 'Punto de Venta', icon: 'cart', opera: true },
  { key: 'caja', label: 'Caja', icon: 'cash', opera: true },
  { key: 'historial', label: 'Ventas', icon: 'receipt' },
  { key: 'inventario', label: 'Inventario', icon: 'shirt', roles: ['admin'] },
  { key: 'compras', label: 'Compras', icon: 'box', roles: ['admin'], opera: true },
  { key: 'ventaanterior', label: 'Registrar venta anterior', icon: 'calendar', roles: ['admin'], opera: true },
  { key: 'clientes', label: 'Clientes', icon: 'users' },
  { key: 'fiado', label: 'Cuentas por cobrar', icon: 'receipt', flag: 'fiado_habilitado' },
  { key: 'reportes', label: 'Reportes', icon: 'chart', roles: ['admin'] },
  { key: 'usuarios', label: 'Usuarios', icon: 'lock', roles: ['admin'] },
  { key: 'config', label: 'Configuración', icon: 'settings', roles: ['admin'] }
]

export default function App(): JSX.Element {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [vista, setVista] = useState<Vista>('inicio')
  const [tienda, setTienda] = useState('Mi Tienda de Ropa')
  const [cambiarPass, setCambiarPass] = useState(false)
  const [version, setVersion] = useState('')
  const [lic, setLic] = useState<any>('checking')
  const [tipoNegocio, setTipoNegocio] = useState('ropa')
  const [licenciaCodigo, setLicenciaCodigo] = useState('')
  const [fiadoOn, setFiadoOn] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  async function cargarConfig(): Promise<void> {
    const c = (await window.api.configGetAll()) as Record<string, string>
    if (c.tienda_nombre) setTienda(c.tienda_nombre)
    setTipoNegocio(c.tipo_negocio ?? 'ropa')
    setLicenciaCodigo(c.licencia_codigo ?? '')
    setFiadoOn(c.fiado_habilitado === '1')
  }

  async function verificarLicencia(): Promise<void> {
    // Arranque optimista: muestra de una con la última validación en cache (sin esperar internet).
    const rapido: any = await window.api.licenciaEstadoRapido()
    if (rapido) setLic(rapido)
    else setLic('checking')
    // Valida contra el servidor en segundo plano (aplica suspensiones/cambios).
    const real: any = await window.api.licenciaEstado()
    setLic(real)
    if (real.configCambio) {
      await cargarConfig()
      setRefreshKey((k) => k + 1)
    }
  }

  useEffect(() => {
    verificarLicencia()
    window.api.appVersion().then((v: string) => setVersion(v))
    // Revisar la licencia cada 60s: aplica suspensiones al instante y, si el
    // proveedor cambió la configuración desde el panel, refresca las pantallas
    // SIN cerrar la sesión (el cajero no tiene que volver a entrar).
    const id = setInterval(async () => {
      const r: any = await window.api.licenciaEstado()
      setLic(r)
      if (r.configCambio) {
        await cargarConfig()
        setRefreshKey((k) => k + 1) // remonta las páginas para reflejar la nueva config
      }
    }, 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    cargarConfig()
  }, [usuario])

  // ----- Portero de licencia (antes de todo) -----
  if (lic === 'checking') return <PantallaCentro texto="Verificando licencia..." />
  if (lic.necesitaActivacion) return <Activacion onActivado={verificarLicencia} />

  if (!usuario) return <Login onLogin={setUsuario} />

  // Licencia vencida o suspendida: NO se cierra la puerta. La tienda entra, ve y
  // exporta toda su información —que es suya—, pero el sistema deja de operar.
  // Las secciones que registran movimientos se ocultan aquí, y el proceso
  // principal además rechaza esas operaciones (ver CANALES_ESCRITURA).
  const soloConsulta = !lic.activa
  const vistaActual = soloConsulta && NAV.find((n) => n.key === vista)?.opera ? 'inicio' : vista

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          Vx<span>Play</span>
        </div>
        <div
          style={{
            margin: '0 0 12px',
            padding: '10px 12px',
            background: 'var(--panel-2)',
            borderRadius: 8,
            borderLeft: '3px solid var(--primary)',
            flexShrink: 0
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13 }}>{tienda}</div>
          {licenciaCodigo && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              Licencia: {licenciaCodigo}
            </div>
          )}
          {usuario.rol === 'admin' && (
            <button
              className="btn-sm"
              style={{ marginTop: 8, fontSize: 11, padding: '4px 8px' }}
              onClick={async () => {
                if (await confirmar('¿Cambiar la licencia/tienda de este equipo? Deberás ingresar otro código.')) {
                  await window.api.licenciaCambiar()
                  // Reinicio limpio: borra TODO el estado en memoria (config, sesión, páginas)
                  // para que no queden datos de la tienda anterior en pantalla.
                  window.location.reload()
                }
              }}
            >
              Cambiar licencia
            </button>
          )}
        </div>
        <nav className="sidebar-nav">
          {NAV.filter(
            (n) =>
              (!n.roles || n.roles.includes(usuario.rol)) &&
              (!n.tipos || n.tipos.includes(tipoNegocio)) &&
              (!n.flag || (n.flag === 'fiado_habilitado' && fiadoOn)) &&
              (!soloConsulta || !n.opera)
          ).map((n) => (
            <button
              key={n.key}
              className={'nav-item' + (vistaActual === n.key ? ' active' : '')}
              onClick={() => setVista(n.key)}
            >
              <span className="nav-icon">
                <Icon name={n.icon} size={18} />
              </span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          {usuario.nombre} ({usuario.rol})
          <br />
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              className="btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => setCambiarPass(true)}
            >
              <Icon name="lock" size={14} />
              Contraseña
            </button>
            <button
              className="btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => setUsuario(null)}
            >
              <Icon name="logout" size={14} />
              Salir
            </button>
          </div>
          {version && (
            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.6 }}>VxPlay v{version}</div>
          )}
        </div>
      </aside>

      <main className="main" key={refreshKey}>
        {soloConsulta && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              background: 'rgba(217, 119, 6, 0.14)',
              border: '1px solid var(--amber)',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 18
            }}
          >
            <Icon name="alert" size={20} />
            <div style={{ flex: 1, minWidth: 240, fontSize: 13.5, lineHeight: 1.5 }}>
              <b>Modo consulta — la licencia no está activa.</b>
              <div className="muted">
                {lic.motivo ?? 'Comunícate para reactivarla.'} Puedes ver y exportar toda tu
                información, pero el sistema no registra ventas ni movimientos hasta reactivar.
              </div>
            </div>
            <button className="btn-primary" onClick={verificarLicencia}>
              Reintentar
            </button>
          </div>
        )}
        {vistaActual === 'inicio' && <Inicio usuario={usuario} irA={(v) => setVista(v as Vista)} />}
        {vistaActual === 'ventas' && <Ventas usuario={usuario} />}
        {vistaActual === 'mesas' && <Mesas usuario={usuario} />}
        {vistaActual === 'caja' && <Caja usuario={usuario} />}
        {vistaActual === 'historial' && <HistorialVentas usuario={usuario} />}
        {vistaActual === 'inventario' && <Inventario />}
        {vistaActual === 'compras' && <Compras usuario={usuario} />}
        {vistaActual === 'ventaanterior' && <VentaAnterior usuario={usuario} />}
        {vistaActual === 'clientes' && <Clientes />}
        {vistaActual === 'fiado' && <CuentasPorCobrar usuarioActual={usuario} />}
        {vistaActual === 'reportes' && <Reportes />}
        {vistaActual === 'usuarios' && <Usuarios usuarioActual={usuario} />}
        {vistaActual === 'config' && <Configuracion />}
      </main>

      {cambiarPass && <CambiarPassword usuario={usuario} onClose={() => setCambiarPass(false)} />}
      <DialogHost />
    </div>
  )
}

function PantallaCentro({ texto }: { texto: string }): JSX.Element {
  return (
    <div className="login-wrap">
      <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
        <div className="brand" style={{ fontSize: 28, marginBottom: 10 }}>
          Vx<span style={{ color: 'var(--primary)' }}>Play</span>
        </div>
        {texto}
      </div>
    </div>
  )
}

function Activacion({ onActivado }: { onActivado: () => void }): JSX.Element {
  const [codigo, setCodigo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function activar(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setCargando(true)
    const r: any = await window.api.licenciaActivar(codigo)
    setCargando(false)
    if (r.ok) onActivado()
    else setError(r.error ?? 'No se pudo activar')
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={activar}>
        <h1>
          Vx<span style={{ color: 'var(--primary)' }}>Play</span>
        </h1>
        <p>Activación del sistema</p>
        <p className="muted" style={{ fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
          Ingresa el código de licencia que te entregó el proveedor para activar este equipo.
        </p>
        <div className="field">
          <label>Código de licencia</label>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Ej: DEMO-1234"
            autoFocus
          />
        </div>
        {error && <p style={{ color: 'var(--red)', marginBottom: 12, fontSize: 13 }}>{error}</p>}
        <button className="btn-primary" style={{ width: '100%' }} disabled={cargando}>
          {cargando ? 'Activando...' : 'Activar'}
        </button>
      </form>
    </div>
  )
}

// La pantalla "Sistema bloqueado" se eliminó a propósito: retenerle los datos al
// cliente no daba más presión que impedirle vender, y sí generaba conflictos.
// Ahora una licencia inactiva deja entrar en modo consulta (ver `soloConsulta`).
// "Cambiar licencia" vive en la barra lateral, solo para administradores.

function CambiarPassword({ usuario, onClose }: { usuario: Usuario; onClose: () => void }): JSX.Element {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(): Promise<void> {
    if (nueva !== repetir) {
      avisar('La nueva contraseña y su repetición no coinciden')
      return
    }
    setGuardando(true)
    const r: any = await window.api.cambiarPassword(usuario.id, actual, nueva)
    setGuardando(false)
    if (r.ok) {
      avisar('Contraseña actualizada correctamente')
      onClose()
    } else {
      avisar(r.error ?? 'No se pudo cambiar la contraseña')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">
          <Icon name="lock" size={20} /> Cambiar mi contraseña
        </h2>
        <div className="field">
          <label>Contraseña actual</label>
          <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Nueva contraseña</label>
          <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </div>
        <div className="field">
          <label>Repetir nueva contraseña</label>
          <input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </div>
        <div className="modal-foot">
          <button onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </div>
      </div>
    </div>
  )
}
