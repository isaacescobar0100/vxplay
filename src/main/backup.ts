import { app, dialog } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { getDbPath, persist, queryOne } from './db'

/** Etiqueta de la tienda para nombrar los respaldos: vxplay-<LICENCIA> (o solo vxplay). */
function etiquetaTienda(): string {
  try {
    const row = queryOne<{ valor: string }>("SELECT valor FROM config WHERE clave = 'licencia_codigo'")
    const lic = (row?.valor ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '')
    return lic ? 'vxplay-' + lic : 'vxplay'
  } catch {
    return 'vxplay'
  }
}

/**
 * Respaldo de la base de datos. Como todo vive en un solo archivo .sqlite,
 * hacemos copias con fecha en una carpeta "backups" dentro de los datos de la app.
 */

function backupsDir(): string {
  const d = join(app.getPath('userData'), 'backups')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

/** Crea una copia con marca de tiempo y conserva solo las últimas `maxBackups`. */
export function crearBackupAutomatico(maxBackups = 15): string | null {
  persist()
  const src = getDbPath()
  if (!existsSync(src)) return null
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = join(backupsDir(), `${etiquetaTienda()}-${ts}.sqlite`)
  copyFileSync(src, dest)

  // eliminar los más antiguos
  const files = readdirSync(backupsDir())
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => ({ f, t: statSync(join(backupsDir(), f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const old of files.slice(maxBackups)) unlinkSync(join(backupsDir(), old.f))

  return dest
}

export function listarBackups(): { nombre: string; fecha: string; kb: number }[] {
  return readdirSync(backupsDir())
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => {
      const st = statSync(join(backupsDir(), f))
      return { nombre: f, fecha: st.mtime.toLocaleString('es-CO'), kb: Math.round(st.size / 1024) }
    })
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
}

/** Exporta la base de datos a una ubicación elegida por el usuario. */
export async function exportarDb(): Promise<{ ok: boolean; ruta?: string }> {
  persist()
  const ts = new Date().toISOString().slice(0, 10)
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exportar copia de seguridad',
    defaultPath: `respaldo-${etiquetaTienda()}-${ts}.sqlite`,
    filters: [{ name: 'Base de datos POS', extensions: ['sqlite'] }]
  })
  if (canceled || !filePath) return { ok: false }
  copyFileSync(getDbPath(), filePath)
  return { ok: true, ruta: filePath }
}

/**
 * Importa/restaura una base de datos desde un archivo. Sobrescribe la actual.
 * Antes de sobrescribir, respalda la actual por seguridad.
 * El proceso reinicia la app para cargar la base restaurada.
 */
export async function importarDb(): Promise<{ ok: boolean; reinicia?: boolean }> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Restaurar copia de seguridad',
    properties: ['openFile'],
    filters: [{ name: 'Base de datos POS', extensions: ['sqlite'] }]
  })
  if (canceled || !filePaths.length) return { ok: false }

  const confirm = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancelar', 'Restaurar y reiniciar'],
    defaultId: 1,
    cancelId: 0,
    title: 'Confirmar restauración',
    message: 'Se reemplazará la base de datos actual por la copia seleccionada.',
    detail: 'Se hará un respaldo de seguridad de los datos actuales antes de reemplazar. La aplicación se reiniciará.'
  })
  if (confirm.response !== 1) return { ok: false }

  crearBackupAutomatico() // respalda lo actual antes de sobrescribir
  copyFileSync(filePaths[0], getDbPath())

  app.relaunch()
  app.exit(0)
  return { ok: true, reinicia: true }
}
