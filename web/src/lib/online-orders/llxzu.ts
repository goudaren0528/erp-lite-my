import path from "path"
import fs from "fs"
import net from "net"
import { chromium, type BrowserContext, type Page } from "playwright"
import { loadConfig, type SiteConfig, type OnlineOrdersConfig } from "./zanchen"
import { schedulerLogger } from "./scheduler"
import { prisma } from "@/lib/db"
import { autoMatchSpecId } from "@/lib/spec-auto-match"

// Re-use types or define specific ones
export type LlxzuStatus = {
  status: "idle" | "running" | "awaiting_user" | "error" | "success"
  message?: string
  needsAttention?: boolean
  logs?: string[]
  lastRunAt?: string
}

type LlxzuRuntime = {
  status: LlxzuStatus
  context?: BrowserContext
  page?: Page
  headless?: boolean
  shouldStop?: boolean
}

type LlxzuParsedOrder = {
  orderNo: string
  customerName: string
  recipientPhone: string
  address: string
  totalAmount: number
  rentPrice: number
  deposit: number
  status: string
  rentStartDate?: Date
  returnDeadline?: Date
  duration: number
  platform: string
  productName: string
  variantName: string
  itemTitle: string
  itemSku: string
  logisticsCompany?: string
  trackingNumber: string
  promotionChannel: string
  specId?: string
  createdAt?: Date
}

const globalForLlxzu = globalThis as unknown as { llxzuRuntime?: LlxzuRuntime }

const runtime: LlxzuRuntime = globalForLlxzu.llxzuRuntime ?? {
  status: { status: "idle", logs: [] },
  shouldStop: false
}
globalForLlxzu.llxzuRuntime = runtime

function getOriginFromUrl(url: string) {
  try {
    return new URL(url).origin
  } catch {
    return ""
  }
}

function getDefaultBrowserUserAgent() {
  if (process.platform === "linux") {
    return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  }
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
}

function getDefaultExtraHeaders() {
  return {
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  }
}

async function findFreeTcpPort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      server.close(() => {
        if (addr && typeof addr === "object" && typeof addr.port === "number") {
          resolve(addr.port)
        } else {
          reject(new Error("Failed to allocate a free port"))
        }
      })
    })
  })
}

async function readCdpPort(userDataDir: string) {
  const filePath = path.join(userDataDir, "cdp.json")
  try {
    const raw = await fs.promises.readFile(filePath, "utf8")
    const obj = JSON.parse(raw) as { port?: unknown }
    const port = typeof obj.port === "number" ? obj.port : Number(obj.port)
    return Number.isFinite(port) && port > 0 ? port : null
  } catch {
    return null
  }
}

async function writeCdpPort(userDataDir: string, port: number) {
  const filePath = path.join(userDataDir, "cdp.json")
  await fs.promises.mkdir(userDataDir, { recursive: true }).catch(() => void 0)
  await fs.promises.writeFile(filePath, JSON.stringify({ port }), "utf8").catch(() => void 0)
}

async function tryAttachToExistingCdp(userDataDir: string) {
  const port = await readCdpPort(userDataDir)
  if (!port) return null

  try {
    const browser = await Promise.race([
      chromium.connectOverCDP(`http://127.0.0.1:${port}`),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("CDP connect timeout")), 1500)),
    ])

    const contexts = browser.contexts()
    const ctx = contexts[0]
    if (!ctx) {
      await browser.close().catch(() => void 0)
      return null
    }
    return ctx
  } catch {
    return null
  }
}

async function waitRandom(page: Page, minMs: number, maxMs: number) {
  const span = Math.max(maxMs - minMs, 0)
  const ms = minMs + Math.floor(Math.random() * (span + 1))
  await page.waitForTimeout(ms)
}

async function simulateHumanMouse(page: Page, minMoves = 2, maxMoves = 5) {
  try {
    const size = page.viewportSize() || ({ width: 1280, height: 800 } as { width: number; height: number })
    const moves = minMoves + Math.floor(Math.random() * (Math.max(maxMoves - minMoves, 0) + 1))
    for (let i = 0; i < moves; i += 1) {
      const x = Math.max(1, Math.floor(Math.random() * (size.width - 2)))
      const y = Math.max(1, Math.floor(Math.random() * (size.height - 2)))
      const steps = 8 + Math.floor(Math.random() * 12)
      await page.mouse.move(x, y, { steps }).catch(() => void 0)
      await page.waitForTimeout(100 + Math.floor(Math.random() * 250))
    }
  } catch {
    void 0
  }
}

async function simulateHumanScroll(page: Page, minScrolls = 2, maxScrolls = 5) {
  try {
    const scrolls = minScrolls + Math.floor(Math.random() * (Math.max(maxScrolls - minScrolls, 0) + 1))
    for (let i = 0; i < scrolls; i += 1) {
      const dx = Math.floor(Math.random() * 7) - 3
      const dy = 180 + Math.floor(Math.random() * 780)
      await page.mouse.wheel(dx, dy).catch(() => void 0)
      await page.waitForTimeout(120 + Math.floor(Math.random() * 380))
    }
  } catch {
    void 0
  }
}

function sanitizeSelector(raw?: string) {
  const text = raw?.trim() || ""
  if (!text) return ""
  return text.replace(/([>+~]\s*)+$/g, "").replace(/,\s*$/g, "").trim()
}

async function clickNav(page: Page, selector: string) {
  const sel = sanitizeSelector(selector)
  if (!sel) return false
  for (let i = 0; i < 4; i += 1) {
    try {
      const loc = page.locator(sel).first()
      await loc.waitFor({ state: "visible", timeout: 8000 })
      await simulateHumanMouse(page, 1, 2)
      await waitRandom(page, 600, 1800)
      await loc.click({ timeout: 8000, force: true })
      await waitRandom(page, 900, 2200)
      return true
    } catch {
      await page.waitForTimeout(800)
    }
  }
  return false
}

async function openLlxzuOrderListByClicks(page: Page) {
  const orderTab =
    "#root > div > div.ant-layout.css-d1kefi > div > header.ant-layout-header.css-d1kefi.ant-pro-layout-header.ant-pro-layout-header-fixed-header.ant-pro-layout-header-mix.ant-pro-layout-header-fixed-header-action.ant-pro-layout-header-header.css-16e1sxi > div > div > div.ant-pro-top-nav-header-menu.css-16e1sxi > ul > li:nth-child(4) > span > a"
  const orderListMenu =
    "#app > div.app-wrapper.openSidebar > div.sidebar-container.has-logo > div.el-scrollbar > div.scrollbar-wrapper.el-scrollbar__wrap > div > ul > div:nth-child(6) > li > ul > div:nth-child(1) > a > li"

  const ok1 = await clickNav(page, orderTab)
  const ok2 = await clickNav(page, orderListMenu)
  if (!ok1 && !ok2) return false
  await simulateHumanScroll(page, 1, 3)
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => void 0)
  return true
}

function getLogFilePath() {
  const date = new Date().toISOString().split('T')[0]
  const logDir = path.join(process.cwd(), "logs")
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  return path.join(logDir, `llxzu-${date}.log`)
}

export function getLlxzuStatus() {
    return runtime.status
}

export function getRunningPage() {
    return runtime.page
}

export function stopLlxzuSync() {
    runtime.shouldStop = true
    appendLog("User requested stop.")
    // Do NOT close context — preserves login session for next run
    updateStatus({ status: "idle", message: "已停止" })
}

export async function restartLlxzuBrowser() {
    appendLog("Browser restart requested.")
    runtime.shouldStop = true
    try {
        if (runtime.context) {
            await runtime.context.close().catch(() => void 0)
            runtime.context = undefined
            runtime.page = undefined
            appendLog("Browser context closed.")
        }
    } catch { void 0 }
    updateStatus({ status: "idle", message: "\u6d4f\u89c8\u5668\u5df2\u91cd\u542f\uff0c\u53ef\u91cd\u65b0\u5f00\u59cb\u540c\u6b65" })
    return { success: true }
}

function updateStatus(updates: Partial<LlxzuStatus>) {
    const currentLogs = runtime.status.logs || []
    let newLogs = currentLogs
    
    // If updates include new logs (rarely used, usually via appendLog), merge them
    if (updates.logs && updates.logs !== currentLogs) {
        newLogs = updates.logs
    }

    runtime.status = {
        ...runtime.status,
        ...updates,
        logs: newLogs
    }
}

