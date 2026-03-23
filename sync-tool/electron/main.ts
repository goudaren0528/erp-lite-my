import { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import * as http from 'http'
import * as https from 'https'
import { chromium, type BrowserContext, type Page } from 'playwright'

// Static imports — vite-plugin-electron bundles these into main.js
import * as zanchenMod from '../src/lib/platforms/zanchen'
import * as chenglinMod from '../src/lib/platforms/chenglin'
import * as aolzuMod from '../src/lib/platforms/aolzu'
import * as youpinMod from '../src/lib/platforms/youpin'
import * as llxzuMod from '../src/lib/platforms/llxzu'
import * as rrzMod from '../src/lib/platforms/rrz'

// ── Types ─────────────────────────────────────────────────────────────────────
type LocalConfig = {
  erpUrl: string
  apiToken: string
  showBrowser: boolean
  showBrowserPerSite: Record<string, boolean> // siteId → per-platform browser visibility
  scheduledTimes: Record<string, string[]> // siteId → ["08:00","14:00"]
  siteOverrides: Record<string, SiteOverride> // siteId → local overrides
}

// Fields from SiteConfig that can be overridden locally
type SiteOverride = {
  loginUrl?: string
  username?: string
  password?: string
  maxPages?: number
  stopThreshold?: number
  selectors?: Record<string, string>
  autoSync?: { scheduledTimes?: string[]; concurrencyLimit?: number }
}

type ErpConfig = {
  headless?: boolean
  sites?: {
    id: string; name: string; enabled: boolean
    loginUrl?: string; username?: string; password?: string; maxPages?: number
    selectors?: Record<string, string>
    autoSync?: { scheduledTimes?: string[]; concurrencyLimit?: number }
    [key: string]: unknown
  }[]
  [key: string]: unknown
}

type PlatformMod = {
  setExternalConfig?: (cfg: ErpConfig) => void
  setAppBasePath?: (p: string) => void
  clearCollectedOrders: () => void
  getCollectedOrders: () => Record<string, unknown>[]
  closeContext?: () => Promise<void>
  moveWindow?: (x: number, y: number) => Promise<void>
  setSharedPage?: (page: Page, context: BrowserContext) => void
  [key: string]: unknown
}

// ── Platform registry ─────────────────────────────────────────────────────────
const platformModules: Record<string, PlatformMod> = {
  zanchen: zanchenMod as unknown as PlatformMod,
  chenglin: chenglinMod as unknown as PlatformMod,
  aolzu: aolzuMod as unknown as PlatformMod,
  youpin: youpinMod as unknown as PlatformMod,
  llxzu: llxzuMod as unknown as PlatformMod,
  rrz: rrzMod as unknown as PlatformMod,
}
const startFnNames: Record<string, string> = {
  zanchen: 'startZanchenSync', chenglin: 'startChenglinSync',
  aolzu: 'startAolzuSync', youpin: 'startYoupinSync',
  llxzu: 'startLlxzuSync', rrz: 'startRrzSync',
}
const stopFnNames: Record<string, string> = {
  zanchen: 'stopZanchenSync', chenglin: 'stopChenglinSync',
  aolzu: 'stopAolzuSync', youpin: 'stopYoupinSync',
  llxzu: 'stopLlxzuSync', rrz: 'stopRrzSync',
}
const getStatusFnNames: Record<string, string> = {
  zanchen: 'getZanchenStatus', chenglin: 'getChenglinStatus',
  aolzu: 'getAolzuStatus', youpin: 'getYoupinStatus',
  llxzu: 'getLlxzuStatus', rrz: 'getRrzStatus',
}

function detectPlatformKey(siteId: string, siteName: string): string {
  const id = siteId.toLowerCase()
  if (siteName.includes('诚赁') || id.includes('chenglin')) return 'chenglin'
  if (siteName.includes('奥租') || id.includes('aolzu')) return 'aolzu'
  if (siteName.includes('优品') || id.includes('youpin')) return 'youpin'
  if (siteName.includes('零零享') || id.includes('llxzu')) return 'llxzu'
  if (siteName.includes('人人租') || id.includes('rrz')) return 'rrz'
  return 'zanchen'
}

// ── Apply local site overrides onto a copy of erpConfig ───────────────────────
function applyLocalOverrides(erpConfig: ErpConfig, localConfig: LocalConfig): ErpConfig {
  if (!erpConfig.sites || !localConfig.siteOverrides) return erpConfig
  const overrides = localConfig.siteOverrides
  const sites = erpConfig.sites.map(site => {
    const ov = overrides[site.id]
    if (!ov) return site
    const merged = { ...site }
    if (ov.loginUrl !== undefined) merged.loginUrl = ov.loginUrl
    if (ov.username !== undefined) merged.username = ov.username
    if (ov.password !== undefined) merged.password = ov.password
    if (ov.maxPages !== undefined) merged.maxPages = ov.maxPages
    if (ov.stopThreshold !== undefined) merged.stopThreshold = ov.stopThreshold
    if (ov.selectors) merged.selectors = { ...(site.selectors as Record<string, string> || {}), ...ov.selectors }
    if (ov.autoSync) merged.autoSync = { ...(site.autoSync || {}), ...ov.autoSync }
    return merged
  })
  return { ...erpConfig, sites }
}

// ── Config persistence ────────────────────────────────────────────────────────
let CONFIG_PATH = ''
function defaultConfig(): LocalConfig {
  return { erpUrl: '', apiToken: '', showBrowser: true, showBrowserPerSite: {}, scheduledTimes: {}, siteOverrides: {} }
}
function loadLocalConfig(): LocalConfig {
  if (!existsSync(CONFIG_PATH)) return defaultConfig()
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
    return { ...defaultConfig(), ...raw }
  } catch { return defaultConfig() }
}
function saveLocalConfig(config: LocalConfig) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

