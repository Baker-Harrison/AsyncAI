const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChange: (callback) => {
    ipcRenderer.on('window-maximized-changed', (_, state) => callback(state));
  },
  platform: process.platform,
  opencode: {
    startContainer: (repo, taskId) =>
      ipcRenderer.invoke('opencode:start-container', repo, taskId),
    sendMessage: (sessionId, text) =>
      ipcRenderer.invoke('opencode:send-message', sessionId, text),
  },
});
