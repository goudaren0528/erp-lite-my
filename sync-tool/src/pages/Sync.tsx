import { useState, useEffect, useRef, useCallback } from 'react'

type LocalConfig = {
  erpUrl: string
  apiToken: string
  showBrowser: boolean
  showBrowserPerSite: Record<string, boolean>
  scheduledTimes: Record<string, string[]>
  siteOverrides?: Record<string, Record<string, unknown>>
}

type SiteConfig = {
  id: string
  name: string
  enabled: boolean
  autoSync?: { scheduledTimes?: string[] }
}

type LogEntry = { time: string; siteId: string; msg: string }

type Props = {
  localConfig: LocalConfig
  erpConfig: Record<string, unknown> | null
  onNeedConfig: () => void
  onLocalConfigChange: (cfg: LocalConfig) => void
}

export default function SyncPage({ localConfig, erpConfig, onNeedConfig, onLocalConfigChange }: Props) {
  const [sites, setSites] = useState<SiteConfig[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [syncingSet, setSyncingSet] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [filterSite, setFilterSite] = useState<string | null>(null) // null = show all
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null) // siteId being edited
  const [scheduleInput, setScheduleInput] = useState('')
  const logsEndRef = useRef<HTMLDivElement>(null)

  const addLog = useCallback((siteId: string, msg: string) => {
    setLogs(prev => [...prev, {
      time: new Date().toLocaleTimeString(),
      siteId,
      msg
    }].slice(-1000))
  }, [])

  const loadErpConfig = async () => {
    setLoading(true)
    const res = await window.electronAPI.fetchErpConfig({ erpUrl: localConfig.erpUrl, apiToken: localConfig.apiToken })
    setLoading(false)
    if (!res.success) { addLog('system', `拉取配置失败: ${res.error}`); return }
    const cfg = res.data as { sites?: SiteConfig[] }
    setSites(cfg.sites || [])
    addLog('system', `已拉取 ERP 配置，共 ${cfg.sites?.length || 0} 个平台`)
  }

  useEffect(() => {
    if (erpConfig) {
      setSites((erpConfig.sites as SiteConfig[]) || [])
    } else {
      loadErpConfig()
    }

    const unsubLog = window.electronAPI.onSyncLog(({ siteId, msg }) => {
      setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), siteId, msg }].slice(-1000))
    })
    const unsubStatus = window.electronAPI.onSyncStatus(({ siteId, syncing }) => {
      setSyncingSet(prev => {
        const next = new Set(prev)
        if (syncing) next.add(siteId)
        else next.delete(siteId)
        return next
      })
    })
    return () => { unsubLog(); unsubStatus() }
  }, [])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleStop = async (site: SiteConfig) => {
    addLog(site.id, `手动停止抓取: ${site.name}`)
    await window.electronAPI.stopSync(site.id)
  }

  const handleSync = async (site: SiteConfig) => {
    if (syncingSet.has(site.id)) return
    if (!erpConfig) { addLog('system', '请先在连接配置页面连接 ERP'); return }
    addLog(site.id, `手动触发抓取: ${site.name}`)
    const showBrowser = localConfig.showBrowserPerSite[site.id] ?? localConfig.showBrowser
    await window.electronAPI.platformSync({
      siteId: site.id,
      erpUrl: localConfig.erpUrl,
      apiToken: localConfig.apiToken,
      erpConfig,
      showBrowser,
    })
  }

  const handleShowBrowserToggle = async (show: boolean) => {
    onLocalConfigChange({ ...localConfig, showBrowser: show })
    await window.electronAPI.setBrowserVisibility(show)
  }

  const handleSiteBrowserToggle = async (siteId: string, show: boolean) => {
    const next = { ...localConfig.showBrowserPerSite, [siteId]: show }
    onLocalConfigChange({ ...localConfig, showBrowserPerSite: next })
    await window.electronAPI.setSiteBrowserVisibility(siteId, show)
  }

  const getEffectiveTimes = (site: SiteConfig): string[] => {
    if (localConfig.scheduledTimes[site.id]?.length) return localConfig.scheduledTimes[site.id]
    return site.autoSync?.scheduledTimes ?? []
  }

  const startEditSchedule = (site: SiteConfig) => {
    setEditingSchedule(site.id)
    setScheduleInput(getEffectiveTimes(site).join(', '))
  }

  const saveSchedule = (siteId: string) => {
    const times = scheduleInput.split(/[,，\s]+/).map(s => s.trim()).filter(s => /^\d{2}:\d{2}$/.test(s))
    onLocalConfigChange({
      ...localConfig,
      scheduledTimes: { ...localConfig.scheduledTimes, [siteId]: times }
    })
    setEditingSchedule(null)
  }

  const filteredLogs = filterSite ? logs.filter(l => l.siteId === filterSite || l.siteId === 'system') : logs

  const siteColor: Record<string, string> = {}
  const palette = ['#89b4fa', '#a6e3a1', '#fab387', '#f38ba8', '#cba6f7', '#94e2d5']
  sites.forEach((s, i) => { siteColor[s.id] = palette[i % palette.length] })

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      {/* Top toolbar */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 12, background: '#f9fafb' }}>
        <div style={{ flex: 1 }} />
        <button onClick={loadErpConfig} disabled={loading} style={smallBtnStyle}>
          {loading ? '...' : '刷新配置'}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Platform list */}
        <div style={{ width: 300, borderRight: '1px solid #e5e7eb', overflowY: 'auto', padding: 12 }}>
          {sites.length === 0 && (
            <div style={{ color: '#888', fontSize: 13, padding: 8 }}>
              {loading ? '加载中...' : (
                <span>暂无配置，请先
                  <button onClick={onNeedConfig} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>连接 ERP</button>
                </span>
              )}
            </div>
          )}
          {sites.map(site => {
            const isSyncing = syncingSet.has(site.id)
            const effectiveTimes = getEffectiveTimes(site)
            const isLocalOverride = !!localConfig.scheduledTimes[site.id]?.length
            const showBrowser = localConfig.showBrowserPerSite[site.id] ?? localConfig.showBrowser
            return (
              <div key={site.id} style={{
                border: `1px solid ${isSyncing ? '#3b82f6' : '#e5e7eb'}`,
                borderRadius: 8, padding: 10, marginBottom: 8, background: '#fff',
                boxShadow: isSyncing ? '0 0 0 2px #bfdbfe' : undefined
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: siteColor[site.id] ?? '#888', flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{site.name}</span>
                      {isSyncing && <span style={{ fontSize: 11, color: '#3b82f6', animation: 'pulse 1s infinite' }}>抓取中...</span>}
                    </div>
                    {/* Schedule row */}
                    <div style={{ marginTop: 6, fontSize: 11 }}>
                      {editingSchedule === site.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            value={scheduleInput}
                            onChange={e => setScheduleInput(e.target.value)}
                            placeholder="08:00, 14:00"
                            style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 4, width: 120 }}
                            onKeyDown={e => { if (e.key === 'Enter') saveSchedule(site.id); if (e.key === 'Escape') setEditingSchedule(null) }}
                            autoFocus
                          />
                          <button onClick={() => saveSchedule(site.id)} style={{ ...smallBtnStyle, fontSize: 10, padding: '2px 6px' }}>保存</button>
                          <button onClick={() => setEditingSchedule(null)} style={{ ...smallBtnStyle, fontSize: 10, padding: '2px 6px' }}>取消</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: effectiveTimes.length ? '#16a34a' : '#9ca3af' }}>
                            {effectiveTimes.length ? `⏰ ${effectiveTimes.join(', ')}` : '无定时'}
                            {isLocalOverride && <span style={{ color: '#f59e0b', marginLeft: 4 }}>本地</span>}
                          </span>
                          <button onClick={() => startEditSchedule(site)} style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: '0 2px' }}>✏️</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => isSyncing ? handleStop(site) : handleSync(site)}
                    style={{
                      ...smallBtnStyle, marginLeft: 8, flexShrink: 0,
                      background: isSyncing ? '#ef4444' : '#3b82f6',
                      color: '#fff',
                      borderColor: isSyncing ? '#dc2626' : '#3b82f6',
                      minWidth: 52,
                    }}
                  >
                    {isSyncing ? '停止' : '抓取'}
                  </button>
                  <button
                    title={showBrowser ? '隐藏浏览器' : '显示浏览器'}
                    onClick={() => handleSiteBrowserToggle(site.id, !showBrowser)}
                    style={{
                      ...smallBtnStyle, marginLeft: 4, flexShrink: 0,
                      padding: '4px 7px', fontSize: 14,
                      background: showBrowser ? '#fef9c3' : '#f3f4f6',
                      borderColor: showBrowser ? '#fde047' : '#d1d5db',
                    }}
                  >
                    {showBrowser ? '👁' : '🙈'}
                  </button>
                </div>
                {/* Log filter shortcut */}
                <button
                  onClick={() => setFilterSite(filterSite === site.id ? null : site.id)}
                  style={{
                    marginTop: 6, fontSize: 10, padding: '1px 6px', borderRadius: 4,
                    background: filterSite === site.id ? siteColor[site.id] : '#f3f4f6',
                    color: filterSite === site.id ? '#1e1e2e' : '#6b7280',
                    border: '1px solid #e5e7eb', cursor: 'pointer', width: '100%'
                  }}
                >
                  {filterSite === site.id ? '显示全部日志' : '只看此平台日志'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Logs panel */}
        <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              运行日志 {filterSite ? `— ${sites.find(s => s.id === filterSite)?.name ?? filterSite}` : '（全部）'}
            </span>
            <button onClick={() => setLogs([])} style={smallBtnStyle}>清空</button>
          </div>
          <div style={{
            flex: 1, background: '#1e1e2e', borderRadius: 8, padding: 10,
            overflowY: 'auto', fontFamily: 'monospace', fontSize: 11.5, color: '#cdd6f4'
          }}>
            {filteredLogs.length === 0
              ? <span style={{ color: '#585b70' }}>暂无日志</span>
              : filteredLogs.map((l, i) => (
                <div key={i} style={{ marginBottom: 2, wordBreak: 'break-all' }}>
                  <span style={{ color: '#585b70' }}>[{l.time}] </span>
                  {l.siteId !== 'system' && (
                    <span style={{ color: siteColor[l.siteId] ?? '#a6adc8', marginRight: 4 }}>
                      [{sites.find(s => s.id === l.siteId)?.name ?? l.siteId}]
                    </span>
                  )}
                  <span>{l.msg}</span>
                </div>
              ))
            }
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}

const smallBtnStyle: React.CSSProperties = {
  background: '#f3f4f6', border: '1px solid #d1d5db',
  padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12
}