// ── Independent browser contexts per platform (siteId → BrowserContext) ──────
const platformContexts: Map<string, BrowserContext> = new Map()
const platformPages: Map<string, Page> = new Map()
let currentShowBrowser = true

async function getContextForSite(siteId: string, platformKey: string, showBrowser: boolean): Promise<BrowserContext> {
  const existing = platformContexts.get(siteId)
  if (existing) {
    try {
      existing.pages() // throws if closed
      return existing
    } catch {
      platformContexts.delete(siteId)
      platformPages.delete(siteId)
    }
  }

  const userData = app.getPath('userData')
  const profileDir = join(userData, '.playwright', platformKey)
  if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true })

  const args = [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
  ]
  if (!showBrowser) args.push('--window-position=-4800,-4800')

  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: null,
    args,
    ignoreDefaultArgs: ['--enable-automation'],
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })

  ctx.on('close', () => {
    platformContexts.delete(siteId)
    platformPages.delete(siteId)
    sendLog(siteId, '浏览器已关闭，下次抓取将自动重启')
  })

  platformContexts.set(siteId, ctx)
  return ctx
}

async function getPageForSite(siteId: string, showBrowser: boolean): Promise<Page> {
  const site = cachedErpConfig?.sites?.find(s => s.id === siteId)
  const platformKey = detectPlatformKey(siteId, site?.name || '')
  const ctx = await getContextForSite(siteId, platformKey, showBrowser)

  const existing = platformPages.get(siteId)
  if (existing && !existing.isClosed()) return existing

  platformPages.delete(siteId)
  const pages = ctx.pages()
  const blank = pages.find(p => p.url() === 'about:blank' && ![...platformPages.values()].includes(p))
  const page = blank ?? await ctx.newPage()
  platformPages.set(siteId, page)
  return page
}

