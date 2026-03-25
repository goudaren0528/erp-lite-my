export {}

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
  enabled: boolean
  loginUrl?: string
  username?: string
  password?: string
  maxPages?: number
  stopThreshold?: number
  selectors?: Record<string, string>
  autoSync?: { enabled?: boolean; scheduledTimes?: string[]; concurrencyLimit?: number }
}

declare global {
  interface Window {
    electronAPI: {
      loadConfig: () => Promise<LocalConfig>
      saveConfig: (config: LocalConfig) => Promise<boolean>
      exportConfig: () => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>
      importConfig: () => Promise<{ success: boolean; config?: LocalConfig; canceled?: boolean; error?: string }>
      fetchErpConfig: (config: { erpUrl: string; apiToken: string }) => Promise<{ success: boolean; data?: unknown; error?: string }>
      platformSync: (params: { siteId: string; erpUrl: string; apiToken: string; erpConfig: unknown; showBrowser: boolean }) => Promise<{ success: boolean; error?: string }>
      importOrders: (params: { erpUrl: string; apiToken: string; csvContent: string }) => Promise<{ success: boolean; error?: string }>
      setBrowserVisibility: (show: boolean) => Promise<boolean>
      setSiteBrowserVisibility: (siteId: string, show: boolean) => Promise<boolean>
      getSyncStatus: () => Promise<{ syncing: string[]; attention: Record<string, { siteName: string; message: string }> }>
      onSyncLog: (cb: (data: { siteId: string; msg: string }) => void) => () => void
      onSyncStatus: (cb: (data: { siteId: string; syncing: boolean }) => void) => () => void
      onSyncAttention: (cb: (data: { siteId: string; needsAttention: boolean; siteName: string; message: string }) => void) => () => void
      stopSync: (siteId: string) => Promise<{ success: boolean; error?: string }>
      getSiteOverride: (siteId: string) => Promise<SiteOverride | null>
      setSiteOverride: (siteId: string, override: Record<string, unknown> | null) => Promise<boolean>
      getErpConfig: () => Promise<{ sites?: ErpSiteConfig[]; [key: string]: unknown } | null>
      restartScheduler: () => Promise<{ success: boolean; message: string }>
      onErpConfigLoaded: (cb: (data: unknown) => void) => () => void
    }
  }
}
