import React, { useState, useEffect, useRef } from 'react';
import './TaskModal.css';

function TaskModal({ onClose, onCreate }) {
  const [repo, setRepo] = useState('');
  const [name, setName] = useState('');
  const repoRef = useRef(null);

  useEffect(() => {
    repoRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const normalizeRepo = (val) =>
    val.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalized = normalizeRepo(repo.trim());
    if (!normalized) return;
    const taskName = name.trim() || normalized.split('/')[1] || normalized;
    onCreate({ name: taskName, repo: normalized });
    onClose();
  };

  const isValid = normalizeRepo(repo.trim()).includes('/');

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">New Task</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-field">
            <label className="modal-label">GitHub Repository</label>
            <input
              ref={repoRef}
              className="modal-input"
              placeholder="owner/repo or https://github.com/owner/repo"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
            <span className="modal-hint">
              A Docker container will be spun up with this repo cloned inside.
            </span>
          </div>

          <div className="modal-field">
            <label className="modal-label">Task Name <span className="modal-optional">(optional)</span></label>
            <input
              className="modal-input"
              placeholder="What do you want to accomplish?"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn--cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal-btn modal-btn--create" disabled={!isValid}>
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TaskModal;
