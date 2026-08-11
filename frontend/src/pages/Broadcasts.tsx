import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useSession, useToast } from '../App';
import type { Broadcast, Chat } from '../types';

function extractId(c: any): string {
  if (!c) return '';
  if (typeof c === 'string') return c;
  if (typeof c.id === 'string' && c.id) return c.id;
  if (typeof c.id === 'object' && c.id) {
    if (c.id._serialized) return c.id._serialized;
    if (c.id.user) return `${c.id.user}@${c.id.server || 'c.us'}`;
  }
  if (typeof c.chatId === 'string' && c.chatId) return c.chatId;
  if (typeof c.jid === 'string' && c.jid) return c.jid;
  if (typeof c.number === 'string' && c.number) return `${c.number.replace(/\D/g, '')}@c.us`;
  if (typeof c.phone === 'string' && c.phone) return `${c.phone.replace(/\D/g, '')}@c.us`;
  return '';
}

export default function Broadcasts() {
  const { status } = useSession();
  const toast = useToast();
  const sessionId = status?.sessions?.[0]?.id || null;

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const [sending, setSending] = useState(false);

  const [mediaUrl, setMediaUrl] = useState('');

  const load = useCallback(async () => {
    try {
      setBroadcasts(await api.get<Broadcast[]>('/api/broadcasts'));
    } catch {
      setBroadcasts([]);
    }
    if (sessionId) {
      try {
        const [contactsData, chatsData] = await Promise.allSettled([
          api.get<any[]>(`/api/core/sessions/${sessionId}/contacts?limit=1000`),
          api.get<Chat[]>(`/api/core/sessions/${sessionId}/chats?limit=500`),
        ]);

        const rawContacts =
          contactsData.status === 'fulfilled'
            ? Array.isArray(contactsData.value)
              ? contactsData.value
              : Array.isArray((contactsData.value as any)?.contacts)
              ? (contactsData.value as any).contacts
              : []
            : [];
        const rawChats =
          chatsData.status === 'fulfilled'
            ? Array.isArray(chatsData.value)
              ? chatsData.value
              : Array.isArray((chatsData.value as any)?.chats)
              ? (chatsData.value as any).chats
              : []
            : [];

        const map = new Map<string, Chat>();

        for (const c of rawContacts) {
          const id = extractId(c);
          if (!id || id.endsWith('@g.us')) continue;
          const phone = c.number || c.phone || id.split('@')[0];
          const cName = c.name || c.formattedName || c.pushName || c.shortName || phone;
          map.set(id, {
            id,
            name: cName,
            pushName: c.pushName || c.name || cName,
            phone,
          });
        }

        for (const c of rawChats) {
          const id = extractId(c);
          if (!id || id.endsWith('@g.us')) continue;
          const existing = map.get(id);
          const phone = c.phone || c.number || existing?.phone || id.split('@')[0];
          const cName = c.name || c.pushName || existing?.name || phone;
          map.set(id, {
            id,
            name: cName,
            pushName: c.pushName || existing?.pushName || cName,
            phone,
          });
        }

        setChats(Array.from(map.values()));
      } catch {
        setChats([]);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function send() {
    if (!sessionId) return;
    if (!message.trim() && !mediaUrl.trim()) return toast('Broadcast message or media URL required', true);
    let targets = chats.filter((c) => all || selected.includes(String(c.id || c.chatId)));
    if (!targets.length) return toast('No recipients selected', true);
    setSending(true);
    try {
      await api.post<Broadcast>('/api/broadcasts', {
        sessionId,
        name,
        message,
        mediaUrl: mediaUrl.trim() || undefined,
        targets: targets.map((c) => ({ chatId: c.id || c.chatId, name: c.name })),
      });
      toast(`Broadcast queued (${targets.length} recipients)`);
      setName('');
      setMessage('');
      setMediaUrl('');
      setSelected([]);
      setAll(false);
      await load();
    } catch (e) {
      toast(`Broadcast failed: ${(e as Error).message}`, true);
    } finally {
      setSending(false);
    }
  }

  async function poll(id: string) {
    try {
      await api.post(`/api/broadcasts/${id}/poll`);
      load();
    } catch (e) {
      toast(`Poll: ${(e as Error).message}`, true);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="main">
      <div className="topbar">
        <h1>Broadcasts</h1>
        <div className="spacer" />
      </div>
      <div className="content">
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>New broadcast</h2>
          <div className="grid cols-2">
            <div className="form-row">
              <label>Campaign name</label>
              <input placeholder="e.g. June promo" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="form-row">
              <label>
                Recipients ({all ? chats.length : selected.length} selected)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
                Select all contacts ({chats.length})
              </label>
            </div>
          </div>
          <div className="form-row">
            <label>Message</label>
            <textarea
              rows={3}
              placeholder="Type the broadcast message…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label>Media / Image URL (Optional)</label>
            <input
              placeholder="https://example.com/image.jpg"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button className="btn primary" disabled={sending} onClick={send}>
              {sending ? 'Sending…' : 'Send broadcast'}
            </button>
          </div>
        </div>

        <div className="grid cols-2">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Contacts</h3>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {chats.map((c) => (
                <label
                  key={String(c.id || c.chatId)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 4px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={all || selected.includes(String(c.id || c.chatId))}
                    disabled={all}
                    onChange={() => toggle(String(c.id || c.chatId))}
                  />
                  <span style={{ fontSize: 13 }}>{c.name || c.pushName || c.id}</span>
                </label>
              ))}
              {chats.length === 0 && <div className="empty">No contacts available</div>}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>History</h3>
            {broadcasts.length === 0 ? (
              <div className="empty">No broadcasts yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
                {broadcasts.map((b) => {
                  const counts = countResults(b);
                  return (
                    <div
                      key={b.id}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>{b.name}</strong>
                        <span className={`badge ${b.status === 'completed' ? 'green' : b.status === 'running' ? 'amber' : b.status === 'failed' ? 'red' : 'gray'}`}>
                          {b.status}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>
                        {b.message}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 12.5 }}>
                        <span className="muted">
                          {new Date(b.createdAt).toLocaleString()} · {b.targets?.length || 0} recipients
                        </span>
                        <span className="muted">
                          {counts.sent} sent · {counts.failed} failed
                        </span>
                        {b.status === 'running' && (
                          <button className="btn sm" onClick={() => poll(b.id)}>Refresh</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function countResults(b: Broadcast) {
  const results = b.results || {};
  const values = Object.values(results);
  let sent = 0;
  let failed = 0;
  for (const v of values) {
    if (v?.status === 'sent' || v?.status === 'delivered' || v?.status === 'read') sent += 1;
    else if (v?.status === 'failed' || v?.error) failed += 1;
  }
  return { sent, failed };
}
