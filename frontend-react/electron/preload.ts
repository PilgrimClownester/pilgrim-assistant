import { contextBridge, ipcRenderer } from 'electron';

type ScreenPoint = { x: number; y: number };

function showMain() {
  return ipcRenderer.invoke('firefly:show-main') as Promise<boolean>;
}

function quit() {
  return ipcRenderer.invoke('firefly:quit') as Promise<void>;
}

function showPetMenu() {
  ipcRenderer.send('firefly:show-pet-menu');
}

function startPetDrag(point: ScreenPoint) {
  ipcRenderer.send('firefly:pet-drag-start', point);
}

function movePet(point: ScreenPoint) {
  ipcRenderer.send('firefly:pet-drag-move', point);
}

function endPetDrag() {
  ipcRenderer.send('firefly:pet-drag-end');
}

function setPetMousePassthrough(ignore: boolean) {
  ipcRenderer.send('firefly:set-pet-mouse-passthrough', ignore);
}

function onPetAction(callback: (action: string) => void) {
  const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
  ipcRenderer.on('firefly:pet-action', listener);
  return () => ipcRenderer.removeListener('firefly:pet-action', listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  showMain,
  showPetMenu,
  startPetDrag,
  movePet,
  endPetDrag,
  setPetMousePassthrough,
  onPetAction,
  quit,
});