function appendLog(message: string) {
  try {
    const filePath = getLogFilePath()
    const timestamp = new Date().toLocaleTimeString()
    const fullMsg = `[${timestamp}] ${message}`
    
    const logDir = path.dirname(filePath)
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
    }

    fs.appendFileSync(filePath, fullMsg + "\n")
    console.log(`[Llxzu] ${message}`)
    
    const currentLogs = runtime.status.logs || []
    updateStatus({
        logs: [...currentLogs, fullMsg].slice(-2000)
    })
    
    try {
        if (schedulerLogger && schedulerLogger.log) {
            schedulerLogger.log(`[零零享] ${message}`)
        }
    } catch(err) {
        console.error("Failed to push to scheduler log", err)
    }
  } catch (e) {
    console.error("Failed to write log", e)
    const timestamp = new Date().toLocaleTimeString()
    const fullMsg = `[${timestamp}] ${message}`
    const currentLogs = runtime.status.logs || []
    updateStatus({
        logs: [...currentLogs, fullMsg].slice(-2000)
    })
  }
}

async function ensureContext(headless: boolean): Promise<BrowserContext> {
  // Determine final headless mode first (needed for context reuse check)
  let finalHeadless: boolean
  if (process.platform === 'linux' && !process.env.DISPLAY) {
      throw new Error(`LLXZU requires headful Chrome. DISPLAY is missing (requestedHeadless=${headless}).`)
  } else {
      // llxzu requires headful mode to bypass bot detection
      // On Linux with Xvfb (DISPLAY=:99), this works fine
      // On Windows/Mac local dev, this opens a real Chrome window
      finalHeadless = false
  }

  const userDataDir = path.join(process.cwd(), ".playwright", "llxzu")

  if (runtime.context) {
      try {
          runtime.context.pages(); 
          if (runtime.headless !== undefined && runtime.headless !== finalHeadless) {
              appendLog(`Switching headless mode from ${runtime.headless} to ${finalHeadless}. Closing existing context...`)
              await runtime.context.close().catch(() => void 0)
              runtime.context = undefined
              runtime.page = undefined
          } else {
              try {
                  await runtime.context.setExtraHTTPHeaders(getDefaultExtraHeaders())
              } catch {
                  void 0
              }
              return runtime.context
          }
      } catch {
          appendLog("Existing context seems broken or closed, recreating...")
          runtime.context = undefined
          runtime.page = undefined
      }
  }

  const attached = await tryAttachToExistingCdp(userDataDir)
  if (attached) {
    runtime.context = attached
    runtime.headless = finalHeadless
    try {
      await runtime.context.setExtraHTTPHeaders(getDefaultExtraHeaders())
    } catch {
      void 0
    }
    appendLog("Attached to existing Chrome via CDP.")
    return runtime.context
  }
  
  if (process.platform === 'linux' && !process.env.DISPLAY) {
      appendLog(`[System] Linux environment without DISPLAY detected, forcing headless mode.`)
  } else {
      appendLog(`[System] Using headful mode (DISPLAY=${process.env.DISPLAY || 'native'}) to bypass bot detection`)
  }

  appendLog(`Launching browser (headless: ${finalHeadless})`)

  // Common launch options
  const cdpPort = (await readCdpPort(userDataDir)) ?? (await findFreeTcpPort())
  await writeCdpPort(userDataDir, cdpPort)

  const launchOptions = {
    headless: finalHeadless,
    viewport: { width: 1366, height: 768 },
    userAgent: getDefaultBrowserUserAgent(),
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    extraHTTPHeaders: getDefaultExtraHeaders(),
    javaScriptEnabled: true,
    args: [
      `--remote-debugging-port=${cdpPort}`,
      `--remote-debugging-address=127.0.0.1`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  }

  try {
    // Prefer real Chrome to avoid bot detection (llxzu detects Playwright's bundled Chromium)
    // In Docker (Debian/bookworm), Google Chrome is installed at a fixed path
    const chromePaths = [
      // Linux (Docker container)
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      // macOS
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      // Windows
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ]
    const fs2 = await import('fs')
    const systemChromePath = chromePaths.find(p => fs2.existsSync(p))

    let launched = false

    // Try system Chrome binary first (most realistic, hardest to detect)
    if (systemChromePath) {
      try {
        appendLog(`Using system Chrome: ${systemChromePath}`)
        runtime.context = await chromium.launchPersistentContext(userDataDir, {
          ...launchOptions,
          executablePath: systemChromePath,
        })
        appendLog(`Browser launched with system Chrome`)
        launched = true
      } catch (err) {
        appendLog(`System Chrome failed: ${err}`)
      }
    }

    // Fall back to Playwright channel or bundled Chromium
    if (!launched) {
      for (const channel of ['chrome', 'chromium', undefined] as Array<'chrome' | 'chromium' | undefined>) {
        try {
          appendLog(`Trying channel: ${channel ?? 'playwright-bundled'}`)
          runtime.context = await chromium.launchPersistentContext(userDataDir, {
            ...launchOptions,
            ...(channel ? { channel } : {}),
          })
          appendLog(`Browser launched with channel: ${channel ?? 'playwright-bundled'}`)
          launched = true
          break
        } catch (err) {
          appendLog(`Channel ${channel ?? 'playwright-bundled'} not available: ${err}`)
        }
      }
    }

    if (!launched || !runtime.context) {
      throw new Error("No usable browser found")
    }
    runtime.headless = finalHeadless

    // Stealth: injected before any page script runs
    await runtime.context.addInitScript(() => {
      // 1. Remove webdriver flag — most basic check
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })

      // 2. Realistic plugins array (empty = headless giveaway)
      const mockPlugin = (name: string, filename: string, mimeTypes: { type: string; suffixes: string; description: string }[]) => {
        const plugin = { name, filename, description: name, length: mimeTypes.length } as unknown as Plugin
        mimeTypes.forEach((mt, i) => {
          const mime = { type: mt.type, suffixes: mt.suffixes, description: mt.description, enabledPlugin: plugin } as MimeType
          Object.defineProperty(plugin, i, { value: mime })
        })
        return plugin
      }
      const fakePlugins = [
        mockPlugin('Chrome PDF Plugin', 'internal-pdf-viewer', [{ type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' }]),
        mockPlugin('Chrome PDF Viewer', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', [{ type: 'application/pdf', suffixes: 'pdf', description: '' }]),
        mockPlugin('Native Client', 'internal-nacl-plugin', [
          { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },
          { type: 'application/x-pnacl', suffixes: '', description: 'Portable Native Client Executable' },
        ]),
      ]
      Object.defineProperty(navigator, 'plugins', {
        get: () => Object.assign(fakePlugins, { item: (i: number) => fakePlugins[i], namedItem: (n: string) => fakePlugins.find(p => p.name === n) ?? null, refresh: () => {} }),
      })

      // 3. Languages
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'] })

      // 4. Hardware fingerprint
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })

      // 5. Realistic chrome object
      const win = window as unknown as { chrome?: Record<string, unknown> }
      if (!win.chrome) {
        win.chrome = {
          app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
          runtime: { OnInstalledReason: {}, OnRestartRequiredReason: {}, PlatformArch: {}, PlatformNaclArch: {}, PlatformOs: {}, RequestUpdateCheckStatus: {} },
          loadTimes: () => ({}),
          csi: () => ({}),
        } as unknown as Record<string, unknown>
      }

      // 6. Permissions API — avoid notification permission fingerprint
      const perms = (window.navigator as unknown as { permissions?: { query?: (params: PermissionDescriptor) => Promise<PermissionStatus> } }).permissions
      const origQuery = perms?.query ? perms.query.bind(perms) : undefined
      if (perms && origQuery) {
        perms.query = (params: PermissionDescriptor) =>
          params.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission, onchange: null } as PermissionStatus)
            : origQuery(params)
      }

      // 7. Hide automation-related properties on window
      const win2 = window as unknown as { __playwright?: unknown; __pw_manual?: unknown; _phantom?: unknown }
      delete win2.__playwright
      delete win2.__pw_manual
      delete win2._phantom
    })
  } catch (e) {
    appendLog(`Failed to launch browser: ${e}`)
    throw e
  }
  
  return runtime.context
}

