import React, { useState } from 'react';
import './ToolCall.css';

const ICONS: Record<string, string> = {
  bash: '⬡',
  read: '◈',
  write: '◉',
  edit: '◎',
};

const LABELS: Record<string, string> = {
  bash: 'Bash',
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
};

interface ToolParams {
  command?: string;
  path?: string;
  old_str?: string;
  new_str?: string;
  content?: string;
  [key: string]: unknown;
}

interface ToolCallProps {
  tool: string;
  params?: ToolParams;
  output: string | null;
  status: string;
}

function shortSummary(tool: string, params: ToolParams): string {
  switch (tool) {
    case 'bash': {
      const cmd = params.command || '';
      return cmd.length > 60 ? cmd.slice(0, 60) + '…' : cmd;
    }
    case 'read':
    case 'write':
    case 'edit':
      return params.path || '';
    default:
      return '';
  }
}

function formatParams(tool: string, params: ToolParams): string {
  if (tool === 'bash') return params.command ?? '';
  if (tool === 'read') return params.path ?? '';
  if (tool === 'edit') return `${params.path}\n\n--- old\n${params.old_str}\n\n+++ new\n${params.new_str}`;
  if (tool === 'write') return `${params.path}\n\n${params.content}`;
  return JSON.stringify(params, null, 2);
}

function ToolCall({ tool, params = {}, output, status }: ToolCallProps) {
  const [open, setOpen] = useState(false);
  const running = status === 'running';
  const error = status === 'error';

  return (
    <div className={`tool-call tool-call--${tool} ${error ? 'tool-call--error' : ''}`}>
      <button className="tool-call-header" onClick={() => setOpen((o) => !o)}>
        <span className={`tool-call-icon ${running ? 'tool-call-icon--spin' : ''}`}>
          {running ? '◌' : ICONS[tool] ?? '◆'}
        </span>
        <span className="tool-call-label">{LABELS[tool] ?? tool}</span>
        <span className="tool-call-summary">{shortSummary(tool, params)}</span>
        {!running && (
          <span className={`tool-call-status ${error ? 'tool-call-status--error' : 'tool-call-status--ok'}`}>
            {error ? '✕' : '✓'}
          </span>
        )}
        {running && <span className="tool-call-running-badge">running</span>}
        <span className="tool-call-chevron">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="tool-call-body">
          <div className="tool-call-section">
            <div className="tool-call-section-label">Input</div>
            <pre className="tool-call-pre">{formatParams(tool, params)}</pre>
          </div>
          {output != null && (
            <div className="tool-call-section">
              <div className="tool-call-section-label">Output</div>
              <pre className={`tool-call-pre ${error ? 'tool-call-pre--error' : ''}`}>
                {output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolCall;
