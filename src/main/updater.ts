import { app, dialog, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

/**
 * Auto-actualización vía GitHub Releases.
 *
 * Cómo funciona:
 *  1. Cuando la app abre y hay internet, revisa si hay una versión nueva en GitHub.
 *  2. Si la hay, la descarga en segundo plano (sin interrumpir la venta).
 *  3. Al terminar, avisa al cajero y ofrece reiniciar para instalarla.
 *
 * Los datos NUNCA se tocan (viven en %APPDATA%\pos-ropa, aparte del programa).
 *
 * Para publicar una actualización:
 *  1. Sube la versión en package.json (ej. 1.0.1).
 *  2. npm run dist
 *  3. Sube los archivos de la carpeta `release` (el .exe, latest.yml y .blockmap)
 *     a un GitHub Release con el tag v1.0.1.
 */
export function initAutoUpdater(): void {
  // Solo en la app instalada (en desarrollo no aplica).
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', async (info) => {
    const win = BrowserWindow.getAllWindows()[0]
    const res = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Reiniciar ahora', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
      title: 'Actualización disponible',
      message: `Hay una nueva versión (${info.version}) lista para instalar.`,
      detail:
        'Tus datos no se verán afectados. ¿Deseas reiniciar ahora para actualizar? También se instalará automáticamente al cerrar la aplicación.'
    })
    if (res.response === 0) autoUpdater.quitAndInstall()
  })

  // Errores silenciosos (ej. sin internet): no molestar al cajero.
  autoUpdater.on('error', () => {
    /* sin conexión o sin actualizaciones: se ignora */
  })

  autoUpdater.checkForUpdates().catch(() => {
    /* ignorar fallos de red */
  })
}
