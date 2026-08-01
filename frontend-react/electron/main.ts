import { app, BrowserWindow, ipcMain, Menu, screen, Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.setName('Firefly');
app.commandLine.appendSwitch('enable-transparent-visuals');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
const PET_WIDTH = 260;
const PET_HEIGHT = 300;
const DEV_SERVER_URL = 'http://localhost:5173';

let mainWindow: BrowserWindow | null = null;
let petWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let suppressPetFocusUntil = 0;
let petDragStart: { pointerX: number; pointerY: number; windowX: number; windowY: number } | null = null;
let petDragTimer: ReturnType<typeof setInterval> | null = null;
let savePetPositionTimer: ReturnType<typeof setTimeout> | null = null;

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
    width: 1280, height: 800, minWidth: 940, minHeight: 640,
    title: 'Firefly', icon: getAppIconPath(), backgroundColor: '#0f0a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false,
      additionalArguments: ['--firefly-main-window'],
    },
  });
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault(); suppressPetFocusUntil = Date.now() + 1200; mainWindow?.hide();
  });
  mainWindow.on('minimize', () => { suppressPetFocusUntil = Date.now() + 1200; });
  if (isDev) loadDevUrl(mainWindow, DEV_SERVER_URL);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function createPetWindow() {
  const initialPosition = getInitialPetPosition();
  petWindow = new BrowserWindow({
    width: PET_WIDTH, height: PET_HEIGHT,
    x: initialPosition.x,
    y: initialPosition.y,
    frame: false, show: false, transparent: true, focusable: true, resizable: false,
    movable: true, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, thickFrame: false,
    title: 'Firefly', icon: getAppIconPath(), backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false,
      additionalArguments: ['--firefly-pet-window'],
    },
  });
  // Keep the pet window interactive. Starting it in click-through mode makes
  // the renderer responsible for recovering mouse input from forwarded hover
  // events, which is unreliable on Windows and can leave the pet undraggable.
  petWindow.setIgnoreMouseEvents(false);
  petWindow.setMovable(true);
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.on('moved', schedulePetPositionSave);
  petWindow.on('system-context-menu', (event) => {
    event.preventDefault();
    showPetMenu();
  });
  petWindow.on('closed', () => {
    endPetDrag();
    petWindow = null;
    if (!isQuitting) createPetWindow();
  });
  petWindow.once('ready-to-show', () => {
    suppressPetFocusUntil = Date.now() + 1200; petWindow?.show(); mainWindow?.focus();
  });
  petWindow.webContents.once('did-finish-load', () => {
    if (!petWindow?.isVisible()) { suppressPetFocusUntil = Date.now() + 1200; petWindow?.show(); mainWindow?.focus(); }
  });
  if (isDev) loadDevUrl(petWindow, `${DEV_SERVER_URL}/#pet`);
  else petWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'pet' });
}

function createTray() {
  tray = new Tray(getAppIconPath());
  tray.setToolTip('Firefly');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 Firefly', click: showMainWindow },
    { type: 'separator' },
    { label: '退出', click: quitApp },
  ]));
  tray.on('click', showMainWindow);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show(); mainWindow?.moveTop(); mainWindow?.setAlwaysOnTop(true); mainWindow?.focus();
  setTimeout(() => {
    if (!mainWindow?.isDestroyed()) mainWindow?.setAlwaysOnTop(false);
    petWindow?.blur();
  }, 250);
  return true;
}

function showPetMenu() {
  if (!petWindow || petWindow.isDestroyed()) return;
  Menu.buildFromTemplate([
    { label: '打开 Firefly', click: showMainWindow },
    {
      label: '和流萤互动',
      submenu: [
        { label: '摸摸头', click: () => sendPetAction('pat') },
        { label: '挥挥手', click: () => sendPetAction('wave') },
        { label: '开心招呼', click: () => sendPetAction('cheer') },
        { label: '荡秋千', click: () => sendPetAction('swing') },
        { label: '趴下休息', click: () => sendPetAction('rest') },
      ],
    },
    { type: 'separator' },
    { label: '退出', click: quitApp },
  ]).popup({ window: petWindow });
}

