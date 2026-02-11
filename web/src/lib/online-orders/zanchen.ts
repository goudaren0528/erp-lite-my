import path from "path"
import fs from "fs"
import { chromium, type BrowserContext, type Frame, type Page, type ElementHandle } from "playwright"
import { prisma } from "@/lib/db"

export const CONFIG_KEY = "online_orders_sync_config"

type NightPeriod = {
  start: number
  end: number
}

type SelectorMap = Record<string, string>
type PageOrFrame = Page | Frame

export type SiteConfig = {
  id: string
  name: string
  enabled: boolean
  loginUrl: string
  username: string
  password: string
  maxPages: number
  selectors: SelectorMap
  autoSync?: {
    enabled: boolean
    interval: number
    concurrencyLimit?: number
  }
}

export type OnlineOrdersConfig = {
  autoSyncEnabled?: boolean
  interval?: number
  concurrencyLimit?: number
  headless: boolean
  nightMode: boolean
  nightPeriod: NightPeriod
  webhookUrls: string[]
  deviceMappings?: { keyword: string; deviceName: string }[]
  sites: SiteConfig[]
  stopThreshold?: number
}

export type ZanchenStatus = {
  status: "idle" | "running" | "awaiting_user" | "success" | "error"
  message?: string
  lastRunAt?: string
  needsAttention?: boolean
  heartbeatActive?: boolean
  lastResult?: {
    pendingCount?: number
    extractedCount?: number
    pagesVisited?: number
    pageUrl?: string
    title?: string
    rows?: string[]
    parsedOrders?: {
      orderNo: string
      customerName?: string
      recipientPhone?: string
      address?: string
      productName?: string
      variantName?: string
      itemTitle?: string
      itemSku?: string
      merchantName?: string
      duration?: number
      rentPrice?: number
      deposit?: number
      insurancePrice?: number
      totalAmount?: number
      status?: string
      platform?: string
      promotionChannel?: string
      rentStartDate?: Date | string
      returnDeadline?: Date | string
      logisticsCompany?: string
      trackingNumber?: string
      latestLogisticsInfo?: string
      returnLogisticsCompany?: string
      returnTrackingNumber?: string
      returnLatestLogisticsInfo?: string
    }[]
  }
  snapshotSaved?: boolean
  logs?: string[]
}

type ZanchenRuntime = {
  status: ZanchenStatus
  running: boolean
  shouldStop: boolean
  context?: BrowserContext
  page?: Page
  heartbeatTimer?: NodeJS.Timeout
  headless?: boolean
  currentSite?: string
}

const globalForZanchen = globalThis as unknown as { zanchenRuntime?: ZanchenRuntime }

const runtime: ZanchenRuntime =
  globalForZanchen.zanchenRuntime ?? {
    status: { status: "idle", logs: [] },
    running: false,
    shouldStop: false,
    currentSite: undefined
  }

globalForZanchen.zanchenRuntime = runtime

function getLogFilePath() {
  const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const logDir = path.join(process.cwd(), "logs")
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  return path.join(logDir, `zanchen-${date}.log`)
}

function appendLogToFile(message: string) {
  try {
    const filePath = getLogFilePath()
    fs.appendFileSync(filePath, message + "\n")
  } catch (e) {
    console.error("Failed to write log file", e)
  }
}

function addLog(message: string) {
  const logs = runtime.status.logs || []
  const timestamp = new Date().toLocaleTimeString()
  const prefix = runtime.currentSite ? `[${runtime.currentSite}] ` : ""
  const fullMsg = `[${timestamp}] ${prefix}${message}`
  const newLogs = [...logs, fullMsg]
  
  appendLogToFile(fullMsg)
  
  // Limit to last 2000 logs to prevent memory issues
  runtime.status = { ...runtime.status, logs: newLogs.slice(-2000) }
}

function setStatus(next: ZanchenStatus) {
  const existingLogs = runtime.status.logs || []
  // If the new status has logs, use them (e.g. clearing logs). Otherwise append message if present and different.
  let newLogs = next.logs || existingLogs
  if (!next.logs && next.message && next.message !== runtime.status.message) {
     const timestamp = new Date().toLocaleTimeString()
     const fullMsg = `[${timestamp}] ${next.message}`
     newLogs = [...newLogs, fullMsg]
     appendLogToFile(fullMsg)
  }
  // Limit to last 2000 logs
  if (newLogs.length > 2000) {
    newLogs = newLogs.slice(-2000)
  }
  runtime.status = { ...next, logs: newLogs }
}

export async function loadConfig(): Promise<OnlineOrdersConfig | null> {
  const appConfigClient = (prisma as unknown as { appConfig?: typeof prisma.appConfig }).appConfig
  if (!appConfigClient) return null
  const record = await appConfigClient.findUnique({ where: { key: CONFIG_KEY } })
  if (!record?.value) return null
  try {
    return JSON.parse(record.value) as OnlineOrdersConfig
  } catch {
    return null
  }
}

function resolveSite(config: OnlineOrdersConfig | null, siteId: string) {
  if (!config) return null
  const byId = config.sites.find(site => site.id === siteId)
  if (byId) return byId
  return config.sites.find(site => site.name.includes("赞晨")) || null
}

async function ensureContext(headlessConfig: boolean = false): Promise<BrowserContext> {
  if (runtime.context) {
    try {
      if (runtime.headless !== undefined && runtime.headless !== headlessConfig) {
        await runtime.context.close().catch(() => void 0)
        runtime.context = undefined
        runtime.page = undefined
      } else {
        runtime.context.pages()
        return runtime.context
      }
    } catch {
      runtime.context = undefined
      runtime.page = undefined
    }
  }
  const userDataDir = path.join(process.cwd(), ".playwright", "zanchen")
  
  // In production (when not on Windows dev machine), prefer headless
    // But respect config if provided, unless we are on Linux without display
    let finalHeadless = headlessConfig
    if (process.platform === 'linux' && !process.env.DISPLAY) {
        addLog(`[System] Linux environment without DISPLAY detected, forcing headless mode.`)
        finalHeadless = true
    }
  
    addLog(`[System] Launching browser context. Headless: ${finalHeadless}`)
  
    runtime.context = await chromium.launchPersistentContext(userDataDir, {
      headless: finalHeadless,
    viewport: { width: 1280, height: 720 },
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu',
        '--disable-dev-shm-usage',
    ],
    ignoreDefaultArgs: ['--enable-automation'] 
  })
  runtime.headless = finalHeadless
  return runtime.context
}

async function ensurePage(headlessConfig: boolean = false): Promise<Page> {
  let context = await ensureContext(headlessConfig)
  if (runtime.page && !runtime.page.isClosed()) return runtime.page
  try {
    const pages = context.pages()
    runtime.page = pages[0] || (await context.newPage())
    try { if (!headlessConfig) await runtime.page.bringToFront() } catch { void 0 }
    return runtime.page
  } catch {
    runtime.context = undefined
    runtime.page = undefined
    context = await ensureContext(headlessConfig)
    const pages = context.pages()
    runtime.page = pages[0] || (await context.newPage())
    try { if (!headlessConfig) await runtime.page.bringToFront() } catch { void 0 }
    return runtime.page
  }
}

async function ensureOnLogin(page: Page, site: SiteConfig) {
  if (!site.loginUrl) return
  const currentUrl = page.url()
  if (currentUrl && currentUrl.startsWith(site.loginUrl)) return
  await page.goto(site.loginUrl, { waitUntil: "domcontentloaded" })
}

async function tryLogin(page: Page, site: SiteConfig) {
  const { username_input, password_input, login_button } = site.selectors
  if (username_input && site.username) {
    await page.fill(username_input, site.username)
  }
  if (password_input && site.password) {
    await page.fill(password_input, site.password)
  }
  if (login_button) {
    await page.click(login_button)
  }
}

async function isOnLoginPage(page: Page, site: SiteConfig) {
  const url = page.url()
  if (site.loginUrl && url && url.startsWith(site.loginUrl)) return true
  const loginHints = [
    site.selectors.username_input,
    site.selectors.password_input,
    site.selectors.login_button
  ].filter(Boolean)
  for (const selector of loginHints) {
    try {
      if (await page.isVisible(selector, { timeout: 1000 })) return true
    } catch {
      void 0
    }
  }
  return false
}

async function detectRiskHint(page: Page) {
  try {
    const text = await page.evaluate(() => document.body?.innerText || "")
    const strongKeywords = [
      "安全验证",
      "验证码",
      "短信验证码",
      "短信校验",
      "短信验证",
      "手机验证",
      "手机号验证",
      "身份验证",
      "身份校验",
      "人机验证",
      "人机识别",
      "请完成验证",
      "滑动验证",
      "拖动滑块",
      "验证失败",
      "验证超时",
      "验证已过期",
      "校验失败",
      "请先验证",
      "请先完成验证",
      "请先安全验证"
    ]
    const weakKeywords = [
      "风控",
      "安全检测",
      "安全中心",
      "安全提醒",
      "安全确认",
      "安全校验",
      "风险验证",
      "异常验证",
      "异常校验",
      "异常操作",
      "异常登录",
      "账号异常",
      "账户异常",
      "操作过于频繁",
      "访问频繁",
      "请求频繁",
      "访问受限",
      "暂时无法访问",
      "风险提示",
      "存在风险",
      "需要验证",
      "需要校验",
      "检测到异常"
    ]
    const hitStrong = strongKeywords.find(key => text.includes(key))
    if (hitStrong) return { level: "strong", reason: hitStrong }
    const captchaSelectors = [
      ".geetest_panel",
      ".geetest_container",
      ".geetest_holder",
      ".nc-container",
      ".nc_scale",
      ".captcha",
      ".captcha_container",
      ".captcha-box",
      ".captcha-modal",
      ".slider",
      "iframe[src*='captcha']",
      "iframe[src*='verify']",
      "iframe[src*='geetest']",
      "iframe[src*='gjcaptcha']",
      "iframe[src*='tencent']",
      "iframe[src*='aliyun']",
      "iframe[src*='hcaptcha']",
      "iframe[src*='recaptcha']",
      "img[alt*='验证码']",
      "input[name*='captcha']",
      "input[name*='verify']"
    ]
    let captchaVisible = false
    for (const selector of captchaSelectors) {
      try {
        if (await page.isVisible(selector, { timeout: 500 })) {
          captchaVisible = true
          break
        }
      } catch {
        void 0
      }
    }
    const hitWeak = weakKeywords.find(key => text.includes(key))
    if (hitWeak && captchaVisible) return { level: "strong", reason: hitWeak }
    if (captchaVisible) return { level: "strong", reason: "验证控件" }
    return null
  } catch {
    return null
  }
}

async function ensureNoRisk(page: Page, site: SiteConfig, timeoutMs = 5 * 60_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isOnLoginPage(page, site)) {
      setStatus({
        status: "awaiting_user",
        message: "登录需要人工验证或短信验证码",
        needsAttention: true
      })
      // Trigger webhook for manual intervention
      void loadConfig().then(cfg => sendWebhook(cfg, "登录检测到需要人工验证"))
      
      await page.waitForTimeout(1200)
      continue
    }
    const riskHint = await detectRiskHint(page)
    if (!riskHint) return true
    if (riskHint.level === "weak") {
      const cooldownMs = 15000 + Math.floor(Math.random() * 15000)
      const cooldownSec = Math.ceil(cooldownMs / 1000)
      setStatus({
        status: "running",
        message: `检测到疑似风控提示，自动冷却 ${cooldownSec}s（${riskHint.reason}）`
      })
      await page.waitForTimeout(cooldownMs)
      continue
    }
    setStatus({
      status: "awaiting_user",
      message: `触发平台风控，请在浏览器完成验证（检测到${riskHint.reason}）`,
      needsAttention: true
    })
    await page.waitForTimeout(1200)
  }
  return false
}

