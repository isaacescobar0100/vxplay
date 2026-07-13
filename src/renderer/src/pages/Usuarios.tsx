import { useEffect, useState } from 'react'
import type { Usuario } from '../App'
import Icon from '../components/Icon'

const vacio = { nombre: '', usuario: '', rol: 'cajero', password: '', activo: true }

export default function Usuarios({ usuarioActual }: { usuarioActual: Usuario }): JSX.Element {
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [editando, setEditando] = useState<any | null>(null)

  async function cargar(): Promise<void> {
    setUsuarios((await window.api.usuariosList()) as any[])
  }
  useEffect(() => {
    cargar()
  }, [])

  async function guardar(): Promise<void> {
    if (!editando.nombre?.trim() || !editando.usuario?.trim()) {
      alert('Nombre y usuario de acceso son obligatorios')
      return
    }
    if (!editando.id && !editando.password) {
      alert('Define una contraseña para el nuevo usuario')
      return
    }
    try {
      await window.api.usuariosSave(editando)
      setEditando(null)
      cargar()
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo guardar')
    }
  }

  async function toggle(u: any): Promise<void> {
    if (u.id === usuarioActual.id) {
      alert('No puedes desactivar tu propio usuario')
      return
    }
    await window.api.usuariosToggle(u.id, !u.activo)
    cargar()
  }

  async function eliminar(u: any): Promise<void> {
    if (u.id === usuarioActual.id) {
      alert('No puedes eliminar tu propio usuario')
      return
    }
    if (!confirm('¿Eliminar al usuario "' + u.nombre + '"? Esta acción no se puede deshacer.')) return
    const r: any = await window.api.usuariosEliminar(u.id)
    if (r?.ok) {
      cargar()
    } else {
      alert(r?.error ?? 'No se pudo eliminar')
    }
  }

  return (
    <div>
      <div className="page-title">Usuarios</div>
      <div className="toolbar">
        <p className="muted" style={{ flex: 1 }}>
          Administra los usuarios que pueden ingresar. Los <b>cajeros</b> solo ven Punto de Venta,
          Caja, Ventas y Clientes; los <b>administradores</b> ven todo.
        </p>
        <button className="btn-primary btn-icon" onClick={() => setEditando({ ...vacio })}>
          <Icon name="plus" size={16} /> Nuevo usuario
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Usuario de acceso</th>
              <th>Rol</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>
                  <b>{u.nombre}</b>
                  {u.id === usuarioActual.id && <span className="muted"> (tú)</span>}
                </td>
                <td className="muted">{u.usuario}</td>
                <td>
                  <span className={'badge ' + (u.rol === 'admin' ? 'badge-amber' : 'badge-green')}>
                    {u.rol}
                  </span>
                </td>
                <td>
                  <span className={'badge ' + (u.activo ? 'badge-green' : 'badge-red')}>
                    {u.activo ? 'activo' : 'inactivo'}
                  </span>
                </td>
                <td className="text-right">
                  <button className="btn-sm" onClick={() => setEditando({ ...u, password: '' })}>
                    Editar
                  </button>{' '}
                  <button className="btn-sm" onClick={() => toggle(u)}>
                    {u.activo ? 'Desactivar' : 'Activar'}
                  </button>{' '}
                  {u.id !== usuarioActual.id && (
                    <button className="btn-sm btn-danger" onClick={() => eliminar(u)}>
                      Eliminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editando.id ? 'Editar usuario' : 'Nuevo usuario'}</h2>
            <div className="field">
              <label>Nombre completo *</label>
              <input
                value={editando.nombre ?? ''}
                onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                autoFocus
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Usuario de acceso *</label>
                <input
                  value={editando.usuario ?? ''}
                  onChange={(e) => setEditando({ ...editando, usuario: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Rol</label>
                <select
                  value={editando.rol}
                  onChange={(e) => setEditando({ ...editando, rol: e.target.value })}
                >
                  <option value="cajero">Cajero</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>
                {editando.id ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}
              </label>
              <input
                type="password"
                value={editando.password ?? ''}
                onChange={(e) => setEditando({ ...editando, password: e.target.value })}
                placeholder={editando.id ? '••••••' : 'Define una contraseña'}
              />
            </div>
            <div className="modal-foot">
              <button onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn-primary" onClick={guardar}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
