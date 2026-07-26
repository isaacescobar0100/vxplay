import { useEffect, useState } from 'react'
import { avisar, confirmar } from '../dialogo'
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
    // Un vendedor de piso no necesita entrar a la app: basta el nombre.
    const soloVendedor = editando.rol === 'vendedor' && !editando.usuario?.trim()
    if (!editando.nombre?.trim()) {
      avisar('El nombre es obligatorio')
      return
    }
    if (!soloVendedor && !editando.usuario?.trim()) {
      avisar('El usuario de acceso es obligatorio.\nSi es un vendedor que no usa el computador, déjalo vacío y elige el rol "Vendedor".')
      return
    }
    if (!editando.id && !soloVendedor && !editando.password) {
      avisar('Define una contraseña para el nuevo usuario')
      return
    }
    try {
      await window.api.usuariosSave(editando)
      setEditando(null)
      cargar()
    } catch (e: any) {
      avisar(e?.message ?? 'No se pudo guardar')
    }
  }

  async function toggle(u: any): Promise<void> {
    if (u.id === usuarioActual.id) {
      avisar('No puedes desactivar tu propio usuario')
      return
    }
    await window.api.usuariosToggle(u.id, !u.activo)
    cargar()
  }

  async function eliminar(u: any): Promise<void> {
    if (u.id === usuarioActual.id) {
      avisar('No puedes eliminar tu propio usuario')
      return
    }
    if (!(await confirmar('¿Eliminar al usuario "' + u.nombre + '"? Esta acción no se puede deshacer.'))) return
    const r: any = await window.api.usuariosEliminar(u.id)
    if (r?.ok) {
      cargar()
    } else {
      avisar(r?.error ?? 'No se pudo eliminar')
    }
  }

  // Los vendedores sin acceso llevan un usuario interno "#v<id>" que no se muestra
  // nunca: para la pantalla es como si no tuvieran nombre de acceso.
  const sinAccesoInterno = String(editando?.usuario ?? '').startsWith('#')
  const esVendedorSinAcceso = editando?.rol === 'vendedor' && (!editando?.usuario || sinAccesoInterno)

  return (
    <div>
      <div className="page-title">Usuarios</div>
      <div className="toolbar">
        <p className="muted" style={{ flex: 1 }}>
          Los <b>cajeros</b> solo ven Punto de Venta, Caja, Ventas y Clientes; los{' '}
          <b>administradores</b> ven todo. Los <b>vendedores</b> no entran a la app: se registran solo
          con el nombre para poder saber quién atendió cada venta.
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
                <td className="muted">
                  {String(u.usuario ?? '').startsWith('#') ? '— (no entra a la app)' : u.usuario}
                </td>
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
                <label>{esVendedorSinAcceso ? 'Usuario de acceso (opcional)' : 'Usuario de acceso *'}</label>
                <input
                  value={sinAccesoInterno ? '' : (editando.usuario ?? '')}
                  onChange={(e) => setEditando({ ...editando, usuario: e.target.value })}
                  placeholder={esVendedorSinAcceso ? 'Déjalo vacío: no entra a la app' : ''}
                />
              </div>
              <div className="field">
                <label>Rol</label>
                <select
                  value={editando.rol}
                  onChange={(e) => setEditando({ ...editando, rol: e.target.value })}
                >
                  <option value="cajero">Cajero</option>
                  <option value="vendedor">Vendedor (solo para atribuirle ventas)</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>
            {esVendedorSinAcceso ? (
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                Esta persona <b>no podrá entrar a la app</b> ni necesita contraseña. Aparecerá en el
                desplegable <b>Vendedor</b> del Punto de Venta para saber quién atendió cada venta.
                Si además va a manejar la caja, escríbele un usuario de acceso y ponle contraseña.
              </p>
            ) : (
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
            )}
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
