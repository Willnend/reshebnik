/**
 * preload.js - Прелоад-скрипт Electron для безопасного моста между нативным окном и веб-интерфейсом.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  toggleFullScreen: () => ipcRenderer.send('toggle-fullscreen'),
  exitFullScreen: () => ipcRenderer.send('exit-fullscreen'),
  zoomIn: () => ipcRenderer.send('zoom-in'),
  zoomOut: () => ipcRenderer.send('zoom-out'),
  resetZoom: () => ipcRenderer.send('reset-zoom'),
  onFullScreenChange: (callback) => {
    ipcRenderer.on('fullscreen-change', (event, isFull) => callback(isFull));
  }
});
