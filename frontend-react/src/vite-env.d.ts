/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    platform: string;
    showMain: () => Promise<boolean>;
    showPetMenu: () => void;
    startPetDrag: (point: { x: number; y: number }) => void;
    movePet: (point: { x: number; y: number }) => void;
    endPetDrag: () => void;
    setPetMousePassthrough: (ignore: boolean) => void;
    onPetAction: (callback: (action: string) => void) => () => void;
    quit: () => Promise<void>;
  };
}
