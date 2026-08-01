import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import './DesktopPet.css';

interface DesktopPetProps {
  windowMode?: boolean;
}

const PET_WIDTH = 260;
const PET_HEIGHT = 300;
const DRAG_THRESHOLD = 5;

type PetAction = 'idle' | 'pat' | 'wave' | 'cheer' | 'swing' | 'rest';

interface PetActionDefinition {
  image: string;
  duration: number;
  label: string;
}

const PET_ACTIONS: Record<PetAction, PetActionDefinition> = {
  idle: { image: './assets/firefly-wave.png', duration: 0, label: '陪着你' },
  pat: { image: './assets/firefly2.png', duration: 2800, label: '摸摸头' },
  wave: { image: './assets/firefly-wave.png', duration: 2800, label: '挥挥手' },
  cheer: { image: './assets/firefly-double-wave.png', duration: 3200, label: '开心招呼' },
  swing: { image: './assets/firefly-swing.png', duration: 5200, label: '荡秋千' },
  rest: { image: './assets/firefly-catlie.png', duration: 6200, label: '趴下休息' },
};

const PET_MESSAGES: Record<Exclude<PetAction, 'idle'>, string[]> = {
  pat: ['唔……祥云的手很暖。', '再摸一下也可以喔。', '嗯……有点开心。'],
  wave: ['祥云，我在这里～', '流萤来啦！', '今天也一起加油呀！'],
  cheer: ['锵锵——打起精神来！', '发现祥云！开心！', '给你双倍的元气～'],
  swing: ['风轻轻的，很舒服呢。', '一起荡到云上去吧～', '休息一下，再继续出发。'],
  rest: ['让我在这里陪你一会儿。', '稍微休息一下……', '忙完记得也要伸伸懒腰。'],
};

const QUICK_ACTIONS: Array<{ action: Exclude<PetAction, 'idle' | 'pat'>; icon: string }> = [
  { action: 'wave', icon: '👋' },
  { action: 'cheer', icon: '✨' },
  { action: 'swing', icon: '🎠' },
  { action: 'rest', icon: '💤' },
];

const AUTO_ACTIONS: Array<Exclude<PetAction, 'idle' | 'pat'>> = ['wave', 'cheer', 'swing', 'rest'];

function isPetAction(value: string): value is PetAction {
  return value in PET_ACTIONS;
}

interface FireflyAvatarProps {
  action: PetAction;
  actionId: number;
  message: string | null;
}

function FireflyAvatar({ action, actionId, message }: FireflyAvatarProps) {
  const definition = PET_ACTIONS[action];
  return (
    <div
      key={actionId}
      className={`firefly-avatar is-${action}${message ? ' has-message' : ''}`}
      data-action={action}
    >
      {message && <span className="pet-speech" role="status">{message}</span>}
      {action === 'pat' && <span className="pet-affection" aria-hidden="true">♥</span>}
      {(action === 'wave' || action === 'cheer') && <span className="pet-wave-trail" aria-hidden="true">✦</span>}
      <span className="avatar-halo" aria-hidden="true" />
      <span className="pet-spark pet-spark--aqua pet-spark--one" aria-hidden="true" />
      <span className="pet-spark pet-spark--gold pet-spark--two" aria-hidden="true" />
      <span className="pet-spark pet-spark--aqua pet-spark--three" aria-hidden="true" />
      <span className="pet-spark pet-spark--gold pet-spark--four" aria-hidden="true" />
      <img
        src={definition.image}
        alt={`流萤正在${definition.label}`}
        className="firefly-avatar__image"
        draggable={false}
      />
      <span className="pet-hint" aria-hidden="true">点击互动 · 双击打开 · 按住拖动</span>
    </div>
  );
}

