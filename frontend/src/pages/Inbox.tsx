import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useSession, useToast } from '../App';
import type { Chat, Conversation, ConversationMap, CannedReply, WAMessage } from '../types';

interface SendResponse {
  messageId?: string;
  [key: string]: unknown;
}

export default function Inbox() {
  const { status } = useSession();
  const toast = useToast();
  const sessionId = status?.sessions?.[0]?.id || null;

  const [chats, setChats] = useState<Chat[]>([]);
  const [convs, setConvs] = useState<ConversationMap>({});
  const [active, setActive] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<WAMessage[]>([]);
  const [canned, setCanned] = useState<CannedReply[]>([]);
  const [text, setText] = useState('');
  const [suggest, setSuggest] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [note, setNote] = useState('');
  const [assignTarget, setAssignTarget] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadChats = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await api.get<Chat[]>(`/api/core/sessions/${sessionId}/chats?limit=200`);
      setChats(Array.isArray(data) ? data : []);
    } catch {
      setChats([]);
    }
  }, [sessionId]);

  const loadConvs = useCallback(async () => {
    try {
      const data = await api.get<ConversationMap>('/api/conversations');
      setConvs(data || {});
    } catch {
      setConvs({});
    }
  }, []);

  useEffect(() => {
    loadChats();
    loadConvs();
    const t = setInterval(() => {
      loadChats();
      loadConvs();
    }, 8000);
    return () => clearInterval(t);
  }, [loadChats, loadConvs]);

  const openChat = useCallback(
    async (chat: Chat) => {
      const id = (chat.id || chat.chatId) as string;
      setActive(chat);
      setLoading(true);
      setSuggest('');
      setPaused(!!convs[id]?.botPaused);
      setAssignTarget(convs[id]?.assignedTo || '');
      if (sessionId) {
        try {
          const data = await api.get<any>(
            `/api/core/sessions/${sessionId}/messages?chatId=${encodeURIComponent(id)}&limit=50`,
          );
          const list = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : [];
          setMessages(list);
        } catch {
          setMessages([]);
        }
        try {
          await api.post(`/api/conversations/${encodeURIComponent(id)}/mark-read`);
          loadConvs();
        } catch {
          /* ignore */
        }
      }
      setLoading(false);
    },
    [convs, loadConvs, sessionId],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sortedChats = useMemo(() => {
    const list = chats
      .filter((c) => !String(c.id || c.chatId || '').endsWith('@g.us') || true)
      .sort((a, b) => {
        const ta = Number(a.timestamp || a.lastMessageTime || 0);
        const tb = Number(b.timestamp || b.lastMessageTime || 0);
        return tb - ta;
      });
    return list;
  }, [chats]);

  async function sendMessage(bodyOverride?: string) {
    const id = active?.id || active?.chatId;
    if (!id || !sessionId) return;
    const payload = bodyOverride ?? text;
    if (!payload.trim()) return;
    try {
      await api.post<SendResponse>(`/api/core/sessions/${sessionId}/messages/send-text`, {
        chatId: id,
        text: payload,
      });
      setText('');
      setSuggest('');
      const data = await api.get<any>(
        `/api/core/sessions/${sessionId}/messages?chatId=${encodeURIComponent(id)}&limit=50`,
      );
      const list = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : [];
      setMessages(list);
      await api.post(`/api/conversations/${encodeURIComponent(id)}/mark-read`);
      loadChats();
    } catch (e) {
      toast(`Send failed: ${(e as Error).message}`, true);
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const id = active?.id || active?.chatId;
    if (!id || !sessionId) return;

    setUploadingMedia(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        let endpoint = 'send-document';
        if (file.type.startsWith('image/')) endpoint = 'send-image';
        else if (file.type.startsWith('video/')) endpoint = 'send-video';
        else if (file.type.startsWith('audio/')) endpoint = 'send-audio';

        await api.post(`/api/core/sessions/${sessionId}/messages/${endpoint}`, {
          chatId: id,
          base64: base64Data,
          filename: file.name,
          caption: text || undefined,
        });

        setText('');
        toast('Media sent successfully');
        const data = await api.get<any>(
          `/api/core/sessions/${sessionId}/messages?chatId=${encodeURIComponent(id)}&limit=50`,
        );
        const list = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : [];
        setMessages(list);
        loadChats();
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast(`Media upload failed: ${(err as Error).message}`, true);
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function suggestReply() {
    const id = active?.id || active?.chatId;
    if (!sessionId || !id) return;
    setSuggesting(true);
    setSuggest('');
    try {
      const history = messages
        .filter((m) => m.body)
        .map((m) => ({ fromMe: !!m.fromMe, body: String(m.body) }));
      const res = await api.post<{ text: string }>('/api/ai/suggest', {
        contactName: active?.name || id,
        history,
        tone: 'professional',
      });
      setSuggest(res.text);
    } catch (e) {
      toast(`AI suggest failed: ${(e as Error).message}`, true);
    } finally {
      setSuggesting(false);
    }
  }

  async function handover() {
    const id = active?.id || active?.chatId;
    if (!id) return;
    try {
      await api.post(`/api/conversations/${encodeURIComponent(id)}/handover`, {
        assignedTo: assignTarget || null,
        message: null,
        note: note || null,
      });
      setPaused(true);
      setHandoverOpen(false);
      setNote('');
      setAssignTarget('');
      toast('Handed over to human. Bot paused for this chat.');
      if (assignTarget && text) await sendMessage();
      loadConvs();
    } catch (e) {
      toast(`Handover failed: ${(e as Error).message}`, true);
    }
  }

  async function resume() {
    const id = active?.id || active?.chatId;
    if (!id) return;
    try {
      await api.post(`/api/conversations/${encodeURIComponent(id)}/resume`);
      setPaused(false);
      toast('Bot resumed for this chat.');
      loadConvs();
    } catch (e) {
      toast(`Resume failed: ${(e as Error).message}`, true);
    }
  }

  async function resolve() {
    const id = active?.id || active?.chatId;
    if (!id) return;
    try {
      await api.post(`/api/conversations/${encodeURIComponent(id)}/resolve`);
      toast('Conversation marked resolved.');
      loadConvs();
    } catch (e) {
      toast(`Resolve failed: ${(e as Error).message}`, true);
    }
  }

  async function loadCanned() {
    try {
      setCanned(await api.get<CannedReply[]>('/api/canned-replies'));
    } catch {
      setCanned([]);
    }
  }
  useEffect(() => {
    loadCanned();
  }, []);

  const conv = active ? (convs[active.id || active.chatId || ''] as Conversation | undefined) : undefined;
  const isHandover = conv?.botPaused || paused;

  return (
    <div className="main">
      <div className="topbar">
        <h1>Inbox</h1>
        <div className="spacer" />
        <button className="btn sm" onClick={() => { loadChats(); loadConvs(); }}>
          Refresh
        </button>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div
          style={{
            width: 340,
            borderRight: '1px solid var(--border)',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          {sortedChats.map((c) => {
            const id = String(c.id || c.chatId || '');
            const c2 = convs[id];
            const unread = c2?.unread || c.unreadCount || 0;
            const activeConv = active?.id === c.id || active?.chatId === c.id;
            return (
              <div
                key={id}
                onClick={() => openChat(c)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: activeConv ? 'var(--panel-2)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 14 }}>{c.name || c.pushName || id}</strong>
                  {unread > 0 ? (
                    <span className="badge red">{unread}</span>
                  ) : null}
                </div>
                <div style={{ color: 'var(--text-3)', fontSize: 12.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c2?.lastMessage || c.lastMessage || ''}
                </div>
                {c2?.botPaused ? (
                  <span className="badge amber" style={{ marginTop: 6 }}>
                    🧑‍💻 Handover
                  </span>
                ) : null}
              </div>
            );
          })}
          {sortedChats.length === 0 && (
            <div className="empty">
              <div className="big">No conversations yet</div>
              Connect WhatsApp and wait for incoming messages.
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!active ? (
            <div className="empty" style={{ flex: 1 }}>
              <div className="big">Select a conversation</div>
              Choose a chat on the left to view and reply.
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: '12px 18px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <strong>{active.name || active.id}</strong>
                {isHandover && <span className="badge amber">🧑‍💻 Human handover</span>}
                {conv?.assignedTo && <span className="badge cyan">👤 {conv.assignedTo}</span>}
                {conv?.status === 'resolved' && <span className="badge green">✓ Resolved</span>}
                <div className="spacer" />
                {isHandover ? (
                  <button className="btn sm" onClick={resume}>Resume bot</button>
                ) : (
                  <button className="btn sm" onClick={() => setHandoverOpen(!handoverOpen)}>
                    Hand over to human
                  </button>
                )}
                <button className="btn sm" onClick={resolve}>Resolve</button>
              </div>

              {handoverOpen && !isHandover && (
                <div
                  style={{
                    padding: '12px 18px',
                    background: 'rgba(245,158,11,0.06)',
                    borderBottom: '1px solid rgba(245,158,11,0.25)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      placeholder="Assign to agent (name)"
                      value={assignTarget}
                      onChange={(e) => setAssignTarget(e.target.value)}
                      style={{ flex: 1, minWidth: 160 }}
                    />
                    <input
                      placeholder="Note for the agent (optional)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      style={{ flex: 1.5, minWidth: 200 }}
                    />
                    <button className="btn primary sm" onClick={handover}>Confirm handover</button>
                    <button className="btn sm" onClick={() => setHandoverOpen(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {isHandover && (
                <div
                  style={{
                    padding: '10px 18px',
                    background: 'rgba(245,158,11,0.08)',
                    borderBottom: '1px solid rgba(245,158,11,0.25)',
                    fontSize: 13,
                  }}
                >
                  🤖 Automations are paused. A human is handling this conversation
                  {conv?.handoverNote ? ` — note: ${conv.handoverNote}` : ''}.
                </div>
              )}

              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {loading ? (
                  <div className="empty"><div className="loader" /></div>
                ) : (
                  messages.map((m, i) => {
                    const bodyText =
                      m.body ||
                      m.caption ||
                      m.text ||
                      m.content ||
                      (m.message && typeof m.message === 'object' ? (m.message as any).conversation || (m.message as any).extendedTextMessage?.text : '') ||
                      '';
                    const mediaUrl = (m.mediaUrl || m.url) as string | undefined;
                    const mediaType = (m.mediaType || m.type) as string | undefined;

                    return (
                      <div
                        key={i}
                        style={{
                          alignSelf: m.fromMe ? 'flex-end' : 'flex-start',
                          background: m.fromMe ? 'var(--accent)' : 'var(--panel)',
                          border: m.fromMe ? 'none' : '1px solid var(--border)',
                          borderRadius: 12,
                          padding: '8px 12px',
                          maxWidth: '72%',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {mediaUrl && (mediaType?.includes('image') || mediaUrl.match(/\.(png|jpe?g|gif|webp)$/i)) ? (
                          <img src={mediaUrl} alt="attachment" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 4 }} />
                        ) : mediaUrl ? (
                          <div style={{ fontSize: 12, marginBottom: 4 }}>
                            📎 <a href={mediaUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Attachment ({mediaType || 'file'})</a>
                          </div>
                        ) : null}
                        <div style={{ fontSize: 13.5 }}>
                          {bodyText ? String(bodyText) : mediaUrl ? '' : '[Message]'}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            marginTop: 4,
                            opacity: 0.7,
                            color: m.fromMe ? '#fff' : 'var(--text-3)',
                          }}
                        >
                          {formatTime(m.timestamp || (m as any).createdAt)}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {suggest && (
                <div
                  style={{
                    margin: '0 18px 8px',
                    padding: '10px 12px',
                    background: 'rgba(99,102,241,0.1)',
                    border: '1px solid rgba(99,102,241,0.35)',
                    borderRadius: 10,
                    fontSize: 13.5,
                  }}
                >
                  <strong style={{ fontSize: 12 }}>🤖 AI suggestion</strong>
                  <div style={{ margin: '4px 0 8px' }}>{suggest}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn sm primary" onClick={() => sendMessage(suggest)}>
                      Send suggestion
                    </button>
                    <button className="btn sm" onClick={() => setSuggest('')}>Dismiss</button>
                  </div>
                </div>
              )}

              <div
                style={{
                  padding: '10px 18px 14px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {!isHandover && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn sm" disabled={suggesting} onClick={suggestReply}>
                      {suggesting ? <span className="loader" style={{ width: 12, height: 12 }} /> : '✨ AI reply'}
                    </button>
                    <span className="muted" style={{ fontSize: 12 }}>AI suggestions need an Anthropic API key in Settings.</span>
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {canned.slice(0, 5).map((c) => (
                    <button
                      key={c.id}
                      className="btn sm ghost"
                      title={c.body}
                      onClick={() => setText(c.body)}
                    >
                      /{c.shortcut}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  <button
                    className="btn sm"
                    disabled={uploadingMedia}
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach image or file"
                  >
                    📎 {uploadingMedia ? 'Uploading…' : 'Attach'}
                  </button>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={isHandover ? 'Reply as human agent…' : 'Type a message…'}
                    rows={2}
                    style={{ flex: 1, resize: 'none' }}
                  />
                  <button className="btn primary" onClick={() => sendMessage()}>
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(ts: number | string | undefined): string {
  if (!ts) return '';
  const n = Number(ts);
  if (Number.isNaN(n) || String(ts).length <= 13) {
    const d = new Date(Number(ts) * 1000);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return new Date(Number(ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
