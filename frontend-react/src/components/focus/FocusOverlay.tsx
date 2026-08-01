import { useEffect, useMemo, useRef, useState } from 'react';
import { saveFocusSession } from '../../api/client';
import './FocusOverlay.css';

function FocusOverlay({ task, onClose }: { task: string | null; onClose: () => void }) {
  const [minutes, setMinutes] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const startedAt = useRef('');

  useEffect(() => {
    setMinutes(25);
    setRemaining(25 * 60);
    setRunning(false);
    setFinished(false);
    startedAt.current = '';
  }, [task]);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [remaining, running]);

  useEffect(() => {
    if (remaining !== 0 || !running) return;
    setRunning(false);
    setFinished(true);
    persist(true, minutes);
    if ('Notification' in window && Notification.permission === 'granted') new Notification('这一段专注完成了', { body: `${task} · ${minutes} 分钟` });
  }, [remaining, running]);

  const progress = useMemo(() => ((minutes * 60 - remaining) / (minutes * 60)) * 360, [minutes, remaining]);
  if (!task) return null;

  const chooseMinutes = (value: number) => { if (running) return; setMinutes(value); setRemaining(value * 60); setFinished(false); };
  const start = () => { if (!startedAt.current) startedAt.current = new Date().toISOString(); setRunning(true); setFinished(false); };
  const stop = async () => {
    const elapsed = Math.max(0, Math.ceil((minutes * 60 - remaining) / 60));
    if (elapsed) await persist(false, elapsed);
    onClose();
  };
  async function persist(completed: boolean, completedMinutes: number) {
    try {
      await saveFocusSession({ task_title: task, planned_minutes: minutes, completed_minutes: completedMinutes, completed, started_at: startedAt.current || new Date().toISOString() });
      window.dispatchEvent(new CustomEvent('firefly:focus-updated'));
    } catch { /* 专注本身不因记录失败而中断。 */ }
  }

  return (
    <div className="focus-backdrop">
      <section className="focus-overlay">
        <button className="focus-close" onClick={stop} aria-label="结束专注">×</button>
        <div className="focus-copy"><span>FIREFLY FOCUS</span><h2>{finished ? '这一段完成了' : '现在，只做这一件事'}</h2><p>{task}</p></div>
        <div className="focus-clock" style={{ '--focus-progress': `${progress}deg` } as React.CSSProperties}><div><strong>{String(Math.floor(remaining / 60)).padStart(2,'0')}:{String(remaining % 60).padStart(2,'0')}</strong><small>{running ? '保持呼吸，慢慢推进' : finished ? '做得很好' : '准备好就开始'}</small></div></div>
        <div className="focus-lengths">{[25,45,60].map((value) => <button key={value} className={minutes === value ? 'is-active' : ''} disabled={running} onClick={() => chooseMinutes(value)}>{value} 分钟</button>)}</div>
        <button className="focus-start" onClick={finished ? onClose : running ? () => setRunning(false) : start}>{finished ? '回到今天' : running ? '暂停一下' : remaining < minutes * 60 ? '继续专注' : '开始专注'}<b>→</b></button>
        <p className="focus-note">退出时也会记录已经投入的时间。</p>
      </section>
    </div>
  );
}

export default FocusOverlay;
