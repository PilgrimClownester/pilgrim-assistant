import { contextBridge, ipcRenderer } from 'electron';

function isPetWindow() {
  return process.argv.includes('--firefly-pet-window') || window.location.hash === '#pet' || window.location.search.includes('pet=1');
}

function showMain() {
  ipcRenderer.send('firefly:show-main');
  return ipcRenderer.invoke('firefly:show-main');
}

function quit() {
  ipcRenderer.send('firefly:quit');
  return ipcRenderer.invoke('firefly:quit');
}

function showPetMenu() {
  ipcRenderer.send('firefly:show-pet-menu');
}

if (isPetWindow()) {
  const bindPetClick = () => {
    const handlePointer = (event: MouseEvent | PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 0) {
        ipcRenderer.send('firefly:show-main');
      }
    };
    const preventMenu = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      ipcRenderer.send('firefly:show-pet-menu');
    };
    window.addEventListener('pointerdown', handlePointer, true);
    window.addEventListener('mousedown', handlePointer, true);
    window.addEventListener('contextmenu', preventMenu, true);
    document.addEventListener('pointerdown', handlePointer, true);
    document.addEventListener('mousedown', handlePointer, true);
    document.addEventListener('contextmenu', preventMenu, true);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPetClick, { once: true });
  } else {
    bindPetClick();
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  showMain,
  showPetMenu,
  quit,
});
