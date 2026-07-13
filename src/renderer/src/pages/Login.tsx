import { useState } from 'react'
import type { Usuario } from '../App'

export default function Login({ onLogin }: { onLogin: (u: Usuario) => void }): JSX.Element {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function entrar(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setCargando(true)
    const u = await window.api.login(usuario, password)
    setCargando(false)
    if (u) onLogin(u as Usuario)
    else setError('Usuario o contraseña incorrectos')
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={entrar}>
        <h1>
          Vx<span style={{ color: 'var(--primary)' }}>Play</span>
        </h1>
        <p>Sistema de punto de venta</p>
        <div className="field">
          <label>Usuario</label>
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Tu usuario" autoFocus />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tu contraseña"
          />
        </div>
        {error && <p style={{ color: 'var(--red)', marginBottom: 12, fontSize: 13 }}>{error}</p>}
        <button className="btn-primary" style={{ width: '100%' }} disabled={cargando}>
          {cargando ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
