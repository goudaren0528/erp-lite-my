import { useState, useEffect } from 'react'
import SettingsPage from './pages/Settings'
import SyncPage from './pages/Sync'

// Reuse the global LocalConfig from electron.d.ts via window.electronAPI
type LocalConfig = Parameters<typeof window.electronAPI.saveConfig>[0]

type Page = 'settings' | 'sync'

export default function App() {
  const [page, setPage] = useState<Page>('settings')
  const [localConfig, setLocalConfig] = useState<LocalConfig>({
    erpUrl: '', apiToken: '', showBrowser: true, showBrowserPerSite: {}, scheduledTimes: {}, siteOverrides: {}
  })
  const [erpConfig, setErpConfig] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    window.electronAPI.loadConfig().then(c => {
      setLocalConfig(c)
      if (c.erpUrl && c.apiToken) setPage('sync')
    })
    // If main process auto-fetched ERP config on startup, receive it here
    const unsub = window.electronAPI.onErpConfigLoaded(data => {
      setErpConfig(data as Record<string, unknown>)
    })
    return unsub
  }, [])

  const handleConfigSaved = (cfg: LocalConfig, erp: Record<string, unknown>) => {
    setLocalConfig(cfg)
    setErpConfig(erp)
    setPage('sync')
  }

  const handleLocalConfigChange = async (cfg: LocalConfig) => {
    setLocalConfig(cfg)
    await window.electronAPI.saveConfig(cfg)
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 160, background: '#1e1e2e', color: '#cdd6f4', display: 'flex', flexDirection: 'column', padding: '20px 0' }}>
        <div style={{ padding: '0 16px 20px', fontWeight: 700, fontSize: 13, color: '#89b4fa' }}>ERP 同步工具</div>
        {(['sync', 'settings'] as Page[]).map(p => (
          <button key={p} onClick={() => setPage(p)} style={{
            background: page === p ? '#313244' : 'transparent',
            color: page === p ? '#cdd6f4' : '#a6adc8',
            border: 'none', cursor: 'pointer',
            padding: '10px 16px', textAlign: 'left', fontSize: 13
          }}>
            {p === 'sync' ? '📡 订单同步' : '⚙️ 连接配置'}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {/* Always mounted to preserve logs/state across tab switches */}
        <div style={{ display: page === 'settings' ? 'block' : 'none', height: '100%' }}>
          <SettingsPage
            initialConfig={localConfig}
            onSaved={handleConfigSaved}
          />
        </div>
        <div style={{ display: page === 'sync' ? 'flex' : 'none', height: '100%', flexDirection: 'column' }}>
          <SyncPage
            localConfig={localConfig}
            erpConfig={erpConfig}
            onNeedConfig={() => setPage('settings')}
            onLocalConfigChange={handleLocalConfigChange}
          />
        </div>
      </div>
    </div>
  )
}
