import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useSession, useToast } from '../App';
import type { Chat, TimelineItem, TimelineResponse } from '../types';

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

export default function Contacts() {
  const { status } = useSession();
  const toast = useToast();
  const sessionId = status?.sessions?.[0]?.id || null;

  const [contacts, setContacts] = useState<Chat[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Chat | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
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

      // Populate from synced phonebook contacts first
      for (const c of rawContacts) {
        const id = extractId(c);
        if (!id || id.endsWith('@g.us')) continue;
        const phone = c.number || c.phone || id.split('@')[0];
        const name = c.name || c.formattedName || c.pushName || c.shortName || phone;
        map.set(id, {
          id,
          name,
          pushName: c.pushName || c.name || name,
          phone,
          lastMessage: c.lastMessage || 'Saved Contact',
        });
      }

      // Merge active chats
      for (const c of rawChats) {
        const id = extractId(c);
        if (!id || id.endsWith('@g.us')) continue;
        const existing = map.get(id);
        const phone = c.phone || c.number || existing?.phone || id.split('@')[0];
        const name = c.name || c.pushName || existing?.name || phone;
        map.set(id, {
          id,
          name,
          pushName: c.pushName || existing?.pushName || name,
          phone,
          lastMessage: c.lastMessage || existing?.lastMessage || '',
        });
      }

      setContacts(Array.from(map.values()));
    } catch {
      setContacts([]);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function openContact(c: Chat) {
    setSelected(c);
    if (!sessionId) return;
    setLoadingTimeline(true);
    try {
      const data = await api.get<TimelineResponse>(
        `/api/timeline/contacts/${encodeURIComponent(c.id || c.chatId || '')}?sessionId=${sessionId}`,
      );
      setTimeline(data.items || []);
    } catch (e) {
      toast(`Timeline: ${(e as Error).message}`, true);
      setTimeline([]);
    } finally {
      setLoadingTimeline(false);
    }
  }

  const filtered = contacts.filter((c) => {
    const name = String(c.name || c.pushName || '');
    const id = String(c.id || c.chatId || '');
    return name.toLowerCase().includes(query.toLowerCase()) || id.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="main">
      <div className="topbar">
        <h1>Contacts</h1>
        <div className="spacer" />
        <input
          placeholder="Search contacts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 240 }}
        />
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ width: 380, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
          {filtered.map((c) => (
            <div
              key={String(c.id || c.chatId)}
              onClick={() => openContact(c)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                background: selected?.id === c.id ? 'var(--panel-2)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{c.name || c.pushName || c.id}</strong>
                <span className="muted mono">{String(c.id || c.chatId)}</span>
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {c.lastMessage || 'No messages yet'}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="empty">No contacts found</div>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {!selected ? (
            <div className="empty">
              <div className="big">Select a contact</div>
              View the full conversation timeline with messages and broadcast receipts.
            </div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <h2 style={{ marginTop: 0, marginBottom: 4 }}>{selected.name || selected.pushName}</h2>
                <span className="muted mono">{String(selected.id || selected.chatId)}</span>
              </div>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Timeline</h3>
                {loadingTimeline ? (
                  <div className="empty"><div className="loader" /></div>
                ) : timeline.length === 0 ? (
                  <div className="empty">
                    <div className="big">No activity yet</div>
                    Messages and broadcast receipts will appear here.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {timeline.map((item, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          gap: 10,
                          alignItems: 'flex-start',
                          padding: '8px 12px',
                          background: item.direction === 'out' ? 'rgba(99,102,241,0.08)' : 'transparent',
                          borderRadius: 8,
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{item.direction === 'out' ? '📤' : '📥'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{item.body}</div>
                          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                            {item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}
                            {item.type === 'broadcast' ? ' · broadcast' : ''}
                            {item.status ? ` · ${item.status}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
