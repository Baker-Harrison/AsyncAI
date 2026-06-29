import React from 'react';
import './Sidebar.css';

function Sidebar({ tasks, activeTaskId, onTaskSelect, onNewTask }) {
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
            <span>Tasks</span>
            <button className="new-task-btn" onClick={onNewTask}>+ New</button>
          </div>
          <ul className="task-list">
            {tasks.map((task) => (
              <li
                key={task.id}
                className={`task-item ${activeTaskId === task.id ? 'active' : ''}`}
                onClick={() => onTaskSelect(task.id)}
              >
                <div className="task-item-body">
                  <span className="task-label">{task.name}</span>
                  {task.repo && <span className="task-repo">{task.repo}</span>}
                </div>
                {(task.status === 'starting' || task.status === 'running') && (
                  <span className={`status-dot status-dot--${task.status}`} />
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