async function waitUntilLoggedIn(page: Page, site: SiteConfig, timeoutMs = 10_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isOnLoginPage(page, site)) {
      await page.waitForTimeout(800)
      continue
    }
    if (await detectRiskHint(page)) {
      await page.waitForTimeout(800)
      continue
    }

    const url = page.url()
    if (site.loginUrl && url && !url.startsWith(site.loginUrl)) return true
    // If login url unknown, infer by presence of order targets becoming available
    const ready = await isOrderReady(page, site.selectors)
    if (ready) return true
    await page.waitForTimeout(800)
  }
  return false
}

function sanitizeSelector(raw?: string) {
  const text = raw?.trim() || ""
  if (!text) return ""
  return text.replace(/([>+~]\s*)+$/g, "").replace(/,\s*$/g, "").trim()
}

function getContainerSelector(selectors: SelectorMap) {
  return sanitizeSelector(selectors.order_list_container)
}

async function waitRandom(scope: PageOrFrame, minMs: number, maxMs: number) {
  const span = Math.max(maxMs - minMs, 0)
  const ms = minMs + Math.floor(Math.random() * (span + 1))
  await scope.waitForTimeout(ms)
}

async function resolveOrderFrame(page: Page, selectors: SelectorMap) {
  const container = getContainerSelector(selectors)
  if (!container) return page
  for (let i = 0; i < 10; i += 1) {
    try {
      const direct = await page.$(container)
      if (direct) return page
    } catch {
      void 0
    }
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue
      try {
        const found = await frame.$(container)
        if (found) {
          const tag = frame.url() || frame.name() || "unknown"
          addLog(`Order list container found in frame: ${tag}`)
          return frame
        }
      } catch {
        void 0
      }
    }
    await page.waitForTimeout(1000)
  }
  addLog("Order list container not found in any frame, using main page")
  return page
}

function normalizeRowSelector(raw: string, container?: string) {
  const rawClean = sanitizeSelector(raw)
  const containerClean = sanitizeSelector(container)
  if (!rawClean) return ""
  if (!containerClean) return rawClean
  if (rawClean.startsWith(">")) return `${containerClean}${rawClean}`
  if (rawClean.startsWith(":scope")) return `${containerClean}${rawClean.replace(":scope", "")}`
  return rawClean
}

function parseRowSelectors(selectors: SelectorMap) {
  const raw = selectors.order_row_selectors?.trim()
  if (!raw) return []
  const parts = raw
    .split(/\r?\n|,|;|\|/g)
    .map(item => item.trim())
    .filter(Boolean)
  return parts
    .map(sel => normalizeRowSelector(sel, selectors.order_list_container))
    .filter(Boolean)
}

async function buildTemplateSelectors(page: PageOrFrame, selectors: SelectorMap) {
  const template = selectors.order_row_selector_template?.trim()
  if (!template) return []
  const start = Number(selectors.order_row_index_start) || 1
  const step = Number(selectors.order_row_index_step) || 1
  let end = Number(selectors.order_row_index_end) || 0

  const container = getContainerSelector(selectors)
  if (!end && container) {
    try {
      // Retry getting children count a few times
      for (let i = 0; i < 10; i++) {
        end = await page.$$eval(`${container} > *`, elements => elements.length)
        if (end > 0) break
        await page.waitForTimeout(1000)
      }
      console.log(`[Zanchen] Container ${container} has ${end} children`)
      addLog(`Container has ${end} children`)
    } catch (e) {
      console.error("[Zanchen] Error counting container children:", e)
      addLog(`Error counting container children: ${e}`)
      end = 0
    }
  }

  if (!end) return []

  const selectorsList: string[] = []
  for (let i = start; i <= end; i += Math.max(step, 1)) {
    const raw = template.replace(/\{i\}/g, String(i))
    const normalized = normalizeRowSelector(raw, container)
    if (normalized) selectorsList.push(normalized)
  }
  return selectorsList
}

async function resolveRowSelector(page: PageOrFrame, selectors: SelectorMap) {
  const rowSelectors = parseRowSelectors(selectors)
  if (rowSelectors.length > 0) return rowSelectors.join(", ")
  
  const templateSelectors = await buildTemplateSelectors(page, selectors)
  if (templateSelectors.length > 0) return templateSelectors.join(", ")
  
  // Fallback: try standard Ewei Shop structure
  const container = getContainerSelector(selectors)
  if (container) {
      // Check if the container itself has content
      try {
        // Try waiting for the container to actually appear in DOM first
        await page.waitForSelector(container, { state: 'attached', timeout: 5000 }).catch(() => void 0)

        // Try to count direct children divs
        const count = await page.$$eval(`${container} > div`, els => els.length)
        if (count > 0) {
            console.log(`[Zanchen] Fallback: found ${count} divs in container`)
            addLog(`Fallback: found ${count} divs in container`)
            return `${container} > div`
        }
        
        // Try to count table rows if it's a table
        const trCount = await page.$$eval(`${container} tr`, els => els.length)
        if (trCount > 0) {
            console.log(`[Zanchen] Fallback: found ${trCount} rows in container`)
            addLog(`Fallback: found ${trCount} rows in container`)
            return `${container} tr`
        }
      } catch {}
      
      // Last resort fallbacks
    // Try to find ANY div inside the container that looks like a row
    return `${container} > div, ${container} tr`
  }
  return ""
}

async function revealReceiverInfo(scope: PageOrFrame, selectors: SelectorMap) {
  void scope
  void selectors
  return
}

async function isOrderReady(page: Page, selectors: SelectorMap) {
  const checks: Promise<unknown>[] = []
  const orderTarget = selectors.order_menu_link
  if (orderTarget && orderTarget.startsWith("http")) {
    if (page.url().startsWith(orderTarget)) return true
  }
  const scope = await resolveOrderFrame(page, selectors)
  const rowSelector = await resolveRowSelector(scope, selectors)
  if (rowSelector) {
    checks.push(scope.waitForSelector(rowSelector, { timeout: 5000 }))
  }
  if (checks.length === 0) return false
  try {
    await Promise.race(checks)
    return true
  } catch {
    return false
  }
}

async function openOrderList(page: Page, selectors: SelectorMap) {
  const orderTarget = selectors.order_menu_link
  if (!orderTarget) return
  if (orderTarget.startsWith("http")) {
    if (page.url() !== orderTarget) {
      await page.goto(orderTarget, { waitUntil: "domcontentloaded" })
    }
    return
  }
  await page.click(orderTarget)
}

async function extractOrderSummary(page: PageOrFrame, selectors: SelectorMap) {
  let pendingCount: number | undefined
  let extractedCount: number | undefined

  const container = getContainerSelector(selectors)
  if (container) {
      setStatus({ status: "running", message: "等待订单列表加载..." })
      try {
        await waitRandom(page, 300, 900)
        // Wait for the container itself
        await page.waitForSelector(container, { state: "visible", timeout: 15000 })
        
        // Check if container has content
        const containerHtml = await page.$eval(container, el => el.innerHTML.slice(0, 100))
        addLog(`Container content preview: ${containerHtml.replace(/\s+/g, ' ')}...`)

        // Try to wait for at least one child row if template is used
        if (selectors.order_row_selector_template) {
        const start = selectors.order_row_index_start || 1
        // Try to wait for the first row specifically
        const firstRowSelector = selectors.order_row_selector_template.replace(/\{i\}/g, String(start))
        const normalized = normalizeRowSelector(firstRowSelector, container)
        if (normalized) {
          await page.waitForSelector(normalized, { state: "attached", timeout: 10000 }).catch(() => void 0)
        }
      }
    } catch {
      console.log("Wait for order list container timed out, proceeding anyway...")
      addLog("Wait for order list container timed out, proceeding anyway...")
    }
  }
  await revealReceiverInfo(page, selectors)

  if (selectors.pending_count_element) {
    try {
      const text = await page.textContent(selectors.pending_count_element)
      const matched = text?.match(/\d+/)
      if (matched) pendingCount = Number(matched[0])
    } catch {
      void 0
    }
  }

  const rowSelector = await resolveRowSelector(page, selectors)
  if (rowSelector) {
    try {
      const rows = await page.$$(rowSelector)
      extractedCount = rows.length
      console.log(`[Zanchen] Extracted ${extractedCount} rows using selector: ${rowSelector.slice(0, 100)}...`)
      addLog(`Extracted ${extractedCount} rows using selector: ${rowSelector.slice(0, 100)}...`)
    } catch (e) {
      console.error("[Zanchen] Error extracting rows:", e)
      addLog(`Error extracting rows: ${e}`)
    }
  } else {
    console.warn("[Zanchen] No row selector resolved")
    addLog("No row selector resolved")
  }

  return { pendingCount, extractedCount }
}

async function extractOrderRows(page: PageOrFrame, selectors: SelectorMap) {
  const rowSelector = await resolveRowSelector(page, selectors)
  if (!rowSelector) return []
  try {
    const rows = await page.$$eval(
      rowSelector,
      elements =>
        elements
          .map(el => {
            const text =
              (el as HTMLElement).innerText ||
              (el.textContent ?? "").replace(/\s+/g, " ")
            return text.trim()
          })
          .filter(Boolean)
    )
    return rows
  } catch {
    return []
  }
}

function parseNumber(text: string | null | undefined) {
  const m = (text || "").match(/-?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : undefined
}

function parseDateTokens(text: string) {
  return text.match(/\d{4}-\d{2}-\d{2}/g) || []
}

function parseDateRangeDays(text: string) {
  const matches = parseDateTokens(text)
  if (matches.length < 2) return undefined
  const start = new Date(matches[0]!)
  const end = new Date(matches[1]!)
  const ms = end.getTime() - start.getTime()
  const days = Math.round(ms / (24 * 3600 * 1000)) + 1
  return days > 0 ? days : undefined
}

function parseDateRange(text: string) {
  const matches = parseDateTokens(text)
  if (matches.length < 2) return { start: undefined, end: undefined }
  const start = new Date(matches[0]!)
  const end = new Date(matches[1]!)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { start: undefined, end: undefined }
  }
  return { start, end }
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, "").trim().toLowerCase()
}

function parseVariantNames(raw: string | null | undefined) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => (typeof item === "string" ? item : (item as { name?: string }).name))
        .filter((item): item is string => Boolean(item))
    }
  } catch {
    void 0
  }
  return []
}

function matchProductByTitle(
  itemTitle: string | undefined,
  itemSku: string | undefined,
  products: { id: string; name: string; variants: string | null }[]
) {
  const titleKey = normalizeText(itemTitle || "")
  const skuKey = normalizeText(itemSku || "")
  let matchedProduct: { id: string; name: string; variantName?: string } | null = null
  // 1) 先用商品标题匹配产品
  if (titleKey) {
    for (const product of products) {
      const productKey = normalizeText(product.name || "")
      if (!productKey) continue
      if (!titleKey.includes(productKey)) continue
      if (!matchedProduct || productKey.length > normalizeText(matchedProduct.name).length) {
        matchedProduct = { id: product.id, name: product.name }
      }
    }
  }
  // 2) 若标题未命中，再用 SKU 进行产品匹配
  if (!matchedProduct && skuKey) {
    for (const product of products) {
      const productKey = normalizeText(product.name || "")
      if (!productKey) continue
      if (!skuKey.includes(productKey)) continue
      if (!matchedProduct || productKey.length > normalizeText(matchedProduct.name).length) {
        matchedProduct = { id: product.id, name: product.name }
      }
    }
  }
  if (!matchedProduct) return null
  const variants = parseVariantNames(
    products.find(p => p.id === matchedProduct?.id)?.variants || ""
  )
  let matchedVariant: string | undefined
  for (const v of variants) {
    const variantKey = normalizeText(v)
    if (!variantKey) continue
    if ((skuKey && skuKey.includes(variantKey)) || titleKey.includes(variantKey)) {
      if (!matchedVariant || variantKey.length > normalizeText(matchedVariant).length) {
        matchedVariant = v
      }
    }
  }
  return { productId: matchedProduct.id, productName: matchedProduct.name, variantName: matchedVariant }
}

