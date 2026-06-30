import { app, BrowserWindow, ipcMain, Menu, screen, Tray } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.setName('Firefly');
app.commandLine.appendSwitch('enable-transparent-visuals');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let petWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let suppressPetFocusUntil = 0;
let petFocusTimer: ReturnType<typeof setTimeout> | null = null;

const PET_SIZE = 88;
const DEV_SERVER_URL = 'http://localhost:5173';

function getAppIconPath() {
  return isDev
    ? path.join(__dirname, '..', 'public', 'assets', 'firefly2.png')
    : path.join(__dirname, '..', 'dist', 'assets', 'firefly2.png');
}

function loadDevUrl(window: BrowserWindow, url: string, retries = 80) {
  window.loadURL(url).catch(() => {
    if (window.isDestroyed() || retries <= 0) return;
    setTimeout(() => loadDevUrl(window, url, retries - 1), 300);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 640,
    title: 'Firefly',
    icon: getAppIconPath(),
    backgroundColor: '#0f0a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: ['--firefly-main-window'],
    },
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    suppressPetFocusUntil = Date.now() + 1200;
    mainWindow?.hide();
  });
  mainWindow.on('minimize', () => {
    suppressPetFocusUntil = Date.now() + 1200;
  });

  if (isDev) {
    loadDevUrl(mainWindow, DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function createPetWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  petWindow = new BrowserWindow({
    width: PET_SIZE,
    height: PET_SIZE,
    x: workArea.x + workArea.width - PET_SIZE - 24,
    y: workArea.y + workArea.height - PET_SIZE - 24,
    frame: false,
    show: false,
    transparent: true,
    focusable: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: false,
    title: 'Firefly',
    icon: getAppIconPath(),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: ['--firefly-pet-window'],
    },
  });

  petWindow.setIgnoreMouseEvents(false);
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.on('focus', () => {
    if (isQuitting || Date.now() < suppressPetFocusUntil) return;
    if (petFocusTimer) {
      clearTimeout(petFocusTimer);
    }
    petFocusTimer = setTimeout(() => {
      petFocusTimer = null;
      if (!isQuitting) {
        showMainWindow();
      }
    }, 120);
  });
  petWindow.webContents.on('context-menu', () => {
    if (petFocusTimer) {
      clearTimeout(petFocusTimer);
      petFocusTimer = null;
    }
    showPetMenu();
  });
  petWindow.once('ready-to-show', () => {
    suppressPetFocusUntil = Date.now() + 1200;
    petWindow?.show();
    mainWindow?.focus();
  });
  petWindow.webContents.once('did-finish-load', () => {
    if (!petWindow?.isVisible()) {
      suppressPetFocusUntil = Date.now() + 1200;
      petWindow?.show();
      mainWindow?.focus();
    }
  });

  if (isDev) {
    loadDevUrl(petWindow, `${DEV_SERVER_URL}/#pet`);
  } else {
    petWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'pet' });
  }
}

function createTray() {
  tray = new Tray(getAppIconPath());
  tray.setToolTip('Firefly');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 Firefly', click: () => showMainWindow() },
    { type: 'separator' },
    { label: '退出', click: () => quitApp() },
  ]));
  tray.on('click', () => showMainWindow());
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
  if (mainWindow?.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow?.show();
  mainWindow?.moveTop();
  mainWindow?.setAlwaysOnTop(true);
  mainWindow?.focus();
  setTimeout(() => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow?.setAlwaysOnTop(false);
    }
    petWindow?.blur();
  }, 250);
  return true;
}

function showPetMenu() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const menu = Menu.buildFromTemplate([
    { label: '打开 Firefly', click: () => showMainWindow() },
    { type: 'separator' },
    { label: '退出', click: () => quitApp() },
  ]);
  menu.popup({ window: petWindow });
}

function quitApp() {
  isQuitting = true;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.destroy();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
  tray?.destroy();
  app.exit(0);
}

app.whenReady().then(() => {
  createWindow();
  createPetWindow();
  createTray();

  ipcMain.handle('firefly:show-main', () => {
    return showMainWindow();
  });

  ipcMain.on('firefly:show-main', () => {
    showMainWindow();
  });

  ipcMain.on('firefly:show-pet-menu', () => {
    showPetMenu();
  });

  ipcMain.handle('firefly:quit', () => {
    quitApp();
  });

  ipcMain.on('firefly:quit', () => {
    quitApp();
  });

  app.on('activate', () => {
    showMainWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // Keep the backend-facing Electron app alive so the desktop pet can stay visible.
});
