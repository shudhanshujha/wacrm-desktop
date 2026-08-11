import { useEffect, useState, createContext, useContext, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { api } from './api';
import type { StatusResponse } from './types';
import Connect from './pages/Connect';
import Inbox from './pages/Inbox';
import Contacts from './pages/Contacts';
import Broadcasts from './pages/Broadcasts';
import Analytics from './pages/Analytics';
import Automations from './pages/Automations';
import Settings from './pages/Settings';

interface Toast {
  id: number;
  message: string;
  error?: boolean;
}

const ToastCtx = createContext<(message: string, error?: boolean) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

const SessionCtx = createContext<{
  status: StatusResponse | null;
  refresh: () => void;
}>({ status: null, refresh: () => {} });

export function useSession() {
  return useContext(SessionCtx);
}

const NAV = [
  { to: '/connect', label: 'Connect', icon: '⚡' },
  { to: '/inbox', label: 'Inbox', icon: '💬' },
  { to: '/contacts', label: 'Contacts', icon: '👥' },
  { to: '/broadcasts', label: 'Broadcasts', icon: '📣' },
  { to: '/analytics', label: 'Analytics', icon: '📊' },
  { to: '/automations', label: 'Automations', icon: '⚙️' },
  { to: '/settings', label: 'Settings', icon: '🔧' },
];

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const refresh = useCallback(() => {
    api
      .get<StatusResponse>('/api/status')
      .then(setStatus)
      .catch(() => setStatus({ coreAlive: false, sessions: [] }));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const toast = useCallback((message: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, error }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const connected = status?.sessions?.some((s) => s.status === 'ready' || s.state === 'ready');

  return (
    <ToastCtx.Provider value={toast}>
      <SessionCtx.Provider value={{ status, refresh }}>
        <div className="app">
          <aside className="sidebar">
            <div className="logo">
              Wa<span>CRM</span>
            </div>
            <nav className="nav">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  <span className="icon">{n.icon}</span>
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <div style={{ marginTop: 'auto', padding: '10px' }}>
              {status?.coreAlive ? (
                <span className="badge green">Core online</span>
              ) : (
                <span className="badge red">Core offline</span>
              )}
              {connected ? (
                <div style={{ marginTop: 8 }}>
                  <span className="badge cyan">WhatsApp connected</span>
                </div>
              ) : null}
            </div>
          </aside>
          <div className="main">
            <Routes>
              <Route path="/" element={<Navigate to="/connect" replace />} />
              <Route path="/connect" element={<Connect />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/broadcasts" element={<Broadcasts />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/automations" element={<Automations />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </div>
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.error ? ' error' : ''}`}>
            {t.message}
          </div>
        ))}
      </SessionCtx.Provider>
    </ToastCtx.Provider>
  );
}
