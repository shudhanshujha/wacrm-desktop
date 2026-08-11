import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';
import type { AgentPerformanceRow, ConversationMap } from '../types';

export default function Analytics() {
  const { status } = useSession();
  const sessionId = status?.sessions?.[0]?.id || null;
  const [agentRows, setAgentRows] = useState<AgentPerformanceRow[]>([]);
  const [convs, setConvs] = useState<ConversationMap>({});
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.get<AgentPerformanceRow[]>('/api/agent-performance').then(setAgentRows).catch(() => setAgentRows([]));
    api.get<ConversationMap>('/api/conversations').then(setConvs).catch(() => setConvs({}));
    if (sessionId) {
      api
        .get<Record<string, unknown>>(`/api/core/sessions/${sessionId}/stats/overview`)
        .then(setOverview)
        .catch(() => setOverview(null));
    }
  }, [sessionId]);

  const convValues = Object.values(convs);
  const openCount = convValues.filter((c) => c.status !== 'resolved').length;
  const resolvedCount = convValues.filter((c) => c.status === 'resolved').length;
  const handoverCount = convValues.filter((c) => c.botPaused).length;
  const totalMsgs = overview && typeof overview.totalMessages === 'number' ? overview.totalMessages : 0;

  return (
    <div className="main">
      <div className="topbar">
        <h1>Analytics</h1>
        <div className="spacer" />
      </div>
      <div className="content">
        <div className="grid cols-4" style={{ marginBottom: 20 }}>
          <div className="stat">
            <div className="label">Open conversations</div>
            <div className="value">{openCount}</div>
          </div>
          <div className="stat">
            <div className="label">Resolved</div>
            <div className="value">{resolvedCount}</div>
          </div>
          <div className="stat">
            <div className="label">Human handovers</div>
            <div className="value">{handoverCount}</div>
          </div>
          <div className="stat">
            <div className="label">Total messages</div>
            <div className="value">{totalMsgs}</div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Agent performance</h2>
          {agentRows.length === 0 ? (
            <div className="empty">
              <div className="big">No agent data yet</div>
              Assign conversations and resolve them to start tracking performance.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Handled</th>
                  <th>Resolved</th>
                  <th>Manual replies</th>
                  <th>Auto replies</th>
                  <th>Response rate</th>
                  <th>Avg resolution</th>
                </tr>
              </thead>
              <tbody>
                {agentRows.map((a) => (
                  <tr key={a.agentId}>
                    <td><strong>{a.agentId}</strong></td>
                    <td>{a.handled}</td>
                    <td>{a.resolved}</td>
                    <td>{a.manualReplies}</td>
                    <td>{a.autoReplies}</td>
                    <td>{a.responseRate}%</td>
                    <td>{a.avgResolutionHours == null ? '—' : `${a.avgResolutionHours}h`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