async function ensurePage(headless: boolean): Promise<Page> {
  // Check if headless mode needs to change — if so, don't reuse existing page
  const needsHeadlessChange = runtime.headless !== undefined &&
    runtime.headless !== (process.platform === 'linux' && !process.env.DISPLAY ? true : false)

  if (runtime.page && !runtime.page.isClosed() && !needsHeadlessChange) {
      appendLog("Reusing existing page session.");
      return runtime.page;
  }

  if (needsHeadlessChange && runtime.page) {
      appendLog("Headless mode changed, closing existing session...")
      await runtime.page.close().catch(() => {})
      runtime.page = undefined
  }
  
  const context = await ensureContext(headless)
  
  if (runtime.page) {
      if (!runtime.page.isClosed()) {
          try {
              await Promise.race([
                  runtime.page.title(),
                  new Promise((_, reject) => setTimeout(() => reject(new Error("Page check timeout")), 2000))
              ])
              return runtime.page
          } catch (e) {
              appendLog(`Previous page is unresponsive (${e}), recreating...`)
              try { await runtime.page.close().catch(() => {}) } catch {}
              runtime.page = undefined
          }
      } else {
          appendLog("Previous page was closed, creating new one...")
          runtime.page = undefined
      }
  }
  
  try {
      if (!context.pages) { 
           throw new Error("Context is invalid") 
      }
      
      const pages = context.pages()
      if (pages.length > 0 && !pages[0].isClosed()) {
          runtime.page = pages[0]
      } else {
          runtime.page = await context.newPage()
      }
      return runtime.page
  } catch (e) {
      appendLog(`Context error (${e}), restarting browser context...`)
      await runtime.context?.close().catch(() => {})
      runtime.context = undefined
      return ensurePage(headless)
  }
}

async function isOnLoginPage(page: Page, site: SiteConfig) {
  const url = page.url()

  // If URL clearly indicates we're logged in (order list page), return false immediately
  if (url.includes("/Order/OrderManage") || url.includes("/order/audit") || url.includes("/orderList")) {
    return false
  }

  if (site.loginUrl && url && url.includes("login")) return true

  // Check for LLXZU-specific login form elements (avoid generic "登录" button — it stays visible during SMS input)
  const loginHints = [
    "input[placeholder='请输入手机号']",
    "input[placeholder='请输入验证码']",
    "input#mobile",
    "input#smsLoginVerifyCode",
    site.selectors.login_button,
  ].filter(Boolean) as string[]

  for (const selector of loginHints) {
    try {
      if (await page.isVisible(selector, { timeout: 500 })) return true
    } catch {
      // ignore
    }
  }
  return false
}

async function login(page: Page, site: SiteConfig) {
  if (!site.loginUrl) return

  if (await isOnLoginPage(page, site) || page.url() === "about:blank") {
    appendLog(`Navigating to login: ${site.loginUrl}`)
    const origin = getOriginFromUrl(site.loginUrl)
    await page.goto(site.loginUrl, { waitUntil: "domcontentloaded", referer: origin ? `${origin}/` : undefined })
    // Wait for Vue SPA to render (hash routing needs extra time after domcontentloaded)
    await waitRandom(page, 2500, 4000)
  }

  if (await isOnLoginPage(page, site)) {
    const { username_input } = site.selectors

    // Step 1: Fill phone number with human-like typing
    if (username_input && site.username) {
      try {
        const input = await page.waitForSelector(username_input, { timeout: 8000 }).catch(() => null)
        const targetInput = input
          || await page.$("input[placeholder*='手机']").catch(() => null)
          || await page.$("input[placeholder*='mobile']").catch(() => null)
          || await page.$("input[placeholder*='请输入手机']").catch(() => null)
          || await page.$("input[type='tel']").catch(() => null)
          || await page.$("input#mobile").catch(() => null)
          || await page.$("input[name='mobile']").catch(() => null)
          || await page.$("input[name='phone']").catch(() => null)
          || await page.$("input[autocomplete='tel']").catch(() => null)

        if (targetInput) {
          appendLog("Filling phone number with human-like typing...")
          await targetInput.click()
          await waitRandom(page, 300, 700)
          // Clear existing value first
          await page.keyboard.press("Control+a")
          await page.keyboard.press("Delete")
          // Type character by character like a human
          for (const char of site.username) {
            await page.keyboard.type(char, { delay: 80 + Math.floor(Math.random() * 120) })
          }
          await waitRandom(page, 500, 1200)
        } else {
          // Debug: log all input elements found on page to help identify correct selector
          try {
            const allInputs = await page.$$eval("input", els =>
              els.map(el => ({
                id: el.id,
                name: el.name,
                type: el.type,
                placeholder: el.placeholder,
                className: el.className.substring(0, 80),
              }))
            )
            appendLog(`Could not find phone input field. All inputs on page: ${JSON.stringify(allInputs)}`)
          } catch {
            appendLog(`Could not find phone input field`)
          }
        }
      } catch (err) {
        appendLog(`Error filling username: ${err}`)
      }
    }

    // NOTE: 零零享需要先通过图片验证码才能获取短信验证码，不能自动点击，需人工在 remote-auth 界面操作
    updateStatus({ status: "awaiting_user", message: "需要人工介入: 请在远程界面完成图片验证码后获取短信验证码并登录", needsAttention: true })
    appendLog("需要人工介入: 检测到处于登录页 (零零享需短信验证)")

    const config = await loadConfig()
    if (config?.webhookUrls && config.webhookUrls.length > 0) {
      sendWebhookSimple(config, "零零享平台需要登录验证")
    }
  }

  // Wait up to 5 minutes for user to complete login
  const start = Date.now()
  const TIMEOUT_MS = 300_000
  let lastSmsRetryAt = Date.now()

  while (Date.now() - start < TIMEOUT_MS) {
    if (runtime.shouldStop) break

    const currentUrl = page.url()
    const stillOnLogin = await isOnLoginPage(page, site)

    if (!stillOnLogin && currentUrl !== "about:blank" && !currentUrl.includes("login")) {
      appendLog("Login appears successful.")
      updateStatus({ status: "running", message: "登录成功，继续执行...", needsAttention: false })
      return true
    }

    // Every 55s, remind user if still waiting (cannot auto-retry SMS due to image captcha requirement)
    if (stillOnLogin && Date.now() - lastSmsRetryAt > 55_000) {
      appendLog("Still on login page, waiting for user to complete image captcha + SMS verification...")
      lastSmsRetryAt = Date.now()
    }

    await page.waitForTimeout(1000)
  }

  throw new Error("Login timeout: user did not complete SMS verification within 5 minutes")
}

async function sendWebhookSimple(config: OnlineOrdersConfig, message: string) {
    if (!config?.webhookUrls || config.webhookUrls.length === 0) return
    
    let baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim()
    baseUrl = baseUrl.replace(/\/$/, "").replace(/^(https?:\/\/)+/, (m) => m.slice(0, m.indexOf('://') + 3))
    const remoteLink = baseUrl ? `${baseUrl}/online-orders/remote-auth` : "(未配置APP_URL)"
        
    const payload = {
        msgtype: "text" as const,
        text: {
            content: `[ERP Lite] 线上订单同步需要人工介入\n原因: ${message}\n远程处理链接: ${remoteLink}`
        }
    }
    
    for (const url of config.webhookUrls) {
        try {
            let finalPayload: { msgtype: "text"; text: { content: string } } | { msg_type: "text"; content: { text: string } } = payload
            if (url.includes("feishu") || url.includes("larksuite")) {
                finalPayload = {
                    msg_type: "text",
                    content: { text: payload.text.content }
                }
            }
            await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(finalPayload)
            })
            appendLog(`[Webhook] Sent notification to ${url}`)
        } catch (e) {
            console.error(`[Webhook] Error:`, e)
        }
    }
}

async function switchToAllOrdersTab(page: Page, selector: string) {
    appendLog(`Trying to switch to 'All Orders' tab using: ${selector}`)
    try {
        await page.waitForSelector(selector, { timeout: 5000 })
        await page.click(selector)
        appendLog("Clicked 'All Orders' tab, waiting for content update...")
        await page.waitForTimeout(2000) 
    } catch (e) {
        appendLog(`Failed to switch tab: ${e}`)
    }
}

