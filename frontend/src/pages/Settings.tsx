import { useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../App';
import type { CannedReply } from '../types';

export default function Settings() {
  const toast = useToast();
  const [tab, setTab] = useState<'canned' | 'templates' | 'ai'>('canned');
  const [canned, setCanned] = useState<CannedReply[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; body: string }[]>([]);
  const [aiKey, setAiKey] = useState('');

  const loadCanned = () =>
    api.get<CannedReply[]>('/api/canned-replies').then(setCanned).catch(() => setCanned([]));
  const loadTemplates = () =>
    api
      .get<{ id: string; name: string; body: string }[]>('/api/templates')
      .then(setTemplates)
      .catch(() => setTemplates([]));

  useEffect(() => {
    loadCanned();
    loadTemplates();
  }, []);

  // canned reply editor
  const [cTitle, setCTitle] = useState('');
  const [cShortcut, setCShortcut] = useState('');
  const [cBody, setCBody] = useState('');

  async function addCanned() {
    if (!cTitle.trim() || !cBody.trim()) return toast('Title and body required', true);
    try {
      await api.post('/api/canned-replies', { title: cTitle, shortcut: cShortcut || cTitle, body: cBody });
      setCTitle('');
      setCShortcut('');
      setCBody('');
      toast('Quick reply saved');
      loadCanned();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  async function delCanned(id: string) {
    await api.del(`/api/canned-replies/${id}`);
    loadCanned();
  }

  // template editor
  const [tName, setTName] = useState('');
  const [tBody, setTBody] = useState('');

  async function addTemplate() {
    if (!tName.trim() || !tBody.trim()) return toast('Name and body required', true);
    try {
      await api.post('/api/templates', { name: tName, body: tBody });
      setTName('');
      setTBody('');
      toast('Template saved');
      loadTemplates();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  async function delTemplate(id: string) {
    await api.del(`/api/templates/${id}`);
    loadTemplates();
  }

  function saveAiKey() {
    if (!aiKey.trim()) return toast('Enter an API key', true);
    api
      .post('/api/ai/key', { key: aiKey })
      .then(() => {
        toast('AI key saved');
        setAiKey('');
      })
      .catch((e) => toast((e as Error).message, true));
  }

  return (
    <div className="main">
      <div className="topbar">
        <h1>Settings</h1>
        <div className="spacer" />
      </div>
      <div className="content">
        <div className="tabbar">
          <button className={tab === 'canned' ? 'active' : ''} onClick={() => setTab('canned')}>
            Quick replies
          </button>
          <button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>
            Templates
          </button>
          <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
            AI assistant
          </button>
        </div>

        {tab === 'canned' && (
          <div className="grid cols-2">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>New quick reply</h3>
              <div className="form-row">
                <label>Title</label>
                <input value={cTitle} onChange={(e) => setCTitle(e.target.value)} placeholder="e.g. Welcome message" />
              </div>
              <div className="form-row">
                <label>Shortcut (used with /)</label>
                <input value={cShortcut} onChange={(e) => setCShortcut(e.target.value)} placeholder="welcome" />
              </div>
              <div className="form-row">
                <label>Body</label>
                <textarea
                  rows={4}
                  value={cBody}
                  onChange={(e) => setCBody(e.target.value)}
                  placeholder="Hi! Thanks for reaching out to us…"
                />
              </div>
              <div className="form-actions">
                <button className="btn primary" onClick={addCanned}>Add quick reply</button>
              </div>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Saved quick replies</h3>
              {canned.length === 0 ? (
                <div className="empty">
                  <div className="big">No quick replies yet</div>
                  Add reusable replies shown in the inbox as /shortcut buttons.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {canned.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>{c.title}</strong>
                        <button className="btn sm danger" onClick={() => delCanned(c.id)}>Delete</button>
                      </div>
                      <div className="muted mono" style={{ fontSize: 12 }}>/{c.shortcut}</div>
                      <div style={{ fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'templates' && (
          <div className="grid cols-2">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>New template</h3>
              <div className="form-row">
                <label>Name</label>
                <input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="e.g. Order confirmation" />
              </div>
              <div className="form-row">
                <label>Body</label>
                <textarea
                  rows={4}
                  value={tBody}
                  onChange={(e) => setTBody(e.target.value)}
                  placeholder="Your order #{{id}} has shipped!"
                />
              </div>
              <div className="form-actions">
                <button className="btn primary" onClick={addTemplate}>Add template</button>
              </div>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Saved templates</h3>
              {templates.length === 0 ? (
                <div className="empty">
                  <div className="big">No templates yet</div>
                  Templates support {'{{variable}}'} placeholders for broadcasts.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>{t.name}</strong>
                        <button className="btn sm danger" onClick={() => delTemplate(t.id)}>Delete</button>
                      </div>
                      <div style={{ fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>{t.body}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'ai' && (
          <div className="card" style={{ maxWidth: 520 }}>
            <h3 style={{ marginTop: 0 }}>AI reply assistant</h3>
            <p className="muted">
              The AI suggestion button in the Inbox uses Anthropic Claude. Add your API key below
              (get one at console.anthropic.com). Suggestions gracefully degrade with a clear error
              when no key is configured.
            </p>
            <div className="form-row">
              <label>Anthropic API key</label>
              <input
                type="password"
                placeholder="sk-ant-…"
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Model</label>
              <input placeholder="claude-sonnet-4-20250514 (default)" disabled />
            </div>
            <div className="form-actions">
              <button className="btn primary" onClick={saveAiKey}>Save key</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
              Note: the desktop server reads the key from the <span className="mono">ANTHROPIC_API_KEY</span>{' '}
              environment variable or the <span className="mono">data/ai-key</span> file next to the app.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