function sendPetAction(action: string) {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send('firefly:pet-action', action);
}

function clampPetPosition(x: number, y: number) {
  const { workArea } = screen.getDisplayNearestPoint({ x, y });
  return {
    x: Math.round(Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - PET_WIDTH)),
    y: Math.round(Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - PET_HEIGHT)),
  };
}

function getPetPositionFile() {
  return path.join(app.getPath('userData'), 'pet-position.json');
}

function getInitialPetPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  const fallback = {
    x: workArea.x + workArea.width - PET_WIDTH - 24,
    y: workArea.y + workArea.height - PET_HEIGHT - 24,
  };
  try {
    const saved = JSON.parse(fs.readFileSync(getPetPositionFile(), 'utf8')) as { x?: unknown; y?: unknown };
    if (typeof saved.x === 'number' && typeof saved.y === 'number') {
      return clampPetPosition(saved.x, saved.y);
    }
  } catch {
    // The first launch has no saved position yet.
  }
  return fallback;
}

function schedulePetPositionSave() {
  if (savePetPositionTimer) clearTimeout(savePetPositionTimer);
  savePetPositionTimer = setTimeout(() => {
    savePetPositionTimer = null;
    if (!petWindow || petWindow.isDestroyed()) return;
    const [x, y] = petWindow.getPosition();
    try {
      fs.writeFileSync(getPetPositionFile(), JSON.stringify({ x, y }), 'utf8');
    } catch (error) {
      console.warn('Unable to save the desktop pet position.', error);
    }
  }, 180);
}

function startPetDrag(pointerX: number, pointerY: number) {
  if (!petWindow || petWindow.isDestroyed()) return;
  endPetDrag();
  const [windowX, windowY] = petWindow.getPosition();
  petDragStart = { pointerX, pointerY, windowX, windowY };
  // Moving a frameless window can interrupt renderer pointermove events on
  // Windows. Track the OS cursor in the main process so dragging stays smooth.
  petDragTimer = setInterval(() => {
    const point = screen.getCursorScreenPoint();
    movePet(point.x, point.y);
  }, 16);
}

function movePet(pointerX: number, pointerY: number) {
  if (!petWindow || petWindow.isDestroyed() || !petDragStart) return;
  const next = clampPetPosition(petDragStart.windowX + pointerX - petDragStart.pointerX, petDragStart.windowY + pointerY - petDragStart.pointerY);
  petWindow.setPosition(next.x, next.y, false);
}

function endPetDrag() {
  if (petDragStart) schedulePetPositionSave();
  petDragStart = null;
  if (petDragTimer) {
    clearInterval(petDragTimer);
    petDragTimer = null;
  }
}

function quitApp() {
  isQuitting = true;
  endPetDrag();
  if (savePetPositionTimer) clearTimeout(savePetPositionTimer);
  if (petWindow && !petWindow.isDestroyed()) petWindow.destroy();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  tray?.destroy(); app.exit(0);
}

app.whenReady().then(() => {
  createWindow(); createPetWindow(); createTray();
  ipcMain.handle('firefly:show-main', showMainWindow);
  ipcMain.on('firefly:show-main', showMainWindow);
  ipcMain.on('firefly:show-pet-menu', showPetMenu);
  ipcMain.on('firefly:pet-drag-start', (_event, point: { x: number; y: number }) => startPetDrag(point.x, point.y));
  ipcMain.on('firefly:pet-drag-move', (_event, point: { x: number; y: number }) => movePet(point.x, point.y));
  ipcMain.on('firefly:pet-drag-end', endPetDrag);
  ipcMain.on('firefly:set-pet-mouse-passthrough', (_event, ignore: boolean) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    if (ignore) petWindow.setIgnoreMouseEvents(true, { forward: true });
    else petWindow.setIgnoreMouseEvents(false);
  });
  ipcMain.handle('firefly:quit', quitApp);
  ipcMain.on('firefly:quit', quitApp);
  app.on('activate', showMainWindow);
});

app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => { /* Keep the desktop pet alive. */ });