async function handlePopup(page: Page) {
    try {
        const platformNotifyBtnSel = "body > div:nth-child(5) > div > div.ant-modal-wrap > div > div:nth-child(1) > div > div.ant-modal-body > div > div:nth-child(2) > button"
        try {
            const btn = page.locator(platformNotifyBtnSel).first()
            if (await btn.isVisible({ timeout: 400 })) {
                appendLog("Detected platform notification modal, clicking confirm button...")
                await btn.click({ force: true, timeout: 3000 })
                await page.waitForTimeout(900)
                return
            }
        } catch {
            void 0
        }

        try {
            const title = page.locator(".ant-modal-title:has-text('平台通知')").first()
            if (await title.isVisible({ timeout: 400 })) {
                const candidates = [
                    ".ant-modal-footer button.ant-btn-primary",
                    ".ant-modal-footer button:has-text('知道了')",
                    ".ant-modal-footer button:has-text('我知道了')",
                    ".ant-modal-footer button:has-text('确定')",
                    ".ant-modal-footer button:has-text('确认')",
                    ".ant-modal-body button:has-text('知道了')",
                    ".ant-modal-body button:has-text('我知道了')",
                    ".ant-modal-body button:has-text('确定')",
                    ".ant-modal-body button:has-text('确认')"
                ]
                for (const sel of candidates) {
                    try {
                        const btn = page.locator(sel).first()
                        if (await btn.isVisible({ timeout: 300 })) {
                            appendLog(`Detected platform notification modal, clicking: ${sel}`)
                            await btn.click({ force: true, timeout: 3000 })
                            await page.waitForTimeout(900)
                            return
                        }
                    } catch {
                        void 0
                    }
                }
            }
        } catch {
            void 0
        }

        // Generic popup handling
        const popupSelector = [
            "text=工单提醒",
            "div:has-text('工单反馈未处理')",
            ".ant-modal-title:has-text('工单提醒')", 
            "body > div.el-message-box__wrapper", 
            ".el-message-box__title:has-text('工单提醒')"
        ].join(",")

        const popup = await page.$(popupSelector).catch(() => null)
        
        if (popup) {
            appendLog("Detected generic popup.")
            let closeBtn = await page.$("button:has-text('稍后提醒')") || await page.$("text=稍后提醒")
            
            if (!closeBtn) {
                 closeBtn = await page.$("body > div.el-message-box__wrapper > div > div.el-message-box__btns > button:nth-child(1)")
            }
            
            if (closeBtn) {
                appendLog("Clicking close/later button to dismiss popup...")
                await closeBtn.click()
                await page.waitForTimeout(1000) 
            } else {
                const xBtn = await page.$(".ant-modal-close") || await page.$("button[aria-label='Close']") || await page.$(".el-message-box__headerbtn")
                if (xBtn) {
                    await xBtn.click()
                    await page.waitForTimeout(1000)
                }
            }
        }
    } catch (e) {
        appendLog(`Error handling popup: ${e}`)
    }
}