function matchDeviceMapping(
  itemTitle: string | undefined,
  itemSku: string | undefined,
  products: { name: string; matchKeywords: string | null }[]
) {
  const titleKey = normalizeText(itemTitle || "")
  const skuKey = normalizeText(itemSku || "")
  if ((!titleKey && !skuKey) || products.length === 0) return null
  
  let matched: { name: string; keywordLength: number } | null = null
  
  for (const product of products) {
    if (!product.matchKeywords) continue
    let keywords: string[] = []
    try {
        keywords = JSON.parse(product.matchKeywords)
    } catch {
        continue
    }
    if (!Array.isArray(keywords)) continue

    for (const keyword of keywords) {
        const key = normalizeText(keyword || "")
        if (!key) continue
        const hit = (!!titleKey && titleKey.includes(key)) || (!!skuKey && skuKey.includes(key))
        if (!hit) continue
        
        if (!matched || key.length > matched.keywordLength) {
          matched = { name: product.name, keywordLength: key.length }
        }
    }
  }
  return matched ? { deviceName: matched.name } : null
}

function parseMerchantName(text: string) {
  const m = text.match(/商户名称[:：]?\s*([^\s|]+)/)
  return m ? m[1].trim() : undefined
}

function splitDeviceLines(text: string) {
  return text
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
}

function cleanDeviceLine(line: string) {
  return line
    .replace(/^(设备|商品)[:：]?\s*/i, "")
    .replace(/数量[:：]?\s*\d+.*$/i, "")
    .replace(/数量\s*\d+.*$/i, "")
    .trim()
}

function parseDeviceInfo(text: string) {
  const ignorePatterns = [
    /订单编号/i,
    /订单号/i,
    /商户名称/i,
    /支付类型/i,
    /支付方式/i,
    /^备注$/i,
    /^关闭订单/i,
    /^合同[:：]/i,
    /^公证[:：]/i,
    /^代扣类型[:：]/i,
    /^下单渠道[:：]/i,
    /^公域来源[:：]/i,
    /^昵称[:：]/i,
    /^到期购买价[:：]/i,
    /^购买总价[:：]/i,
    /^已付\/总租金/i,
    /^信用冻结[:：]/i,
    /^资金冻结[:：]/i,
    /^商品押金[:：]/i,
    /^订单详情$/i,
    /^物流信息$/i,
    /^待发货$/i,
    /^待付款$/i,
    /^已关闭$/i,
    /^历史订单[:：]/i,
    /^转单记录[:：]/i,
    /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/
  ]
  const titleMatch = text.match(/(商品标题|商品|标题)[:：]\s*([^\n]+)/)
  const skuMatch = text.match(/(套餐|SKU|型号|规格)[:：]\s*([^\n]+)/i)
  let itemTitle = titleMatch ? titleMatch[2].trim() : undefined
  let itemSku = skuMatch ? cleanDeviceLine(skuMatch[2].trim()) : undefined
  const lineItems = splitDeviceLines(text)
    .map((line, index) => ({ index, value: cleanDeviceLine(line) }))
    .filter(item => item.value && !ignorePatterns.some(pattern => pattern.test(item.value)))
  const lines = lineItems.map(item => item.value)
  const uniqueLines = Array.from(
    new Map(lines.map(line => [normalizeText(line), line])).values()
  )
  const skuKeyword = /(套餐|快递|相纸|内存|三电池|挂脖|自拍杆|配件|套装|\+)/i
  if (!itemTitle && lines.length > 0) {
    itemTitle = uniqueLines[0] || undefined
  }
  if (!itemSku) {
    let titleIndex = -1
    if (itemTitle) {
      const titleKey = normalizeText(itemTitle)
      const titleLine = lineItems.find(item => normalizeText(item.value).includes(titleKey))
      if (titleLine) titleIndex = titleLine.index
    }
    if (titleIndex >= 0) {
      const nextLine = lineItems.find(item => item.index > titleIndex)?.value
      if (nextLine && normalizeText(nextLine) !== normalizeText(itemTitle || "")) {
        itemSku = nextLine
      }
    }
    if (!itemSku && uniqueLines.length > 1) {
      const matched = uniqueLines.find((line, idx) => idx > 0 && skuKeyword.test(line))
      itemSku = matched || uniqueLines[1] || undefined
    } else if (uniqueLines.length === 1 && itemTitle) {
      const inlineSku =
        (uniqueLines[0].match(/(套餐|SKU|型号|规格)[:：]?\s*([^\n]+)/i) || [])[2] ||
        undefined
      itemSku = inlineSku ? inlineSku.trim() : undefined
    }
  }
  return { itemTitle, itemSku }
}

function parseItemTitle(text: string) {
  return parseDeviceInfo(text).itemTitle
}

function parseItemSku(text: string) {
  return parseDeviceInfo(text).itemSku
}

function inferPlatform(text: string) {
  if (/闲鱼/.test(text)) return "XIANYU"
  if (/小程序|支付宝/.test(text)) return "OTHER"
  return "OTHER"
}

function normalizeHeaderKey(input: string) {
  return input.replace(/\s+/g, "").trim()
}

function findCellByHeader(data: Record<string, string>, keywords: string[]) {
  const entries = Object.entries(data)
  const found = entries.find(([key]) => {
    const normalizedKey = normalizeHeaderKey(key)
    return keywords.some(keyword => normalizedKey.includes(normalizeHeaderKey(keyword)))
  })
  return found ? found[1] : ""
}

function parseOrderNo(text: string) {
  const match =
    text.match(/[A-Z]{2}\d{14,}/) ||
    text.match(/[A-Z0-9]{12,}/)
  return match ? match[0] : ""
}

function trimAfterMarkers(text: string, markers: string[]) {
  let cutIndex = -1
  for (const marker of markers) {
    const index = text.indexOf(marker)
    if (index >= 0) {
      if (cutIndex === -1 || index < cutIndex) cutIndex = index
    }
  }
  return cutIndex >= 0 ? text.slice(0, cutIndex).trim() : text.trim()
}

function normalizeLogisticsText(text: string) {
  const markers = [
    "已付/总租金",
    "订单详情",
    "物流信息",
    "历史订单",
    "转单记录",
    "【商户备注】",
    "【风控建议】",
    "认证信息",
    "风控信息",
    "审核资料",
    "取消订单",
    "确认发货",
    "顺丰发货",
    "线下取货",
    "加黑名单",
    "交易快照",
    "发起补充合同",
    "纸质回执单",
    "租赁行业交易单"
  ]
  return trimAfterMarkers(text.replace(/\s+/g, " ").trim(), markers)
}

function parseDurationDays(text: string) {
  const m = text.match(/(\d+)\s*天/)
  return m ? Number(m[1]) : undefined
}

function parseRentDates(text: string) {
  const range = parseDateRange(text)
  if (range.start || range.end) return range
  const matches = parseDateTokens(text)
  if (matches.length >= 2) {
    return { start: new Date(matches[0]!), end: new Date(matches[1]!) }
  }
  const start = (text.match(/起租[:：]?\s*(\d{4}-\d{2}-\d{2})/) || [])[1]
  const end = (text.match(/归还[:：]?\s*(\d{4}-\d{2}-\d{2})/) || [])[1]
  return {
    start: start ? new Date(start) : undefined,
    end: end ? new Date(end) : undefined
  }
}

