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

  const pollingSessionId = useRef<string | null>(null);

  useEffect(() => {
    const sessions = status?.sessions || [];
    if (sessions.length > 0) {
      const first = sessions[0];
      setSession(first);
      if (first.status !== 'ready' && pollingSessionId.current !== first.id) {
        startQrPoll(first.id);
      } else if (first.status === 'ready') {
        stopPolling();
        setQr(null);
      }
    } else {
      setSession(null);
      setQr(null);
      stopPolling();
    }
  }, [status]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollingSessionId.current = null;
  };

  useEffect(() => {
    return stopPolling;
  }, []);

  async function ensureSession() {
    setBusy(true);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        let current = session;
        if (!current) {
          // Try getting existing sessions first or creating a new one
          const st = await api.get<Session[]>('/api/core/sessions');
          if (Array.isArray(st) && st.length > 0) {
            current = st[0];
          } else {
            current = await api.post<Session>('/api/core/sessions', { name: 'wacrm' });
          }
          setSession(current);
        }
        if (!current || !current.id) {
          throw new Error('Engine returning invalid session object');
        }
        await api.post(`/api/core/sessions/${current.id}/start`).catch(() => {
          // May already be starting
        });
        await refresh();
        startQrPoll(current.id);
        setBusy(false);
        return;
      } catch (e) {
        lastError = e as Error;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    }

    setBusy(false);
    if (lastError) {
      toast(`Could not start session: ${lastError.message}`, true);
    }
  }

  function startQrPoll(id: string) {
    stopPolling();
    pollingSessionId.current = id;

    const fetchQr = async () => {
      try {
        const data = await api.get<QRResponse>(`/api/core/sessions/${id}/qr`);
        if (data.qrCode) {
          const raw = data.qrCode.trim();
          if (raw.startsWith('data:') || raw.startsWith('http')) {
            setQr(raw);
          } else if (raw.length > 50) {
            setQr(`data:image/png;base64,${raw}`);
          }
        }
        if (data.status === 'authenticating') setPairing('Authenticating with WhatsApp…');

        const st = await api.get<Session[]>(`/api/core/sessions`);
        if (Array.isArray(st)) {
          const found = st.find((s) => s.id === id);
          if (found) {
            setSession(found);
            if (found.status === 'ready') {
              setQr(null);
              stopPolling();
              toast('WhatsApp connected!');
              refresh();
            }
          }
        }
      } catch {
        // QR not ready yet; keep polling
      }
    };

    fetchQr();
    pollRef.current = setInterval(fetchQr, 2000);
  }

  async function requestPairing() {
    if (!session) return;
    const cleanPhone = pairPhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 8) {
      toast('Enter your WhatsApp number in international format, e.g. 628123456789', true);
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ pairingCode?: string; code?: string }>(
        `/api/core/sessions/${session.id}/pairing-code`,
        { phoneNumber: cleanPhone },
      );
      const codeStr = res.pairingCode || res.code || '';
      setPairing(codeStr ? `Pairing Code: ${codeStr}` : 'Pairing code requested');
    } catch (e) {
      toast(`Pairing code error: ${(e as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function logoutSession() {
    if (!session) return;
    setBusy(true);
    try {
      stopPolling();
      await api.post(`/api/core/sessions/${session.id}/logout`).catch(async () => {
        await api.del(`/api/core/sessions/${session.id}`).catch(() => {});
      });
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
