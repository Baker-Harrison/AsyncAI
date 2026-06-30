import React, { useState, useEffect, useRef } from 'react';
import './TaskModal.css';

interface TaskModalProps {
  onClose: () => void;
  onCreate: (data: { name: string }) => void;
}

function TaskModal({ onClose, onCreate }: TaskModalProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({ name: name.trim() || 'New Agent' });
    onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">New Agent</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-field">
            <label className="modal-label">Agent Name <span className="modal-optional">(optional)</span></label>
            <input
              ref={inputRef}
              className="modal-input"
              placeholder="e.g. Alex, Frontend Dev, Bug Hunter…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn--cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal-btn modal-btn--create">
              Create Agent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TaskModal;
