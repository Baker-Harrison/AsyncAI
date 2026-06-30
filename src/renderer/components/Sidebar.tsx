import React, { useState, useRef, useEffect } from 'react';
import type { Agent } from '../types';
import './Sidebar.css';

interface SidebarProps {
  agents: Agent[];
  activeAgentId: string | null;
  onAgentSelect: (id: string) => void;
  onNewAgent: () => void;
  onOpenSettings: () => void;
  onDeleteAgent: (id: string) => void;
  onRenameAgent: (id: string, name: string) => void;
  collapsed: boolean;
}

function Sidebar({ agents, activeAgentId, onAgentSelect, onNewAgent, onOpenSettings, onDeleteAgent, onRenameAgent, collapsed }: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleDoubleClick = (agent: Agent) => {
    setEditingId(agent.id);
    setEditName(agent.name);
  };

  const handleRenameSubmit = () => {
    if (editingId && editName.trim()) {
      onRenameAgent(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit();
    if (e.key === 'Escape') setEditingId(null);
  };

  if (collapsed) {
    return (
      <div className="sidebar sidebar--collapsed">
        <div className="sidebar-scroll sidebar-scroll--collapsed">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`sidebar-icon ${activeAgentId === agent.id ? 'active' : ''}`}
              onClick={() => onAgentSelect(agent.id)}
              title={agent.name}
            >
              {agent.name[0].toUpperCase()}
              {agent.status === 'starting' && <span className="status-dot status-dot--starting" />}
            </div>
          ))}
          <div className="sidebar-icon sidebar-icon--add" onClick={onNewAgent} title="New Agent">
            +
          </div>
        </div>
        <div className="sidebar-footer sidebar-footer--collapsed">
          <div className="sidebar-icon" onClick={onOpenSettings} title="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-scroll">
        <div className="sidebar-section">
          <div className="section-header">
            <span>Agents</span>
            <button className="new-task-btn" onClick={onNewAgent} title="New Agent">+</button>
          </div>
          <ul className="task-list">
            {agents.map((agent) => (
              <li
                key={agent.id}
                className={`task-item ${activeAgentId === agent.id ? 'active' : ''}`}
                onClick={() => onAgentSelect(agent.id)}
                onDoubleClick={() => handleDoubleClick(agent)}
              >
                <div className="task-item-body">
                  {editingId === agent.id ? (
                    <input
                      ref={inputRef}
                      className="task-item-rename-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleRenameSubmit}
                      onKeyDown={handleRenameKeyDown}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="task-label">{agent.name}</span>
                  )}
                </div>
                {agent.status === 'starting' && (
                  <span className="status-dot status-dot--starting" />
                )}
                <button
                  className="task-item-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete agent "${agent.name}"?`)) {
                      onDeleteAgent(agent.id);
                    }
                  }}
                  title="Delete agent"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">Y</div>
          <div className="user-status">
            <span className="user-name">You</span>
            <span className="user-presence">🟢 Online</span>
          </div>
        </div>
        <button className="settings-gear-btn" onClick={onOpenSettings} title="Settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
