import { useEffect, useState } from 'react';
import '../../styles/network-status.css';

type SyncState = 'synced' | 'syncing' | 'offline';

export default function NetworkStatus() {
  const [state, setState] = useState<SyncState>(() => navigator.onLine ? 'synced' : 'offline');
  const [visible, setVisible] = useState(() => !navigator.onLine);

  useEffect(() => {
    let timer = 0;
    const update = (next: SyncState) => {
      window.clearTimeout(timer);
      setState(next);
      setVisible(true);
      if (next === 'synced') timer = window.setTimeout(() => setVisible(false), 1800);
    };
    const online = () => update('syncing');
    const offline = () => update('offline');
    const sync = (event: Event) => update((event as CustomEvent<SyncState>).detail);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('firefly:sync-status', sync);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('firefly:sync-status', sync);
    };
  }, []);

  if (!visible) return null;
  const copy = state === 'offline' ? '离线使用中 · 修改将在联网后同步' : state === 'syncing' ? '正在同步…' : '已同步';
  return <div className={`network-status is-${state}`} role="status"><i />{copy}</div>;
}
