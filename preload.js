const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('noa', {
  scanPrescription: ()       => ipcRenderer.invoke('scan-prescription'),
  saveOrder:        (data)   => ipcRenderer.invoke('save-order', data),
  getOrders:        ()       => ipcRenderer.invoke('get-orders'),
});
