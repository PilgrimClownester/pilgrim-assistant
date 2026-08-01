import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/shared/AppErrorBoundary';
import AuthGate from './components/auth/AuthGate';
import './styles/firefly-theme.css';
import './styles/global.css';
import './styles/animations.css';

const isPetWindow = new URLSearchParams(window.location.search).get('pet') === '1' || window.location.hash === '#pet';
if (isPetWindow) {
  document.documentElement.classList.add('firefly-pet-mode');
  document.body.classList.add('firefly-pet-mode');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary><AuthGate><App /></AuthGate></AppErrorBoundary>
  </React.StrictMode>,
);
