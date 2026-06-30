import { useState, useCallback, useRef, useEffect, MouseEvent } from 'react';
import './DesktopPet.css';

interface DesktopPetProps {
  windowMode?: boolean;
}

function DesktopPet({ windowMode = false }: DesktopPetProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [pos, setPos] = useState({ x: window.innerWidth - 100, y: window.innerHeight - 160 });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (windowMode) return;
    dragging.current = true;
    startPos.current = { x: e.clientX, y: e.clientY };
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  }, [pos, windowMode]);

  useEffect(() => {
    if (windowMode) return;
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!dragging.current) return;
      const dx = Math.abs(e.clientX - startPos.current.x);
      const dy = Math.abs(e.clientY - startPos.current.y);
      if (dx < 3 && dy < 3) return;
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    };

    const handleMouseUp = (e: globalThis.MouseEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      const dx = Math.abs(e.clientX - startPos.current.x);
      const dy = Math.abs(e.clientY - startPos.current.y);
      if (dx < 3 && dy < 3) {
        setMenuOpen((prev) => !prev);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [windowMode]);

  if (!visible) return null;

  if (windowMode) {
    return (
      <button
        className="desktop-pet desktop-pet--window"
        onMouseDown={(event) => {
          event.preventDefault();
          if (event.button === 2) {
            (window as unknown as { electronAPI?: { showPetMenu?: () => void } }).electronAPI?.showPetMenu?.();
          } else {
            void (window as unknown as { electronAPI?: { showMain?: () => Promise<void> } }).electronAPI?.showMain?.();
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          (window as unknown as { electronAPI?: { showPetMenu?: () => void } }).electronAPI?.showPetMenu?.();
        }}
        title="左键打开 Firefly，右键退出"
      >
        <img
          src="/assets/firefly2.png"
          alt="Firefly"
          className="pet-image pet-image--window"
          draggable={false}
        />
      </button>
    );
  }

  return (
    <>
      <div
        className="desktop-pet"
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={handleMouseDown}
      >
        <img
          src="/assets/firefly2.png"
          alt="Firefly"
          className="pet-image"
          draggable={false}
        />
      </div>

      {menuOpen && (
        <div
          className="pet-menu"
          style={{ left: pos.x - 80, top: pos.y - 140 }}
        >
          <button onClick={() => setMenuOpen(false)}>
            💬 打开对话
          </button>
          <button onClick={() => setMenuOpen(false)}>
            ✨ 今日运势
          </button>
          <button onClick={() => { setMenuOpen(false); setVisible(false); }}>
            👋 隐藏
          </button>
        </div>
      )}
    </>
  );
}

export default DesktopPet;
