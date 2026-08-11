export interface Session {
  id: string;
  name: string;
  status: string;
  state?: string;
}

export interface StatusResponse {
  coreAlive: boolean;
  sessions: Session[];
}

export interface Chat {
  id?: string;
  chatId?: string;
  name?: string;
  pushName?: string;
  phone?: string;
  unreadCount?: number;
  lastMessage?: string;
  lastMessageTime?: number | string;
  [key: string]: unknown;
}

export interface WAMessage {
  id?: string;
  body?: string;
  fromMe?: boolean;
  timestamp?: number | string;
  [key: string]: unknown;
}

export interface Conversation {
  chatId: string;
  status: string;
  botPaused: boolean;
  assignedTo?: string | null;
  unread?: number;
  lastMessage?: string;
  lastMessageAt?: string;
  handoverAt?: string | null;
  notes?: string[];
  [key: string]: unknown;
}

export interface ConversationMap {
  [chatId: string]: Conversation;
}

export interface CannedReply {
  id: string;
  title: string;
  shortcut: string;
  body: string;
}

export interface Broadcast {
  id: string;
  sessionId: string;
  name: string;
  message: string;
  targets: { chatId?: string; name?: string }[];
  status: string;
  batchId?: string | null;
  results?: Record<string, { status?: string; error?: string }>;
  createdAt: string;
}

export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { type: string; value: string };
  steps: { type: string; message?: string; minutes?: number; assignTo?: string }[];
  runCount: number;
}

export interface AgentPerformanceRow {
  agentId: string;
  handled: number;
  resolved: number;
  manualReplies: number;
  autoReplies: number;
  responseRate: number;
  avgResolutionHours: number | null;
}

export interface TimelineItem {
  type: 'message' | 'broadcast';
  direction: 'in' | 'out';
  body: string;
  timestamp: string | null;
  status?: string;
}

export interface TimelineResponse {
  chatId: string;
  items: TimelineItem[];
}
