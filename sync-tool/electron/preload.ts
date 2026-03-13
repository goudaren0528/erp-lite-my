import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('config:save', config),
  fetchErpConfig: (config: { erpUrl: string; apiToken: string }) => ipcRenderer.invoke('erp:fetchConfig', config),
  platformSync: (params: { siteId: string; erpUrl: string; apiToken: string; erpConfig: unknown; showBrowser: boolean }) =>
    ipcRenderer.invoke('platform:sync', params),
  importOrders: (params: { erpUrl: string; apiToken: string; csvContent: string }) =>
    ipcRenderer.invoke('erp:importOrders', params),
  setBrowserVisibility: (show: boolean) => ipcRenderer.invoke('browser:setVisibility', show),
  setSiteBrowserVisibility: (siteId: string, show: boolean) => ipcRenderer.invoke('browser:setSiteVisibility', siteId, show),
  getSyncStatus: () => ipcRenderer.invoke('sync:getStatus'),
  onSyncLog: (cb: (data: { siteId: string; msg: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { siteId: string; msg: string }) => cb(data)
    ipcRenderer.on('sync:log', handler)
    return () => ipcRenderer.removeListener('sync:log', handler)
  },
  onSyncStatus: (cb: (data: { siteId: string; syncing: boolean }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { siteId: string; syncing: boolean }) => cb(data)
    ipcRenderer.on('sync:status', handler)
    return () => ipcRenderer.removeListener('sync:status', handler)
  },
  stopSync: (siteId: string) => ipcRenderer.invoke('platform:stop', siteId),
  getSiteOverride: (siteId: string) => ipcRenderer.invoke('config:getSiteOverride', siteId),
  setSiteOverride: (siteId: string, override: Record<string, unknown> | null) => ipcRenderer.invoke('config:setSiteOverride', siteId, override),
  getErpConfig: () => ipcRenderer.invoke('config:getErpConfig'),
  onErpConfigLoaded: (cb: (data: unknown) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: unknown) => cb(data)
    ipcRenderer.on('erp:configLoaded', handler)
    return () => ipcRenderer.removeListener('erp:configLoaded', handler)
  },
})
