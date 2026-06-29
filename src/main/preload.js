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
    abort:  (agentId)       => ipcRenderer.invoke('agent:abort',  { agentId }),
    onEvent:  (cb) => ipcRenderer.on('agent-event',  (_, d) => cb(d)),
    onStatus: (cb) => ipcRenderer.on('agent-status', (_, d) => cb(d)),
  },
});
