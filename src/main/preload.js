const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize:        () => ipcRenderer.send('window-minimize'),
  maximize:        () => ipcRenderer.send('window-maximize'),
  close:           () => ipcRenderer.send('window-close'),
  isMaximized:     () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChange: (cb) => ipcRenderer.on('window-maximized-changed', (_, v) => cb(v)),
  platform: process.platform,

  agent: {
    list:   ()              => ipcRenderer.invoke('agent:list'),
    create: (name)          => ipcRenderer.invoke('agent:create', { name }),
    chat:   (agentId, text) => ipcRenderer.invoke('agent:chat',   { agentId, text }),
    abort:    (agentId)       => ipcRenderer.invoke('agent:abort', { agentId }),
    clear:    (agentId)       => ipcRenderer.invoke('agent:clear', { agentId }),
    onEvent:   (cb) => ipcRenderer.on('agent-event',   (_, d) => cb(d)),
    onStatus:  (cb) => ipcRenderer.on('agent-status',  (_, d) => cb(d)),
    onCleared: (cb) => ipcRenderer.on('agent-cleared', (_, d) => cb(d)),
  },

  update: {
    install:      ()   => ipcRenderer.send('update:install'),
    onAvailable:  (cb) => ipcRenderer.on('update:available', (_, d) => cb(d)),
    onProgress:   (cb) => ipcRenderer.on('update:progress',  (_, d) => cb(d)),
    onDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_, d) => cb(d)),
  },

  settings: {
    get: (key)        => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },

  terminal: {
    create:  (agentId)             => ipcRenderer.invoke('terminal:create', agentId),
    input:   (agentId, data)       => ipcRenderer.send('terminal:input',  { agentId, data }),
    resize:  (agentId, cols, rows) => ipcRenderer.send('terminal:resize', { agentId, cols, rows }),
    destroy: (agentId)             => ipcRenderer.send('terminal:destroy', agentId),
    onData: (cb) => {
      const listener = (_, d) => cb(d);
      ipcRenderer.on('terminal-data', listener);
      return () => ipcRenderer.removeListener('terminal-data', listener);
    },
    onExit: (cb) => {
      const listener = (_, d) => cb(d);
      ipcRenderer.on('terminal-exit', listener);
      return () => ipcRenderer.removeListener('terminal-exit', listener);
    },
  },
});
