import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useSession, useToast } from '../App';
import type { Session } from '../types';

interface QRResponse {
  qrCode: string;
  status: string;
}

export default function Connect() {
  const { status, refresh } = useSession();
  const toast = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pairing, setPairing] = useState('');
  const [pairPhone, setPairPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const sessions = status?.sessions || [];
    if (sessions.length > 0) {
      const first = sessions[0];
      setSession(first);
      if (first.status !== 'ready') {
        startQrPoll(first.id);
      }
    }
  }, [status]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return stopPolling;
  }, []);

  async function ensureSession() {
    setBusy(true);
    try {
      let current = session;
      if (!current) {
        // Try getting existing sessions first or creating a new one
        const st = await api.get<Session[]>('/api/core/sessions');
        if (st && st.length > 0) {
          current = st[0];
        } else {
          current = await api.post<Session>('/api/core/sessions', { name: 'wacrm' });
        }
        setSession(current);
      }
      if (!current) return;
      await api.post(`/api/core/sessions/${current.id}/start`).catch(() => {
        // May already be starting
      });
      await refresh();
      startQrPoll(current.id);
    } catch (e) {
      toast(`Could not start session: ${(e as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  }

  function startQrPoll(id: string) {
    stopPolling();
    // Fetch immediately once
    const fetchQr = async () => {
      try {
        const data = await api.get<QRResponse>(`/api/core/sessions/${id}/qr`);
        if (data.qrCode) setQr(data.qrCode);
        if (data.status === 'authenticating') setPairing('Scanning...');
        const st = await api.get<Session[]>(`/api/core/sessions`);
        const found = st.find((s) => s.id === id);
        if (found) setSession(found);
        if (found && found.status === 'ready') {
          setQr(null);
          stopPolling();
          toast('WhatsApp connected!');
          refresh();
        }
      } catch {
        // QR not ready yet; keep waiting
      }
    };
    fetchQr();
    pollRef.current = setInterval(fetchQr, 2000);
  }

  async function requestPairing() {
    if (!session) return;
    if (!pairPhone || pairPhone.length < 8) {
      toast('Enter your WhatsApp number in international format, e.g. 628123456789', true);
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ pairingCode?: string; code?: string }>(
        `/api/core/sessions/${session.id}/pairing-code`,
        { phoneNumber: pairPhone },
      );
      setPairing(res.pairingCode || res.code || 'Pairing code requested');
    } catch (e) {
      toast(`Pairing: ${(e as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function logoutSession() {
    if (!session) return;
    setBusy(true);
    try {
      stopPolling();
      await api.post(`/api/core/sessions/${session.id}/logout`);
      toast('Logged out from WhatsApp');
      setQr(null);
      setSession(null);
      await refresh();
    } catch (e) {
      toast(`Logout failed: ${(e as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  }

  const ready = session?.status === 'ready';

  return (
    <div className="main">
      <div className="topbar">
        <h1>Connect WhatsApp</h1>
        <div className="spacer" />
        {session && (
          <span className={`badge ${ready ? 'green' : 'amber'}`}>{session.status}</span>
        )}
      </div>
      <div className="content">
        <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}>
          {ready ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 44 }}>✅</div>
              <h2 style={{ margin: '12px 0 4px' }}>WhatsApp connected</h2>
              <p className="muted">
                Session <span className="mono">{session.name}</span> is ready. Head to the Inbox
                to start handling conversations.
              </p>
              <div className="form-actions" style={{ justifyContent: 'center', marginTop: 16, gap: 12 }}>
                <button
                  className="btn"
                  onClick={() => {
                    stopPolling();
                    refresh();
                  }}
                >
                  Refresh status
                </button>
                <button className="btn danger" disabled={busy} onClick={logoutSession}>
                  {busy ? 'Logging out…' : 'Logout / Unlink WhatsApp'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <h2 style={{ marginTop: 0 }}>Link your WhatsApp number</h2>
              <p className="muted">
                Open <strong>WhatsApp</strong> on your phone → <strong>Settings → Linked
                devices → Link a device</strong> → scan the QR code below.
              </p>

              {qr ? (
                <div style={{ textAlign: 'center', margin: '20px 0' }}>
                  <div
                    style={{
                      display: 'inline-block',
                      background: '#fff',
                      padding: 12,
                      borderRadius: 12,
                    }}
                  >
                    <img
                      src={qr}
                      alt="QR code"
                      width={280}
                      height={280}
                      style={{ display: 'block' }}
                    />
                  </div>
                  {pairing && <p className="muted" style={{ marginTop: 10 }}>{pairing}</p>}
                </div>
              ) : (
                <div style={{ textAlign: 'center', margin: '20px 0' }}>
                  {session?.status === 'qr_ready' ? (
                    <>
                      <p className="muted">Waiting for QR code…</p>
                      <div className="loader" />
                    </>
                  ) : (
                    <p className="muted">
                      No session yet. Create and start one to get a QR code.
                    </p>
                  )}
                </div>
              )}

              <div className="form-actions" style={{ justifyContent: 'center', gap: 12 }}>
                <button className="btn primary" disabled={busy} onClick={ensureSession}>
                  {busy ? 'Starting…' : session ? 'Restart session' : 'Create & start session'}
                </button>
                {session && (
                  <button className="btn danger" disabled={busy} onClick={logoutSession}>
                    {busy ? 'Logging out…' : 'Logout / Reset session'}
                  </button>
                )}
              </div>
              {session && !ready && (
                <div
                  className="card"
                  style={{ marginTop: 20, background: 'var(--bg-2)', borderColor: 'var(--border)' }}
                >
                  <div className="form-row">
                    <label>Pairing code (alternative to QR)</label>
                    <input
                      placeholder="International number, e.g. 628123456789"
                      value={pairPhone}
                      onChange={(e) => setPairPhone(e.target.value)}
                    />
                  </div>
                  <div className="form-actions">
                    <button className="btn" disabled={busy} onClick={requestPairing}>
                      Request code
                    </button>
                    {pairing && <span className="muted mono" style={{ alignSelf: 'center' }}>{pairing}</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
