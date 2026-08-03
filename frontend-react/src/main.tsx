import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/shared/AppErrorBoundary';
import AuthGate from './components/auth/AuthGate';
import { syncEdgeAI, syncProductivity } from './api/client';
import './styles/firefly-theme.css';
import './styles/global.css';
import './styles/animations.css';

const isPetWindow = new URLSearchParams(window.location.search).get('pet') === '1' || window.location.hash === '#pet';
if (isPetWindow) {
  document.documentElement.classList.add('firefly-pet-mode');
  document.body.classList.add('firefly-pet-mode');
}

if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
window.addEventListener('online', () => { void syncProductivity(); void syncEdgeAI(); });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary><AuthGate><App /></AuthGate></AppErrorBoundary>
  </React.StrictMode>,
);
