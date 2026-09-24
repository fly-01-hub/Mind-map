const { app, BrowserWindow, net, protocol, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const APP_ORIGIN = 'app://researchmind'
const isDevelopment = process.argv.includes('--dev')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

function registerAppProtocol() {
  const webRoot = path.resolve(__dirname, '..', 'dist')
  protocol.handle('app', (request) => {
    const requestUrl = new URL(request.url)
    const requestedPath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '')
    const candidate = path.resolve(webRoot, requestedPath)
    const insideWebRoot = candidate === webRoot || candidate.startsWith(`${webRoot}${path.sep}`)
    const hasFileExtension = path.extname(requestedPath) !== ''
    const filePath = insideWebRoot && hasFileExtension && fs.existsSync(candidate)
      ? candidate
      : path.join(webRoot, 'index.html')
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#f7f9f7',
    title: '枝间 · ResearchMind',
    autoHideMenuBar: true,
    icon: path.resolve(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const allowedOrigin = isDevelopment ? 'http://127.0.0.1:5173' : APP_ORIGIN
    if (!url.startsWith(allowedOrigin)) {
      event.preventDefault()
      if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    }
  })

  if (isDevelopment) void window.loadURL('http://127.0.0.1:5173/library')
  else void window.loadURL(`${APP_ORIGIN}/library`)
}

app.setName('ResearchMind')
if (process.platform === 'win32') app.setAppUserModelId('com.fly01hub.researchmind')

app.whenReady().then(() => {
  if (!isDevelopment) registerAppProtocol()
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
