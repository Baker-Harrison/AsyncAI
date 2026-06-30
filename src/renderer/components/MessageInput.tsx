import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { FileData } from '../types';
import './MessageInput.css';

interface Command {
  name: string;
  description: string;
}

const COMMANDS: Command[] = [
  { name: '/clear', description: 'Archive this conversation and start a fresh context' },
];

interface MessageInputProps {
  onSend: (text: string, files?: FileData[]) => void;
  onCommand: (name: string) => void;
  disabled: boolean;
  placeholder?: string;
}

function MessageInput({ onSend, onCommand, disabled, placeholder }: MessageInputProps) {
  const [text, setText]           = useState('');
  const [suggestions, setSuggestions] = useState<Command[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [files, setFiles]         = useState<FileData[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recompute suggestions whenever text changes
  useEffect(() => {
    if (text.startsWith('/')) {
      const q = text.toLowerCase();
      const matches = COMMANDS.filter((c) => c.name.startsWith(q));
      setSuggestions(matches);
      setSelectedIdx(0);
    } else {
      setSuggestions([]);
    }
  }, [text]);

  const executeCommand = (cmd: Command) => {
    setText('');
    setSuggestions([]);
    onCommand?.(cmd.name);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (disabled) return;

    // If autocomplete is open and user presses Enter, run the highlighted command
    if (suggestions.length > 0) {
      executeCommand(suggestions[selectedIdx]);
      return;
    }

    // Check if it's a bare slash command
    const exact = COMMANDS.find((c) => c.name === text.trim());
    if (exact) {
      executeCommand(exact);
      return;
    }

    if (text.trim() || files.length > 0) {
      onSend(text.trim(), files);
      setText('');
      setFiles([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Escape') {
        setSuggestions([]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  // ── File handling ──────────────────────────────────────────────────────

  const readFileAsBase64 = (file: File): Promise<FileData> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1]; // Remove data URL prefix
        resolve({ name: file.name, size: file.size, type: file.type, data: base64 });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const newFiles: FileData[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      // Frontend size validation
      if (file.size > 10 * 1024 * 1024) {
        alert(`File "${file.name}" is too large (max 10MB)`);
        continue;
      }
      // Block executable files by MIME type
      const dangerousPrefixes = ['application/x-msdownload', 'application/vnd.microsoft',
        'application/x-executable', 'application/x-sharedlib', 'application/x-mach-binary'];
      if (dangerousPrefixes.some((p) => file.type.startsWith(p))) {
        alert(`File type "${file.type}" is not allowed for security reasons`);
        continue;
      }
      try {
        const encoded = await readFileAsBase64(file);
        newFiles.push(encoded);
      } catch (e) {
        console.error('Error reading file:', e);
      }
    }
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div
      className={`message-input-container ${isDragOver ? 'message-input-container--drag' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {files.length > 0 && (
        <div className="file-preview-bar">
          {files.map((f, i) => (
            <div key={i} className="file-preview-chip">
              <span className="file-preview-name">📎 {f.name}</span>
              <span className="file-preview-size">
                {f.size > 1024 * 1024
                  ? `${(f.size / (1024 * 1024)).toFixed(1)} MB`
                  : `${Math.round(f.size / 1024)} KB`}
              </span>
              <button className="file-preview-remove" onClick={() => removeFile(i)}>×</button>
            </div>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="slash-menu">
          {suggestions.map((cmd, i) => (
            <div
              key={cmd.name}
              className={`slash-item ${i === selectedIdx ? 'slash-item--active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); executeCommand(cmd); }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <span className="slash-item-name">{cmd.name}</span>
              <span className="slash-item-desc">{cmd.description}</span>
            </div>
          ))}
        </div>
      )}
      <form className="message-input-form" onSubmit={handleSubmit}>
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="file-input-hidden"
          onChange={handleFileSelect}
          multiple
          tabIndex={-1}
        />
        <textarea
          ref={inputRef}
          className="message-input-field"
          placeholder={placeholder ?? 'Message your agent… (type / for commands)'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          autoComplete="off"
          rows={1}
        />
        <button
          type="submit"
          className="send-btn"
          disabled={(!text.trim() && files.length === 0) || disabled}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 2L14 9H10V14H6V9H2L8 2Z" fill="currentColor"/>
          </svg>
        </button>
      </form>
    </div>
  );
}

export default MessageInput;