function parseMoneyByLabels(text: string, labels: string[]) {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:：]?\\s*￥?\\s*([\\d.]+)`)
    const m = text.match(re)
    if (m) return Number(m[1])
  }
  return undefined
}

function parseAmountInfo(text: string) {
  const rentPrice = parseMoneyByLabels(text, ["租金", "租"])
  const insurancePrice = parseMoneyByLabels(text, ["保险", "保障", "保"])
  const deposit = parseMoneyByLabels(text, ["押金", "押"])
  const totalMatch =
    (text.match(/(合计|总计|总金额|金额|支付|实付)[:：]?\s*￥?\s*([\d.]+)/) || [])[2] ||
    (text.match(/￥\s*([\d.]+)/) || [])[1]
  const totalAmount = totalMatch ? Number(totalMatch) : undefined
  return { rentPrice, insurancePrice, deposit, totalAmount }
}

function parseOrderFromCells(data: Record<string, string>) {
  const promotionChannel = findCellByHeader(data, ["推广方式"])
  const orderCell = findCellByHeader(data, ["订单号", "订单编号"])
  const logisticsCellRaw = findCellByHeader(data, ["物流", "物流信息", "收货信息", "收件信息"])
  const logisticsCell = normalizeLogisticsText(logisticsCellRaw)
  const deviceCell = findCellByHeader(data, ["设备", "商品", "商品信息", "设备信息"])
  const rentCell = findCellByHeader(data, [
    "租期",
    "租赁",
    "租赁时间",
    "租期/时间",
    "租期时间",
    "租赁期限",
    "租用时间",
    "使用时间"
  ])
  const amountCell = findCellByHeader(data, ["金额", "费用", "价格"])
  const statusCell = findCellByHeader(data, ["状态", "订单状态", "当前状态", "状态/操作"])
  const merchantCell = findCellByHeader(data, ["商户", "商户名称"])

  const orderNo = parseOrderNo(orderCell)
  const merchantName =
    parseMerchantName(merchantCell) || parseMerchantName(orderCell) || parseMerchantName(logisticsCellRaw)
  const { itemTitle, itemSku } = parseDeviceInfo(deviceCell)

  const phoneMatch = logisticsCell.match(/1\d{2}\*{4}\d{4}|1\d{10}/)
  const recipientPhone = phoneMatch ? phoneMatch[0] : undefined
  let recipientName =
    (logisticsCell.match(/收货人[:：]?\s*([^\s|]+)/) || [])[1] ||
    (logisticsCell.match(/收件人[:：]?\s*([^\s|]+)/) || [])[1] ||
    undefined
  if (!recipientName && recipientPhone) {
    const beforePhone = logisticsCell.split(recipientPhone)[0] || ""
    recipientName = beforePhone.trim().split(/\s+/).slice(-1)[0] || undefined
  }
  let address =
    (logisticsCell.match(/地址[:：]?\s*([^\n]+)/) || [])[1] || undefined
  if (!address && recipientPhone) {
    const afterPhone = (logisticsCell.split(recipientPhone)[1] || "").trim()
    address = afterPhone || undefined
  }

  const productName = itemTitle || undefined
  const variantName = itemSku || undefined

  const rentSource = [rentCell, deviceCell].filter(Boolean).join("\n")
  const duration = parseDateRangeDays(rentSource) || parseDurationDays(rentSource)
  const { start: rentStartDate, end: returnDeadline } = parseRentDates(rentSource)

  const { rentPrice, insurancePrice, deposit, totalAmount } = parseAmountInfo(amountCell)
  const computedTotal = totalAmount ?? (rentPrice || 0) + (insurancePrice || 0)

  const status = statusCell.split(/\s+/)[0] || undefined
  const platform = inferPlatform([promotionChannel, orderCell, logisticsCell].join(" "))

  return {
    orderNo,
    productName,
    variantName,
    itemTitle,
    itemSku,
    merchantName,
    customerName: recipientName,
    recipientPhone,
    address,
    rentPrice,
    deposit,
    insurancePrice,
    duration,
    status,
    platform,
    promotionChannel,
    rentStartDate,
    returnDeadline,
    totalAmount: computedTotal,
    logisticsCompany: undefined as string | undefined,
    trackingNumber: undefined as string | undefined,
    latestLogisticsInfo: undefined as string | undefined,
    returnLogisticsCompany: undefined as string | undefined,
    returnTrackingNumber: undefined as string | undefined,
    returnLatestLogisticsInfo: undefined as string | undefined
  }
}

function parseOrderFromText(text: string) {
  const orderNo = (text.match(/订单编号[:：]\s*([A-Z0-9]+)/) || [])[1] || ""
  const productName = parseItemTitle(text) || undefined
  const merchantName = parseMerchantName(text)
  const { itemTitle, itemSku } = parseDeviceInfo(text)
  const customerName = (text.match(/昵称[:：].*?\s([^\s]+)\s+\d/) || [])[1] || undefined
  const recipientPhone = (text.match(/昵称[:：].*?\s[^\s]+\s+([0-9*]+)/) || [])[1] || undefined

  let address: string | undefined
  if (recipientPhone) {
    const phoneIndex = text.indexOf(recipientPhone)
    if (phoneIndex > -1) {
      const afterPhone = text.slice(phoneIndex + recipientPhone.length).trim()
      address = trimAfterMarkers(afterPhone, [
        "已付/总租金",
        "订单详情",
        "物流信息",
        "历史订单",
        "转单记录",
        "【商户备注】",
        "【风控建议】",
        "认证信息",
        "风控信息",
        "审核资料",
        "取消订单",
        "确认发货",
        "顺丰发货",
        "线下取货",
        "加黑名单",
        "交易快照",
        "发起补充合同",
        "纸质回执单",
        "租赁行业交易单"
      ])
    }
  }
  if (!address) {
     address = (text.match(/[0-9*]+\s+([^\n]+?)\s+已付\/总租金/) || [])[1] || undefined
  }

  const rentPrice =
    parseNumber((text.match(/已付\/总租金[:：][^\n]*\/\s*([￥\s]*[\d.]+)/) || [])[1]) ||
    parseMoneyByLabels(text, ["租金", "租"])
  const deposit =
    parseNumber((text.match(/商品押金[:：]\s*￥\s*([\d.]+)/) || [])[1]) ||
    parseMoneyByLabels(text, ["押金", "押"])
  const insurancePrice =
    parseNumber((text.match(/增值服务[:：]\s*￥\s*([\d.]+)/) || [])[1]) ||
    parseMoneyByLabels(text, ["保险", "保障", "保"])
  const duration = parseDateRangeDays(text) || parseDurationDays(text)
  const { start: rentStartDate, end: returnDeadline } = parseRentDates(text)
  const status =
    (text.match(
      /(待付款|待审核|订单待分配|待分配员工|待发货|待收货|待归还|已逾期|设备归还中|归还中|已完成|已关闭|已取消|审核拒绝|已买断|已购买|退租中|审核中)/
    ) || [])[1] || undefined

  let promotionChannel = ""
  // Debug: Log context around "下单渠道" to help diagnose extraction issues
  const debugContext = text.match(/(下单渠道[\s\S]{0,100})/)
  if (debugContext) {
      addLog(`[Extraction Debug] Found context: ${debugContext[1].replace(/\n/g, "\\n")}`)
  }

  // Improved regex: use non-greedy dot matching (stops at newline) and explicit lookaheads
  const channelMatch = text.match(/下单渠道[:：]?\s*(.*?)(?=\s+(?:公域来源|商品|套餐|订单)|\s*[\r\n]|$)/)
  if (channelMatch) {
    promotionChannel = channelMatch[1].trim()
  }
  
  const publicSourceMatch = text.match(/公域来源[:：]?\s*(.*?)(?=\s+(?:商品|套餐|订单)|\s*[\r\n]|$)/)
  if (publicSourceMatch) {
    const publicSource = publicSourceMatch[1].trim()
    if (publicSource) {
      promotionChannel = promotionChannel ? `${promotionChannel} - ${publicSource}` : publicSource
    }
  }

  const platform = inferPlatform(text + " " + promotionChannel)
  const totalAmount =
    parseAmountInfo(text).totalAmount ?? (rentPrice || 0) + (insurancePrice || 0)

  return {
    orderNo,
    productName,
    variantName: "-" as string | undefined,
    itemTitle,
    itemSku,
    merchantName,
    customerName,
    recipientPhone,
    address,
    rentPrice,
    deposit,
    insurancePrice,
    duration,
    status,
    platform,
    promotionChannel,
    rentStartDate,
    returnDeadline,
    totalAmount,
    logisticsCompany: undefined as string | undefined,
    trackingNumber: undefined as string | undefined,
    latestLogisticsInfo: undefined as string | undefined,
    returnLogisticsCompany: undefined as string | undefined,
    returnTrackingNumber: undefined as string | undefined,
    returnLatestLogisticsInfo: undefined as string | undefined
  }
}

async function parseLogisticsModal(page: Page, scope: PageOrFrame) {
  let target: PageOrFrame = page
  try {
    // Wait for modal to exist in DOM (it might be added via AJAX after click)
    // We check both Page and Scope because we aren't sure where it renders.
    let found = false
    const start = Date.now()
    // Poll for up to 5 seconds for the modal to appear in DOM
    while (Date.now() - start < 5000) {
        const modalInPage = await page.$("#ajaxModal").catch(() => null)
        if (modalInPage) {
            target = page
            found = true
            break
        }
        
        // Check scope if it's different/relevant
        // Note: scope might be the same object as page, but checking doesn't hurt
        const modalInScope = await scope.$("#ajaxModal").catch(() => null)
        if (modalInScope) {
            target = scope
            found = true
            addLog(`[Logistics Debug] Modal found in iframe scope.`)
            break
        }
        
        await new Promise(r => setTimeout(r, 200))
    }

    if (!found) {
        addLog(`[Logistics Debug] Modal #ajaxModal not found in either page or scope after 5s.`)
        return null
    }

    // Wait for visibility
    try {
      await target.waitForSelector("#ajaxModal", { state: "visible", timeout: 5000 })
    } catch (e) {
      addLog(`[Logistics Debug] Modal found but not visible within 5s.`)
      return null
    }

    // Optimize waiting: Wait for either summary or list to appear, which is faster than generic body wait
    // and ensures we have the specific content we need.
    try {
        await target.waitForFunction(
            () => {
                const summary = document.querySelector("#ajaxModal .logistics-summary")
                const list = document.querySelector("#ajaxModal .list-main")
                const body = document.querySelector("#ajaxModal .modal-body")
                // Return true if summary OR list exists and has text, OR body has substantial text
                return (summary && summary.textContent && summary.textContent.trim().length > 0) ||
                       (list && list.textContent && list.textContent.trim().length > 0) ||
                       (body && body.textContent && body.textContent.trim().length > 20)
            },
            { timeout: 8000 }
        )
    } catch (e) {
        addLog(`[Logistics Debug] Content did not appear in modal within 8s.`)
    }

    let company: string | undefined
    let trackingNumber: string | undefined
    let latestInfo: string | undefined
    let hasAnyInfo = false

    // 1. Try to extract from Summary specifically (Faster & More Accurate)
    const summaryText = await target.$eval("#ajaxModal .logistics-summary", el => (el as HTMLElement).innerText)
        .catch(() => "")
    
    // 2. Use full body text to ensure we don't miss anything
    // Previous logic used summaryText (first div) which might cause issues if info is in subsequent divs
    const fullText = await target.$eval("#ajaxModal .modal-body", el => (el as HTMLElement).innerText)
        .catch(() => "")
    
    const textToParse = fullText

    if (textToParse) {
      const cleanText = textToParse.replace(/\s+/g, " ")
      // addLog(`[Logistics Debug] Parsing text: ${cleanText.substring(0, 100)}...`)

      // Regex to extract info
      // 1. 优先匹配带括号的格式 (更精准)
      // 使用 [^）)]+ 匹配括号内的所有内容，直到遇到右括号
      const parenMatch = cleanText.match(/(?:物流单号|单号|发货物流)[:：]?\s*[（(]\s*([^）)]+)\s*[）)]/)
      
      // 2. 常规匹配 (后备)
      // Matches "物流单号: xxxx" or "单号 xxxx"
      const normalMatch = cleanText.match(/(?:物流单号|单号|发货物流)[:：]?\s*([A-Za-z0-9-\s]{6,})(?=\s*[）)]?)/)
      
      const trackMatch = parenMatch || normalMatch

      // Matches "物流公司: xxxx" or "快递: xxxx"
      const companyMatch = cleanText.match(/(?:物流公司|快递|快递公司)[:：]?\s*([^\s\d:：]+)/)
      
      trackingNumber = trackMatch?.[1]?.replace(/\s+/g, "")
      
      // Fix: Handle spaced tracking numbers inside brackets that might have been missed or partially captured
      // Example: "（ SF 1559 8611 2623 7 ）" -> "SF1559861126237"
      // If we didn't get a tracking number or it looks suspicious, try a more aggressive extraction
      if (!trackingNumber) {
          const aggressiveMatch = cleanText.match(/[（(]\s*([A-Za-z0-9\s]+)\s*[）)]/)
          if (aggressiveMatch) {
             const candidate = aggressiveMatch[1].replace(/\s+/g, "")
             // If it looks like a tracking number (long enough, mostly digits/letters)
             if (candidate.length > 8 && /^[A-Za-z0-9]+$/.test(candidate)) {
                 trackingNumber = candidate
                 addLog(`[Logistics Debug] Extracted tracking number from brackets: ${trackingNumber}`)
             }
          }
      }

      const candidateCompany = companyMatch?.[1]
      // Filter out invalid company names captured by loose regex
      if (candidateCompany && !/^(物流单号|单号|运单号)$/.test(candidateCompany)) {
          company = candidateCompany
          if (company === "SFEXPRESS") company = "顺丰速运"
      }
      
      // Special handling for offline pickup in modal
      if (cleanText.includes("线下取货") || cleanText.includes("线下自提")) {
          company = "线下自提"
          trackingNumber = ""
      }
      
      if (!trackingNumber) {
         const mNum = cleanText.match(/(SF[0-9]{10,}|JD[0-9]{10,}|[0-9]{12,})/)
         if (mNum) trackingNumber = mNum[0]
      }
      
      if (company || trackingNumber) hasAnyInfo = true
    }

    // 3. Extract Latest Info from List
    // Try multiple selectors for robustness
    const infoSelectors = [
      "#ajaxModal .list-main > div:nth-child(1) .info", // First item info
      "#ajaxModal .list-main .info", // Any info
      ".list-main .info"
    ]
    
    for (const sel of infoSelectors) {
      const text = await target.$eval(sel, el => (el as HTMLElement).innerText).catch(() => null)
      if (text && text.trim()) {
        latestInfo = text.trim()
        break
      }
    }
    
    if (latestInfo) hasAnyInfo = true

    // Special case: Empty logistics (Labels present but no values)
    // If we haven't found any info yet, but the text contains the labels, treat it as empty success
    if (!hasAnyInfo && textToParse) {
        const cleanText = textToParse.replace(/\s+/g, " ")
        const hasLabels = /(?:物流单号|单号|发货物流)[:：]?/.test(cleanText) && /(?:物流公司|快递|快递公司)[:：]?/.test(cleanText)
        if (hasLabels) {
            hasAnyInfo = true
            company = company || ""
            trackingNumber = trackingNumber || ""
            latestInfo = latestInfo || ""
            addLog(`[Logistics Debug] Detected empty logistics info (labels present).`)
        }
    }

    // Log for debugging if we fail OR succeed to verify
    if (!hasAnyInfo) {
       addLog(`[Logistics Debug] Extraction failed. Full Text: ${fullText.substring(0, 300)}...`)
    } else {
       // Optional: log success for verification if user reports issues
       // addLog(`[Logistics Debug] Extracted: ${company} / ${trackingNumber} / ${latestInfo?.substring(0, 10)}...`)
    }

    // Close the modal
    try {
      // Scroll to bottom just in case
      await target.$eval("#ajaxModal .modal-body", el => { el.scrollTop = el.scrollHeight }).catch(() => void 0)
      
      const closeSelectors = [
        "#ajaxModal .modal-header .close",
        "button.close",
        ".modal-footer .btn"
      ]
      
      let closed = false
      for (const selector of closeSelectors) {
        if (await target.$(selector)) {
          await target.click(selector).catch(() => void 0)
          closed = true
          break
        }
      }
      
      if (!closed) {
         // Try Escape on the page (keyboard events usually go to page)
         await page.keyboard.press("Escape").catch(() => void 0)
      }
      
      // Wait for it to disappear
      await target.waitForSelector("#ajaxModal", { state: "hidden", timeout: 2000 }).catch(() => void 0)
    } catch {
      // Ignore close errors
    }

    if (!hasAnyInfo) return null
    return { company, trackingNumber, latestInfo }

  } catch (e) {
    addLog(`[Logistics Debug] Error in parseLogisticsModal: ${e}`)
    return null
  }
}

