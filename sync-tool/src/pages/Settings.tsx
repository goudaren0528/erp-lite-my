import { useState, useEffect } from 'react'

type LocalConfig = {
  erpUrl: string
  apiToken: string
  showBrowser: boolean
  showBrowserPerSite: Record<string, boolean>
  scheduledTimes: Record<string, string[]>
  siteOverrides?: Record<string, SiteOverride>
}

type SiteOverride = {
  loginUrl?: string
  username?: string
  password?: string
  maxPages?: number
  stopThreshold?: number
  selectors?: Record<string, string>
  autoSync?: { scheduledTimes?: string[]; concurrencyLimit?: number }
}

type ErpSiteConfig = {
  id: string
  name: string
  loginUrl?: string
  username?: string
  password?: string
  maxPages?: number
  stopThreshold?: number
  selectors?: Record<string, string>
  autoSync?: { scheduledTimes?: string[]; concurrencyLimit?: number }
}

type Props = {
  initialConfig: LocalConfig
  onSaved: (config: LocalConfig, erpConfig: Record<string, unknown>) => void
}

type Tab = 'connection' | 'platforms'

export default function SettingsPage({ initialConfig, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>('connection')
  const [erpUrl, setErpUrl] = useState(initialConfig.erpUrl)
  const [apiToken, setApiToken] = useState(initialConfig.apiToken)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [connMsg, setConnMsg] = useState('')

  const [sites, setSites] = useState<ErpSiteConfig[]>([])
  const [overrides, setOverrides] = useState<Record<string, SiteOverride>>({})
  const [expandedSite, setExpandedSite] = useState<string | null>(null)
  const [loadingErp, setLoadingErp] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    if (initialConfig.erpUrl) setErpUrl(initialConfig.erpUrl)
    if (initialConfig.apiToken) setApiToken(initialConfig.apiToken)
  }, [initialConfig.erpUrl, initialConfig.apiToken])

  useEffect(() => {
    setOverrides(initialConfig.siteOverrides ?? {})
  }, [initialConfig.siteOverrides])

  const loadPlatformData = async () => {
    setLoadingErp(true)
    const cfg = await window.electronAPI.getErpConfig()
    setLoadingErp(false)
    if (cfg?.sites) setSites(cfg.sites as ErpSiteConfig[])
  }

  useEffect(() => {
    if (tab === 'platforms') loadPlatformData()
  }, [tab])

  const normalizeUrl = (u: string) => {
    const trimmed = u.trim().replace(/\/$/, '')
    return trimmed.startsWith('http') ? trimmed : `http://${trimmed}`
  }

  const handleSave = async () => {
    if (!erpUrl || !apiToken) { setError('请填写 ERP 地址和 Token'); return }
    setError(''); setConnMsg('')
    const url = normalizeUrl(erpUrl)
    // Read latest config from disk to avoid overwriting locally saved overrides
    const latestCfg = await window.electronAPI.loadConfig()
    const cfg: LocalConfig = { ...latestCfg, erpUrl: url, apiToken }
    await window.electronAPI.saveConfig(cfg)
    setTesting(true)
    try {
      const res = await window.electronAPI.fetchErpConfig({ erpUrl: url, apiToken })
      if (res.success) {
        setConnMsg('已保存并连接成功')
        onSaved(cfg, res.data as Record<string, unknown>)
      } else {
        setError(`已保存，但连接失败: ${res.error || '请检查地址和 Token'}`)
        onSaved(cfg, {})
      }
    } catch (e) {
      setError(`已保存，但连接失败: ${String(e)}`)
      onSaved(cfg, {})
    } finally {
      setTesting(false)
    }
  }

  const handlePullErpConfig = async () => {
    if (!initialConfig.erpUrl || !initialConfig.apiToken) {
      setSaveMsg('请先在连接配置页面保存 ERP 地址和 Token')
      return
    }
    setLoadingErp(true)
    const res = await window.electronAPI.fetchErpConfig({
      erpUrl: initialConfig.erpUrl,
      apiToken: initialConfig.apiToken,
    })
    setLoadingErp(false)
    if (!res.success) { setSaveMsg(`拉取失败: ${res.error}`); return }
    const data = res.data as { sites?: ErpSiteConfig[] }
    setSites(data.sites ?? [])
    setSaveMsg('已拉取最新 ERP 配置')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const getOv = (siteId: string): SiteOverride => overrides[siteId] ?? {}

  const setOvField = (siteId: string, field: keyof SiteOverride, value: unknown) => {
    setOverrides(prev => ({ ...prev, [siteId]: { ...prev[siteId], [field]: value } }))
  }

  const setSelectorKey = (siteId: string, key: string, value: string) => {
    setOverrides(prev => {
      const existing = prev[siteId]?.selectors ?? {}
      return { ...prev, [siteId]: { ...prev[siteId], selectors: { ...existing, [key]: value } } }
    })
  }

  const removeSelectorKey = (siteId: string, key: string) => {
    setOverrides(prev => {
      const existing = { ...(prev[siteId]?.selectors ?? {}) }
      delete existing[key]
      return { ...prev, [siteId]: { ...prev[siteId], selectors: existing } }
    })
  }

  const saveOverrides = async () => {
    for (const [siteId, ov] of Object.entries(overrides)) {
      const isEmpty = !ov || Object.keys(ov).length === 0
      await window.electronAPI.setSiteOverride(siteId, isEmpty ? null : ov as Record<string, unknown>)
    }
    const cfg: LocalConfig = { ...initialConfig, siteOverrides: overrides }
    await window.electronAPI.saveConfig(cfg)
    setSaveMsg('本地配置已保存')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const clearOverride = async (siteId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await window.electronAPI.setSiteOverride(siteId, null)
    setOverrides(prev => { const next = { ...prev }; delete next[siteId]; return next })
    setSaveMsg('已清除本地覆盖')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', padding: '0 16px' }}>
        {(['connection', 'platforms'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '12px 16px', fontSize: 13, fontWeight: tab === t ? 600 : 400,
            color: tab === t ? '#3b82f6' : '#6b7280',
            borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t === 'connection' ? '连接配置' : '平台配置'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'connection' && (
          <div style={{ padding: 32, maxWidth: 520 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>ERP 地址</label>
              <input value={erpUrl} onChange={e => setErpUrl(e.target.value)}
                placeholder="localhost:3000"
                style={inputStyle}
                onKeyDown={e => e.key === 'Enter' && handleSave()} />
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>可省略 http://，末尾不含斜杠</div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>API Token</label>
              <input value={apiToken} onChange={e => setApiToken(e.target.value)}
                placeholder="在 ERP 系统设置页面生成" type="password" style={inputStyle}
                onKeyDown={e => e.key === 'Enter' && handleSave()} />
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>ERP 系统设置 - API Token</div>
            </div>
            {error && (
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
                {error}
              </div>
            )}
            {connMsg && (
              <div style={{ background: '#dcfce7', color: '#16a34a', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
                {connMsg}
              </div>
            )}
            <button onClick={handleSave} disabled={testing} style={btnStyle}>
              {testing ? '连接中...' : '保存'}
            </button>
          </div>
        )}

        {tab === 'platforms' && (
          <div style={{ padding: 16, maxWidth: 800 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>本地覆盖优先于 ERP 配置，留空则沿用 ERP 值</span>
              <div style={{ flex: 1 }} />
              {saveMsg && <span style={{ fontSize: 12, color: '#16a34a' }}>{saveMsg}</span>}
              <button onClick={handlePullErpConfig} disabled={loadingErp} style={smallBtnStyle}>
                {loadingErp ? '拉取中...' : '拉取 ERP 配置'}
              </button>
              <button onClick={saveOverrides} style={{ ...smallBtnStyle, background: '#3b82f6', color: '#fff', borderColor: '#3b82f6' }}>
                保存本地配置
              </button>
            </div>

            {sites.length === 0 && !loadingErp && (
              <div style={{ color: '#888', fontSize: 13 }}>暂无平台数据，请点击「拉取 ERP 配置」</div>
            )}

            {sites.map(s => {
              const ov = getOv(s.id)
              const hasOverride = Object.keys(ov).length > 0
              const isExpanded = expandedSite === s.id
              return (
                <div key={s.id} style={{ border: `1px solid ${hasOverride ? '#fbbf24' : '#e5e7eb'}`, borderRadius: 8, marginBottom: 8, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setExpandedSite(isExpanded ? null : s.id)}>
                    <span style={{ fontWeight: 500, fontSize: 13, flex: 1 }}>{s.name}</span>
                    {hasOverride && <span style={{ fontSize: 11, color: '#d97706', marginRight: 8 }}>本地已覆盖</span>}
                    <button onClick={e => clearOverride(s.id, e)}
                      style={{ ...smallBtnStyle, fontSize: 11, padding: '2px 8px', marginRight: 8, color: '#ef4444', borderColor: '#fca5a5' }}>
                      清除覆盖
                    </button>
                    <span style={{ color: '#9ca3af', fontSize: 11 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 14px 14px', borderTop: '1px solid #f3f4f6' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                        <FieldRow label="登录地址" erpVal={s.loginUrl} localVal={ov.loginUrl}
                          onChange={v => setOvField(s.id, 'loginUrl', v || undefined)} />
                        <FieldRow label="用户名" erpVal={s.username} localVal={ov.username}
                          onChange={v => setOvField(s.id, 'username', v || undefined)} />
                        <FieldRow label="密码" erpVal={s.password} localVal={ov.password} type="password"
                          onChange={v => setOvField(s.id, 'password', v || undefined)} />
                        <FieldRow label="最大页数 (0=不限)" erpVal={s.maxPages != null ? String(s.maxPages) : ''}
                          localVal={ov.maxPages != null ? String(ov.maxPages) : undefined}
                          onChange={v => setOvField(s.id, 'maxPages', v ? Number(v) : undefined)} />
                        <FieldRow label="增量阈値 (连续终态订单数)" erpVal={s.stopThreshold != null ? String(s.stopThreshold) : ''}
                          localVal={ov.stopThreshold != null ? String(ov.stopThreshold) : undefined}
                          onChange={v => setOvField(s.id, 'stopThreshold', v ? Number(v) : undefined)} />
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>选择器覆盖</div>
                        {Object.entries(s.selectors ?? {}).map(([key, erpVal]) => (
                          <SelectorRow key={key} selectorKey={key} erpVal={erpVal}
                            localVal={ov.selectors?.[key]}
                            onChange={v => v ? setSelectorKey(s.id, key, v) : removeSelectorKey(s.id, key)} />
                        ))}
                        {Object.entries(ov.selectors ?? {})
                          .filter(([k]) => !(s.selectors ?? {})[k])
                          .map(([key, localVal]) => (
                            <SelectorRow key={key} selectorKey={key} erpVal={undefined} localVal={localVal}
                              onChange={v => v ? setSelectorKey(s.id, key, v) : removeSelectorKey(s.id, key)} />
                          ))}
                        <AddSelectorRow onAdd={(k, v) => setSelectorKey(s.id, k, v)} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function FieldRow({ label, erpVal, localVal, onChange, type = 'text' }: {
  label: string; erpVal?: string; localVal?: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>{label}</div>
      <input type={type} value={localVal ?? ''} onChange={e => onChange(e.target.value)}
        placeholder={erpVal ? `ERP: ${type === 'password' ? '......' : erpVal}` : '(未配置)'}
        style={{ ...inputStyle, fontSize: 12, padding: '5px 8px', background: localVal ? '#fffbeb' : '#fff' }} />
    </div>
  )
}

function SelectorRow({ selectorKey, erpVal, localVal, onChange }: {
  selectorKey: string; erpVal?: string; localVal?: string; onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 6, marginBottom: 5, alignItems: 'center' }}>
      <div style={{ fontSize: 11, color: '#374151', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={selectorKey}>{selectorKey}</div>
      <input value={localVal ?? ''} onChange={e => onChange(e.target.value)}
        placeholder={erpVal ?? '(本地新增)'}
        style={{ ...inputStyle, fontSize: 11, padding: '3px 7px', fontFamily: 'monospace',
          background: localVal ? '#fffbeb' : '#f9fafb' }} />
    </div>
  )
}

function AddSelectorRow({ onAdd }: { onAdd: (key: string, val: string) => void }) {
  const [key, setKey] = useState('')
  const [val, setVal] = useState('')
  const submit = () => {
    if (!key.trim()) return
    onAdd(key.trim(), val)
    setKey(''); setVal('')
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: 6, marginTop: 8, alignItems: 'center' }}>
      <input value={key} onChange={e => setKey(e.target.value)} placeholder="新选择器 key"
        style={{ ...inputStyle, fontSize: 11, padding: '3px 7px', fontFamily: 'monospace' }} />
      <input value={val} onChange={e => setVal(e.target.value)} placeholder="CSS 选择器值"
        style={{ ...inputStyle, fontSize: 11, padding: '3px 7px', fontFamily: 'monospace' }} />
      <button onClick={submit} style={{ ...smallBtnStyle, fontSize: 11, padding: '3px 10px' }}>添加</button>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
  borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box'
}
const btnStyle: React.CSSProperties = {
  background: '#3b82f6', color: '#fff', border: 'none',
  padding: '10px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500
}
const smallBtnStyle: React.CSSProperties = {
  background: '#f3f4f6', border: '1px solid #d1d5db',
  padding: '5px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap'
}