function DesktopPet({ windowMode = false }: DesktopPetProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<PetAction>('idle');
  const [actionId, setActionId] = useState(0);
  const [pos, setPos] = useState({
    x: Math.max(0, window.innerWidth - PET_WIDTH),
    y: Math.max(0, window.innerHeight - PET_HEIGHT),
  });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const petPointer = useRef({ active: false, moved: false, id: -1, x: 0, y: 0 });
  const actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickAt = useRef(0);

  const playAction = useCallback((nextAction: Exclude<PetAction, 'idle'>, quiet = false) => {
    const messages = PET_MESSAGES[nextAction];
    setAction(nextAction);
    setMessage(quiet ? null : messages[Math.floor(Math.random() * messages.length)]);
    setActionId((current) => current + 1);
    if (actionTimer.current) clearTimeout(actionTimer.current);
    actionTimer.current = setTimeout(() => {
      setMessage(null);
      setAction('idle');
      setActionId((current) => current + 1);
    }, PET_ACTIONS[nextAction].duration);
  }, []);

  useEffect(() => {
    if (!windowMode) return;
    let disposed = false;
    const scheduleIdleAction = () => {
      idleTimer.current = setTimeout(() => {
        if (disposed) return;
        const nextAction = AUTO_ACTIONS[Math.floor(Math.random() * AUTO_ACTIONS.length)];
        playAction(nextAction, true);
        scheduleIdleAction();
      }, 14000 + Math.random() * 12000);
    };
    scheduleIdleAction();
    return () => {
      disposed = true;
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [playAction, windowMode]);

  useEffect(() => {
    if (!windowMode || !window.electronAPI?.onPetAction) return;
    return window.electronAPI.onPetAction((nextAction) => {
      if (isPetAction(nextAction) && nextAction !== 'idle') playAction(nextAction);
    });
  }, [playAction, windowMode]);

  useEffect(() => () => {
    if (actionTimer.current) clearTimeout(actionTimer.current);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (clickTimer.current) clearTimeout(clickTimer.current);
    window.electronAPI?.endPetDrag();
  }, []);

  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (windowMode) return;
    dragging.current = true;
    startPos.current = { x: event.clientX, y: event.clientY };
    offset.current = { x: event.clientX - pos.x, y: event.clientY - pos.y };
    event.preventDefault();
  }, [pos, windowMode]);

  useEffect(() => {
    if (windowMode) return;
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (!dragging.current) return;
      const moved = Math.abs(event.clientX - startPos.current.x) >= 3
        || Math.abs(event.clientY - startPos.current.y) >= 3;
      if (!moved) return;
      setPos({
        x: Math.min(Math.max(0, event.clientX - offset.current.x), window.innerWidth - PET_WIDTH),
        y: Math.min(Math.max(0, event.clientY - offset.current.y), window.innerHeight - PET_HEIGHT),
      });
    };
    const handleMouseUp = (event: globalThis.MouseEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      const wasClick = Math.abs(event.clientX - startPos.current.x) < 3
        && Math.abs(event.clientY - startPos.current.y) < 3;
      if (wasClick) setMenuOpen((value) => !value);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [windowMode]);

  useEffect(() => {
    if (!windowMode) return;
    const finishMissedDrag = () => {
      queueMicrotask(() => {
        if (!petPointer.current.active) return;
        petPointer.current.active = false;
        window.electronAPI?.endPetDrag();
      });
    };
    window.addEventListener('mouseup', finishMissedDrag);
    window.addEventListener('blur', finishMissedDrag);
    return () => {
      window.removeEventListener('mouseup', finishMissedDrag);
      window.removeEventListener('blur', finishMissedDrag);
    };
  }, [windowMode]);

  const handlePetPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!windowMode || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    petPointer.current = {
      active: true,
      moved: false,
      id: event.pointerId,
      x: event.screenX,
      y: event.screenY,
    };
    window.electronAPI?.startPetDrag({ x: event.screenX, y: event.screenY });
  };

  const handlePetPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = petPointer.current;
    if (!windowMode || !pointer.active || pointer.id !== event.pointerId) return;
    if (!pointer.moved) {
      pointer.moved = Math.abs(event.screenX - pointer.x) > DRAG_THRESHOLD
        || Math.abs(event.screenY - pointer.y) > DRAG_THRESHOLD;
    }
    if (pointer.moved) window.electronAPI?.movePet({ x: event.screenX, y: event.screenY });
  };

  const handlePetClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastClickAt.current < 340) {
      lastClickAt.current = 0;
      if (clickTimer.current) clearTimeout(clickTimer.current);
      void window.electronAPI?.showMain();
      return;
    }
    lastClickAt.current = now;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    const nextAction: Exclude<PetAction, 'idle'> = event.clientY < 154 ? 'pat' : 'wave';
    clickTimer.current = setTimeout(() => playAction(nextAction), 350);
  };

  const finishPetPointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const pointer = petPointer.current;
    if (!windowMode || !pointer.active || pointer.id !== event.pointerId) return;
    const moved = pointer.moved
      || Math.abs(event.screenX - pointer.x) > DRAG_THRESHOLD
      || Math.abs(event.screenY - pointer.y) > DRAG_THRESHOLD;
    pointer.active = false;
    window.electronAPI?.endPetDrag();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!cancelled && !moved) handlePetClick(event);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!windowMode) return;
    event.preventDefault();
    petPointer.current.active = false;
    window.electronAPI?.endPetDrag();
    window.electronAPI?.showPetMenu();
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      playAction('cheer');
    } else if (event.key === ' ') {
      event.preventDefault();
      playAction('swing');
    }
  };

  if (!visible) return null;
  return (
    <>
      <div
        className={`desktop-pet${windowMode ? ' desktop-pet--window' : ''}`}
        style={windowMode ? undefined : { left: pos.x, top: pos.y }}
        onMouseDown={handleMouseDown}
        onPointerDown={handlePetPointerDown}
        onPointerMove={handlePetPointerMove}
        onPointerUp={(event) => finishPetPointer(event)}
        onPointerCancel={(event) => finishPetPointer(event, true)}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyboard}
        aria-label="流萤桌宠。点击互动，双击打开 Firefly，按住可拖动。"
        role="application"
        tabIndex={0}
      >
        {windowMode && <span className="pet-drag-grip" title="拖动流萤" aria-hidden="true">⠿</span>}
        <FireflyAvatar action={action} actionId={actionId} message={message} />
        {windowMode && (
          <div className="pet-actions" aria-label="流萤动作">
            {QUICK_ACTIONS.map((item) => (
              <button
                key={item.action}
                className={action === item.action ? 'is-active' : undefined}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => playAction(item.action)}
                title={PET_ACTIONS[item.action].label}
                type="button"
              >
                <span aria-hidden="true">{item.icon}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!windowMode && menuOpen && (
        <div className="pet-menu" style={{ left: pos.x + 54, top: pos.y - 118 }}>
          <button onClick={() => setMenuOpen(false)}>💬 打开对话</button>
          <button onClick={() => playAction('swing')}>🎠 荡秋千</button>
          <button onClick={() => { setMenuOpen(false); setVisible(false); }}>👋 隐藏</button>
        </div>
      )}
    </>
  );
}

export default DesktopPet;
