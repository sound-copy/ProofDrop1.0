const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('proofdrop', {
  processFile: (p, opts) => ipcRenderer.invoke('process-file', p, opts || {}),
  onProgress: (cb) => ipcRenderer.on('process-progress', (_e, msg) => cb(msg))
});

