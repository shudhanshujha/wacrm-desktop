import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useSession, useToast } from '../App';
import type { Chat, TimelineItem, TimelineResponse } from '../types';

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

      const rawContacts = contactsData.status === 'fulfilled' && Array.isArray(contactsData.value) ? contactsData.value : [];
      const rawChats = chatsData.status === 'fulfilled' && Array.isArray(chatsData.value) ? chatsData.value : [];

      const map = new Map<string, Chat>();

      // Populate from synced contacts first
      for (const c of rawContacts) {
        const id = String(c.id || c.chatId || c.jid || '');
        if (!id || id.endsWith('@g.us')) continue;
        map.set(id, {
          id,
          name: c.name || c.formattedName || c.pushName || id,
          pushName: c.pushName || c.name,
          phone: c.phone || id.split('@')[0],
          lastMessage: c.lastMessage || 'Contact in phonebook',
        });
      }

      // Merge active chats
      for (const c of rawChats) {
        const id = String(c.id || c.chatId || '');
        if (!id || id.endsWith('@g.us')) continue;
        const existing = map.get(id);
        map.set(id, {
          id,
          name: c.name || c.pushName || existing?.name || id,
          pushName: c.pushName || existing?.pushName,
          phone: c.phone || existing?.phone || id.split('@')[0],
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
