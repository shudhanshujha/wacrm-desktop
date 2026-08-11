import { useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../App';
import type { Automation } from '../types';

type Step = Automation['steps'][number];

const EMPTY: Omit<Automation, 'id' | 'runCount'> = {
  name: '',
  enabled: true,
  trigger: { type: 'keyword', value: '' },
  steps: [],
};

export default function Automations() {
  const toast = useToast();
  const [list, setList] = useState<Automation[]>([]);
  const [draft, setDraft] = useState<Omit<Automation, 'id' | 'runCount'>>(EMPTY);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    api.get<Automation[]>('/api/automations').then(setList).catch(() => setList([]));
  };
  useEffect(load, []);

  function setStep(idx: number, patch: Partial<Step>) {
    const steps = draft.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    setDraft({ ...draft, steps });
  }

  function addStep(type: Step['type']) {
    const step: Step =
      type === 'send'
        ? { type: 'send', message: '' }
        : type === 'wait'
          ? { type: 'wait', minutes: 1 }
          : { type: 'handover', assignTo: '' };
    setDraft({ ...draft, steps: [...draft.steps, step] });
  }

  function removeStep(idx: number) {
    setDraft({ ...draft, steps: draft.steps.filter((_, i) => i !== idx) });
  }

  async function save() {
    setError('');
    if (!draft.name.trim()) return setError('Flow name required');
    if (!draft.trigger.value.trim()) return setError('Trigger keyword/value required');
    if (!draft.steps.length) return setError('Add at least one step');
    try {
      if (editing) {
        await api.put(`/api/automations/${editing.id}`, draft);
        toast('Flow updated');
      } else {
        await api.post('/api/automations', draft);
        toast('Flow created');
      }
      setDraft(EMPTY);
      setEditing(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggle(item: Automation) {
    await api.put(`/api/automations/${item.id}`, { enabled: !item.enabled });
    load();
  }

  async function remove(item: Automation) {
    await api.del(`/api/automations/${item.id}`);
    toast('Flow deleted');
    load();
  }

  function edit(item: Automation) {
    setEditing(item);
    setDraft({
      name: item.name,
      enabled: item.enabled,
      trigger: item.trigger,
      steps: item.steps,
    });
    setError('');
  }

  return (
    <div className="main">
      <div className="topbar">
        <h1>Automations</h1>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          Keyword-triggered flows run automatically on incoming messages (unless a chat is handed over).
        </span>
      </div>
      <div className="content">
        <div className="grid" style={{ gridTemplateColumns: '1.1fr 1fr', gap: 20 }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Flows</h2>
            {list.length === 0 ? (
              <div className="card empty">
                <div className="big">No automation flows yet</div>
                Create your first keyword-triggered flow.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {list.map((a) => (
                  <div key={a.id} className="card" style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>{a.name}</strong>
                        <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>
                          {a.trigger.type} «{a.trigger.value}» · {a.steps.length} steps · ran {a.runCount}×
                        </span>
                      </div>
                      <span className={`badge ${a.enabled ? 'green' : 'gray'}`}>
                        {a.enabled ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button className="btn sm" onClick={() => toggle(a)}>
                        {a.enabled ? 'Pause' : 'Activate'}
                      </button>
                      <button className="btn sm" onClick={() => edit(a)}>Edit</button>
                      <button className="btn sm danger" onClick={() => remove(a)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>{editing ? `Edit: ${editing.name}` : 'New flow'}</h2>
            {error && <div className="error-banner">{error}</div>}
            <div className="form-row">
              <label>Name</label>
              <input
                placeholder="e.g. Order status lookup"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="grid cols-2" style={{ gap: 10 }}>
              <div className="form-row">
                <label>Trigger type</label>
                <select
                  value={draft.trigger.type}
                  onChange={(e) => setDraft({ ...draft, trigger: { ...draft.trigger, type: e.target.value } })}
                >
                  <option value="keyword">Contains keyword</option>
                  <option value="exact">Exact match</option>
                  <option value="regex">Regex</option>
                </select>
              </div>
              <div className="form-row">
                <label>Trigger value</label>
                <input
                  placeholder="e.g. order"
                  value={draft.trigger.value}
                  onChange={(e) => setDraft({ ...draft, trigger: { ...draft.trigger, value: e.target.value } })}
                />
              </div>
            </div>

            <div style={{ margin: '8px 0' }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>Steps</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {draft.steps.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      padding: '8px 10px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-2)',
                    }}
                  >
                    <span className="badge gray">#{i + 1}</span>
                    {s.type === 'send' && (
                      <>
                        <span className="muted" style={{ fontSize: 12 }}>Send:</span>
                        <input
                          placeholder="Message text (use {{inboundBody}}, {{chatId}})"
                          value={s.message}
                          onChange={(e) => setStep(i, { message: e.target.value })}
                          style={{ flex: 1 }}
                        />
                      </>
                    )}
                    {s.type === 'wait' && (
                      <>
                        <span className="muted" style={{ fontSize: 12 }}>Wait:</span>
                        <input
                          type="number"
                          min={1}
                          value={s.minutes}
                          onChange={(e) => setStep(i, { minutes: Number(e.target.value) })}
                          style={{ width: 80 }}
                        />
                        <span className="muted" style={{ fontSize: 12 }}>minutes</span>
                      </>
                    )}
                    {s.type === 'handover' && (
                      <>
                        <span className="muted" style={{ fontSize: 12 }}>Hand over to:</span>
                        <input
                          placeholder="Agent name"
                          value={s.assignTo || ''}
                          onChange={(e) => setStep(i, { assignTo: e.target.value })}
                          style={{ flex: 1 }}
                        />
                      </>
                    )}
                    <button className="btn sm danger" onClick={() => removeStep(i)}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn sm" onClick={() => addStep('send')}>+ Send message</button>
                <button className="btn sm" onClick={() => addStep('wait')}>+ Wait</button>
                <button className="btn sm" onClick={() => addStep('handover')}>+ Handover</button>
              </div>
            </div>

            <div className="form-actions">
              {editing && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    setEditing(null);
                    setDraft(EMPTY);
                    setError('');
                  }}
                >
                  Cancel
                </button>
              )}
              <button className="btn primary" onClick={save}>
                {editing ? 'Save changes' : 'Create flow'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
