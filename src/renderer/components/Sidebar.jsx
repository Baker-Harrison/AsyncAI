import React from 'react';
import './Sidebar.css';

function Sidebar({ agents, activeAgentId, onAgentSelect, onNewAgent, onOpenSettings }) {
  return (
    <div className="sidebar">
      <div className="workspace-header">
        <div className="workspace-name">
          <div className="workspace-icon">A</div>
          AsyncAI
        </div>
      </div>

      <div className="sidebar-scroll">
        <div className="sidebar-section">
          <div className="section-header">
            <span>Agents</span>
            <button className="new-task-btn" onClick={onNewAgent}>+ New Agent</button>
          </div>
          <ul className="task-list">
            {agents.map((agent) => (
              <li
                key={agent.id}
                className={`task-item ${activeAgentId === agent.id ? 'active' : ''}`}
                onClick={() => onAgentSelect(agent.id)}
              >
                <div className="task-item-body">
                  <span className="task-label">{agent.name}</span>
                </div>
                {agent.status === 'starting' && (
                  <span className="status-dot status-dot--starting" />
                )}
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