// Move browser window on/off screen dynamically via CDP
async function setBrowserVisibility(show: boolean) {
  currentShowBrowser = show
  const x = show ? 100 : -4800
  const y = show ? 100 : -4800

  // Move all per-platform context windows
  for (const [siteId, ctx] of platformContexts) {
    try {
      const pages = ctx.pages()
      const page = pages[0]
      if (page) {
        const cdp = await ctx.newCDPSession(page)
        const { windowId } = await cdp.send('Browser.getWindowForTarget')
        await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: x, top: y, windowState: 'normal' } })
        await cdp.detach()
      }
    } catch (e) {
      console.log(`[setBrowserVisibility] CDP error for ${siteId}:`, e)
    }
  }

  // Fallback: move via platform modules (legacy per-platform browser)
  for (const mod of Object.values(platformModules)) {
    await mod.moveWindow?.(x, y).catch(() => void 0)
  }
  sendLog('system', show ? '浏览器已移回屏幕' : '浏览器已移出屏幕')
}

// Focus a specific platform's tab (bring to front)
async function focusPageForSite(siteId: string) {
  try {
    const page = platformPages.get(siteId)
    if (page && !page.isClosed()) {
      await page.bringToFront().catch(() => void 0)
    }
  } catch { /* ignore */ }
}

// ── Sync state ────────────────────────────────────────────────────────────────
const syncingSet = new Set<string>() // siteIds currently syncing
let cachedErpConfig: ErpConfig | null = null

// ── Scheduler ─────────────────────────────────────────────────────────────────
let schedulerInterval: NodeJS.Timeout | null = null
const firedToday = new Map<string, Set<string>>() // siteId → Set<"HH:MM">

function getScheduledTimesForSite(siteId: string, localConfig: LocalConfig): string[] {
  // Local config takes priority over ERP config
  if (localConfig.scheduledTimes[siteId]?.length) return localConfig.scheduledTimes[siteId]
  const site = cachedErpConfig?.sites?.find(s => s.id === siteId)
  return site?.autoSync?.scheduledTimes ?? []
}

function startScheduler() {
  if (schedulerInterval) clearInterval(schedulerInterval)
  schedulerInterval = setInterval(() => {
    const now = new Date()
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const today = now.toDateString()
    const localConfig = loadLocalConfig()
    if (!cachedErpConfig?.sites) return

    for (const site of cachedErpConfig.sites) {
      const times = getScheduledTimesForSite(site.id, localConfig)
      if (!times.includes(hhmm)) continue
      if (!firedToday.has(site.id)) firedToday.set(site.id, new Set())
      const fired = firedToday.get(site.id)!
      const key = `${today}-${hhmm}`
      if (fired.has(key)) continue
      fired.add(key)
      sendLog(site.id, `[定时] ${hhmm} 触发自动抓取`)
      runPlatformSync(site.id, localConfig.erpUrl, localConfig.apiToken, cachedErpConfig, localConfig.showBrowserPerSite[site.id] ?? localConfig.showBrowser)
    }
  }, 30_000) // check every 30s
}

// ── Main window ───────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let forceQuit = false

// Build a 32x32 RGBA tray icon programmatically: blue circle with white cross
function buildTrayIcon(): Electron.NativeImage {
  const size = 32
  const buf = Buffer.alloc(size * size * 4)
  const cx = size / 2, cy = size / 2, r = size / 2 - 1

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const inCircle = (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2
      const inCross = (y >= 13 && y <= 18 && x >= 5 && x <= 26) ||
                      (x >= 13 && x <= 18 && y >= 5 && y <= 26)
      if (!inCircle) {
        buf[i] = 0; buf[i+1] = 0; buf[i+2] = 0; buf[i+3] = 0 // transparent
      } else if (inCross) {
        buf[i] = 255; buf[i+1] = 255; buf[i+2] = 255; buf[i+3] = 255 // white
      } else {
        buf[i] = 0x3b; buf[i+1] = 0x82; buf[i+2] = 0xf6; buf[i+3] = 255 // #3b82f6 blue
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

function createTray() {
  const icon = buildTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('ERP 订单同步工具')
  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: '退出', click: () => { forceQuit = true; app.quit() } },
  ])
  tray.setContextMenu(menu)
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })
}