async function parseOrders(page: Page, site: SiteConfig): Promise<LlxzuParsedOrder[]> {
    const rowSelector = site.selectors.order_row_selectors
    const templateSelector = site.selectors.order_row_selector_template
    const parsedOrders: LlxzuParsedOrder[] = []
    
    if (!rowSelector && !templateSelector) {
        appendLog("No row selector configured, skipping parsing.")
        return []
    }

    let orderElements: (import("playwright").ElementHandle<SVGElement | HTMLElement>)[] = []

    if (templateSelector && templateSelector.includes("{i}")) {
        let useTemplate = true
        
        const start = site.selectors.order_row_index_start ? Number(site.selectors.order_row_index_start) : 1
        const end = site.selectors.order_row_index_end ? Number(site.selectors.order_row_index_end) : 20 
        const step = site.selectors.order_row_index_step ? Number(site.selectors.order_row_index_step) : 1
        
        appendLog(`Using template selector: ${templateSelector} (start=${start}, step=${step}, end=${end})`)
        
        const firstSelector = templateSelector.replace("{i}", String(start))
        
        try {
            await page.waitForSelector(firstSelector, { timeout: 5000 })
        } catch {
            appendLog(`Timeout waiting for first order row: ${firstSelector}.`)
            appendLog("Trying to fallback to generic table row selector...")
            
            const rows = await page.$$("table tbody tr")
            if (rows.length > 0) {
                appendLog(`Found ${rows.length} generic table rows. Using these instead.`)
                orderElements = rows
                useTemplate = false
            } else {
                appendLog("No generic table rows found either. Will try scanning template anyway.")
            }
        }

        if (useTemplate) {
            let consecutiveMisses = 0
            const MAX_CONSECUTIVE_MISSES = 10 

            for (let i = start; i <= end; i += step) {
                const currentSelector = templateSelector.replace("{i}", String(i))
                try {
                    const element = await page.$(currentSelector)
                    if (element) {
                        orderElements.push(element)
                        consecutiveMisses = 0
                    } else {
                        consecutiveMisses++
                        if (i === start) {
                            appendLog(`Failed to find first element with selector: ${currentSelector}`)
                        }
                        
                        if (consecutiveMisses >= MAX_CONSECUTIVE_MISSES) {
                            appendLog(`Stopped scanning after ${MAX_CONSECUTIVE_MISSES} consecutive missing items at index ${i}.`)
                            break
                        }
                    }
                } catch {
                }
            }
        }
    } else {
        const selector = rowSelector || templateSelector || ""
        try {
            await page.waitForSelector(selector, { timeout: 10000 })
        } catch {
            appendLog("Timeout waiting for order rows. Maybe no orders or wrong selector?")
            return []
        }
        orderElements = await page.$$(selector)
    }

    appendLog(`Found ${orderElements.length} orders on current page.`)
    const unknownStatusCounts = new Map<string, number>()

    for (const [index, element] of orderElements.entries()) {
        if (runtime.shouldStop) {
            appendLog("Processing interrupted by stop signal.")
            break
        }

        try {
            const fullText = await element.innerText()
            
            if (index < 3) {
                 const cleanText = fullText.replace(/\s+/g, ' ').substring(0, 500)
                 appendLog(`[Debug] Order ${index + 1} Raw: ${cleanText}`)
            }
            
            // NOTE: Generic parsing logic, similar to Youpin/Aolzu.
            // Adjust based on actual LLXZU HTML structure if needed.
            
            // 1. Order No
            let orderNo = ""
            
            // Try to find masked order number first, as it is common in LLXZU logs
            // Log: "订单号：012O****8640"
            const maskedOrderMatch = fullText.match(/(?:订单号|订单编号)[:：]?\s*([A-Za-z0-9]+\*{3,}[A-Za-z0-9]+)/)
            
            if (maskedOrderMatch) {
                // If we found a masked order number, we need to click it to reveal full number
                const maskedNo = maskedOrderMatch[1]
                appendLog(`Found masked order number: ${maskedNo}. Attempting to click to reveal...`)
                
                // Try to find the element containing this text and click it
                // We need to be careful not to click the whole row, but just the order number part
                // The order number is usually inside a span or div
                
                try {
                    // Search for element containing the masked text
                    const orderNoElement = await element.$(`text="${maskedNo}"`) || await element.$(`:text-matches("${maskedNo.replace(/\*/g, '\\*')}")`)
                    
                    if (orderNoElement) {
                        await orderNoElement.click()
                        // Wait a bit for the text to update
                        await page.waitForTimeout(500)
                        
                        // Re-fetch the text of the row after click
                        const newText = await element.innerText()
                        
                        // Try to find full order number now
                        // Pattern: O20260225... or similar long alphanumeric
                        const fullOrderMatch = newText.match(/(?:订单号|订单编号)[:：]?\s*([A-Za-z0-9]{15,})/)
                        if (fullOrderMatch) {
                            orderNo = fullOrderMatch[1]
                            appendLog(`Revealed full order number: ${orderNo}`)
                        } else {
                            // Fallback: look for the long string again
                            const fallbackMatch = newText.match(/O\d{20,}/)
                            if (fallbackMatch) {
                                orderNo = fallbackMatch[0]
                                appendLog(`Revealed full order number (fallback): ${orderNo}`)
                            }
                        }
                    } else {
                        appendLog("Could not find clickable element for masked order number.")
                    }
                } catch (clickErr) {
                    appendLog(`Failed to click order number: ${clickErr}`)
                }
            }
            
            // If we didn't find masked one or failed to reveal, try standard extraction
            if (!orderNo) {
                const orderNoMatch = fullText.match(/(?:订单号|订单编号)[:：]?\s*([A-Za-z0-9]{10,})/)
                if (orderNoMatch && !orderNoMatch[1].includes("*")) {
                    orderNo = orderNoMatch[1]
                }
            }
            
            if (!orderNo) {
                const fallbackMatch = fullText.match(/[A-Z0-9]{15,}/)
                if (fallbackMatch && !fallbackMatch[0].includes("*")) orderNo = fallbackMatch[0]
            }

            if (orderNo) {
                orderNo = orderNo.split(/\s+/)[0]
            }
            
            if (!orderNo) {
                if (index < 5) appendLog(`[Warning] No order number found for item ${index + 1}`)
                continue 
            }

            // 2. Product Name & Variant
            const lines = fullText.split('\n').map(l => l.trim()).filter(l => l)
            let productName = ""
            let variantName = ""
            
            const nameCandidates = lines.filter(l => 
                l.length > 5 && 
                !l.includes("订单编号") && 
                !l.includes("下单时间") && 
                !l.includes("发货时间") &&
                !l.includes("运单号") &&
                !l.includes("风控")
            )

            // Priority: take the line immediately after "商品信息" label
            const productInfoIdx = lines.findIndex(l => l.trim() === "商品信息")
            if (productInfoIdx !== -1 && lines[productInfoIdx + 1]) {
                productName = lines[productInfoIdx + 1].trim()
            } else {
                const brands = ["三星", "Samsung", "Galaxy", "Apple", "iPhone", "DJI", "大疆", "华为", "小米", "vivo", "OPPO", "MacBook", "iPad", "索尼", "Canon", "Nikon", "佳能", "尼康", "富士", "索尼"]
                const brandLine = nameCandidates.find(l => brands.some(b => l.includes(b)))
                if (brandLine) {
                    productName = brandLine
                } else {
                    // Fallback: skip date-like and order-no-like lines
                    const fallback = nameCandidates.find(l =>
                        !/^\d{4}-\d{2}-\d{2}/.test(l) &&
                        !/^\d{10,}$/.test(l) &&
                        !l.includes("订单号") &&
                        !l.includes("商铺") &&
                        !l.includes("渠道") &&
                        !l.includes("结算") &&
                        !l.includes("责任人")
                    )
                    productName = fallback || ""
                }
            }
            
            // Variant / Package
            const packageLineIndex = lines.findIndex(l => l.includes("套餐：") || l.includes("套餐:"))
            
            if (packageLineIndex !== -1) {
                const line = lines[packageLineIndex]
                if (line.length < 10 && lines[packageLineIndex + 1]) {
                    variantName = lines[packageLineIndex + 1]
                } else {
                    variantName = line
                }
                variantName = variantName.replace(/套餐[:：]?\s*/, "").trim()
            } else {
                 const altPackageLine = lines.find(l => (l.includes("套餐") || l.includes("标配") || l.includes("套装")) && l.length > 5)
                 if (altPackageLine) {
                     variantName = altPackageLine
                     variantName = variantName.replace(/^(套餐|标配|套装)[:：]?\s*/, "").trim()
                 }
            }
            
            // Promotion Channel
            let promotionChannel = ""
            const channelLine = lines.find(l => l.includes("订单来源") || l.includes("来源"))
            if (channelLine) {
                const parts = channelLine.split(/[:：]/)
                if (parts.length > 1) {
                    promotionChannel = parts[1].trim()
                }
            } else {
                 if (fullText.includes("支付宝-零零享")) {
                     promotionChannel = "支付宝-零零享"
                 } else if (fullText.includes("租物")) {
                     promotionChannel = "租物"
                 }
            }

            // 3. Status
            let status = "UNKNOWN"
            let rawStatus = ""
            
            const statusRules: Array<{ keywords: string[]; value: string }> = [
                { keywords: ["交易关闭", "已取消", "已关闭", "已拒绝", "申请取消"], value: "CLOSED" },
                { keywords: ["订单完成", "已完成", "已结清"], value: "COMPLETED" },
                { keywords: ["已买断"], value: "BOUGHT_OUT" },
                { keywords: ["逾期", "已逾期"], value: "OVERDUE" },
                { keywords: ["归还中", "退租中"], value: "RETURNING" },
                { keywords: ["待归还"], value: "RENTING" },
                { keywords: ["租用中", "使用中", "已签收"], value: "RENTING" },
                { keywords: ["明日到期"], value: "RENTING" },
                { keywords: ["待结算"], value: "RETURNING" },
                { keywords: ["今日未还款", "今日未还"], value: "RENTING" },
                { keywords: ["今日已还款", "今日已还"], value: "RETURNING" },
                { keywords: ["待确认收货"], value: "PENDING_RECEIPT" },
                { keywords: ["待收货"], value: "PENDING_RECEIPT" },
                { keywords: ["已发货"], value: "SHIPPED" },
                { keywords: ["待发货", "去发货"], value: "PENDING_SHIPMENT" },
                { keywords: ["下单待审核", "待审核", "审核中"], value: "PENDING_REVIEW" },
                { keywords: ["待支付"], value: "WAIT_PAY" },
                { keywords: ["申请售后"], value: "RETURNING" }
            ]
            
            for (const rule of statusRules) {
                const matchedKeyword = rule.keywords.find(k => fullText.includes(k))
                if (matchedKeyword) {
                    status = rule.value
                    rawStatus = matchedKeyword
                    break
                }
            }

            if (status === "UNKNOWN") {
                const statusFromLabel =
                    (fullText.match(/订单状态[:：]\s*([^\s]+)/) || [])[1] ||
                    (fullText.match(/当前状态[:：]\s*([^\s]+)/) || [])[1] ||
                    (fullText.match(/状态[:：]\s*([^\s]+)/) || [])[1] ||
                    ""
                rawStatus = statusFromLabel || rawStatus
            }
            
            if (index < 5) {
                appendLog(`[Debug] Order ${index + 1} Status Result: ${status} (Matched Keyword: "${rawStatus}")`)
            }

            if (status === "UNKNOWN") {
                const key = rawStatus || "UNIDENTIFIED"
                unknownStatusCounts.set(key, (unknownStatusCounts.get(key) || 0) + 1)
                // Capture a broader context
                const snippet = fullText.replace(/\s+/g, " ").substring(0, 300)
                // Use [System] to ensure it bypasses filters, and make it very clear
                appendLog(`[System] 零零享未知状态: 订单=${orderNo}, 提取状态="${key}", 全文片段=${snippet}`)
            }
            
            // 4. Money
            let rentPrice = 0
            let deposit = 0
            let totalAmount = 0

            // Strategy 1: "100(总)" format
            const moneyRegex = /([\d.]+)\s*\(([^)]+)\)/g
            const moneyMatches = [...fullText.matchAll(moneyRegex)]
            
            for (const match of moneyMatches) {
                const amount = parseFloat(match[1])
                const label = match[2]
                
                if (label.includes("总") && rentPrice === 0) {
                    rentPrice = amount
                } else if (label.includes("免押") || label.includes("押金")) {
                    deposit = amount
                }
            }
            
            // Strategy 2: "已付/总租金：¥74.7/¥74.7" or "总租金：¥74.7"
            if (rentPrice === 0) {
                 const complexRentMatch = fullText.match(/(?:已付\/)?总租金[:：]\s*[¥￥]?([\d.]+)\/[¥￥]?([\d.]+)/)
                 if (complexRentMatch) {
                     rentPrice = parseFloat(complexRentMatch[2])
                 } else {
                     const simpleRentMatch = fullText.match(/总租金[:：]\s*[¥￥]?([\d.]+)/)
                     if (simpleRentMatch) {
                         rentPrice = parseFloat(simpleRentMatch[1])
                     }
                 }
            }

            // Strategy 3: Fallback "100(总)" without space or variations
            if (rentPrice === 0) {
                const rentMatch = fullText.match(/￥?([\d.]+)\(总\)/)
                if (rentMatch) rentPrice = parseFloat(rentMatch[1])
            }
            
            // Strategy 4: "期数明细：¥74.7" if nothing else found
            if (rentPrice === 0) {
                 const periodPriceMatch = fullText.match(/期数明细[:：]\s*[¥￥]?([\d.]+)/)
                 if (periodPriceMatch) {
                     rentPrice = parseFloat(periodPriceMatch[1])
                 }
            }

            if (rentPrice > 0 && totalAmount === 0) {
                totalAmount = rentPrice
            }

            // 5. Customer, Address
            if (index < 5) appendLog(`[Debug] Order ${index + 1}: Checking for phone in text...`)

            // Priority 1: Context-based search (safer)
            let maskedPhoneMatch = fullText.match(/(?:号码|手机|电话)[:：]?\s*(1[\d*]{10})/)
            
            // Priority 2: Generic search for 11-digit pattern starting with 1 containing stars
            if (!maskedPhoneMatch) {
                maskedPhoneMatch = fullText.match(/(?:^|[^\d])(1[\d*]*\*+[\d*]*)(?:$|[^\d])/)
                // Validate length is roughly phone-like (11 chars) to avoid noise
                if (maskedPhoneMatch && maskedPhoneMatch[1].length !== 11) {
                    maskedPhoneMatch = null
                }
            }

            if (maskedPhoneMatch) {
                const maskedPhone = maskedPhoneMatch[1]
                if (maskedPhone.includes('*')) {
                     if (index < 5) appendLog(`[Debug] Order ${index + 1}: Found masked phone ${maskedPhone}. Trying to reveal...`)
                     
                     try {
                        const elementId = await element.getAttribute("id")
                    let clicked = false

                    if (elementId && elementId.startsWith("orderScreenshot")) {
                        const selector = `#${elementId} div.userInfo_register > span[style*="cursor"]`
                        const btn = await page.$(selector).catch(() => null)
                        if (btn) {
                            if (index < 5) appendLog(`[Debug] Clicking phone selector 1: ${selector}`)
                            await btn.scrollIntoViewIfNeeded().catch(() => {})
                            await btn.click({ force: true })
                            clicked = true
                        }

                        if (!clicked) {
                            const legacySelector = `#${elementId} > div.good_info > div > div:nth-child(4) > div > div.ant-card-body > div > div > div > div:nth-child(2) > div > span:nth-child(2)`
                            const legacyBtn = await page.$(legacySelector).catch(() => null)
                            if (legacyBtn) {
                                if (index < 5) appendLog(`[Debug] Clicking phone selector 2 (legacy)`)
                                await legacyBtn.scrollIntoViewIfNeeded().catch(() => {})
                                await legacyBtn.click({ force: true })
                                clicked = true
                            }
                        }
                    }

                    if (!clicked) {
                        const userInfoBtn = await element.$('div.userInfo_register > span[style*="cursor"]')
                        if (userInfoBtn) {
                            if (index < 5) appendLog(`[Debug] Clicking phone selector 3 (userInfo_register)`)
                            await userInfoBtn.scrollIntoViewIfNeeded().catch(() => {})
                            await userInfoBtn.click({ force: true })
                            clicked = true
                        }
                    }

                    if (!clicked) {
                        const svg = await element.$("svg[data-icon='eye-invisible']") || await element.$(".anticon-eye-invisible svg")
                        if (svg) {
                            if (index < 5) appendLog(`[Debug] Clicking phone selector 4 (eye-invisible svg)`)
                            await svg.evaluate(el => {
                                const root = el as HTMLElement
                                const clickTarget =
                                    root.closest('span[style*="cursor"]') ||
                                    root.closest("span")?.parentElement?.closest('span[style*="cursor"]') ||
                                    root.closest("span")
                                ;(clickTarget as HTMLElement | null)?.click()
                            })
                            clicked = true
                        }
                    }

                    if (!clicked) {
                        const icon = await element.$("span[aria-label='eye-invisible']") || await element.$(".anticon-eye-invisible")
                        if (icon) {
                            if (index < 5) appendLog(`[Debug] Clicking phone selector 5 (eye-invisible icon)`)
                            await icon.evaluate(el => {
                                const root = el as HTMLElement
                                const clickTarget =
                                    root.closest('span[style*="cursor"]') ||
                                    root.parentElement?.closest('span[style*="cursor"]') ||
                                    root.closest("span")
                                ;(clickTarget as HTMLElement | null)?.click()
                            })
                            clicked = true
                        }
                    }

                    if (!clicked) {
                        const phoneText = await element.$(`text="${maskedPhone}"`)
                        if (phoneText) {
                            if (index < 5) appendLog(`[Debug] Clicking phone text directly: ${maskedPhone}`)
                            await phoneText.scrollIntoViewIfNeeded().catch(() => {})
                            await phoneText.click({ force: true })
                            clicked = true
                        }
                    }

                    if (clicked) {
                        await page.waitForTimeout(1000)
                    } else {
                        if (index < 5) appendLog(`[Warning] Failed to find any clickable element for phone ${maskedPhone}`)
                    }
                } catch (e) {
                    appendLog(`Error clicking phone: ${e}`)
                }
             } // Close if (maskedPhone.includes('*'))
            } // Close if (maskedPhoneMatch)

            if (runtime.shouldStop) {
                 appendLog("Processing interrupted by stop signal.")
                 break
            }

            const textAfterClick = await element.innerText()

            let recipientPhone = ""
            let customerName = ""
            let address = ""

            const userInfoMatch = textAfterClick.match(/用户信息[\s\S]*?姓名[:：]\s*([^\s]+)[\s\S]*?号码[:：]\s*(1\d{0,2}\*{2,}\d{2,4}|\*{4,}\d{2,4}|\d{10,11})[\s\S]*?地址[:：]\s*([\s\S]+?)(?:\s*注册号码|$)/)
            if (userInfoMatch) {
                customerName = userInfoMatch[1].trim()
                recipientPhone = userInfoMatch[2].trim()
                address = userInfoMatch[3].trim()
            } else {
                const nameInline = textAfterClick.match(/姓名[:：]\s*([^\s]+)/)
                const phoneInline = textAfterClick.match(/号码[:：]\s*(1\d{0,2}\*{2,}\d{2,4}|\*{4,}\d{2,4}|\d{10,11})/)
                const addressInline = textAfterClick.match(/地址[:：]\s*([\s\S]+?)(?:\s*注册号码|$)/)
                if (nameInline) customerName = nameInline[1].trim()
                if (phoneInline) recipientPhone = phoneInline[1].trim()
                if (addressInline) address = addressInline[1].trim()
            }

            if (!recipientPhone || !address || !customerName) {
                const phoneRegex = /(?:^|[^\d])(1\d{0,2}\*{2,}\d{2,4}|\*{4,}\d{2,4}|\d{10,11})(?:$|[^\d])/g
                const phoneMatches = [...textAfterClick.matchAll(phoneRegex)]
                if (phoneMatches.length > 0) {
                    recipientPhone = phoneMatches[0][1]
                    const phoneIndex = phoneMatches[0].index! + phoneMatches[0][0].indexOf(recipientPhone)
                    const beforePhoneText = textAfterClick.slice(0, phoneIndex).trimEnd()
                    const nameMatch = beforePhoneText.match(/姓名[:：]\s*([^\s]+)/)
                    if (nameMatch) {
                        customerName = nameMatch[1].trim()
                    }
                    const postPhone = textAfterClick.substring(phoneIndex + recipientPhone.length).trim()
                    const addressMatch = postPhone.match(/地址[:：]\s*([\s\S]+?)(?:\s*注册号码|$)/)
                    if (addressMatch) {
                        address = addressMatch[1].trim()
                    }
                }
            }

            // Logistics
            let logisticsCompany = ""
            let trackingNumber = ""
            
            // Log: "发货物流： SF5128285236964"
            // Log: "发货物流： 自提"
            
            const logisticsLine = lines.find(l => l.includes("发货物流") || l.includes("物流："))
            if (logisticsLine) {
                 const content = logisticsLine.split(/[:：]/)[1]?.trim()
                 if (content) {
                     if (content.includes("SF") || content.includes("顺丰")) {
                         logisticsCompany = "顺丰速运"
                         const match = content.match(/SF\d{10,}/)
                         if (match) trackingNumber = match[0]
                     } else if (content.includes("JD") || content.includes("京东")) {
                         logisticsCompany = "京东快递"
                         const match = content.match(/JD\d{10,}/)
                         if (match) trackingNumber = match[0]
                     } else if (content.includes("YT") || content.includes("圆通")) {
                         logisticsCompany = "圆通速递"
                         const match = content.match(/YT\d{10,}/)
                         if (match) trackingNumber = match[0]
                     } else if (content.includes("自提")) {
                         logisticsCompany = "自提"
                         trackingNumber = "自提"
                     } else {
                         // Fallback for other formats
                         trackingNumber = content
                     }
                 }
            }
            
            // If not found in specific line, try global search
            if (!trackingNumber) {
                const sfMatch = fullText.match(/(SF\d{10,})/)
                const jdMatch = fullText.match(/(JD\d{10,})/)
                const ytMatch = fullText.match(/(YT\d{10,})/)
                
                if (sfMatch) {
                    trackingNumber = sfMatch[1]
                    logisticsCompany = "顺丰速运"
                } else if (jdMatch) {
                    trackingNumber = jdMatch[1]
                    logisticsCompany = "京东快递"
                } else if (ytMatch) {
                    trackingNumber = ytMatch[1]
                    logisticsCompany = "圆通速递"
                }
            }
            
            // Dates
            // Log: "租期：2026-03-01 至 2026-03-07 7天(1期)"
            let rentStartDate, returnDeadline, duration = 0
            
            const periodLine = lines.find(l => l.includes("租期：") || l.includes("租期:"))
            if (periodLine) {
                 // Format: 2026-03-01 至 2026-03-07
                 const dates = periodLine.match(/(\d{4}-\d{2}-\d{2})/g)
                 if (dates && dates.length >= 2) {
                     rentStartDate = new Date(dates[0])
                     returnDeadline = new Date(dates[1])
                 }
                 
                 const durationMatch = periodLine.match(/(\d+)天/)
                 if (durationMatch) {
                     duration = parseInt(durationMatch[1])
                 }
            } else {
                 // Fallback to global date search if specific line not found
                 // Try simple date format YYYY-MM-DD first as LLXZU uses that often
                 const simpleDates = [...fullText.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map(m => m[1])
                 if (simpleDates.length >= 2) {
                     // Sort unique dates
                     const unique = Array.from(new Set(simpleDates)).sort()
                     if (unique.length >= 2) {
                         // Assume last two are start/end
                         rentStartDate = new Date(unique[unique.length - 2])
                         returnDeadline = new Date(unique[unique.length - 1])
                     }
                 }
            }
            
            // Duration fallback
            if (duration === 0) {
                const durationMatch = fullText.match(/(\d+)天/)
                if (durationMatch) {
                    duration = parseInt(durationMatch[1])
                }
            }
            
            parsedOrders.push({
                orderNo,
                customerName,
                recipientPhone,
                address,
                totalAmount,
                rentPrice,
                deposit,
                status,
                rentStartDate,
                returnDeadline,
                duration,
                platform: site.name?.trim() || "零零享",
                productName,
                variantName,
                itemTitle: productName,
                itemSku: variantName,
                logisticsCompany,
                trackingNumber,
                promotionChannel,
                createdAt: (() => {
                    // llxzu has no "下单时间" label — scan all datetimes, take first not on a rental period line
                    const dtMatches = [...fullText.matchAll(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/g)]
                    for (const m of dtMatches) {
                        const idx = m.index ?? 0
                        const lineStart = fullText.lastIndexOf('\n', idx) + 1
                        const lineEnd = fullText.indexOf('\n', idx)
                        const lineText = fullText.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
                        if (!lineText.includes('租期')) return new Date(m[1])
                    }
                    return undefined
                })()
            })
            
        } catch (e) {
            appendLog(`Error parsing order row: ${e}`)
        }
    }
    
    if (unknownStatusCounts.size > 0) {
        const top = [...unknownStatusCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([k, v]) => `${k}=${v}`)
            .join(" | ")
        appendLog(`[System][零零享] 未识别状态汇总: ${top}`)
    }
    
    return parsedOrders
}

