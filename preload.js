const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('noa', {
  scanPrescription: ()       => ipcRenderer.invoke('scan-prescription'),
  saveOrder:        (data)   => ipcRenderer.invoke('save-order', data),
  getOrders:        ()       => ipcRenderer.invoke('get-orders'),
  // Paiement : la page peut demander, elle ne peut pas décider.
  paymentConfig:    ()       => ipcRenderer.invoke('payment-config'),
  paymentCreate:    (d)      => ipcRenderer.invoke('payment-create', d),
  paymentStatus:    (ref)    => ipcRenderer.invoke('payment-status', ref),
  isDev:            ()       => ipcRenderer.invoke('is-dev'),
});
