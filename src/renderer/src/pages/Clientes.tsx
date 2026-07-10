import { useEffect, useState } from 'react'
import Icon from '../components/Icon'

const vacio = {
  tipo_documento: 'CC',
  numero_documento: '',
  nombre: '',
  email: '',
  telefono: '',
  direccion: ''
}

export default function Clientes(): JSX.Element {
  const [clientes, setClientes] = useState<any[]>([])
  const [filtro, setFiltro] = useState('')
  const [editando, setEditando] = useState<any | null>(null)

  async function cargar(): Promise<void> {
    setClientes((await window.api.clientesList(filtro || undefined)) as any[])
  }

  useEffect(() => {
    const t = setTimeout(cargar, 250)
    return () => clearTimeout(t)
  }, [filtro])

  async function guardar(): Promise<void> {
    if (!editando.nombre?.trim()) {
      alert('El nombre es obligatorio')
      return
    }
    await window.api.clientesSave(editando)
    setEditando(null)
    cargar()
  }

  async function eliminar(c: any): Promise<void> {
    if (!confirm(`¿Eliminar al cliente "${c.nombre}"?\n\nSi tiene ventas registradas, se conservarán como "Consumidor final".`)) {
      return
    }
    await window.api.clientesDelete(c.id)
    cargar()
  }

  return (
    <div>
      <div className="page-title">Clientes</div>
      <div className="toolbar">
        <div className="input-icon" style={{ flex: 1 }}>
          <Icon name="search" size={16} />
          <input
            className="search"
            placeholder="Buscar por nombre o documento..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </div>
        <button className="btn-primary btn-icon" onClick={() => setEditando({ ...vacio })}>
          <Icon name="plus" size={16} /> Nuevo cliente
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Documento</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td>
                  <b>{c.nombre}</b>
                </td>
                <td className="muted">
                  {c.tipo_documento} {c.numero_documento}
                </td>
                <td className="muted">{c.telefono}</td>
                <td className="muted">{c.email}</td>
                <td className="text-right">
                  <button className="btn-sm" onClick={() => setEditando(c)}>
                    Editar
                  </button>{' '}
                  <button
                    className="btn-sm btn-danger"
                    title="Eliminar cliente"
                    onClick={() => eliminar(c)}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                  No hay clientes registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editando.id ? 'Editar cliente' : 'Nuevo cliente'}</h2>
            <div className="grid-2">
              <div className="field">
                <label>Tipo documento</label>
                <select
                  value={editando.tipo_documento}
                  onChange={(e) => setEditando({ ...editando, tipo_documento: e.target.value })}
                >
                  <option value="CC">Cédula (CC)</option>
                  <option value="NIT">NIT</option>
                  <option value="CE">Cédula extranjería (CE)</option>
                  <option value="PP">Pasaporte (PP)</option>
                </select>
              </div>
              <div className="field">
                <label>Número documento</label>
                <input
                  value={editando.numero_documento ?? ''}
                  onChange={(e) => setEditando({ ...editando, numero_documento: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>Nombre / Razón social *</label>
              <input
                value={editando.nombre ?? ''}
                onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                autoFocus
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Teléfono</label>
                <input
                  value={editando.telefono ?? ''}
                  onChange={(e) => setEditando({ ...editando, telefono: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Email</label>
                <input
                  value={editando.email ?? ''}
                  onChange={(e) => setEditando({ ...editando, email: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>Dirección</label>
              <input
                value={editando.direccion ?? ''}
                onChange={(e) => setEditando({ ...editando, direccion: e.target.value })}
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
