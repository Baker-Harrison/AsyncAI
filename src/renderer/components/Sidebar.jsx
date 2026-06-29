import React from 'react';
import './Sidebar.css';

function Sidebar({ agents, activeAgentId, onAgentSelect, onNewAgent }) {
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
      </div>
    </div>
  );
}

export default Sidebar;