async function extractLogisticsFromDetailsPage(
  page: Page,
  row: ElementHandle<Element> | ElementHandle<Node>
) {
  const detailTimeoutMs = 15000
  let newPage: Page | null = null
  try {
    const detailBtn = await row.$("div.ops.list-inner > a.order_detail_key")
    if (!detailBtn) {
      addLog("[Detail Debug] Order detail button not found in row")
      return null
    }

    const href = await detailBtn.getAttribute("href").catch(() => null)
    const context = page.context()

    if (href && href.trim() !== "" && !href.startsWith("javascript:") && !href.startsWith("#")) {
        newPage = await context.newPage()
        const targetUrl = new URL(href, page.url()).toString()
        await newPage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: detailTimeoutMs })
        await newPage.waitForTimeout(1000) // Wait for stability
        addLog("[Detail Debug] Detail page opened and loaded via URL")
    } else {
        addLog(`[Detail Debug] Clicking detail button (href: ${href || 'null'})...`)
        const pagePromise = context.waitForEvent("page", { timeout: detailTimeoutMs })
        await detailBtn.click({ modifiers: ["Control"] }) 
        newPage = await pagePromise
        await Promise.race([
          newPage.waitForLoadState("domcontentloaded"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("detail page load timeout")), detailTimeoutMs))
        ])
        await newPage.waitForTimeout(1000) // Wait for stability
        addLog("[Detail Debug] Detail page opened and loaded via Click")
    }

    // Selectors from user
    const shipSelector = "body > div.wb-container > div:nth-child(5) > div:nth-child(7) > div:nth-child(3)"
    const returnSelector = "body > div.wb-container > div:nth-child(5) > div:nth-child(10) > div:nth-child(2)"
    const statusSelector = "body > div.wb-container > div:nth-child(5) > div:nth-child(4) > div:nth-child(3) > div"

    // Helper to parse text from selector
    const parseInfo = async (selector: string, label: string) => {
      try {
        // addLog(`[Detail Debug] Extracting ${label}...`)
        const text = await newPage!.$eval(selector, el => (el as HTMLElement).innerText).catch(() => "")
        if (!text) return null
        const clean = text.replace(/\s+/g, " ").trim()
        
        // Extract company
        let company: string | undefined = (clean.match(/(?:物流公司|快递公司)[:：]?\s*([^\s]+)/) || [])[1]
        if (company && /^(物流单号|单号|运单号|发货物流)$/.test(company)) {
            company = undefined
        }
        if (company === "SFEXPRESS") company = "顺丰速运"
        
        // Extract tracking number
        // Allow Chinese characters for cases like "无单号"
        // Updated: Removed Chinese characters to avoid capturing status text, added '发货物流'
        // Updated: Handle spaces in tracking number and parentheses (e.g. "（ SF 123 456 ）")
        let trackingNumber = (clean.match(/(?:物流单号|运单号|发货物流)[:：]?\s*(?:[（(]\s*)?([A-Za-z0-9\s-]+)(?:[）)\s])?/) || [])[1]
        if (trackingNumber) {
           trackingNumber = trackingNumber.replace(/\s+/g, "")
           // If result is too short after stripping spaces, ignore it (likely noise)
           if (trackingNumber.length < 5) trackingNumber = ""
        }
        
        // Special handling for offline pickup
        if (clean.includes("线下取货") || clean.includes("线下自提")) {
             return { company: "线下自提", trackingNumber: "", raw: clean }
        }

        if (company || trackingNumber) {
            return { company, trackingNumber, raw: clean }
        }
        return null
      } catch {
        return null
      }
    }

    // Helper to parse status
    const parseStatus = async (selector: string) => {
        try {
            const text = await newPage!.$eval(selector, el => (el as HTMLElement).innerText).catch(() => "")
            if (!text) return undefined
            // Extract "待收货" from "订单状态: 待收货"
            const match = text.match(/订单状态[:：]?\s*([^\s]+)/)
            return match ? match[1].trim() : undefined
        } catch {
            return undefined
        }
    }

    const shippingInfo = await parseInfo(shipSelector, "shipping")
    const returnInfo = await parseInfo(returnSelector, "return")
    const status = await parseStatus(statusSelector)

    return { shippingInfo, returnInfo, status }

  } catch (e) {
    if (String(e).includes("timeout")) {
      addLog("[Detail Debug] Detail page load timeout, skipping order")
      return null
    }
    addLog(`[Detail Debug] Error extracting details: ${e}`)
    return null
  } finally {
    if (newPage && !newPage.isClosed()) {
      await newPage.close().catch(() => void 0)
    }
  }
}

