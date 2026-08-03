import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { getAuthStatus, login, logout } from '../../api/client';
import './AuthGate.css';

type AuthState = 'checking' | 'authenticated' | 'anonymous' | 'offline';
const OFFLINE_AUTH_KEY = 'firefly:authenticated-device';

export default function AuthGate({ children }: { children: ReactNode }) {
  const trustedOfflineDevice = () => window.localStorage.getItem(OFFLINE_AUTH_KEY) === 'true';
  const [state, setState] = useState<AuthState>(() => trustedOfflineDevice() ? 'authenticated' : 'checking');
  const [authEnabled, setAuthEnabled] = useState(false);
  const [username, setUsername] = useState('firefly');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const checkSession = async (background = false) => {
    if (!background) setState('checking');
    try {
      const status = await getAuthStatus();
      setAuthEnabled(status.enabled);
      if (status.authenticated) window.localStorage.setItem(OFFLINE_AUTH_KEY, 'true');
      setState(status.authenticated ? 'authenticated' : 'anonymous');
    } catch {
      setState(trustedOfflineDevice() ? 'authenticated' : 'offline');
    }
  };

  useEffect(() => {
    void checkSession(trustedOfflineDevice());
    const handleUnauthorized = () => {
      window.localStorage.removeItem(OFFLINE_AUTH_KEY);
      setAuthEnabled(true);
      setState('anonymous');
      setError('登录已失效，请重新登录');
    };
    window.addEventListener('firefly:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('firefly:unauthorized', handleUnauthorized);
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(username.trim(), password);
      window.localStorage.setItem(OFFLINE_AUTH_KEY, 'true');
      setPassword('');
      setState('authenticated');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    window.localStorage.removeItem(OFFLINE_AUTH_KEY);
    setState('anonymous');
  };

  if (state === 'authenticated') {
    return (
      <>
        {children}
        {authEnabled && (
          <button className="auth-logout-button" type="button" onClick={handleLogout} aria-label="退出 Firefly">
            退出
          </button>
        )}
      </>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-live="polite">
        <div className="auth-mark"><span /></div>
        <p className="auth-eyebrow">PRIVATE COMPANION</p>
        <h1>回到 Firefly</h1>
        <p className="auth-copy">
          {state === 'checking' && '正在确认云端会话…'}
          {state === 'offline' && '暂时无法连接云端，请检查网络后重试。'}
          {state === 'anonymous' && '登录后，你的对话、任务与个人空间会在这里继续。'}
        </p>

        {state === 'anonymous' && (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              <span>用户名</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
            </label>
            <label>
              <span>密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={submitting || !username.trim() || !password}>
              {submitting ? '正在登录…' : '进入 Firefly'}
            </button>
          </form>
        )}

        {state === 'offline' && <button className="auth-retry" type="button" onClick={() => void checkSession()}>重新连接</button>}
        <p className="auth-security">安全会话仅保存在此设备，密码不会写入 App。</p>
      </section>
    </main>
  );
}
