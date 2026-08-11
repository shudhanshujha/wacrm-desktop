import { useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../App';
import type { CannedReply } from '../types';

export default function Settings() {
  const toast = useToast();
  const [tab, setTab] = useState<'canned' | 'templates' | 'ai'>('canned');
  const [canned, setCanned] = useState<CannedReply[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; body: string }[]>([]);
  // AI Config state
  const [provider, setProvider] = useState<'groq' | 'anthropic'>('groq');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [groqModel, setGroqModel] = useState('llama-3.3-70b-versatile');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [anthropicModel, setAnthropicModel] = useState('claude-3-5-sonnet-20241022');
  const [savingAi, setSavingAi] = useState(false);

  const loadCanned = () =>
    api.get<CannedReply[]>('/api/canned-replies').then(setCanned).catch(() => setCanned([]));
  const loadTemplates = () =>
    api
      .get<{ id: string; name: string; body: string }[]>('/api/templates')
      .then(setTemplates)
      .catch(() => setTemplates([]));

  const loadAiConfig = () => {
    api
      .get<{
        provider: 'groq' | 'anthropic';
        groqApiKey: string;
        groqModel: string;
        anthropicApiKey: string;
        anthropicModel: string;
      }>('/api/ai/config')
      .then((cfg) => {
        if (cfg) {
          if (cfg.provider) setProvider(cfg.provider);
          if (cfg.groqApiKey) setGroqApiKey(cfg.groqApiKey);
          if (cfg.groqModel) setGroqModel(cfg.groqModel);
          if (cfg.anthropicApiKey) setAnthropicApiKey(cfg.anthropicApiKey);
          if (cfg.anthropicModel) setAnthropicModel(cfg.anthropicModel);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadCanned();
    loadTemplates();
    loadAiConfig();
  }, []);

  async function saveAiSettings() {
    setSavingAi(true);
    try {
      await api.post('/api/ai/config', {
        provider,
        groqApiKey,
        groqModel,
        anthropicApiKey,
        anthropicModel,
      });
      toast(`AI settings saved (${provider === 'groq' ? 'Groq AI' : 'Anthropic Claude'})`);
      loadAiConfig();
    } catch (e) {
      toast(`Failed to save AI config: ${(e as Error).message}`, true);
    } finally {
      setSavingAi(false);
    }
  }

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
          <div className="card" style={{ maxWidth: 540 }}>
            <h3 style={{ marginTop: 0 }}>AI Reply Assistant</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              Configure AI suggestions for your chat inbox. Choose your preferred AI provider below.
            </p>

            <div className="form-row">
              <label style={{ fontWeight: 600 }}>Active AI Provider</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className={`btn ${provider === 'groq' ? 'primary' : ''}`}
                  onClick={() => setProvider('groq')}
                  type="button"
                >
                  ⚡ Groq AI (Fast & Free)
                </button>
                <button
                  className={`btn ${provider === 'anthropic' ? 'primary' : ''}`}
                  onClick={() => setProvider('anthropic')}
                  type="button"
                >
                  🧠 Anthropic Claude
                </button>
              </div>
            </div>

            {provider === 'groq' && (
              <>
                <div className="form-row" style={{ marginTop: 16 }}>
                  <label>
                    Groq API Key{' '}
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 12, marginLeft: 6 }}
                    >
                      (Get free key at console.groq.com)
                    </a>
                  </label>
                  <input
                    type="password"
                    placeholder="gsk_…"
                    value={groqApiKey}
                    onChange={(e) => setGroqApiKey(e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label>Groq AI Model</label>
                  <select value={groqModel} onChange={(e) => setGroqModel(e.target.value)}>
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Recommended)</option>
                    <option value="llama3-70b-8192">llama3-70b-8192</option>
                    <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                    <option value="gemma2-9b-it">gemma2-9b-it</option>
                  </select>
                </div>
              </>
            )}

            {provider === 'anthropic' && (
              <>
                <div className="form-row" style={{ marginTop: 16 }}>
                  <label>
                    Anthropic API Key{' '}
                    <a
                      href="https://console.anthropic.com/"
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 12, marginLeft: 6 }}
                    >
                      (Get key at console.anthropic.com)
                    </a>
                  </label>
                  <input
                    type="password"
                    placeholder="sk-ant-…"
                    value={anthropicApiKey}
                    onChange={(e) => setAnthropicApiKey(e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label>Claude Model</label>
                  <select value={anthropicModel} onChange={(e) => setAnthropicModel(e.target.value)}>
                    <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet-20241022 (Recommended)</option>
                    <option value="claude-3-haiku-20240307">claude-3-haiku-20240307</option>
                  </select>
                </div>
              </>
            )}

            <div className="form-actions" style={{ marginTop: 20 }}>
              <button className="btn primary" disabled={savingAi} onClick={saveAiSettings}>
                {savingAi ? 'Saving…' : 'Save AI Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