async function extractParsedOrders(page: Page, scope: PageOrFrame, selectors: SelectorMap, options?: { concurrencyLimit?: number }) {
  await revealReceiverInfo(scope, selectors)
  const rowSelector = await resolveRowSelector(scope, selectors)
  if (!rowSelector) return []
  const rowHandles = await scope.$$(rowSelector)
  type RowHandle = (typeof rowHandles)[number]
  let headerTexts: string[] | null = null
  if (rowHandles.length > 0) {
    headerTexts = await rowHandles[0].evaluate(row => {
      const table = row.closest("table")
      if (!table) return null
      let headers = Array.from(table.querySelectorAll("thead th"))
        .map(th => (th.textContent || "").trim())
        .filter(Boolean)
      if (headers.length === 0) {
        headers = Array.from(table.querySelectorAll("th"))
          .map(th => (th.textContent || "").trim())
          .filter(Boolean)
      }
      return headers.length > 0 ? headers : null
    })
  }
  const parsed: Awaited<ReturnType<typeof parseOrderFromText>>[] = []
  const detailTasks: Array<{
    row: RowHandle
    base: Awaited<ReturnType<typeof parseOrderFromText>>
    statusRef: { value: string }
    updateStatus: "missing" | "always" | "never"
    applyShipping: boolean
    applyReturn: boolean
    label: "status" | "groupA" | "fallback" | "final"
  }> = []
  const existingOrderLogisticsCache = new Map<string, boolean>()
  const maxDetailTasks = 5
  for (let i = 0; i < rowHandles.length; i += 1) {
    try {
      const row = rowHandles[i]
      if (i > 0 && i % 5 === 0) {
        await waitRandom(scope, 200, 700)
      }
      const rawText = await row.innerText()

      // Fix: Skip pagination/footer rows that are mistakenly picked up by the selector
      if ((rawText.includes("共") && rawText.includes("条记录")) || (rawText.includes("下一页") && rawText.includes("尾页"))) {
        continue
      }

      const text = rawText.replace(/\s+/g, " ").trim()
      const textBase = parseOrderFromText(rawText)
      let base = textBase
      if (headerTexts && headerTexts.length > 0) {
        const structured = await row.evaluate((row, headers) => {
          const cells = Array.from(row.querySelectorAll("td"))
          if (cells.length === 0) return null
          const data: Record<string, string> = {}
          headers.forEach((header, index) => {
            const cell = cells[index] as HTMLElement | undefined
            if (!cell) return
            const value = (cell.innerText || cell.textContent || "").trim()
            if (value) data[header] = value
          })
          return Object.keys(data).length > 0 ? data : null
        }, headerTexts)
        if (structured) {
          const cellBase = parseOrderFromCells(structured)
          if (cellBase.orderNo) {
            base = cellBase
            // Fallback: If cell parsing missed promotionChannel, use the one from raw text
            if (!base.promotionChannel && textBase.promotionChannel) {
              base.promotionChannel = textBase.promotionChannel
            }
          }
        }
      }
      if (!base.merchantName) base.merchantName = parseMerchantName(rawText)
      if (!base.itemTitle) base.itemTitle = parseItemTitle(rawText)
      if (!base.itemSku) base.itemSku = parseItemSku(rawText)
      if (!base.rentStartDate || !base.returnDeadline) {
        const { start, end } = parseDateRange(rawText)
        if (!base.rentStartDate && start) base.rentStartDate = start
        if (!base.returnDeadline && end) base.returnDeadline = end
        if (!base.duration && start && end) {
          const ms = end.getTime() - start.getTime()
          const days = Math.round(ms / (24 * 3600 * 1000)) + 1
          if (days > 0) base.duration = days
        }
      }
      if (base.orderNo) {
        const existingOrder = await prisma.order.findUnique({
          where: { orderNo: base.orderNo },
          select: {
            status: true,
            logisticsCompany: true,
            trackingNumber: true,
            returnLogisticsCompany: true,
            returnTrackingNumber: true
          }
        })
        if (existingOrder?.status === "COMPLETED") {
          addLog(`Skip completed order ${base.orderNo}`)
          continue
        }
        if (!existingOrderLogisticsCache.has(base.orderNo)) {
          existingOrderLogisticsCache.set(base.orderNo, false)
        }
      }
      try {
        // Try to find status in the ops column first (as user feedback suggests it's accurate for some)
        const opsDiv = await row.$("div.ops.list-inner")
        let statusFromOps = ""
        if (opsDiv) {
            const rawOpsText = (await opsDiv.innerText()) || ""
            // Clean up: remove known action button texts to avoid confusion, though usually status is distinct
            // Known statuses list
            const knownStatuses = [
                "待付款", "待审核", "订单待分配", "待分配员工", "待发货", 
                "待收货", "待归还", "已逾期", "设备归还中", "归还中", 
                "已完成", "已关闭", "已取消", "审核拒绝", "已买断", 
                "已购买", "退租中", "审核中"
            ]
            // Find if any known status is present in the ops text
            statusFromOps = knownStatuses.find(s => rawOpsText.includes(s)) || ""
            
            // If not found, maybe it's a pure text node in there?
            if (!statusFromOps) {
                 // Try span again as fallback for simple cases
                 const statusSpan = await row.$("div.ops.list-inner > span")
                 const spanText = statusSpan ? (await statusSpan.textContent())?.trim() || "" : ""
                 if (spanText && spanText.length < 10) statusFromOps = spanText
            }
        }

        let status = statusFromOps || base.status || ""
        const statusRef = { value: status }
        
        if (!status) {
            // Fallback: try to extract status from the whole row text using regex
             const fallbackStatus = (text.match(
                /(待付款|待审核|订单待分配|待分配员工|待发货|待收货|待归还|已逾期|设备归还中|归还中|已完成|已关闭|已取消|审核拒绝|已买断|已购买|退租中|审核中)/
            ) || [])[1]
            if (fallbackStatus) {
                status = fallbackStatus
                statusRef.value = fallbackStatus
                addLog(`[Status Debug] Recovered status '${fallbackStatus}' from row text for ${base.orderNo}`)
            } else {
                addLog(`[Status Debug] Failed to parse status for ${base.orderNo}. Row text snippet: ${(text || "").substring(0, 50)}...`)
            }
        }

        const isFinalStatus =
          status.includes("已完成") ||
          status.includes("已关闭") ||
          status.includes("已买断") ||
          status.includes("已购买") ||
          status.includes("已取消")
        const listHasLogistics =
          (!!base.logisticsCompany && !!base.trackingNumber) ||
          (!!base.returnLogisticsCompany && !!base.returnTrackingNumber)
        const skipDetail =
          (isFinalStatus && listHasLogistics)
        let detailScheduled = false
        const scheduleDetail = (task: Omit<(typeof detailTasks)[number], "row" | "base" | "statusRef">) => {
          if (detailScheduled) return
          if (detailTasks.length >= maxDetailTasks) return
          if (skipDetail) return
          detailTasks.push({ row, base, statusRef, ...task })
          detailScheduled = true
        }

        // If status is still missing, try detail page
        if (!status || status === "未知") {
             addLog(`[Status Debug] Status missing for ${base.orderNo}, trying detail page extraction...`)
             scheduleDetail({
               updateStatus: "missing",
               applyShipping: true,
               applyReturn: true,
               label: "status"
             })
        }

        const needLogistics =
          status.includes("待收货") ||
          status.includes("待归还") ||
          status.includes("已逾期") ||
          status.includes("设备归还中") ||
          status.includes("归还中") ||
          status.includes("已完成")

        if (needLogistics && !detailScheduled) {
          let extracted = false
          // Group A: Returning or Completed -> Prefer Detail Page for shipping history
          // Note: "设备归还中" is technically returning, user said "归还中"
          if (status.includes("归还中") || status.includes("已完成") || status.includes("设备归还中")) {
             // For returning/completed, user wants previous shipping info via detail page
             // We can also try modal for latest return status if it's "Returning"
             // But let's prioritize the detail page flow as requested
             addLog(`[Logistics] Status ${status}, using Detail Page flow for ${base.orderNo}`)
             
             scheduleDetail({
               updateStatus: "missing",
               applyShipping: true,
               applyReturn: true,
               label: "groupA"
             })
             extracted = true
          }
          
          // Group B: To Receive/Return/Overdue -> Try Modal first, then Detail Page
          if (!extracted && (status.includes("待收货") || status.includes("待归还") || status.includes("已逾期"))) {
              const link = await row.$("div.ops.list-inner > a.op.text-primary")
              if (link) {
                await waitRandom(scope, 200, 800)
                await link.scrollIntoViewIfNeeded().catch(() => void 0)
                await link.click({ timeout: 1500, noWaitAfter: true }).catch(() => void 0)
                let modal = await Promise.race([
                  parseLogisticsModal(page, scope),
                  new Promise<null>(resolve => setTimeout(() => resolve(null), 15000))
                ])
                if (!modal) {
                  await waitRandom(scope, 200, 600)
                  await link.click({ timeout: 1500, noWaitAfter: true }).catch(() => void 0)
                  modal = await Promise.race([
                    parseLogisticsModal(page, scope),
                    new Promise<null>(resolve => setTimeout(() => resolve(null), 15000))
                  ])
                }
                if (modal) {
                    base.logisticsCompany = modal.company
                    base.trackingNumber = modal.trackingNumber
                    base.latestLogisticsInfo = modal.latestInfo
                    addLog(`Extracted logistics for ${base.orderNo}: ${modal.company || '未知公司'} ${modal.trackingNumber || '无单号'}`)
                    extracted = true
                } else {
                  addLog(`Failed to extract logistics from modal for ${base.orderNo}, trying detail page...`)
                }
              }
              
              // Fallback to Detail Page if Modal failed or incomplete (no tracking number, unless it's offline pickup)
               const isOffline = base.logisticsCompany && /线下|自提|无需/.test(base.logisticsCompany)
               if ((!base.trackingNumber && !isOffline) || !base.logisticsCompany) {
                   scheduleDetail({
                     updateStatus: "always",
                     applyShipping: true,
                     applyReturn: true,
                     label: "fallback"
                   })
               }
          }
          
          // Final fallback: if still no logistics and status suggests shipping may exist or offline pickup,
          // attempt detail page extraction once to catch cases like 线下自提
          // Only try if we haven't already tried the detail page (detailPageResult is null)
          if (!extracted && !detailScheduled && (!base.logisticsCompany || (!base.trackingNumber && !/线下|自提|无需/.test(base.logisticsCompany || "")))) {
              addLog(`[Final Fallback] Trying detail page for ${base.orderNo} due to missing logistics`)
              scheduleDetail({
                updateStatus: "never",
                applyShipping: true,
                applyReturn: false,
                label: "final"
              })
          }
        }
        base.status = status || undefined
      } catch (e) {
        addLog(`[Error] Non-critical error processing row logic: ${e}`)
      }
      parsed.push(base)
    } catch (e) {
      addLog(`[Error] Critical error processing row: ${e}`)
      if (String(e).includes("Target page, context or browser has been closed")) {
          addLog("[System] Browser crash detected. Resetting context.")
          try { if (runtime.context) await runtime.context.close() } catch {}
          runtime.context = undefined
          runtime.page = undefined
      }
    }
  }
  if (detailTasks.length > 0) {
    let nextIndex = 0
    const concurrency = Math.min(options?.concurrencyLimit || 3, detailTasks.length, 5)
    const worker = async () => {
      while (true) {
        const currentIndex = nextIndex
        if (currentIndex >= detailTasks.length) break
        nextIndex += 1
        const task = detailTasks[currentIndex]
        const details = await extractLogisticsFromDetailsPage(page, task.row)
        if (!details) {
          if (task.label === "fallback") {
            addLog(`[Detail Debug] Detail page could not be opened for ${task.base.orderNo}`)
          } else if (task.label === "final") {
            addLog(`[Final Fallback] Still no logistics for ${task.base.orderNo}`)
          }
          continue
        }
        if (details.status) {
          const currentStatus = task.statusRef.value
          if (
            task.updateStatus === "always" ||
            (task.updateStatus === "missing" && (!currentStatus || currentStatus === "未知"))
          ) {
            task.statusRef.value = details.status
            task.base.status = details.status
            if (task.label === "fallback") {
              addLog(`[Fallback] Updated status for ${task.base.orderNo} to ${details.status}`)
            } else if (task.label === "status") {
              addLog(`[Detail] Recovered status for ${task.base.orderNo} from detail page: ${details.status}`)
            } else if (task.label === "groupA") {
              addLog(`[Detail] Updated status for ${task.base.orderNo} to ${details.status}`)
            }
          }
        }
        if (task.applyShipping && details.shippingInfo) {
          task.base.logisticsCompany = details.shippingInfo.company
          task.base.trackingNumber = details.shippingInfo.trackingNumber
          task.base.latestLogisticsInfo = details.shippingInfo.raw
          if (task.label === "fallback") {
            addLog(`[Fallback] Extracted shipping from detail for ${task.base.orderNo}`)
          } else if (task.label === "final") {
            addLog(`[Final Fallback] Extracted shipping for ${task.base.orderNo}: ${task.base.logisticsCompany || '未知公司'} ${task.base.trackingNumber || '无单号'}`)
          } else {
            addLog(`[Detail] Extracted shipping for ${task.base.orderNo}: ${task.base.logisticsCompany} ${task.base.trackingNumber}`)
          }
        }
        if (task.applyReturn && details.returnInfo) {
          task.base.returnLogisticsCompany = details.returnInfo.company
          task.base.returnTrackingNumber = details.returnInfo.trackingNumber
          task.base.returnLatestLogisticsInfo = details.returnInfo.raw
          if (task.label === "fallback") {
            addLog(`[Fallback] Extracted return info from detail for ${task.base.orderNo}`)
          } else {
            addLog(`[Detail] Extracted return for ${task.base.orderNo}: ${task.base.returnLogisticsCompany} ${task.base.returnTrackingNumber}`)
          }
        }
        if (!details.shippingInfo && !details.returnInfo && task.label === "fallback") {
          addLog(`[Detail Debug] No logistics info found on detail page for ${task.base.orderNo}`)
        }
      }
    }
    const workers = Array.from({ length: concurrency }, () => worker())
    await Promise.all(workers)
  }
  return parsed
}

function mapStatus(cnStatus: string): string {
  if (!cnStatus) return "PENDING_REVIEW" // Default safe fallback
  
  if (cnStatus.includes("待审核") || cnStatus.includes("审核中") || cnStatus.includes("待付款")) return "PENDING_REVIEW"
  if (cnStatus.includes("待发货") || cnStatus.includes("待分配")) return "PENDING_SHIPMENT"
  if (cnStatus.includes("待收货")) return "PENDING_RECEIPT"
  if (cnStatus.includes("待归还")) return "RENTING"
  if (cnStatus.includes("已逾期")) return "OVERDUE"
  if (cnStatus.includes("归还中") || cnStatus.includes("退租中")) return "RETURNING"
  if (cnStatus.includes("已完成")) return "COMPLETED"
  if (cnStatus.includes("已买断") || cnStatus.includes("已购买")) return "BOUGHT_OUT"
  if (cnStatus.includes("已关闭") || cnStatus.includes("已取消") || cnStatus.includes("拒绝")) return "CLOSED"
  
  return "PENDING_REVIEW" // Fallback
}

