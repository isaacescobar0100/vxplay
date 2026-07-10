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
import Inicio from './pages/Inicio'
import Icon, { type IconName } from './components/Icon'

export interface Usuario {
  id: number
  nombre: string
  usuario: string
  rol: string
}

type Vista =
  | 'inicio'
  | 'ventas'
  | 'caja'
  | 'historial'
  | 'inventario'
  | 'compras'
  | 'clientes'
  | 'reportes'
  | 'usuarios'
  | 'config'

// `roles` indica qué roles ven la sección; si se omite, la ven todos.
const NAV: { key: Vista; label: string; icon: IconName; roles?: string[] }[] = [
  { key: 'inicio', label: 'Inicio', icon: 'home' },
  { key: 'ventas', label: 'Punto de Venta', icon: 'cart' },
  { key: 'caja', label: 'Caja', icon: 'cash' },
  { key: 'historial', label: 'Ventas', icon: 'receipt' },
  { key: 'inventario', label: 'Inventario', icon: 'shirt', roles: ['admin'] },
  { key: 'compras', label: 'Compras', icon: 'box', roles: ['admin'] },
  { key: 'clientes', label: 'Clientes', icon: 'users' },
  { key: 'reportes', label: 'Reportes', icon: 'chart', roles: ['admin'] },
  { key: 'usuarios', label: 'Usuarios', icon: 'lock', roles: ['admin'] },
  { key: 'config', label: 'Configuración', icon: 'settings', roles: ['admin'] }
]

export default function App(): JSX.Element {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [vista, setVista] = useState<Vista>('inicio')
  const [tienda, setTienda] = useState('Mi Tienda de Ropa')
  const [cambiarPass, setCambiarPass] = useState(false)

  useEffect(() => {
    window.api.configGetAll().then((c: Record<string, string>) => {
      if (c.tienda_nombre) setTienda(c.tienda_nombre)
    })
  }, [usuario])

  if (!usuario) return <Login onLogin={setUsuario} />

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          POS <span>Ropa</span>
        </div>
        {NAV.filter((n) => !n.roles || n.roles.includes(usuario.rol)).map((n) => (
          <button
            key={n.key}
            className={'nav-item' + (vista === n.key ? ' active' : '')}
            onClick={() => setVista(n.key)}
          >
            <span className="nav-icon">
              <Icon name={n.icon} size={18} />
            </span>
            {n.label}
          </button>
        ))}
        <div className="sidebar-foot">
          {tienda}
          <br />
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
        </div>
      </aside>

      <main className="main">
        {vista === 'inicio' && <Inicio usuario={usuario} irA={(v) => setVista(v as Vista)} />}
        {vista === 'ventas' && <Ventas usuario={usuario} />}
        {vista === 'caja' && <Caja usuario={usuario} />}
        {vista === 'historial' && <HistorialVentas usuario={usuario} />}
        {vista === 'inventario' && <Inventario />}
        {vista === 'compras' && <Compras usuario={usuario} />}
        {vista === 'clientes' && <Clientes />}
        {vista === 'reportes' && <Reportes />}
        {vista === 'usuarios' && <Usuarios usuarioActual={usuario} />}
        {vista === 'config' && <Configuracion />}
      </main>

      {cambiarPass && <CambiarPassword usuario={usuario} onClose={() => setCambiarPass(false)} />}
    </div>
  )
}

function CambiarPassword({ usuario, onClose }: { usuario: Usuario; onClose: () => void }): JSX.Element {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(): Promise<void> {
    if (nueva !== repetir) {
      alert('La nueva contraseña y su repetición no coinciden')
      return
    }
    setGuardando(true)
    const r: any = await window.api.cambiarPassword(usuario.id, actual, nueva)
    setGuardando(false)
    if (r.ok) {
      alert('Contraseña actualizada correctamente')
      onClose()
    } else {
      alert(r.error ?? 'No se pudo cambiar la contraseña')
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