async function saveOrdersBatch(orders: LlxzuParsedOrder[]) {
    let savedCount = 0
    try {
        appendLog(`[Database] Preparing to save ${orders.length} orders. Sample: ${JSON.stringify(orders[0] || {}, null, 2)}`)
        
        // Auto-match specId for orders that don't have one yet
        for (const order of orders) {
            if (!order.specId && (order.itemTitle || order.itemSku)) {
                const matched = await autoMatchSpecId(order.itemTitle, order.itemSku)
                if (matched) (order as Record<string, unknown>).specId = matched
            }
        }
        
        const operations = orders.map(order => 
            prisma.onlineOrder.upsert({
                where: { orderNo: order.orderNo },
                update: { ...order, updatedAt: new Date() },
                create: { ...order, createdAt: order.createdAt ?? new Date(), updatedAt: new Date() }
            })
        )
        
        await prisma.$transaction(operations)
        savedCount = orders.length
        appendLog(`Successfully saved batch of ${savedCount} orders.`)
        
        updateStatus({
            message: `已保存 ${savedCount} 个订单到数据库`
        })
    } catch (e) {
        appendLog(`Error saving batch: ${e}`)
        console.error("Batch save error detail:", e)
        for (const order of orders) {
            try {
                await prisma.onlineOrder.upsert({
                    where: { orderNo: order.orderNo },
                    update: { ...order, updatedAt: new Date() },
                    create: { ...order, createdAt: order.createdAt ?? new Date(), updatedAt: new Date() }
                })
                savedCount++
            } catch (innerErr) {
                appendLog(`Failed to save order ${order.orderNo}: ${innerErr}`)
            }
        }
        appendLog(`Recovered ${savedCount}/${orders.length} orders in fallback mode.`)
    }
}