async function saveOrdersToDB(orders: NonNullable<NonNullable<ZanchenStatus["lastResult"]>["parsedOrders"]>) {
  const allowedMerchants = ["团团享", "米奇租赁"]
  const products = await prisma.product.findMany({
    select: { id: true, name: true, variants: true, matchKeywords: true }
  })
  let savedCount = 0
  for (const o of orders) {
    if (!o.orderNo) continue
    try {
      // Removed merchant filter as we are scraping the Zanchen portal directly, 
      // so all orders found here are valid Zanchen orders.
      // const merchantName = o.merchantName || ""
      // const isAllowedMerchant = allowedMerchants.some(keyword => merchantName.includes(keyword))
      // if (!isAllowedMerchant) {
      //   await prisma.order.deleteMany({ where: { orderNo: o.orderNo, creatorId: "system" } })
      //   continue
      // }
      let source = "RETAIL"
      const promo = o.promotionChannel || ""
      if (promo.includes("同行")) source = "PEER"
      else if (promo.includes("兼职") || promo.includes("代理")) source = "PART_TIME_AGENT"

      // Enforce ZANCHEN platform identifier for all orders scraped from Zanchen
      const platform = "ZANCHEN"

      const deviceMapping = matchDeviceMapping(
        o.itemTitle || o.productName,
        o.itemSku || o.variantName,
        products
      )
      const mappingMatched = deviceMapping?.deviceName
      const matched =
        matchProductByTitle(mappingMatched || o.itemTitle || o.productName, o.itemSku || o.variantName, products) ||
        null
      const productName =
        mappingMatched ||
        matched?.productName ||
        o.productName ||
        o.itemTitle ||
        "未知商品"
      const variantName = matched?.variantName || o.itemSku || o.variantName || promo || "-"
      const productId = matched?.productId
      const rentStartDate = o.rentStartDate ? new Date(o.rentStartDate) : undefined
      const returnDeadline = o.returnDeadline ? new Date(o.returnDeadline) : undefined
      const rentStartDateValue =
        rentStartDate && !Number.isNaN(rentStartDate.getTime()) ? rentStartDate : undefined
      const returnDeadlineValue =
        returnDeadline && !Number.isNaN(returnDeadline.getTime()) ? returnDeadline : undefined

      const mappedStatus = mapStatus(o.status || "")

      await prisma.onlineOrder.upsert({
        where: { orderNo: o.orderNo },
        update: {
          source,
          platform,
          promotionChannel: promo || undefined,
          status: mappedStatus,
          customerXianyuId: o.customerName || "",
          sourceContact: o.customerName || "",
          productName,
          variantName,
          productId,
          itemTitle: o.itemTitle || undefined,
          itemSku: o.itemSku || undefined,
          merchantName: o.merchantName || undefined,
          duration: o.duration || 0,
          rentPrice: o.rentPrice || 0,
          deposit: o.deposit || 0,
          insurancePrice: o.insurancePrice || 0,
          totalAmount: o.totalAmount || 0,
          address: o.address || "-",
          customerName: o.customerName || undefined,
          recipientPhone: o.recipientPhone || undefined,
          logisticsCompany: o.logisticsCompany || undefined,
          trackingNumber: o.trackingNumber || undefined,
          latestLogisticsInfo: o.latestLogisticsInfo || undefined,
          returnLogisticsCompany: o.returnLogisticsCompany || undefined,
          returnTrackingNumber: o.returnTrackingNumber || undefined,
          returnLatestLogisticsInfo: o.returnLatestLogisticsInfo || undefined,
          rentStartDate: rentStartDateValue || undefined,
          returnDeadline: returnDeadlineValue || undefined
        },
        create: {
          orderNo: o.orderNo,
          source,
          platform,
          promotionChannel: promo || undefined,
          status: mappedStatus,
          customerXianyuId: o.customerName || "",
          sourceContact: o.customerName || "",
          productName,
          variantName,
          productId,
          itemTitle: o.itemTitle || undefined,
          itemSku: o.itemSku || undefined,
          merchantName: o.merchantName || undefined,
          duration: o.duration || 0,
          rentPrice: o.rentPrice || 0,
          deposit: o.deposit || 0,
          insurancePrice: o.insurancePrice || 0,
          totalAmount: o.totalAmount || 0,
          address: o.address || "-",
          customerName: o.customerName || undefined,
          recipientPhone: o.recipientPhone || undefined,
          logisticsCompany: o.logisticsCompany || undefined,
          trackingNumber: o.trackingNumber || undefined,
          latestLogisticsInfo: o.latestLogisticsInfo || undefined,
          returnLogisticsCompany: o.returnLogisticsCompany || undefined,
          returnTrackingNumber: o.returnTrackingNumber || undefined,
          returnLatestLogisticsInfo: o.returnLatestLogisticsInfo || undefined,
          rentStartDate: rentStartDateValue || undefined,
          returnDeadline: returnDeadlineValue || undefined
        }
      })

      // Sync to Offline Order if exists, but only update status if advanced
      const existingOfflineOrder = await prisma.order.findUnique({
        where: { orderNo: o.orderNo },
        select: { status: true }
      })

      if (existingOfflineOrder) {
        const statusPriority: Record<string, number> = {
          "PENDING_PAYMENT": 0,
          "PENDING_REVIEW": 1,
          "PENDING_SHIPMENT": 2,
          "RENTING": 3,
          "RETURNING": 4,
          "COMPLETED": 5,
          "CLOSED": 6,
          "CANCELED": 6
        }
        
        const currentPriority = statusPriority[existingOfflineOrder.status] ?? -1
        const newPriority = statusPriority[mappedStatus] ?? -1
        
        // Always update logistics, but only update status if new status is advanced (>=)
        const updateData: any = {
          logisticsCompany: o.logisticsCompany || undefined,
          trackingNumber: o.trackingNumber || undefined,
          latestLogisticsInfo: o.latestLogisticsInfo || undefined,
          returnLogisticsCompany: o.returnLogisticsCompany || undefined,
          returnTrackingNumber: o.returnTrackingNumber || undefined,
          returnLatestLogisticsInfo: o.returnLatestLogisticsInfo || undefined,
        }
        
        if (newPriority >= currentPriority && newPriority !== -1) {
            updateData.status = mappedStatus
        }
        
        // Filter out undefined values to avoid overwriting existing data with null
        const cleanUpdateData = Object.fromEntries(
            Object.entries(updateData).filter(([_, v]) => v !== undefined)
        )

        if (Object.keys(cleanUpdateData).length > 0) {
            await prisma.order.update({
                where: { orderNo: o.orderNo },
                data: cleanUpdateData
            })
            addLog(`已同步更新本地订单: ${o.orderNo}`)
        }
      }

      savedCount++
    } catch (e) {
      addLog(`[保存失败] 订单 ${o.orderNo}: ${e}`)
    }
  }
  // await prisma.order.deleteMany({
  //   where: {
  //     creatorId: "system",
  //     NOT: {
  //       OR: allowedMerchants.map(keyword => ({
  //         merchantName: { contains: keyword }
  //       }))
  //     }
  //   }
  // })
  addLog(`保存完成，共处理 ${savedCount} 个订单`)
}

async function saveSnapshot(lastResult: NonNullable<ZanchenStatus["lastResult"]>) {
  const appConfigClient = (prisma as unknown as { appConfig?: typeof prisma.appConfig }).appConfig
  if (!appConfigClient) return false
  const value = JSON.stringify({
    capturedAt: new Date().toISOString(),
    lastResult
  })
  try {
    await appConfigClient.upsert({
      where: { key: "zanchen_last_snapshot" },
      update: { value },
      create: { key: "zanchen_last_snapshot", value }
    })
    return true
  } catch {
    return false
  }
}

function startHeartbeat(page: Page) {
  if (runtime.heartbeatTimer) {
    clearInterval(runtime.heartbeatTimer)
  }
  runtime.page = page
  runtime.heartbeatTimer = setInterval(() => {
    if (!runtime.page || runtime.page.isClosed()) return
    void runtime.page.evaluate(() => {
      try {
        fetch(location.href, { method: "GET", cache: "no-store" }).catch(() => void 0)
        document.dispatchEvent(new Event("mousemove"))
        document.dispatchEvent(new Event("keydown"))
      } catch {
        void 0
      }
    })
  }, 60_000)
  setStatus({ ...runtime.status, heartbeatActive: true })
}

