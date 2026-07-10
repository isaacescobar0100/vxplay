import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { initDatabase } from './db'
import { registerHandlers } from './handlers'
import { crearBackupAutomatico } from './backup'
import { initAutoUpdater } from './updater'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'POS Tienda de Ropa',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite expone la URL del dev server en esta variable de entorno
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await initDatabase()
  try {
    crearBackupAutomatico() // copia de seguridad al iniciar
  } catch {
    // no bloquear el arranque si falla el respaldo
  }
  registerHandlers()
  createWindow()
  initAutoUpdater() // revisa actualizaciones en GitHub (solo app instalada)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
