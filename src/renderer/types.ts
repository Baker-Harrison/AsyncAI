// ── Message types ──────────────────────────────────────────────────────────

export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
  time: string;
  [key: string]: unknown;
}

export interface AssistantMessage {
  id: string;
  role: 'assistant';
  text: string;
  time: string;
  _streaming?: boolean;
  [key: string]: unknown;
}

export interface ToolMessage {
  id: string;
  role: 'tool';
  tool: string;
  params: Record<string, unknown>;
  output: string | null;
  status: string;
  time?: string;
  [key: string]: unknown;
}

export interface SystemMessage {
  id: string;
  role: 'system';
  text: string;
  time: string;
  [key: string]: unknown;
}

export type Message = UserMessage | AssistantMessage | ToolMessage | SystemMessage;

// ── Agent types ────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  status: string;
  messages: Message[];
}

// ── Electron API types ─────────────────────────────────────────────────────

export interface ElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (cb: (v: boolean) => void) => void;
  platform: string;

  agent: {
    list: () => Promise<Agent[]>;
    create: (name: string) => Promise<Agent>;
    chat: (agentId: string, text: string, files?: FileData[]) => Promise<void>;
    abort: (agentId: string) => Promise<void>;
    clear: (agentId: string) => Promise<void>;
    delete: (agentId: string) => Promise<void>;
    rename: (agentId: string, name: string) => Promise<void>;
    onEvent: (cb: (event: AgentEvent) => void) => void;
    onStatus: (cb: (status: AgentStatus) => void) => void;
    onCleared: (cb: (data: { agentId: string }) => void) => void;
    onDeleted: (cb: (data: { agentId: string }) => void) => void;
    onRenamed: (cb: (data: { agentId: string; name: string }) => void) => void;
  };

  update: {
    install: () => void;
    onAvailable: (cb: (data: { version: string }) => void) => void;
    onProgress: (cb: (data: { percent: number }) => void) => void;
    onDownloaded: (cb: (data: { version: string }) => void) => void;
  };

  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
  };

  terminal: {
    create: (agentId: string) => Promise<void>;
    input: (agentId: string, data: string) => void;
    resize: (agentId: string, cols: number, rows: number) => void;
    destroy: (agentId: string) => void;
    onData: (cb: (data: { agentId: string; data: string }) => void) => () => void;
    onExit: (cb: (data: { agentId: string; exitCode?: number }) => void) => () => void;
  };
}

export interface FileData {
  name: string;
  size: number;
  type: string;
  data: string; // base64
}

export interface AgentEvent {
  agentId: string;
  type: string;
  text?: string;
  message?: string;
  id?: string;
  tool?: string;
  params?: Record<string, unknown>;
  output?: string;
  status?: string;
  [key: string]: unknown;
}

export interface AgentStatus {
  agentId: string;
  status: string;
  error?: string;
}

// Window augmentation
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