async function runZanchenSync(siteId: string) {
  const config = await loadConfig()
  const site = resolveSite(config, siteId)
  if (!site) {
    setStatus({ status: "error", message: "未找到赞晨配置" })
    return
  }

  // Check if sync is enabled for this site
  let isEnabled = false
  if (siteId === "zanchen") {
    isEnabled = config?.autoSyncEnabled ?? false
  } else {
    isEnabled = site.autoSync?.enabled ?? false
  }

  if (!isEnabled) {
    setStatus({ status: "error", message: `站点 ${site.name} 的线上自动抓取未启用，无法同步` })
    return
  }

  runtime.currentSite = site.name

  if (
    !site.selectors.order_list_container?.trim() &&
    !site.selectors.order_row_selectors?.trim() &&
    !site.selectors.order_row_selector_template?.trim()
  ) {
    setStatus({ status: "error", message: "缺少订单列表容器或订单行选择器" })
    return
  }

  const headlessConfig = config?.headless ?? true
  addLog(`[System] Initializing browser. Config headless: ${config?.headless}, using: ${headlessConfig}`)
  const page = await ensurePage(headlessConfig)
  setStatus({ status: "running", message: "已连接浏览器，准备登录" })
  const currentUrl = page.url()
  const isBlank =
    !currentUrl ||
    currentUrl === "about:blank" ||
    currentUrl === "chrome://newtab/" ||
    currentUrl === "chrome://newtab"

  let needsLogin = true
  if (!isBlank) {
      // Check if already logged in (optimistic check)
      const alreadyLoggedIn = await waitUntilLoggedIn(page, site, 3000)
      if (alreadyLoggedIn) {
          needsLogin = false
          addLog("Detected active session, skipping login.")
          await page.reload({ waitUntil: "domcontentloaded" }).catch(() => void 0)
      }
  }

  if (needsLogin) {
      if (isBlank || (await isOnLoginPage(page, site))) {
        await ensureOnLogin(page, site)
      } else {
        // Not on login page, but also not logged in. Force login page.
        await ensureOnLogin(page, site)
      }
      
      setStatus({ status: "running", message: "正在提交登录信息" })
      await tryLogin(page, site)

      setStatus({ status: "running", message: "等待登录状态确认" })
      const loggedIn = await waitUntilLoggedIn(page, site, 8_000)
      const riskHint = await detectRiskHint(page)

      if (!loggedIn && ((await isOnLoginPage(page, site)) || riskHint)) {
        setStatus({
          status: "awaiting_user",
          message: riskHint ? `登录需验证: ${riskHint.reason}` : "登录需要人工验证或短信验证码",
          needsAttention: true
        })
        void loadConfig().then(cfg => sendWebhook(cfg, "登录验证等待人工介入"))

        const solved = await waitUntilLoggedIn(page, site, 5 * 60_000)
        if (!solved) {
          setStatus({ status: "error", message: "登录验证超时" })
          return
        }
      }
  }

  setStatus({ status: "running", message: "已登录，正在打开订单列表" })
  await openOrderList(page, site.selectors)
  
  await waitRandom(page, 800, 1600)

  const scope = await resolveOrderFrame(page, site.selectors)

  // Explicitly ensure we are on the first page (using scope, as pagination is likely inside the frame)
  try {
    const pageOneSelector = "#foreach_page > li:nth-child(1) > a"
    // check if visible in scope
    if (await scope.isVisible(pageOneSelector)) {
        addLog("Ensuring start from Page 1...")
        // If it has class 'disabled' or 'active', we might skip, but clicking is usually safe to reset
        // We can check if parent li has class 'active' to avoid reload if already there
        const isActive = await scope.$eval("#foreach_page > li:nth-child(1)", el => el.classList.contains("active")).catch(() => false)
        
        if (!isActive) {
            await scope.click(pageOneSelector)
            await waitRandom(page, 1500, 2500) // wait for reload
        } else {
            addLog("Already on Page 1.")
        }
    }
  } catch (e) {
      addLog("Optional Page 1 reset skipped: " + (e as Error).message)
  }

  const riskCleared = await ensureNoRisk(page, site)
  if (!riskCleared) {
    setStatus({ status: "error", message: "风控验证超时" })
    return
  }

  const container = getContainerSelector(site.selectors)
  if (container) {
    setStatus({ status: "running", message: "等待订单列表加载..." })
    try {
      // Wait for the container itself
      await scope.waitForSelector(container, { state: "visible", timeout: 10000 })
      // Try to wait for at least one child row if template is used
      if (site.selectors.order_row_selector_template) {
        const start = site.selectors.order_row_index_start || 1
        // Try to wait for the first row specifically
        const firstRowSelector = site.selectors.order_row_selector_template.replace(/\{i\}/g, String(start))
        const normalized = normalizeRowSelector(firstRowSelector, container)
        if (normalized) {
          await scope.waitForSelector(normalized, { state: "attached", timeout: 10000 }).catch(() => void 0)
        }
      }
    } catch {
      console.log("Wait for order list container timed out, proceeding anyway...")
    }
  }
  await revealReceiverInfo(scope, site.selectors)

  let extractedCount = 0
  let pagesVisited = 0
  let firstPageRows: string[] = []
  let parsedOrders: NonNullable<NonNullable<ZanchenStatus["lastResult"]>["parsedOrders"]> = []
  const parsedOrderMap = new Map<string, NonNullable<NonNullable<ZanchenStatus["lastResult"]>["parsedOrders"]>[number]>()
  let pendingSaveOrders: NonNullable<NonNullable<ZanchenStatus["lastResult"]>["parsedOrders"]> = []
  const maxPages = site.maxPages ?? 0
  const stopThreshold = config?.stopThreshold ?? 20
  let consecutiveFinalStateCount = 0
  runtime.shouldStop = false
  while (true) {
   try {
    if (runtime.shouldStop) {
      addLog("用户手动停止同步")
      break
    }
    const ok = await ensureNoRisk(page, site)
    if (!ok) {
      setStatus({ status: "error", message: "风控验证超时" })
      return
    }
    await waitRandom(scope, 300, 900)
    setStatus({
      status: "running",
      message: `正在抓取第 ${pagesVisited + 1} 页`,
      lastResult: {
        extractedCount,
        pagesVisited,
        pageUrl: page.url()
      }
    })
    const summary = await extractOrderSummary(scope, site.selectors)
    extractedCount += summary.extractedCount ?? 0
    pagesVisited += 1
    setStatus({ status: "running", message: "解析当前页订单与物流" })
    if (pagesVisited === 1) {
      firstPageRows = await extractOrderRows(scope, site.selectors)
    }
    const concurrencyLimit = siteId === "zanchen" 
      ? (config?.concurrencyLimit ?? 3) 
      : (site.autoSync?.concurrencyLimit ?? 3)
    const pageOrders = await extractParsedOrders(page, scope, site.selectors, { concurrencyLimit })
    
    // Incremental Sync Check
    if (stopThreshold > 0 && pageOrders.length > 0) {
      const orderNos = pageOrders.map(o => o.orderNo).filter(Boolean) as string[]
      if (orderNos.length > 0) {
        // Include both Chinese and English statuses to ensure we match existing orders correctly
        const finalStatuses = [
            "已完成", "已取消", "已关闭", "审核拒绝", "已买断", "已购买", "已退租", "退租完成",
            "COMPLETED", "CLOSED", "BOUGHT_OUT", "CANCELED"
        ]
        try {
          const existingFinalOrders = await prisma.order.findMany({
            where: {
              orderNo: { in: orderNos },
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
              // addLog(`[Debug] Order ${order.orderNo} is final in DB. Consecutive count: ${consecutiveFinalStateCount}`)
              if (consecutiveFinalStateCount >= stopThreshold) {
                addLog(`已连续发现 ${consecutiveFinalStateCount} 个历史终态订单，触发增量同步停止阈值。`)
                shouldStop = true
                break
              }
            } else {
              if (consecutiveFinalStateCount > 0) {
                 // addLog(`[Debug] Order ${order.orderNo} is NOT final in DB. Resetting count from ${consecutiveFinalStateCount} to 0`)
              }
              consecutiveFinalStateCount = 0
            }
          }
          if (shouldStop) break
        } catch (e) {
          console.error("Error checking incremental sync status:", e)
        }
      }
    }

    for (const order of pageOrders) {
      if (!order.orderNo) continue
      parsedOrderMap.set(order.orderNo, order)
      pendingSaveOrders.push(order)
    }

    // Batch save every 200 orders
    if (pendingSaveOrders.length >= 200) {
        addLog(`[System] 触发批量保存，正在写入 ${pendingSaveOrders.length} 条订单...`)
        await saveOrdersToDB(pendingSaveOrders)
        pendingSaveOrders = []
    }

    if (maxPages > 0 && pagesVisited >= maxPages) break
    if (!site.selectors.pagination_next_selector?.trim()) break

    let nextButton = await scope.$(site.selectors.pagination_next_selector).catch(() => null)
    let verified = false
    
    // 1. Check if configured selector matches "Next Page" text
    if (nextButton) {
        const text = (await nextButton.innerText()).trim()
        if (text.includes("下一页") || text.includes("Next") || text.includes("»") || text === ">") {
            verified = true
        } else {
            addLog(`Pagination warning: Selector matched text "${text}", which doesn't look like 'Next Page'.`)
        }
    }

    // 2. If not verified, try to find by text "下一页" in the whole scope
    if (!verified) {
        addLog("Attempting to find 'Next Page' button by text content...")
        try {
            // Priority 1: Check specifically inside #foreach_page if it exists (common pattern in this site)
            const paginationContainer = await scope.$("#foreach_page").catch(() => null)
            if (paginationContainer) {
                 const items = await paginationContainer.$$("li, a")
                 const itemTexts = []
                 for (const item of items) {
                     const t = (await item.innerText()).trim()
                     // Skip numbers
                     if (/^\d+$/.test(t)) continue
                     
                     itemTexts.push(t)
                     if (t.includes("下一页") || t.includes("Next") || t.includes("»") || t === ">") {
                         nextButton = item
                         verified = true
                         addLog(`Found 'Next Page' button in pagination container: "${t}"`)
                         break
                     }
                 }
                 if (!verified) {
                     addLog(`Pagination container found but no 'Next' button. Non-numeric items: ${itemTexts.join(", ")}`)
                 }
            }
            
            // Priority 2: General search if not found in container
            if (!verified) {
                const candidates = await scope.$$("a, li, button") 
                for (const cand of candidates) {
                    const t = (await cand.innerText()).trim()
                    // Optimization: ignore short numeric strings
                    if (t.length < 20 && !/^\d+$/.test(t)) {
                        if (t.includes("下一页") || t === "Next" || t === "Next Page" || t === "»" || t === ">") {
                            nextButton = cand
                            verified = true
                            addLog(`Found 'Next Page' button by global scan: "${t}"`)
                            break
                        }
                    }
                }
            }
        } catch (e) {
            addLog(`Error searching for Next button: ${e}`)
        }
    }

    if (!nextButton || !verified) {
        addLog("Could not find verified 'Next Page' button. Stopping.")
        break
    }

    const ariaDisabled = await nextButton.getAttribute("aria-disabled").catch(() => null)
    const disabledAttr = await nextButton.getAttribute("disabled").catch(() => null)
    const className = await nextButton.getAttribute("class").catch(() => "")
    const isDisabled =
      ariaDisabled === "true" ||
      disabledAttr !== null ||
      className?.includes("disabled") ||
      className?.includes("is-disabled")

    if (isDisabled) {
        addLog("'Next Page' button is disabled. Reached end.")
        break
    }

    await waitRandom(scope, 600, 1400)
    
    // Ensure no modal backdrops are blocking
    await scope.evaluate(() => {
        const elements = document.querySelectorAll<HTMLElement>('.modal-backdrop, .modal')
        elements.forEach((el) => {
             if (el.classList.contains('modal-backdrop') || (el.classList.contains('modal') && el.style.display === 'none')) {
                 el.remove()
             }
        })
    }).catch(() => void 0)

    try {
        // Scroll into view first
        await nextButton.scrollIntoViewIfNeeded().catch(() => void 0)
        
        // Try normal click with force: true to bypass basic visibility checks if obscured
        await nextButton.click({ timeout: 5000, force: true })
    } catch (e) {
        addLog(`Standard click failed, attempting JS click... Error: ${(e as Error).message}`)
        try {
            // Fallback to JS click
            await nextButton.evaluate((el: HTMLElement) => el.click())
        } catch (e2) {
             addLog(`JS click also failed. Error: ${(e2 as Error).message}`)
             break
        }
    }
    
    if (container) {
      await scope.waitForSelector(container, { timeout: 10000 }).catch(() => void 0)
    }
    await waitRandom(page, 800, 1600)
   } catch (e) {
     addLog(`[System] Error in sync loop: ${e}`)
     if (String(e).includes("Target page, context or browser has been closed")) {
         addLog(`[System] Browser crashed. Stopping sync to save data.`)
     }
     break
   }
  }

  const summary = await extractOrderSummary(scope, site.selectors)
  parsedOrders = Array.from(parsedOrderMap.values())
  const lastResult = {
    pendingCount: summary.pendingCount,
    extractedCount,
    pagesVisited,
    pageUrl: page.url(),
    title: await page.title(),
    rows: firstPageRows,
    parsedOrders
  }

  setStatus({ status: "running", message: "保存抓取结果到数据库" })
  const saved = await saveSnapshot(lastResult)
  if (pendingSaveOrders.length > 0) {
    addLog(`[System] 保存剩余 ${pendingSaveOrders.length} 条订单...`)
    await saveOrdersToDB(pendingSaveOrders)
  }
  startHeartbeat(page)
  setStatus({
    status: "success",
    lastRunAt: new Date().toISOString(),
    lastResult,
    heartbeatActive: true,
    snapshotSaved: saved,
    message: saved ? "已保存快照到数据库" : undefined
  })
}

export async function startZanchenSync(siteId: string) {
  if (runtime.running) return runtime.status
  runtime.running = true
  runtime.shouldStop = false
  setStatus({ status: "running", message: "正在启动同步", logs: [] })
  void runZanchenSync(siteId)
    .catch(error => {
      const message = error instanceof Error ? error.message : String(error)
      setStatus({ status: "error", message: message || "同步失败" })
    })
    .finally(() => {
      runtime.running = false
      runtime.shouldStop = false
      runtime.currentSite = undefined
    })
  return runtime.status
}

export async function stopZanchenSync() {
  if (!runtime.running) return runtime.status
  runtime.shouldStop = true
  addLog("正在停止同步...")
  return runtime.status
}

export function getZanchenStatus() {
  return runtime.status
}

export function getRunningPage() {
  return runtime.page
}

async function sendWebhook(config: OnlineOrdersConfig | null, message: string) {
    if (!config?.webhookUrls || config.webhookUrls.length === 0) {
        addLog(`[System] 未配置 Webhook，跳过发送通知 (Message: ${message})`)
        return
    }
    
    // Ensure NEXT_PUBLIC_APP_URL is available
    if (!process.env.NEXT_PUBLIC_APP_URL) {
        addLog(`[System] 警告: 未配置 NEXT_PUBLIC_APP_URL，Webhook 链接将不可用`)
    }

    let baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    // Fix common configuration error: double protocol (e.g. https://https://...)
    baseUrl = baseUrl.replace(/^https?:\/\/(https?:\/\/)/, '$1');
    // Remove trailing slash
    baseUrl = baseUrl.replace(/\/$/, "");

    const remoteLink = baseUrl 
        ? `${baseUrl}/online-orders/remote-auth`
        : "(未配置APP_URL - 请在环境变量中设置 NEXT_PUBLIC_APP_URL)"
        
    const payload = {
        msgtype: "text",
        text: {
            content: `[ERP Lite] 线上订单同步需要人工介入\n原因: ${message}\n远程处理链接: ${remoteLink}`
        }
    }
    
    addLog(`[System] 正在发送 Webhook 通知 (共 ${config.webhookUrls.length} 个端点)...`)

    for (const url of config.webhookUrls) {
        try {
            // Feishu (Lark) adaptation
            let finalPayload = payload
            if (url.includes("feishu") || url.includes("larksuite")) {
                finalPayload = {
                    msg_type: "text",
                    content: {
                        text: payload.text.content
                    }
                } as any
            }

            console.log(`[Webhook] Sending to ${url}:`, JSON.stringify(finalPayload))
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(finalPayload)
            })
            if (res.ok) {
                addLog(`[System] Webhook 发送成功`)
            } else {
                const text = await res.text().catch(() => "")
                console.error(`[Webhook] Failed: ${res.status} ${text}`)
                addLog(`[System] Webhook 发送失败: ${res.status} ${text.slice(0, 100)}`)
            }
        } catch (e) {
            console.error(`[Webhook] Error:`, e)
            addLog(`[System] Webhook 发送出错: ${e}`)
        }
    }
}