export async function startLlxzuSync(siteId: string) {
  try {
    const config = await loadConfig()
    appendLog(`Starting Llxzu Sync for siteId: ${siteId}`)
    
    if (!config) {
        throw new Error("Online orders config not found")
    }

    const targetSite = config.sites.find(s =>
        s.id === siteId ||
        s.id.toLowerCase() === siteId.toLowerCase()
    )
    if (!targetSite) {
        throw new Error(`Site ${siteId} not found in config`)
    }

    const previousLogs = runtime.status.logs || []
    runtime.shouldStop = false;
    updateStatus({ status: "running", message: "Starting...", logs: previousLogs, lastRunAt: new Date().toISOString() })
    appendLog(`Starting sync for ${targetSite.name} (ID: ${targetSite.id})`)

    const headless = config?.headless ?? false 
    appendLog(`Using headless mode: ${headless}`)
    
    let page = await ensurePage(headless)
    
    try {
        await page.bringToFront()
    } catch {
        // ignore
    }

    await login(page, targetSite)
    
    await page.waitForLoadState("domcontentloaded")
    await waitRandom(page, 1200, 3000)
    
    await handlePopup(page)
    await simulateHumanMouse(page)
    await simulateHumanScroll(page, 1, 3)

    appendLog("Opening order list via menu clicks...")
    const clickOk = await openLlxzuOrderListByClicks(page)
    if (!clickOk) {
        appendLog("Menu click navigation failed, falling back to configured order_menu_link if available.")
        if (targetSite.selectors.order_menu_link) {
            const targetUrl = targetSite.selectors.order_menu_link
            try {
                const origin = getOriginFromUrl(targetUrl)
                await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000, referer: origin ? `${origin}/` : undefined })
                await waitRandom(page, 1200, 3000)
            } catch (err) {
                appendLog(`Navigation failed: ${err}`)
            }
        }
    }
    
    await handlePopup(page)

    if (targetSite.selectors.all_orders_tab_selector) {
        await handlePopup(page)
        await switchToAllOrdersTab(page, targetSite.selectors.all_orders_tab_selector)
    }

    // Reset pagination to page 1
    // Selector: .ant-pagination-item-1
    try {
        const page1Btn = await page.$(".ant-pagination-item-1") || await page.$("li[title='1']") || await page.$("text=1")
        if (page1Btn) {
            const isActive = await page1Btn.getAttribute("class").then(c => c?.includes("active"))
            if (!isActive) {
                appendLog("Resetting pagination to page 1...")
                await page1Btn.click()
                await page.waitForTimeout(3000)
            }
        }
    } catch (e) {
        appendLog(`Failed to reset pagination: ${e}`)
    }

    let currentPage = 1
    const configMaxPages = Number(targetSite.maxPages ?? (targetSite as unknown as { max_pages?: number }).max_pages)
    const MAX_PAGES = !isNaN(configMaxPages) && configMaxPages > 0 ? configMaxPages : 50
    
    appendLog(`Max pages set to: ${MAX_PAGES}`)
    
    let hasMore = true
    const stopThreshold = config?.stopThreshold ?? 20
    let consecutiveFinalStateCount = 0
    const finalStatuses = ["COMPLETED", "CLOSED", "BOUGHT_OUT", "CANCELED"]
    appendLog(`Incremental stop threshold: ${stopThreshold}`)
    
    let pendingSaveOrders: LlxzuParsedOrder[] = []
    const BATCH_SIZE = 200

    const PAGE_CRASH_ERRORS = ["Target page", "Session closed", "crashed", "Target closed", "Connection closed"]
    const isCrashError = (e: unknown) => PAGE_CRASH_ERRORS.some(s => String(e).includes(s))
    let pageRetryCount = 0
    const MAX_PAGE_RETRIES = 3

    const rebuildAndNavigate = async () => {
        try { await runtime.context?.close() } catch {}
        runtime.context = undefined
        runtime.page = undefined
        await new Promise(r => setTimeout(r, 3000))
        page = await ensurePage(headless)
        await login(page, targetSite)
        await page.waitForLoadState("domcontentloaded")
        await waitRandom(page, 1200, 3000)
        await handlePopup(page)
        const ok = await openLlxzuOrderListByClicks(page)
        if (!ok && targetSite.selectors.order_menu_link) {
            const origin = getOriginFromUrl(targetSite.selectors.order_menu_link)
            await page.goto(targetSite.selectors.order_menu_link, { waitUntil: "domcontentloaded", timeout: 30000, referer: origin ? `${origin}/` : undefined })
            await waitRandom(page, 1200, 3000)
        }
        await handlePopup(page)
        if (targetSite.selectors.all_orders_tab_selector) {
            await switchToAllOrdersTab(page, targetSite.selectors.all_orders_tab_selector)
        }
        if (currentPage > 1) {
            appendLog(`Re-navigating to page ${currentPage} after crash recovery...`)
            for (let p = 1; p < currentPage; p++) {
                if (targetSite.selectors.pagination_next_selector) {
                    const nb = await page.$(targetSite.selectors.pagination_next_selector)
                    if (nb) { await nb.click({ force: true }); await waitRandom(page, 2000, 3500) }
                }
            }
        }
    }

    while (hasMore && currentPage <= MAX_PAGES) {
        if (runtime.shouldStop) {
            appendLog("User stopped the sync process.");
            hasMore = false;
            break;
        }

        try {
        appendLog(`正在解析第 ${currentPage} 页订单...`)

        if (page.isClosed()) throw new Error("Target page, context or browser has been closed")

        const PAGE_TIMEOUT_MS = 5 * 60 * 1000
        let pageTimeoutHandle: ReturnType<typeof setTimeout> | undefined
        const pageTimeoutPromise = new Promise<never>((_, reject) => {
            pageTimeoutHandle = setTimeout(() => reject(new Error("Target page, context or browser has been closed")), PAGE_TIMEOUT_MS)
        })
        const pageWorkPromise = (async () => {
            await simulateHumanMouse(page)
            await simulateHumanScroll(page, 1, 3)
            await waitRandom(page, 800, 1600)
            return await parseOrders(page, targetSite)
        })()
        let pageOrders: LlxzuParsedOrder[]
        try {
            pageOrders = await Promise.race([pageWorkPromise, pageTimeoutPromise])
        } finally {
            clearTimeout(pageTimeoutHandle)
        }

        pageRetryCount = 0

        if (stopThreshold > 0 && pageOrders.length > 0) {
            const orderNos = pageOrders.map(o => o.orderNo).filter(Boolean)
            try {
                const existingFinalOrders = await prisma.onlineOrder.findMany({
                    where: {
                        orderNo: { in: orderNos },
                        platform: targetSite.name?.trim() || "零零享",
                        status: { in: finalStatuses }
                    },
                    select: { orderNo: true, status: true }
                })
                const finalSet = new Set(existingFinalOrders.map(o => o.orderNo))

                let shouldStop = false
                for (const order of pageOrders) {
                    if (!order.orderNo) continue
                    if (finalSet.has(order.orderNo)) {
                        consecutiveFinalStateCount++
                        if (consecutiveFinalStateCount >= stopThreshold) {
                            appendLog(`已连续发现 ${consecutiveFinalStateCount} 个历史终态订单，触发增量同步停止阈值。`)
                            shouldStop = true
                            break
                        }
                    } else {
                        consecutiveFinalStateCount = 0
                    }
                }
                if (shouldStop) {
                    hasMore = false
                    break
                }
            } catch (e) {
                appendLog(`增量阀值检查失败，继续全量抓取: ${e}`)
            }
        }
        
        if (pageOrders.length > 0) {
            pendingSaveOrders.push(...pageOrders)
            appendLog(`第 ${currentPage} 页抓取到 ${pageOrders.length} 个订单 (累计缓存 ${pendingSaveOrders.length})`)
        } else {
            appendLog(`第 ${currentPage} 页未抓到订单`)
        }

        await handlePopup(page)
        await waitRandom(page, 1000, 3000)
        if (currentPage > 0 && currentPage % 5 === 0) {
            appendLog(`[System] 已抓取 ${currentPage} 页，随机暂停一段时间...`)
            await simulateHumanMouse(page, 2, 5)
            await simulateHumanScroll(page, 2, 5)
            await waitRandom(page, 3000, 5000)
        }

        if (pendingSaveOrders.length >= BATCH_SIZE) {
            appendLog(`达到批量保存阈值，准备写入 ${pendingSaveOrders.length} 条订单...`)
            await saveOrdersBatch(pendingSaveOrders)
            pendingSaveOrders = []
        }
        
        const progressMsg = `正在抓取第 ${currentPage} 页 (当前缓存 ${pendingSaveOrders.length} 个待保存)`;
        
        appendLog(progressMsg);
        updateStatus({
            message: progressMsg
        });

        if (currentPage >= MAX_PAGES) {
            appendLog(`Reached max pages limit (${MAX_PAGES}). Stopping.`)
            hasMore = false
            break
        }

        if (targetSite.selectors.pagination_next_selector) {
             const nextBtn = await page.$(targetSite.selectors.pagination_next_selector)
             
             if (nextBtn) {
                 const classAttr = await nextBtn.getAttribute('class') || ""
                 const isDisabled = await nextBtn.getAttribute('disabled') !== null || classAttr.includes('disabled')
                 
                 if (!isDisabled) {
                     appendLog(`Navigating to next page (Page ${currentPage + 1})...`)
                     await nextBtn.scrollIntoViewIfNeeded().catch(() => void 0)
                     await simulateHumanScroll(page, 1, 2)
                     await waitRandom(page, 600, 1400)
                     const clickTimeout = new Promise<never>((_, reject) =>
                         setTimeout(() => reject(new Error("Target page, context or browser has been closed")), 60000)
                     )
                     await Promise.race([
                         (async () => {
                             await nextBtn.click({ force: true })
                             await waitRandom(page, 3000, 5000)
                         })(),
                         clickTimeout
                     ])
                     currentPage++
                 } else {
                     appendLog("Next page button is disabled. Reached end of list.")
                     hasMore = false
                 }
             } else {
                 hasMore = false
             }
        } else {
            hasMore = false
        }
        } catch (pageErr) {
            if (isCrashError(pageErr) && pageRetryCount < MAX_PAGE_RETRIES) {
                pageRetryCount++
                appendLog(`[Crash] Page crash on page ${currentPage} (retry ${pageRetryCount}/${MAX_PAGE_RETRIES}): ${pageErr}`)
                updateStatus({ message: `页面崩溃，正在重试第 ${currentPage} 页 (${pageRetryCount}/${MAX_PAGE_RETRIES})...` })
                await rebuildAndNavigate()
                appendLog(`Crash recovery complete, retrying page ${currentPage}...`)
            } else {
                appendLog(`Fatal error on page ${currentPage}: ${pageErr}`)
                throw pageErr
            }
        }
    }
    
    if (pendingSaveOrders.length > 0) {
        appendLog(`Saving remaining ${pendingSaveOrders.length} orders...`)
        await saveOrdersBatch(pendingSaveOrders)
    }

    if (runtime.shouldStop) {
        appendLog("Sync stopped by user.")
        updateStatus({ status: "idle", message: "已停止" })
        return
    }

    updateStatus({ 
        status: "success", 
        message: "Sync completed",
        lastRunAt: new Date().toISOString(),
    })
    appendLog("Sync completed successfully.")
    // Persist last run time to DB
    const now = new Date().toISOString()
    await prisma.appConfig.upsert({
        where: { key: "sync_meta_零零享" },
        update: { value: JSON.stringify({ lastSyncAt: now }) },
        create: { key: "sync_meta_零零享", value: JSON.stringify({ lastSyncAt: now }) },
    }).catch(() => void 0)

  } catch (e) {
    const msg = String(e)
    updateStatus({ 
        status: "error", 
        message: `Error: ${msg}`,
        logs: [...(runtime.status.logs || []), `[Error] ${msg}`]
    })
    appendLog(`Sync failed: ${msg}`)
  } finally {
      if (runtime.shouldStop) {
          updateStatus({ status: "idle", message: "已停止" })
      }
  }
}