function createWindow() {
  const userData = app.getPath('userData')
  CONFIG_PATH = join(userData, 'config.json')

  for (const mod of Object.values(platformModules)) {
    mod.setAppBasePath?.(userData)
  }

  mainWindow = new BrowserWindow({
    width: 1100, height: 750,
    title: 'ERP 订单同步工具',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  // Intercept close button
  mainWindow.on('close', async (e) => {
    if (forceQuit) return // allow quit from tray menu
    e.preventDefault()
    const { response } = await dialog.showMessageBox(mainWindow!, {
      type: 'question',
      buttons: ['最小化到托盘', '直接退出', '取消'],
      defaultId: 0,
      cancelId: 2,
      title: '关闭同步工具',
      message: '请选择关闭方式',
      detail: '最小化到托盘后，定时抓取仍会继续运行。',
    })
    if (response === 0) {
      mainWindow?.hide()
    } else if (response === 1) {
      forceQuit = true
      app.quit()
    }
    // response === 2: cancel, do nothing
  })
}

app.whenReady().then(async () => {
  // Required on Windows for system notifications to appear
  app.setAppUserModelId('com.erp.sync-tool')
  createWindow()
  createTray()

  // Auto-fetch ERP config on startup if credentials are saved
  const cfg = loadLocalConfig()
  if (cfg.erpUrl && cfg.apiToken) {
    // Retry up to 5 times with increasing delay — network/DNS may not be ready at startup
    const tryFetch = async (attempt: number): Promise<void> => {
      try {
        const url = cfg.erpUrl.startsWith('http') ? cfg.erpUrl : `http://${cfg.erpUrl}`
        const data = await new Promise<unknown>((resolve, reject) => {
          const parsed = new URL(`${url}/api/online-orders/config`)
          const isHttps = parsed.protocol === 'https:'
          const options: http.RequestOptions = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: { Authorization: `Bearer ${cfg.apiToken}` },
          }
          const req = (isHttps ? https : http).request(options, res => {
            let body = ''
            res.on('data', chunk => { body += chunk })
            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`))
              else try { resolve(JSON.parse(body)) } catch { reject(new Error('Invalid JSON')) }
            })
          })
          req.on('error', reject)
          req.end()
        })
        cachedErpConfig = data as ErpConfig
        startScheduler()
        // Send to renderer — if window is already loaded send directly, otherwise wait
        if (mainWindow?.webContents.isLoading()) {
          mainWindow?.webContents.once('did-finish-load', () => {
            mainWindow?.webContents.send('erp:configLoaded', cachedErpConfig)
          })
        } else {
          mainWindow?.webContents.send('erp:configLoaded', cachedErpConfig)
        }
      } catch (e) {
        if (attempt < 5) {
          const delay = attempt * 3000 // 3s, 6s, 9s, 12s, 15s
          setTimeout(() => tryFetch(attempt + 1), delay)
        }
        // else give up silently — user can manually reconnect
      }
    }
    // Wait 2s before first attempt to let network initialize
    setTimeout(() => tryFetch(1), 2000)
  }
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { /* do nothing — tray keeps app alive */ } })
app.on('before-quit', async (e) => {
  forceQuit = true
  // Gracefully close all browser contexts so Chromium can flush session/cookies to disk
  const contexts = [...platformContexts.values()]
  const moduleCloses = Object.values(platformModules).map(mod => (mod as { closeContext?: () => Promise<void> }).closeContext?.())
  if (contexts.length > 0 || moduleCloses.some(Boolean)) {
    e.preventDefault()
    await Promise.allSettled([
      ...contexts.map(ctx => ctx.close().catch(() => void 0)),
      ...moduleCloses.map(p => p?.catch(() => void 0)),
    ])
    platformContexts.clear()
    platformPages.clear()
    app.quit()
  }
})
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ── IPC: config ───────────────────────────────────────────────────────────────
ipcMain.handle('config:load', () => loadLocalConfig())
ipcMain.handle('config:save', (_e, config: LocalConfig) => {
  saveLocalConfig(config)
  // Restart scheduler so new scheduledTimes take effect immediately
  if (cachedErpConfig) startScheduler()
  return true
})

// ── IPC: site overrides ───────────────────────────────────────────────────────
ipcMain.handle('config:getSiteOverride', (_e, siteId: string) => {
  const cfg = loadLocalConfig()
  return cfg.siteOverrides?.[siteId] ?? null
})
ipcMain.handle('config:setSiteOverride', (_e, siteId: string, override: Record<string, unknown> | null) => {
  const cfg = loadLocalConfig()
  if (!cfg.siteOverrides) cfg.siteOverrides = {}
  if (override === null) {
    delete cfg.siteOverrides[siteId]
  } else {
    cfg.siteOverrides[siteId] = override
  }
  saveLocalConfig(cfg)
  return true
})
ipcMain.handle('config:getErpConfig', () => cachedErpConfig ?? null)

// ── IPC: fetch ERP config ─────────────────────────────────────────────────────
ipcMain.handle('erp:fetchConfig', async (_e, { erpUrl, apiToken }: LocalConfig) => {
  try {
    const url = erpUrl.startsWith('http') ? erpUrl : `http://${erpUrl}`
    console.log('[fetchConfig] raw erpUrl:', JSON.stringify(erpUrl), '→ normalized:', url)
    const data = await new Promise<unknown>((resolve, reject) => {
      const parsed = new URL(`${url}/api/online-orders/config`)
      console.log('[fetchConfig] parsed hostname:', parsed.hostname, 'port:', parsed.port, 'path:', parsed.pathname)
      const isHttps = parsed.protocol === 'https:'
      const options: http.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { Authorization: `Bearer ${apiToken}` },
      }
      const req = (isHttps ? https : http).request(options, res => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`))
          } else {
            try { resolve(JSON.parse(body)) } catch { reject(new Error('Invalid JSON response')) }
          }
        })
      })
      req.on('error', reject)
      req.end()
    })
    cachedErpConfig = data as ErpConfig
    startScheduler()
    return { success: true, data }
  } catch (e) {
    return { success: false, error: String(e) }
  }
})

// ── IPC: browser visibility ───────────────────────────────────────────────────
ipcMain.handle('browser:setVisibility', async (_e, show: boolean) => {
  const cfg = loadLocalConfig()
  cfg.showBrowser = show
  saveLocalConfig(cfg)
  if (cachedErpConfig) cachedErpConfig = { ...cachedErpConfig, _showBrowser: show }
  await setBrowserVisibility(show)
  return true
})

// Per-site browser visibility toggle
ipcMain.handle('browser:setSiteVisibility', async (_e, siteId: string, show: boolean) => {
  const cfg = loadLocalConfig()
  if (!cfg.showBrowserPerSite) cfg.showBrowserPerSite = {}
  cfg.showBrowserPerSite[siteId] = show
  saveLocalConfig(cfg)

  const x = show ? 100 : -4800
  const y = show ? 100 : -4800
  const ctx = platformContexts.get(siteId)
  if (ctx) {
    try {
      const pages = ctx.pages()
      const page = pages[0]
      if (page) {
        const cdp = await ctx.newCDPSession(page)
        const { windowId } = await cdp.send('Browser.getWindowForTarget')
        await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: x, top: y, windowState: 'normal' } })
        await cdp.detach()
      }
    } catch (e) {
      console.log(`[setSiteVisibility] CDP error for ${siteId}:`, e)
    }
  }
  return true
})

// ── IPC: sync status ──────────────────────────────────────────────────────────
ipcMain.handle('sync:getStatus', () => ({ syncing: [...syncingSet] }))
ipcMain.handle('sync:restartScheduler', () => {
  if (cachedErpConfig) {
    startScheduler()
    return { success: true, message: '调度器已重启' }
  }
  return { success: false, message: '未连接 ERP，无法启动调度器' }
})

// ── CSV serialization ─────────────────────────────────────────────────────────
function ordersToCSV(orders: Record<string, unknown>[]): string {
  if (orders.length === 0) return ''
  const keys = [
    'orderNo', 'platform', 'status', 'merchantName', 'productName', 'variantName',
    'itemTitle', 'itemSku', 'totalAmount', 'rentPrice', 'deposit', 'insurancePrice',
    'duration', 'rentStartDate', 'returnDeadline', 'customerName', 'recipientPhone',
    'address', 'logisticsCompany', 'trackingNumber', 'latestLogisticsInfo',
    'returnLogisticsCompany', 'returnTrackingNumber', 'returnLatestLogisticsInfo',
    'promotionChannel', 'source', 'sourceContact', 'customerXianyuId', 'productId',
    'createdAt'
  ]
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [keys.join(','), ...orders.map(o => keys.map(k => esc(o[k])).join(','))].join('\n')
}

// ── Push CSV to ERP (pure Node http — avoids Electron Blob/FormData issues) ──
async function pushToErp(erpUrl: string, apiToken: string, csv: string): Promise<{ upserted: number; failed: number; rawResponse?: string }> {
  return new Promise((resolve, reject) => {
    const boundary = '----SyncToolBoundary' + Date.now()
    // Prepend UTF-8 BOM so ERP import API detects encoding correctly
    const csvBuf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(csv, 'utf-8')])
    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="orders.csv"\r\n` +
      `Content-Type: text/csv\r\n\r\n`
    )
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
    const body = Buffer.concat([header, csvBuf, footer])

    const url = new URL(`${erpUrl.startsWith('http') ? erpUrl : 'http://' + erpUrl}/api/online-orders/import`)
    const isHttps = url.protocol === 'https:'
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      }
    }

    const req = (isHttps ? https : http).request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
          return
        }
        let upserted = 0, failed = 0
        for (const line of data.split('\n')) {
          if (!line.trim()) continue
          try {
            const obj = JSON.parse(line)
            if (obj.type === 'done') { upserted = obj.upserted ?? 0; failed = obj.failed ?? 0 }
          } catch { /* ignore */ }
        }
        resolve({ upserted, failed, rawResponse: data.slice(0, 500) })
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function sendLog(siteId: string, msg: string) {
  mainWindow?.webContents.send('sync:log', { siteId, msg })
}

function sendSyncStatus(siteId: string, syncing: boolean) {
  mainWindow?.webContents.send('sync:status', { siteId, syncing })
}

function notifyAttentionNeeded(siteName: string, siteId: string, reason: string) {
  console.log(`[notify] notifyAttentionNeeded called: ${siteName} - ${reason}`)
  // System notification bubble
  if (Notification.isSupported()) {
    console.log('[notify] Notification.isSupported() = true, showing...')
    new Notification({
      title: `需要人工介入 — ${siteName}`,
      body: reason,
      urgency: 'critical',
    }).show()
  } else {
    console.log('[notify] Notification.isSupported() = false')
  }
  // Focus the browser tab for this site
  focusPageForSite(siteId)
}

// ── Core sync runner ──────────────────────────────────────────────────────────
async function runPlatformSync(
  siteId: string,
  erpUrl: string,
  apiToken: string,
  erpConfig: ErpConfig,
  showBrowser: boolean
) {
  if (syncingSet.has(siteId)) {
    sendLog(siteId, `已在抓取中，跳过`)
    return
  }
  syncingSet.add(siteId)
  sendSyncStatus(siteId, true)

  try {
    const site = erpConfig.sites?.find(s => s.id === siteId)
    const platformKey = detectPlatformKey(siteId, site?.name || '')
    const mod = platformModules[platformKey]
    if (!mod) { sendLog(siteId, `未知平台: ${platformKey}`); return }

    sendLog(siteId, `[${site?.name ?? siteId}] 开始初始化...`)
    const localConfig = loadLocalConfig()
    const mergedConfig = applyLocalOverrides(erpConfig, localConfig)
    // Override headless based on per-site or global showBrowser setting from local config
    const effectiveShowBrowser = localConfig.showBrowserPerSite[siteId] ?? localConfig.showBrowser
    const configWithBrowser = { ...mergedConfig, headless: !effectiveShowBrowser, _showBrowser: effectiveShowBrowser }
    // Inject merged config into all platform modules (not just zanchen)
    for (const m of Object.values(platformModules)) {
      m.setExternalConfig?.(configWithBrowser as unknown as Parameters<typeof zanchenMod.setExternalConfig>[0])
    }
    mod.clearCollectedOrders()

    const startFn = mod[startFnNames[platformKey]] as ((id: string) => Promise<unknown>) | undefined
    const getStatusFn = mod[getStatusFnNames[platformKey]] as (() => { status: string; logs?: string[]; needsAttention?: boolean; message?: string }) | undefined
    if (!startFn) { sendLog(siteId, `找不到启动函数`); return }

    // Inject shared page so each platform gets its own Chromium context
    const sharedPage = await getPageForSite(siteId, showBrowser)
    const siteCtx = platformContexts.get(siteId)!
    mod.setSharedPage?.(sharedPage, siteCtx)

    // Register context-rebuild callback so memory refresh re-registers the new context with main process
    const setOnContextRebuilt = mod['setOnContextRebuilt'] as ((cb: (page: Page, ctx: BrowserContext) => void) => void) | undefined
    setOnContextRebuilt?.((newPage, newCtx) => {
      platformContexts.set(siteId, newCtx)
      platformPages.set(siteId, newPage)
      sendLog(siteId, `[Memory] 新浏览器上下文已注册到主进程`)
      // If browser should be visible, move the new window on-screen
      const cfg = loadLocalConfig()
      const shouldShow = cfg.showBrowserPerSite[siteId] ?? cfg.showBrowser
      if (shouldShow) {
        newCtx.newCDPSession(newPage).then(cdp =>
          cdp.send('Browser.getWindowForTarget').then(({ windowId }) =>
            cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 100, top: 100, windowState: 'normal' } })
              .then(() => cdp.detach())
          )
        ).catch(() => void 0)
      }
    })

    sendLog(siteId, `[${site?.name ?? siteId}] 启动抓取...`)
    const syncPromise = startFn(siteId)

    // Poll status, forward logs, detect attention needed
    let lastLogCount = 0
    let attentionNotified = false
    let browserShownForAttention = false
    let totalUpserted = 0
    let totalFailed = 0
    const BATCH_SIZE = 200

    const flushBatch = async (orders: Record<string, unknown>[]) => {
      if (orders.length === 0) return
      const sample = orders[0]
      sendLog(siteId, `[Debug] 样本订单: orderNo=${sample['orderNo']}, platform=${sample['platform']}, status=${sample['status']}`)
      const csv = ordersToCSV(orders)
      sendLog(siteId, `[${site?.name ?? siteId}] 推送 ${orders.length} 条到 ERP...`)
      try {
        const { upserted, failed, rawResponse } = await pushToErp(erpUrl, apiToken, csv)
        sendLog(siteId, `[Debug] ERP 响应: ${rawResponse}`)
        totalUpserted += upserted
        totalFailed += failed
        sendLog(siteId, `[${site?.name ?? siteId}] 本批写入 ${upserted} 条，失败 ${failed} 条（累计写入 ${totalUpserted} 条）`)
      } catch (pushErr) {
        sendLog(siteId, `[Error] 推送 ERP 失败: ${pushErr}`)
      }
    }

    const poll = async () => {
      while (true) {
        await new Promise(r => setTimeout(r, 1000))
        const status = getStatusFn?.()
        if (status?.logs) {
          const newLogs = status.logs.slice(lastLogCount)
          for (const log of newLogs) sendLog(siteId, log)
          lastLogCount = status.logs.length
        }
        if (status?.needsAttention && !attentionNotified) {
          attentionNotified = true
          // Auto show browser when attention needed
          if (!currentShowBrowser) {
            browserShownForAttention = true
            await setBrowserVisibility(true)
          }
          // Bring the platform's tab to front
          const page = platformPages.get(siteId)
          if (page && !page.isClosed()) await page.bringToFront().catch(() => void 0)
          notifyAttentionNeeded(site?.name ?? siteId, siteId, status.message ?? '需要人工介入')
        }
        // When attention resolved (login succeeded), restore browser visibility
        if (browserShownForAttention && !status?.needsAttention && status?.status === 'running') {
          browserShownForAttention = false
          attentionNotified = false // allow re-notify if needed again
          const cfg = loadLocalConfig()
          if (!cfg.showBrowser) await setBrowserVisibility(false)
        }

        // Incremental push: flush every BATCH_SIZE orders collected so far
        const collected = mod.getCollectedOrders()
        if (collected.length >= BATCH_SIZE) {
          mod.clearCollectedOrders()
          await flushBatch(collected)
        }

        // Stop polling when sync is done (idle/success/error), keep polling during awaiting_user
        if (!status || status.status === 'idle' || status.status === 'success' || status.status === 'error') break
      }
    }

    await Promise.all([syncPromise, poll()])

    // Flush any remaining orders after sync completes
    const remaining = mod.getCollectedOrders()
    sendLog(siteId, `[${site?.name ?? siteId}] 抓取完成，剩余 ${remaining.length} 条待推送`)
    if (remaining.length > 0) {
      mod.clearCollectedOrders()
      await flushBatch(remaining)
    }
    sendLog(siteId, `[${site?.name ?? siteId}] 全部完成，累计写入 ${totalUpserted} 条，失败 ${totalFailed} 条`)
  } catch (e) {
    const msg = String(e)
    // Browser was closed externally — clear this site's context so next run starts fresh
    if (msg.includes('Target page, context or browser has been closed') || msg.includes('browserContext') || msg.includes('browser has been closed')) {
      platformContexts.delete(siteId)
      platformPages.delete(siteId)
      sendLog(siteId, `浏览器已关闭，已重置状态，请重新点击抓取`)
    } else {
      sendLog(siteId, `错误: ${msg}`)
    }
  } finally {
    syncingSet.delete(siteId)
    sendSyncStatus(siteId, false)
  }
}

// ── IPC: trigger sync ─────────────────────────────────────────────────────────
ipcMain.handle('platform:sync', async (_e, { siteId, erpUrl, apiToken, erpConfig, showBrowser }: {
  siteId: string; erpUrl: string; apiToken: string; erpConfig: ErpConfig; showBrowser: boolean
}) => {
  cachedErpConfig = erpConfig
  // Fire and forget — renderer tracks status via sync:status events
  runPlatformSync(siteId, erpUrl, apiToken, erpConfig, showBrowser)
  return { success: true }
})

// ── IPC: stop sync ────────────────────────────────────────────────────────────
ipcMain.handle('platform:stop', async (_e, siteId: string) => {
  const site = cachedErpConfig?.sites?.find(s => s.id === siteId)
  const platformKey = detectPlatformKey(siteId, site?.name || '')
  const mod = platformModules[platformKey]
  if (!mod) return { success: false, error: 'unknown platform' }
  const stopFn = mod[stopFnNames[platformKey]] as (() => Promise<unknown>) | undefined
  if (stopFn) {
    await stopFn().catch(() => void 0)
  } else {
    syncingSet.delete(siteId)
    sendSyncStatus(siteId, false)
    sendLog(siteId, '已停止')
  }
  // Navigate page to blank to interrupt any blocked playwright awaits,
  // without closing the context (preserves login session)
  const page = platformPages.get(siteId)
  if (page && !page.isClosed()) {
    page.goto('about:blank').catch(() => void 0)
  }
  return { success: true }
})

ipcMain.handle('erp:importOrders', async (_e, { erpUrl, apiToken, csvContent }: {
  erpUrl: string; apiToken: string; csvContent: string
}) => {
  try {
    const result = await pushToErp(erpUrl, apiToken, csvContent)
    return { success: true, ...result }
  } catch (e) {
    return { success: false, error: String(e) }
  }
})
