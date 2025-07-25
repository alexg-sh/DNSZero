// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  checkInternet: () => ipcRenderer.send('check-internet'),
  onInternetStatus: (callback: (value: boolean) => void) => ipcRenderer.on('internet-status', (_event: any, value: boolean) => callback(value))
});
