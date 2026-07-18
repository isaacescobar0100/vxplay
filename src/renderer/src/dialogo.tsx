import { useEffect, useState } from 'react'
import Icon from './components/Icon'

/**
 * Diálogos propios (dentro de la app) para reemplazar `alert()` / `confirm()`
 * nativos, que en Electron dejan los campos de texto "muertos" hasta re-enfocar
 * la ventana (bug de foco). Uso:
 *   import { avisar, confirmar } from '../dialogo'
 *   avisar('Mensaje')                              // informativo
 *   avisar('Guardado ✔', 'Listo')                  // con título propio
 *   if (!(await confirmar('¿Seguro?'))) return     // confirmación
 *   if (!(await confirmar('¿Borrar?', 'Eliminar'))) return
 * Requiere que <DialogHost/> esté montado una vez en App.
 */

type Estado =
  | { tipo: 'aviso' | 'confirm'; mensaje: string; titulo: string; resolver?: (v: boolean) => void }
  | null

let setter: ((e: Estado) => void) | null = null

/** Aviso informativo (reemplaza alert). No bloquea; se cierra con "Entendido". */
export function avisar(mensaje: string, titulo = 'Aviso'): void {
  if (setter) setter({ tipo: 'aviso', mensaje, titulo })
  else window.alert(mensaje) // respaldo si el host no está montado
}

/** Confirmación (reemplaza confirm). Devuelve una promesa true/false. */
export function confirmar(mensaje: string, titulo = 'Confirmar'): Promise<boolean> {
  return new Promise((resolve) => {
    if (setter) setter({ tipo: 'confirm', mensaje, titulo, resolver: resolve })
    else resolve(window.confirm(mensaje))
  })
}

/** Se monta UNA vez en App. Renderiza el modal cuando hay un diálogo activo. */
export function DialogHost(): JSX.Element | null {
  const [estado, setEstado] = useState<Estado>(null)

  useEffect(() => {
    setter = setEstado
    return () => {
      setter = null
    }
  }, [])

  if (!estado) return null

  const cerrar = (v: boolean): void => {
    estado.resolver?.(v)
    setEstado(null)
  }
  const esConfirm = estado.tipo === 'confirm'

  return (
    <div className="modal-overlay" onClick={() => cerrar(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 430, maxWidth: '92vw' }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          <Icon name="alert" size={20} /> {estado.titulo}
        </h2>
        <p style={{ fontSize: 14.5, whiteSpace: 'pre-line', margin: '2px 0 4px', lineHeight: 1.5 }}>
          {estado.mensaje}
        </p>
        <div className="modal-foot">
          {esConfirm && <button onClick={() => cerrar(false)}>Cancelar</button>}
          <button
            className={esConfirm ? 'btn-green btn-icon' : 'btn-primary'}
            onClick={() => cerrar(true)}
            autoFocus
          >
            {esConfirm ? (
              <>
                <Icon name="check" size={15} /> Sí, confirmar
              </>
            ) : (
              'Entendido'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
