import path from "path"
import fs from "fs"
import { chromium, type BrowserContext, type Frame, type Page } from "playwright"

// sync-tool stubs (dead code, never executed)
const prisma = null as unknown as {
  onlineOrder: { upsert: (...a: unknown[]) => Promise<unknown>; findUnique: (...a: unknown[]) => Promise<unknown>; findMany: (...a: unknown[]) => Promise<unknown[]> }
  order: { findUnique: (...a: unknown[]) => Promise<unknown>; update: (...a: unknown[]) => Promise<unknown>; findMany: (...a: unknown[]) => Promise<unknown[]> }
  product: { findMany: (...a: unknown[]) => Promise<unknown[]> }
  $transaction: (...a: unknown[]) => Promise<unknown>
}
async function autoMatchSpecId(_t: unknown, _s: unknown): Promise<string | null> { return null }

import { loadConfig, _appBasePath, getExternalConfig, type SiteConfig, type OnlineOrdersConfig } from "./zanchen"

// Re-use types or define specific ones
export type RrzStatus = {
  status: "idle" | "running" | "awaiting_user" | "error" | "success"
  message?: string
  needsAttention?: boolean
  logs?: string[]
  lastRunAt?: string
}

type RrzRuntime = {
  status: RrzStatus
  context?: BrowserContext
  page?: Page
  headless?: boolean
  shouldStop?: boolean
}

type RrzRuntimeWithApi = RrzRuntime & {
  rrzApiListenerAttached?: boolean
  rrzApiRouteAttached?: boolean
  latestOrderListData?: unknown
  latestOrderListUrl?: string
  latestOrderListText?: string
  orderListDataByPage?: Map<number, unknown>
  orderListUrlByPage?: Map<number, string>
  orderListTextByPage?: Map<number, string>
  expectedApiPage?: number
}

type RrzApiOrderListResponse = {
  data?: { list?: RrzApiOrder[] }
  list?: RrzApiOrder[]
  msg?: string
  message?: string
}

type RrzApiOrder = {
  base_info?: RrzApiBaseInfo
  spu_info?: RrzApiSpuInfo
  rent_info?: RrzApiRentInfo
  deposit_info?: RrzApiDepositInfo
  receipt_info?: RrzApiReceiptInfo
  order_pay_info?: RrzApiPayInfo
  tag?: { origin?: string }
  button_list?: Array<{ button?: number; extra?: string }>
}

type RrzApiBaseInfo = {
  order_id?: string | number
  order_status?: number
  logistic_name?: string
  logistic_number?: string
  shop_name?: string
  rental_money?: string
  ship_at?: string
  receive_date?: string
  return_date?: string
  tenancy_data?: { start_time?: string; end_time?: string; total_days?: number | string }
  return_logistic_shipper_code?: string
  return_logistic_number?: string
}

type RrzApiSpuInfo = {
  spu_name?: string
  sku_name?: string
}

type RrzApiRentInfo = {
  rental_money?: string
}

type RrzApiDepositInfo = {
  product_deposit?: string
}

type RrzApiReceiptInfo = {
  name?: string
  phone?: string
  address?: string
  desensitized_name?: string
  desensitized_phone?: string
  desensitized_address?: string
}

type RrzApiPayInfo = {
  total_cost?: string
  actual_amount_paid?: string
}

type RrzParsedOrder = {
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
  merchantName?: string
  productName: string
  variantName: string
  itemTitle: string
  itemSku: string
  logisticsCompany: string
  trackingNumber: string
  latestLogisticsInfo?: string
  returnLogisticsCompany?: string
  returnTrackingNumber?: string
  returnLatestLogisticsInfo?: string
  promotionChannel: string
  specId?: string | null
  createdAt?: Date
}

type RrzRoot = Frame

const globalForRrz = globalThis as unknown as { rrzRuntime?: RrzRuntime }

const runtime: RrzRuntime = globalForRrz.rrzRuntime ?? {
  status: { status: "idle", logs: [] },
  shouldStop: false
}
globalForRrz.rrzRuntime = runtime

function getOriginFromUrl(url: string) {
  try {
    return new URL(url).origin
  } catch {
    return ""
  }
}

function getDefaultBrowserUserAgent() {
  if (process.platform === "linux") {
    return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  }
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

function getDefaultExtraHeaders() {
  return {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3",
    Connection: "keep-alive"
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

async function waitForRrzOrderListSignal(page: Page, timeoutMs: number) {
  const rt = getRuntimeWithApi()
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const url = rt.latestOrderListUrl || ""
    if (url.includes("/order/orderList")) return true
    for (const f of page.frames()) {
      const fu = f.url() || ""
      if (fu.includes("/order/manage/merchant-order-list")) return true
    }
    await page.waitForTimeout(500)
  }
  return false
}

async function openRrzOrderListByClicks(page: Page) {
  const tradeMenu = "#main-left-ul > li.point.level-one.level-one-3 > a"
  const orderListMenu =
    "#app > div.app-wrapper.openSidebar > div.sidebar-container.has-logo > div.el-scrollbar > div.scrollbar-wrapper.el-scrollbar__wrap > div > ul > div:nth-child(6) > li > ul > div:nth-child(1) > a > li"

  let anyClick = false
  const tradeCandidates = [tradeMenu, "text=交易", "a:has-text('交易')"]
  for (const sel of tradeCandidates) {
    const ok = await clickNav(page, sel)
    if (ok) {
      anyClick = true
      break
    }
  }

  await simulateHumanScroll(page, 1, 2)
  await waitRandom(page, 600, 1400)

  const orderListCandidates = [orderListMenu, "text=订单列表", "a:has-text('订单列表')", "text=订单管理"]
  for (const sel of orderListCandidates) {
    const ok = await clickNav(page, sel)
    if (ok) {
      anyClick = true
      break
    }
  }

  if (!anyClick) return false
  await simulateHumanScroll(page, 1, 3)
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => void 0)
  const ok = await waitForRrzOrderListSignal(page, 15000)
  return ok
}

function getRuntimeWithApi() {
  return runtime as RrzRuntimeWithApi
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getStringFromUnknown(value: unknown) {
  return typeof value === "string" ? value : ""
}

function mapRrzStatusText(raw: string) {
  const text = raw.replace(/\s+/g, " ").trim()
  if (!text) return ""

  const compact = text.replace(/[()（）]/g, " ").replace(/\s+/g, " ").trim()
  const rules: Array<{ re: RegExp; value: string }> = [
    { re: /(交易关闭|已关闭|已取消|取消成功|已拒绝)/, value: "CLOSED" },
    { re: /(已完成|订单完成|已结清|已完结|履约完成)/, value: "COMPLETED" },
    { re: /(已买断)/, value: "BOUGHT_OUT" },
    { re: /(逾期|已逾期)/, value: "OVERDUE" },
    { re: /(归还中|退租中|退货中|寄回中|已发起归还|待寄回|待退回)/, value: "RETURNING" },
    { re: /(租用中|使用中|待归还|已签收|已收货)/, value: "RENTING" },
    { re: /(待确认收货|待收货|待签收|签收中)/, value: "PENDING_RECEIPT" },
    { re: /(已发货|已寄出|待揽收)/, value: "SHIPPED" },
    { re: /(待发货|去发货|待寄出|待出库)/, value: "PENDING_SHIPMENT" },
    { re: /(待审核|审核中|下单待审核)/, value: "PENDING_REVIEW" },
    { re: /(待支付|待付款|未支付)/, value: "WAIT_PAY" },
    { re: /(待结算|结算待支付|今日未还款)/, value: "DUE_REPAYMENT" }
  ]

  for (const r of rules) {
    if (r.re.test(compact)) return r.value
  }
  return ""
}

function inferRrzStatusFromApiFields(base: RrzApiBaseInfo, pay: RrzApiPayInfo) {
  if (base.return_date || base.return_logistic_number || base.return_logistic_shipper_code) return "RETURNING"
  if (base.receive_date) return "RENTING"
  if (base.ship_at || base.logistic_number) return "SHIPPED"
  const paid = Number(pay.actual_amount_paid || pay.total_cost || 0)
  if (paid > 0) return "PENDING_SHIPMENT"
  return "PENDING_REVIEW"
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text)
    return isRecord(v) ? v : null
  } catch {
    return null
  }
}

function extractOrderListFromUnknown(value: unknown): RrzApiOrder[] | null {
  const isOrderLike = (v: unknown) => {
    if (!isRecord(v)) return false
    const base = v["base_info"]
    return isRecord(base) && (typeof base["order_id"] === "string" || typeof base["order_id"] === "number")
  }

  const isOrderArray = (arr: unknown[]) => {
    if (arr.length === 0) return false
    for (const el of arr.slice(0, 5)) {
      if (isOrderLike(el)) return true
    }
    return false
  }

  const pickFromKey = (k: string, child: unknown) => {
    const listKeys = new Set(["list", "rows", "items", "records", "data"])
    if (!listKeys.has(k)) return null
    if (Array.isArray(child) && isOrderArray(child)) return child as unknown as RrzApiOrder[]
    if (Array.isArray(child) && k !== "data") return child as unknown as RrzApiOrder[]
    return null
  }

  const direct = isRecord(value) ? (value as unknown as RrzApiOrderListResponse) : null
  const directList = direct?.data?.list
  if (Array.isArray(directList)) return directList
  const directList2 = direct?.list
  if (Array.isArray(directList2)) return directList2

  const queue: Array<{ v: unknown; depth: number }> = [{ v: value, depth: 0 }]
  const seen = new Set<unknown>()

  while (queue.length > 0) {
    const item = queue.shift()
    if (!item) break
    const { v, depth } = item
    if (depth > 6) continue
    if (seen.has(v)) continue
    seen.add(v)

    if (Array.isArray(v)) {
      if (isOrderArray(v)) return v as unknown as RrzApiOrder[]
      for (const el of v.slice(0, 50)) {
        if (isRecord(el) || Array.isArray(el)) queue.push({ v: el, depth: depth + 1 })
      }
      continue
    }

    if (!isRecord(v)) continue

    for (const k of Object.keys(v)) {
      const child = (v as Record<string, unknown>)[k]
      const hit = pickFromKey(k, child)
      if (hit) return hit
      if (isRecord(child) || Array.isArray(child)) queue.push({ v: child, depth: depth + 1 })
    }
  }

  return null
}

function getPageParamFromUrl(url: string) {
  try {
    const u = new URL(url)
    const v = u.searchParams.get("page") || ""
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

function ensurePageMaps(rt: RrzRuntimeWithApi) {
  if (!rt.orderListDataByPage) rt.orderListDataByPage = new Map()
  if (!rt.orderListUrlByPage) rt.orderListUrlByPage = new Map()
  if (!rt.orderListTextByPage) rt.orderListTextByPage = new Map()
  return rt
}

function getLogFilePath() {
  const date = new Date().toISOString().split('T')[0]
  const logDir = path.join(_appBasePath(), "logs")
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  return path.join(logDir, `rrz-${date}.log`)
}

export function getRrzStatus() {
    return runtime.status
}

/** Inject a shared page/context from main process (shared browser mode) */
export function setSharedPage(page: import("playwright").Page, context: import("playwright").BrowserContext) {
  runtime.page = page
  runtime.context = context
  ;(runtime as Record<string, unknown>)._isShared = true
}

export function getRunningPage() {
    return runtime.page
}

export function stopRrzSync() {
    runtime.shouldStop = true
    appendLog("User requested stop.")
    updateStatus({ status: "idle", message: "已停止" })
}

export async function restartRrzBrowser() {
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
    updateStatus({ status: "idle", message: "浏览器已重启，可重新开始同步" })
    return { success: true }
}

function updateStatus(updates: Partial<RrzStatus>) {
    const currentStatus = runtime.status
    const newLogs = updates.logs !== undefined ? updates.logs : currentStatus.logs
    
    runtime.status = {
        ...currentStatus,
        ...updates,
        logs: newLogs
    }
}

function appendLog(message: string) {
  try {
    const timestamp = new Date().toLocaleTimeString()
    const fullMsg = `[${timestamp}] ${message}`
    
    try {
        const filePath = getLogFilePath()
        const logDir = path.dirname(filePath)
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true })
        }
        fs.appendFileSync(filePath, fullMsg + "\n")
    } catch {}

    console.log(`[Rrz] ${message}`)
    
    const currentLogs = runtime.status.logs || []
    const newLogs = [...currentLogs, fullMsg].slice(-2000)
    
    runtime.status = {
        ...runtime.status,
        logs: newLogs
    }
    
    try {
        /* schedulerLogger removed */
    } catch {
    }
  } catch (e) {
    console.error("Failed to write log", e)
  }
}

async function ensureContext(headless: boolean): Promise<BrowserContext> {
  if (runtime.context) {
      try {
          runtime.context.pages()
          if ((runtime as Record<string, unknown>)._isShared) return runtime.context
          if (runtime.headless !== undefined && runtime.headless !== headless) {
              appendLog(`Switching headless mode from ${runtime.headless} to ${headless}. Closing existing context...`)
              await runtime.context.close().catch(() => void 0)
              runtime.context = undefined
              runtime.page = undefined
          } else {
              return runtime.context
          }
      } catch {
          appendLog("Existing context seems broken or closed, recreating...")
          runtime.context = undefined
          runtime.page = undefined
      }
  }
  
  const userDataDir = path.join(_appBasePath(), ".playwright", "rrz")
  
  let finalHeadless = headless
  if (process.platform === 'linux' && !process.env.DISPLAY) {
      appendLog(`[System] Linux environment without DISPLAY detected, forcing headless mode.`)
      finalHeadless = true
  }

  appendLog(`Launching browser (headless: ${finalHeadless})`)
  
  try {
      const windowArgs = getExternalConfig()?._showBrowser === false ? ['--window-position=-4800,-4800'] : []
      runtime.context = await chromium.launchPersistentContext(userDataDir, {
        headless: finalHeadless,
        viewport: { width: 1280, height: 800 },
        userAgent: getDefaultBrowserUserAgent(),
        locale: "zh-CN",
        timezoneId: "Asia/Shanghai",
        extraHTTPHeaders: getDefaultExtraHeaders(),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            ...windowArgs,
        ],
        ignoreDefaultArgs: ['--enable-automation'] 
      })
      runtime.headless = finalHeadless
  } catch (e) {
      appendLog(`Failed to launch browser: ${e}`)
      throw e
  }
  
  return runtime.context
}

async function ensurePage(headless: boolean): Promise<Page> {
  const rt = getRuntimeWithApi()
  const attachApiListener = async (p: Page) => {
      ensurePageMaps(rt)

      if (!rt.rrzApiRouteAttached) {
          await p.route("**/order/orderList*", async (route) => {
              const request = route.request()
              const url = request.url()
              const pageNo = getPageParamFromUrl(url) || 0

              try {
                  ensurePageMaps(rt)
                  const prevUrl = rt.orderListUrlByPage?.get(pageNo)
                  const hasCached = rt.orderListDataByPage?.has(pageNo)
                  const expected = rt.expectedApiPage

                  if ((expected && expected !== pageNo) || (prevUrl === url && hasCached)) {
                      await route.continue()
                      return
                  }

                  const response = await route.fetch()
                  const status = response.status()
                  const headers = response.headers()
                  const body = await response.body().catch(() => Buffer.from(""))
                  const text = body.length ? body.toString("utf8") : ""

                  rt.latestOrderListUrl = url
                  rt.latestOrderListText = text ? text.replace(/\s+/g, " ").slice(0, 200) : ""
                  rt.orderListUrlByPage?.set(pageNo, url)

                  if (text) {
                      if (text.includes("请重新登录") || text.includes("重新登录")) {
                          const payload = { message: "请重新登录", msg: "请重新登录" }
                          rt.latestOrderListData = payload
                          rt.orderListDataByPage?.set(pageNo, payload)
                          rt.orderListTextByPage?.set(pageNo, "请重新登录")
                          updateStatus({ status: "awaiting_user", message: "需要人工介入: 人人租登录已失效，请重新登录", needsAttention: true })
                      } else {
                          const jsonObj = tryParseJsonObject(text)
                          if (jsonObj) {
                              rt.latestOrderListData = jsonObj
                              rt.orderListDataByPage?.set(pageNo, jsonObj)
                              const list = extractOrderListFromUnknown(jsonObj)
                              const msg = getStringFromUnknown(jsonObj["msg"] || jsonObj["message"])
                              if (msg) rt.orderListTextByPage?.set(pageNo, msg)
                              if (msg.includes("请重新登录") || msg.includes("重新登录")) {
                                  updateStatus({ status: "awaiting_user", message: "需要人工介入: 人人租登录已失效，请重新登录", needsAttention: true })
                              }
                              appendLog(`[API] ${status} ${url}`)
                              appendLog(`[API Capture] page=${pageNo || ""} list=${list ? list.length : "?"} msg=${msg || ""}`)
                          } else {
                              appendLog(`[API] ${status} ${url}`)
                          }
                      }
                  } else {
                      appendLog(`[API] ${status} ${url}`)
                  }

                  await route.fulfill({
                      status,
                      headers,
                      body
                  })
                  return
              } catch (e) {
                  appendLog(`[API Capture] route error: ${e}`)
                  await route.continue().catch(() => {})
              }
          })
          rt.rrzApiRouteAttached = true
      }

      if (rt.rrzApiListenerAttached) return
      const handler = async (response: import("playwright").Response) => {
          const url = response.url()
          if (!url.includes("/order/orderList")) return
          const status = response.status()
          const pageNo = getPageParamFromUrl(url) || 0
          try {
              ensurePageMaps(rt)
              const prevUrl = rt.orderListUrlByPage?.get(pageNo)
              if (prevUrl === url && rt.orderListDataByPage?.has(pageNo)) return

              rt.latestOrderListUrl = url
              rt.orderListUrlByPage?.set(pageNo, url)

              let bodyText = ""
              let jsonObj: Record<string, unknown> | null = null

              try {
                  const v = (await response.json().catch(() => null)) as unknown
                  jsonObj = isRecord(v) ? v : null
              } catch {
                  jsonObj = null
              }

              if (!jsonObj) {
                  bodyText = await response.text().catch(() => "")
                  jsonObj = bodyText ? tryParseJsonObject(bodyText) : null
              }

              if (jsonObj) {
                  rt.latestOrderListData = jsonObj
                  rt.orderListDataByPage?.set(pageNo, jsonObj)
                  const list = extractOrderListFromUnknown(jsonObj)
                  const msg = getStringFromUnknown(jsonObj["msg"] || jsonObj["message"])
                  rt.latestOrderListText = msg
                  if (msg) rt.orderListTextByPage?.set(pageNo, msg)

                  if (msg.includes("请重新登录") || msg.includes("重新登录")) {
                      updateStatus({ status: "awaiting_user", message: "需要人工介入: 人人租登录已失效，请重新登录", needsAttention: true })
                  }

                  if (prevUrl !== url) {
                      appendLog(`[API] ${status} ${url}`)
                      appendLog(`[API Capture] page=${pageNo || ""} list=${list ? list.length : "?"} msg=${msg || ""}`)
                  }
              } else {
                  const snippet = bodyText.replace(/\s+/g, " ").slice(0, 200)
                  rt.latestOrderListText = snippet
                  if (snippet) rt.orderListTextByPage?.set(pageNo, snippet)
                  if (prevUrl !== url) appendLog(`[API] ${status} ${url}`)
              }
          } catch {}
      }
      p.on("response", handler)
      rt.rrzApiListenerAttached = true
  }

  if (runtime.page && !runtime.page.isClosed()) {
      await attachApiListener(runtime.page)
      appendLog("Reusing existing page session.")
      return runtime.page
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
      await attachApiListener(runtime.page)

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
    if (site.loginUrl && url && url.includes("login")) return true
    
    // Additional check for RRZ specific login elements
    const loginHints = [
        site.selectors.login_button,
        "input[placeholder='请输入手机号']",
        "input[placeholder='请输入验证码']",
        "button:has-text('登录')",
        "button:has-text('获取验证码')"
    ].filter(Boolean)

    const frames = page.frames()
    for (const frame of frames) {
        for (const selector of loginHints) {
            try {
                const loc = frame.locator(selector).first()
                if (await loc.isVisible({ timeout: 500 })) return true
            } catch {
                // ignore
            }
        }
        try {
            const hintText = await frame
                .evaluate(() => (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 500))
                .catch(() => "")
            if (hintText.includes("欢迎登录") || hintText.includes("验证码登录") || hintText.includes("账号密码登录")) return true
        } catch {}
    }
    return false
}

async function login(page: Page, site: SiteConfig) {
  if (!site.loginUrl) return
  
  if (await isOnLoginPage(page, site) || page.url() === "about:blank") {
     appendLog(`Navigating to login: ${site.loginUrl}`)
     const origin = getOriginFromUrl(site.loginUrl)
     await page.goto(site.loginUrl, { waitUntil: "domcontentloaded", referer: origin ? `${origin}/` : undefined })
  }

  // Check if we are already logged in (by checking URL or absence of login form)
  
  if (await isOnLoginPage(page, site)) {
      // Try to fill username (phone) if available
      const { username_input } = site.selectors
      
      appendLog(`Checking username input selector: ${username_input}`)
      if (username_input && site.username) {
         try {
             // Try to wait for input to be visible first
             const input = await page.waitForSelector(username_input, { timeout: 5000 }).catch(() => null)
             if (input) {
                 appendLog("Filling phone number...")
                 await input.fill(site.username)
             } else {
                 appendLog(`Could not find username input: ${username_input}`)
                 
                 // Log inputs found on page
                 const inputs = await page.$$eval('input', els => els.map(e => ({ 
                     id: e.id, 
                     class: e.className, 
                     name: e.getAttribute('name'),
                     placeholder: e.getAttribute('placeholder'),
                     type: e.getAttribute('type')
                 })))
                 appendLog(`Found inputs: ${JSON.stringify(inputs)}`)
                 
                 // Fallback: try finding by placeholder
                 const fallbackInput = await page.$("input[placeholder*='手机']").catch(() => null)
                 if (fallbackInput) {
                     appendLog("Found input by placeholder '手机', trying to fill...")
                     await fallbackInput.fill(site.username)
                 }
             }
         } catch (err) {
             appendLog(`Error filling username: ${err}`)
         }
      }
      
      updateStatus({ status: "awaiting_user", message: "需要人工介入: 请在弹出的窗口完成短信验证码登录", needsAttention: true })
      appendLog("需要人工介入: 检测到处于登录页")
      
      const config = await loadConfig()
      if (config?.webhookUrls && config.webhookUrls.length > 0) {
          sendWebhookSimple(config, "人人租平台需要登录验证")
      }
  }

  const start = Date.now()
  while (Date.now() - start < 300_000) {
      if (!(await isOnLoginPage(page, site)) && page.url() !== "about:blank") {
          appendLog("Login appears successful.")
          updateStatus({ status: "running", message: "登录成功，继续执行...", needsAttention: false })
          return true
      }
      
      await page.waitForTimeout(1000)
  }
  
  throw new Error("Login timeout")
}

async function sendWebhookSimple(config: OnlineOrdersConfig, message: string) {
    if (!config?.webhookUrls || config.webhookUrls.length === 0) return
    
    let baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim()
    baseUrl = baseUrl.replace(/\/$/, "")
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

async function switchToAllOrdersTab(page: Page, root: RrzRoot, selector: string): Promise<RrzRoot> {
    appendLog(`Trying to switch to 'All Orders' tab...`)
    
    const allKeywords = ["全部订单", "所有订单", "全部", "所有", "All"]
    const roots: RrzRoot[] = [root, ...page.frames().filter(f => f !== root)]

    for (const candidate of roots) {
        try {
            if (selector) {
                const el = await candidate.$(selector).catch(() => null)
                if (el) {
                    const text = (await el.innerText().catch(() => "")).replace(/\s+/g, " ").trim()
                    appendLog(`[Debug] Found tab element by selector in frame url=${candidate.url()} text="${text}"`)
                    const looksLikeAll = allKeywords.some(k => text.includes(k))
                    if (looksLikeAll) {
                        await el.click({ force: true }).catch(() => void 0)
                        await page.waitForTimeout(1500)
                        return candidate
                    }
                    await el.click({ force: true }).catch(() => void 0)
                    await page.waitForTimeout(1500)
                    return candidate
                }
            }

            const tabs = await candidate.$$(".ant-tabs-tab").catch(() => [])
            if (tabs.length === 0) continue

            const tabTexts = await Promise.all(tabs.map(async t => {
                const text = await t.innerText().catch(() => "")
                const classes = (await t.getAttribute("class").catch(() => "")) || ""
                return { text: text.replace(/\s+/g, " ").trim(), active: classes.includes("ant-tabs-tab-active") }
            }))
            appendLog(`[Debug] Available tabs (frame url=${candidate.url()}): ${JSON.stringify(tabTexts)}`)

            for (const kw of allKeywords) {
                const exact = tabTexts.findIndex(t => t.text === kw)
                if (exact !== -1) {
                    await tabs[exact].click({ force: true }).catch(() => void 0)
                    await page.waitForTimeout(1500)
                    return candidate
                }
            }

            for (const kw of allKeywords) {
                const partial = tabTexts.findIndex(t => t.text.includes(kw))
                if (partial !== -1) {
                    await tabs[partial].click({ force: true }).catch(() => void 0)
                    await page.waitForTimeout(1500)
                    return candidate
                }
            }
        } catch (e) {
            appendLog(`Error switching tab in frame url=${candidate.url()}: ${e}`)
        }
    }

    appendLog("[Warning] Could not identify or click 'All Orders' tab.")
    return root
}

async function handlePopup(page: Page) {
    try {
        const workOrderModal = page.locator("#modal-total .modal-content.workOrderPopup, #modal-total .workOrderPopup, .modal-content.workOrderPopup").first()
        try {
            if (await workOrderModal.isVisible({ timeout: 800 })) {
                appendLog("Detected workOrderPopup modal, attempting to dismiss...")
                const closeSelectors = [
                    "#modal-total .close",
                    "#modal-total button.close",
                    "#modal-total [aria-label='Close']",
                    "#modal-total .ant-modal-close",
                    "#modal-total button:has-text('关闭')",
                    "#modal-total button:has-text('我知道了')",
                    "#modal-total button:has-text('确定')"
                ]
                for (const sel of closeSelectors) {
                    try {
                        const btn = page.locator(sel).first()
                        if (await btn.isVisible({ timeout: 500 })) {
                            await btn.click({ force: true, timeout: 3000 })
                            await page.waitForTimeout(800)
                            break
                        }
                    } catch {}
                }

                try {
                    await page.keyboard.press("Escape")
                    await page.waitForTimeout(500)
                } catch {}

                try {
                    if (await workOrderModal.isVisible({ timeout: 500 })) {
                        await page.evaluate(() => {
                            const modalTotal = document.querySelector("#modal-total") as HTMLElement | null
                            if (modalTotal) {
                                modalTotal.style.display = "none"
                                modalTotal.style.pointerEvents = "none"
                            }
                            const popup = document.querySelector(".modal-content.workOrderPopup") as HTMLElement | null
                            if (popup) {
                                popup.style.display = "none"
                                popup.style.pointerEvents = "none"
                            }
                        })
                        await page.waitForTimeout(300)
                    }
                } catch {}
            }
        } catch {}

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

async function logPageStructure(page: Page, label: string) {
    try {
        const url = page.url()
        appendLog(`[Debug][${label}] Current URL: ${url}`)
        
        // Log Frames
        const frames = page.frames()
        appendLog(`[Debug][${label}] Frames count: ${frames.length}`)
        for (const [i, frame] of frames.entries()) {
            try {
                const title = await frame.title()
                const fUrl = frame.url()
                appendLog(`[Debug][${label}] Frame[${i}]: title="${title}", url="${fUrl}"`)
            } catch (e) {
                appendLog(`[Debug][${label}] Frame[${i}]: error accessing frame: ${e}`)
            }
        }

        // Log Tabs
        const tabs = await page.$$(".ant-tabs-tab")
        if (tabs.length > 0) {
            const tabInfo = await Promise.all(tabs.map(async (t, i) => {
                const text = (await t.innerText()).replace(/\s+/g, ' ').trim()
                const isActive = await t.getAttribute("class").then(c => c?.includes("ant-tabs-tab-active"))
                return `[${i}] ${text} ${isActive ? "(ACTIVE)" : ""}`
            }))
            appendLog(`[Debug][${label}] Tabs: ${tabInfo.join(" | ")}`)
        } else {
            appendLog(`[Debug][${label}] No .ant-tabs-tab found.`)
        }

        // Log Table Wrapper Visibility
        const tableWrappers = await page.$$(".ant-table-wrapper")
        appendLog(`[Debug][${label}] Found ${tableWrappers.length} .ant-table-wrapper elements.`)
        for (const [i, wrapper] of tableWrappers.entries()) {
            const visible = await wrapper.isVisible()
            const text = await wrapper.innerText()
            appendLog(`[Debug][${label}] TableWrapper[${i}]: visible=${visible}, text_start="${text.slice(0, 50).replace(/\s+/g, ' ')}..."`)
        }
        
    } catch (e) {
        appendLog(`[Debug][${label}] Error in logPageStructure: ${e}`)
    }
}

async function pickOrderRoot(page: Page, label: string): Promise<RrzRoot> {
    const frames = page.frames()
    let best: RrzRoot = page.mainFrame()
    let bestScore = Number.NEGATIVE_INFINITY

    for (const frame of frames) {
        try {
            const url = frame.url()
            const tabCount = (await frame.$$(".ant-tabs-tab").catch(() => [])).length
            const wrapperCount = (await frame.$$(".ant-table-wrapper").catch(() => [])).length
            const orderCardCount = (await frame.$$("tr.order-card").catch(() => [])).length
            const tbodyTrCount = (await frame.$$("table tbody tr").catch(() => [])).length
            const snippet = await frame
                .evaluate(() => (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 220))
                .catch(() => "")
            const placeholder = snippet.includes("暂无数据") || snippet.toLowerCase().includes("no data")

            const score =
                orderCardCount * 100 +
                Math.min(tbodyTrCount, 50) +
                wrapperCount * 5 +
                tabCount * 2 -
                (placeholder ? 20 : 0)

            appendLog(
                `[Debug][${label}] FrameCandidate url=${url} score=${score} tabs=${tabCount} wrappers=${wrapperCount} orderCards=${orderCardCount} tbodyTr=${tbodyTrCount} placeholder=${placeholder}`
            )

            if (score > bestScore) {
                bestScore = score
                best = frame
            }
        } catch (e) {
            appendLog(`[Debug][${label}] FrameCandidate error: ${e}`)
        }
    }

    appendLog(`[Debug][${label}] Picked root frame url=${best.url()} score=${bestScore}`)
    return best
}

async function logBodyTextSnippet(root: RrzRoot, label: string) {
    try {
        const bodyText = await root.evaluate(() => (document.body?.innerText || "").replace(/\s+/g, ' ').slice(0, 1000))
        appendLog(`[Debug][${label}] Body Text Snippet (first 1000 chars): ${bodyText}`)
    } catch (e) {
        appendLog(`[Debug][${label}] Failed to log body text: ${e}`)
    }
}

async function waitForOrderListReady(page: Page, root: RrzRoot, timeoutMs = 20000) {
    const start = Date.now()
    let lastLogTime = 0
    
    while (Date.now() - start < timeoutMs) {
        await handlePopup(page)

        const now = Date.now()
        const shouldLog = (now - lastLogTime) > 2000
        if (shouldLog) lastLogTime = now

        try {
            const spinner = root.locator(".ant-spin-spinning, .ant-table-wrapper .ant-spin")
            if (await spinner.first().isVisible({ timeout: 300 })) {
                if (shouldLog) appendLog("[Debug] Waiting for spinner to disappear...")
                await page.waitForTimeout(600)
                continue
            }
        } catch {}

        try {
            const orderCards = await root.$$("table tbody tr.order-card, tr.order-card")
            if (orderCards.length > 0) {
                const samples = await Promise.all(orderCards.slice(0, 2).map(r => r.innerText().catch(() => "")))
                const hasPlaceholder = samples.some(t => t.includes("暂无数据") || t.includes("No data") || t.includes("No Data"))
                if (!hasPlaceholder) return true
                if (shouldLog) appendLog("[Debug] Found order cards but they contain placeholder text (No Data).")
            }
        } catch {}

        try {
            const rows = await root.$$(".ant-table-tbody > tr")
            const virtualRows = await root.$$(".ant-table-body [role='row'], .ant-table-body .ant-table-row, .ant-table-content [role='row']")
            if (virtualRows.length > 0) return true
            if (rows.length > 0) {
                const samples = await Promise.all(rows.slice(0, 2).map(r => r.innerText().catch(() => "")))
                const hasPlaceholder = samples.some(t => t.includes("暂无数据") || t.includes("No data") || t.includes("No Data"))
                if (!hasPlaceholder) return true
                if (shouldLog) appendLog("[Debug] Found .ant-table-tbody rows but they contain placeholder text (No Data).")
            }
        } catch {}

        try {
            const rows = await root.$$("table tbody tr")
            if (rows.length > 0) {
                const samples = await Promise.all(rows.slice(0, 2).map(r => r.innerText().catch(() => "")))
                const hasPlaceholder = samples.some(t => t.includes("暂无数据") || t.includes("No data") || t.includes("No Data"))
                if (!hasPlaceholder) {
                    return true
                }
                if (shouldLog) appendLog("[Debug] Found generic table rows but they contain placeholder text (No Data).")
            }
        } catch {}

        await page.waitForTimeout(800)
    }
    
    // Timeout reached
    await logBodyTextSnippet(root, "timeout_dump")
    return false
}

async function logOrderDomStats(root: RrzRoot, label: string) {
    try {
        const url = root.url()
        const stats = await root.evaluate(() => {
            const count = (sel: string) => document.querySelectorAll(sel).length
            const pickText = (sel: string) =>
                Array.from(document.querySelectorAll(sel))
                    .slice(0, 3)
                    .map(el => ((el as HTMLElement).innerText || (el.textContent || "")).replace(/\s+/g, " ").trim().slice(0, 160))
                    .filter(Boolean)
            const wrappers = Array.from(document.querySelectorAll(".ant-table-wrapper")).slice(0, 3).map(w => {
                const el = w as HTMLElement
                const text = (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 200)
                const placeholder = text.includes("暂无数据") || text.toLowerCase().includes("no data")
                const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
                const trCount = el.querySelectorAll("tbody tr").length
                const divRowCount = el.querySelectorAll(".ant-table-body [role='row'], .ant-table-body .ant-table-row, .ant-table-content [role='row']").length
                return { visible, placeholder, trCount, divRowCount, text }
            })
            return {
                antWrappers: wrappers,
                counts: {
                    orderCardTr: count("tr.order-card"),
                    antTbodyTr: count(".ant-table-tbody > tr"),
                    antVirtualRows: count(".ant-table-body [role='row'], .ant-table-body .ant-table-row, .ant-table-content [role='row']"),
                    tableTbodyTr: count("table tbody tr"),
                    orderTableTr: count(".order-table table tbody tr")
                },
                samples: {
                    orderCardTr: pickText("tr.order-card"),
                    antTbodyTr: pickText(".ant-table-tbody > tr"),
                    antVirtualRows: pickText(".ant-table-body [role='row'], .ant-table-body .ant-table-row, .ant-table-content [role='row']"),
                    tableTbodyTr: pickText("table tbody tr")
                }
            }
        })
        appendLog(`[Debug][${label}] url=${url}`)
        appendLog(`[Debug][${label}] counts=${JSON.stringify(stats.counts)}`)
        if (stats.antWrappers && stats.antWrappers.length > 0) {
            appendLog(`[Debug][${label}] antWrappers=${JSON.stringify(stats.antWrappers)}`)
        }
        if (stats.samples) {
            if (stats.samples.orderCardTr?.length) appendLog(`[Debug][${label}] sample orderCardTr: ${stats.samples.orderCardTr.join(" | ")}`)
            if (stats.samples.antTbodyTr?.length) appendLog(`[Debug][${label}] sample antTbodyTr: ${stats.samples.antTbodyTr.join(" | ")}`)
            if (stats.samples.antVirtualRows?.length) appendLog(`[Debug][${label}] sample antVirtualRows: ${stats.samples.antVirtualRows.join(" | ")}`)
            if (stats.samples.tableTbodyTr?.length) appendLog(`[Debug][${label}] sample tableTbodyTr: ${stats.samples.tableTbodyTr.join(" | ")}`)
        }
    } catch (e) {
        appendLog(`[Debug][${label}] logOrderDomStats failed: ${e}`)
    }
}

async function saveDebugScreenshot(page: Page, label: string) {
    try {
        const logDir = path.join(_appBasePath(), "logs")
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true })
        }
        const safe = label.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 50)
        const filePath = path.join(logDir, `rrz-${safe}-${Date.now()}.png`)
        await page.screenshot({ path: filePath, fullPage: true })
        appendLog(`[Debug] Saved screenshot: ${filePath}`)
    } catch (e) {
        appendLog(`[Debug] Failed to save screenshot: ${e}`)
    }
}

async function parseOrders(page: Page, root: RrzRoot, site: SiteConfig, expectedPage: number): Promise<RrzParsedOrder[]> {
    void root
    void site
    const rt = getRuntimeWithApi()
    ensurePageMaps(rt)
    rt.expectedApiPage = expectedPage

    let interceptedData: unknown = null
    const fromMap = rt.orderListDataByPage?.get(expectedPage)
    if (fromMap) {
        interceptedData = fromMap
        rt.orderListDataByPage?.delete(expectedPage)
    }
    const latestUrlFromMap = rt.orderListUrlByPage?.get(expectedPage) || ""
    const latestTextFromMap = rt.orderListTextByPage?.get(expectedPage) || ""
    
    if (!interceptedData) {
        const API_WAIT_TIMEOUT = 15000
        const startWait = Date.now()
        while (!interceptedData && (Date.now() - startWait < API_WAIT_TIMEOUT)) {
            const byPage = rt.orderListDataByPage?.get(expectedPage)
            if (byPage) {
                interceptedData = byPage
                rt.orderListDataByPage?.delete(expectedPage)
                break
            }
            await page.waitForTimeout(200)
        }
    }
    
    if (!interceptedData) {
        const snippet = (latestTextFromMap || rt.latestOrderListText || "").replace(/\s+/g, " ").slice(0, 200)
        const url = latestUrlFromMap || rt.latestOrderListUrl || ""
        throw new Error(`RRZ_API_CAPTURE_FAILED(page=${expectedPage}) url=${url} text="${snippet}"`)
    }
    
    const msg = isRecord(interceptedData) ? getStringFromUnknown(interceptedData["msg"] || interceptedData["message"]) : ""
    if (msg.includes("请重新登录") || msg.includes("重新登录")) {
        updateStatus({ status: "awaiting_user", message: "需要人工介入: 人人租登录已失效，请重新登录", needsAttention: true })
        throw new Error("RRZ_LOGIN_REQUIRED")
    }

    const extracted = extractOrderListFromUnknown(interceptedData)
    if (!extracted) {
        const keys = isRecord(interceptedData) ? Object.keys(interceptedData).slice(0, 30).join(",") : ""
        const url = latestUrlFromMap || rt.latestOrderListUrl || ""
        throw new Error(`RRZ_API_RESPONSE_NO_LIST(page=${expectedPage}) url=${url} keys=${keys}`)
    }
    const apiList = extracted
    const url = latestUrlFromMap || rt.latestOrderListUrl || ""
    appendLog(`[API Intercept] page=${expectedPage} orders=${apiList.length} url=${url}`)

    const apiUnknownStatusCounts = new Map<
      string,
      { count: number; sampleOrderNos: string[]; mappedTo: string }
    >()
    const mappedOrders: RrzParsedOrder[] = apiList.map((item) => {
        const base = item.base_info || {}
        const spu = item.spu_info || {}
        const rent = item.rent_info || {}
        const depositInfo = item.deposit_info || {}
        const receipt = item.receipt_info || {}
        const tag = item.tag || {}
        const pay = item.order_pay_info || {}
        
        const trackingNumber = base.logistic_number || ""
        let logisticsCompany = base.logistic_name || ""
        
        if (logisticsCompany === "SF") logisticsCompany = "顺丰速运"
        else if (logisticsCompany === "JD") logisticsCompany = "京东快递"
        else if (logisticsCompany === "ZTO") logisticsCompany = "中通快递"
        else if (logisticsCompany === "YTO") logisticsCompany = "圆通速递"
        else if (logisticsCompany === "STO") logisticsCompany = "申通快递"
        else if (logisticsCompany === "YD") logisticsCompany = "韵达快递"
        
        let customerName = receipt.name || receipt.desensitized_name || ""
        let recipientPhone = receipt.phone || receipt.desensitized_phone || ""
        let address = receipt.address || receipt.desensitized_address || ""
        
        if (item.button_list && Array.isArray(item.button_list)) {
            const copyBtn = item.button_list.find((b) => b.button === 113)
            const extraText = copyBtn?.extra ? String(copyBtn.extra) : ""
            if (extraText) {
                try {
                    const extraJson = tryParseJsonObject(extraText)
                    const copyText = extraJson ? getStringFromUnknown(extraJson["copy_text"]) : ""
                    if (copyText) {
                        const parts = copyText.split(/,|，|\n/)
                        if (parts.length >= 3) {
                            customerName = parts[0].trim()
                            recipientPhone = parts[1].trim()
                            let addr = parts[2].trim()
                            if (addr.includes("(用户留言")) {
                                addr = addr.split("(用户留言")[0].trim()
                            }
                            address = addr
                        }
                    }
                } catch {}
            }
        }
        
        let status = "UNKNOWN"
        const sRaw = base.order_status
        const sNum = typeof sRaw === "number" ? sRaw : Number(sRaw)
        if (sNum === 4) status = "RENTING"
        else if (sNum === 1) status = "PENDING_PAYMENT"
        else if (sNum === 2) status = "PENDING_SHIPMENT"
        else if (sNum === 3) status = "PENDING_RECEIPT"
        else if (sNum === 5) status = "COMPLETED"
        else if (sNum === 6) status = "CANCELED"
        else if (sNum === 7) status = "RETURNING"
        else if (sNum === 8) status = "CLOSED"
        else if (sNum === 9) status = "PENDING_REVIEW"
        else if (sNum === 20) status = "COMPLETED"
        else if (sNum === 21) status = "CLOSED"
        else if (sNum === 22) status = "CLOSED"
        else if (sNum === 23) status = "CLOSED"
        
        const orderNo = String(base.order_id || "")
        if ([20, 21, 22, 23].includes(sNum)) {
             appendLog(`[Debug] Order ${orderNo} has special status code ${sNum}, mapped to ${status}`)
        }
        
        if (base.ship_at && !base.receive_date) status = "SHIPPED"
        if (base.receive_date) status = "RENTING"
        if (base.return_date) status = "RETURNING"
        
        const rentPrice = Number(rent.rental_money || base.rental_money || 0)
        const deposit = Number(depositInfo.product_deposit || 0)
        const totalAmount = Number(pay.total_cost || pay.actual_amount_paid || 0)
        
        if (status === "UNKNOWN") {
            const inferred = inferRrzStatusFromApiFields(base, pay)
            status = inferred

            const key = Number.isFinite(sNum) ? `order_status=${sNum}` : `order_status=${String(sRaw)}`
            const curr = apiUnknownStatusCounts.get(key) || { count: 0, sampleOrderNos: [], mappedTo: inferred }
            curr.count += 1
            if (curr.sampleOrderNos.length < 5 && orderNo) curr.sampleOrderNos.push(orderNo)
            apiUnknownStatusCounts.set(key, curr)
        }

        return {
            orderNo,
            customerName,
            recipientPhone,
            address,
            productName: spu.spu_name || "",
            variantName: spu.sku_name || "",
            totalAmount,
            rentPrice,
            deposit,
            status,
            platform: "\u4eba\u4eba\u79df",
            trackingNumber,
            logisticsCompany,
            rentStartDate: base.tenancy_data?.start_time ? new Date(String(base.tenancy_data.start_time)) : undefined,
            returnDeadline: base.tenancy_data?.end_time ? new Date(String(base.tenancy_data.end_time)) : undefined,
            duration: Number(base.tenancy_data?.total_days || 0),
            merchantName: base.shop_name || "",
            promotionChannel: tag.origin || "",
            latestLogisticsInfo: "",
            returnLogisticsCompany: base.return_logistic_shipper_code || "",
            returnTrackingNumber: base.return_logistic_number || "",
            returnLatestLogisticsInfo: "",
            itemTitle: spu.spu_name || "",
            itemSku: spu.sku_name || ""
        }
    })

    if (apiUnknownStatusCounts.size > 0) {
        const top = [...apiUnknownStatusCounts.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 20)
            .map(([k, v]) => `${k}->${v.mappedTo}=${v.count}${v.sampleOrderNos.length ? `(${v.sampleOrderNos.join(",")})` : ""}`)
            .join(" | ")
        appendLog(`[System][人人租][API] 未识别状态汇总: ${top}`)
    }

    const apiOnly = process.env.RRZ_API_ONLY !== "0"
    if (apiOnly) return mappedOrders

    const rowSelector = site.selectors.order_row_selectors
    const templateSelector = site.selectors.order_row_selector_template
    const parsedOrders: RrzParsedOrder[] = []
    
    if (!rowSelector && !templateSelector) {
        appendLog("No row selector configured, skipping parsing.")
        return []
    }

    let orderElements: (import("playwright").ElementHandle<SVGElement | HTMLElement>)[] = []

    await waitForOrderListReady(page, root, 25000)
    await logPageStructure(page, "before_parse")
    await logOrderDomStats(root, "before_parse")

    if (templateSelector && templateSelector.includes("{i}")) {
        const start = site.selectors.order_row_index_start ? Number(site.selectors.order_row_index_start) : 1
        const end = site.selectors.order_row_index_end ? Number(site.selectors.order_row_index_end) : 20 
        const step = site.selectors.order_row_index_step ? Number(site.selectors.order_row_index_step) : 1
        
        appendLog(`Using template selector: ${templateSelector} (start=${start}, step=${step}, end=${end})`)

        const templateElements: (import("playwright").ElementHandle<SVGElement | HTMLElement>)[] = []
        let consecutiveMisses = 0
        const MAX_CONSECUTIVE_MISSES = 10

        for (let i = start; i <= end; i += step) {
            const currentSelector = templateSelector.replace("{i}", String(i))
            try {
                const element = await root.$(currentSelector)
                if (element) {
                    templateElements.push(element)
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
            } catch {}
        }

        if (templateElements.length > 0) {
            orderElements = templateElements
            appendLog(`[Debug] Using template selector rows (count=${orderElements.length})`)
        }
    }

    if (orderElements.length === 0) {
        const cardSelectors = [
            "table tbody tr.order-card",
            "tr.order-card",
        ]
        for (const sel of cardSelectors) {
            try {
                const rows = await root.$$(sel)
                if (rows.length > 0) {
                    orderElements = rows
                    appendLog(`[Debug] Using row selector: ${sel} (count=${rows.length})`)
                    break
                }
            } catch {}
        }
    }

    if (orderElements.length === 0) {
        const antSelectors = [
            ".ant-table-tbody > tr.ant-table-row",
            ".ant-table-tbody > tr",
            ".ant-table-body [role='row']",
            ".ant-table-body .ant-table-row",
            ".ant-table-content [role='row']",
        ]
        for (const sel of antSelectors) {
            try {
                const rows = await root.$$(sel)
                if (rows.length > 0) {
                    orderElements = rows
                    appendLog(`[Debug] Using row selector: ${sel} (count=${rows.length})`)
                    break
                }
            } catch {}
        }
    }

    if (orderElements.length === 0) {
        const selector = rowSelector || ""
        if (selector) {
            try {
                await root.waitForSelector(selector, { timeout: 10000 })
            } catch {
                appendLog("Timeout waiting for order rows. Maybe no orders or wrong selector?")
                await saveDebugScreenshot(page, "wait_rows_timeout")
                return []
            }
            orderElements = await root.$$(selector)
        }
    }

    appendLog(`Found ${orderElements.length} orders on current page.`)
    const unknownStatusCounts = new Map<string, number>()

    const clickToRevealFullLogisticsIfPresent = async (row: import("playwright").ElementHandle<SVGElement | HTMLElement>) => {
        const selectors = [
            "td:nth-child(4) div.ant-space.ant-space-vertical > div:nth-child(3) > div > div:nth-child(1) > div",
            "td:nth-child(4) .ant-space-vertical > div:nth-child(3) > div > div:nth-child(1) > div",
            "text=查看完整的物流收货信息",
            ":text-matches(\"查看完整.*物流.*信息\")",
            ":text-matches(\"查看.*物流.*信息\")"
        ]
        for (const sel of selectors) {
            try {
                const btn = await row.$(sel).catch(() => null)
                if (btn) {
                    await btn.click({ force: true }).catch(() => void 0)
                    await page.waitForTimeout(600)
                    return true
                }
            } catch {}
        }
        return false
    }

    const readVisiblePopoverText = async () => {
        const candidates = [
            ".ant-popover-inner-content",
            ".ant-tooltip-inner",
            ".ant-modal-content",
            ".ant-drawer-content"
        ]
        const sources: Array<{ locator: (sel: string) => import("playwright").Locator }> = [
            { locator: (sel: string) => root.locator(sel) },
            { locator: (sel: string) => page.locator(sel) },
        ]
        for (const source of sources) {
            for (const sel of candidates) {
                try {
                    const loc = source.locator(sel)
                    const count = await loc.count()
                    if (count > 0) {
                        for (let i = 0; i < Math.min(count, 3); i++) {
                            const el = loc.nth(i)
                            if (await el.isVisible({ timeout: 200 }).catch(() => false)) {
                                const txt = (await el.innerText().catch(() => "")).replace(/\s+/g, " ").trim()
                                if (txt) return txt
                            }
                        }
                    }
                } catch {}
            }
        }
        return ""
    }

    const tryExtractOrderNoFromText = (text: string) => {
        if (!text) return ""
        const patterns: RegExp[] = [
            /(?:订单号|订单编号)[:：]?\s*(\d{12,20})/,
            /(?:订单编号|订单ID|订单号)\s*(\d{12,20})/,
            /\bNO\.?\s*(\d{12,20})\b/i,
            /\b([A-Z]{1,6}\d{10,})\b/i,
            /\b(\d{14,20})\b/
        ]
        for (const re of patterns) {
            const m = text.match(re)
            const candidate = m?.[1] || ""
            if (candidate && !candidate.includes("*")) return candidate.split(/\s+/)[0]
        }
        return ""
    }

    const tryExtractOrderNoFromHref = (href: string) => {
        if (!href) return ""
        try {
            const u = new URL(href, page.url())
            const keys = ["order_id", "orderNo", "order_no", "order", "orderId", "order_id", "id"]
            for (const k of keys) {
                const v = (u.searchParams.get(k) || "").trim()
                const parsed = tryExtractOrderNoFromText(v)
                if (parsed) return parsed
            }
            const pathMatch = u.pathname.match(/\/([A-Za-z0-9-]{10,})$/)
            const parsedPath = pathMatch?.[1] ? tryExtractOrderNoFromText(pathMatch[1]) : ""
            if (parsedPath) return parsedPath
        } catch {
            // ignore
        }
        const direct = tryExtractOrderNoFromText(href)
        if (direct) return direct
        return ""
    }

    const normalizeTrackingNo = (t: string) => t.replace(/\s+/g, "").trim()

    const extractTrackingInfoFromText = (t: string) => {
        const raw =
            t.match(/(SF\s*\d{8,})/)?.[1] ||
            t.match(/((?:JDVC|JD)\s*\d{8,})/)?.[1] ||
            t.match(/(YT\s*\d{8,})/)?.[1] ||
            t.match(/(ZTO\s*\d{8,})/)?.[1] ||
            t.match(/(STO\s*\d{8,})/)?.[1] ||
            t.match(/(YTO\s*\d{8,})/)?.[1] ||
            t.match(/(YD\s*\d{8,})/)?.[1] ||
            t.match(/(EMS\s*\d{8,})/)?.[1] ||
            ""
        const tracking = raw ? normalizeTrackingNo(raw) : ""
        const bracketCompany = t.match(/【([^】]+)】/)?.[1] || ""
        return { tracking, bracketCompany }
    }

    // New Logic: Group rows by order based on "Order Time" pattern at start of row
    // Each order block starts with a row containing "YYYY-MM-DD HH:mm:ss" and "订单号"
    // We will scan rows and start a new chunk whenever we see this pattern.
    
    const chunks: (import("playwright").ElementHandle<SVGElement | HTMLElement>)[][] = []
    let currentChunk: (import("playwright").ElementHandle<SVGElement | HTMLElement>)[] = []
    
    // We need to fetch text for all rows to decide grouping (expensive but necessary for variable height)
    // Optimization: fetch all texts in one evaluate call
    const rowTexts = await Promise.all(orderElements.map(el => el.innerText().catch(() => "")))
    
    const ORDER_START_REGEX = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\s\S]*?订单号/
    
    for (let i = 0; i < orderElements.length; i++) {
        const text = rowTexts[i]
        const isStart = ORDER_START_REGEX.test(text)
        
        if (isStart) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk)
            }
            currentChunk = [orderElements[i]]
        } else {
            if (currentChunk.length > 0) {
                currentChunk.push(orderElements[i])
            } else {
                // Orphan row at start (maybe header or junk), treat as start if it looks like content
                if (text.trim().length > 10) {
                     currentChunk.push(orderElements[i])
                }
            }
        }
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk)
    }
    
    appendLog(`[Debug] Grouped ${orderElements.length} rows into ${chunks.length} order chunks based on timestamp pattern.`)

    for (const [chunkIndex, chunkRows] of chunks.entries()) {
        if (runtime.shouldStop) {
            appendLog("Processing interrupted by stop signal.")
            break
        }

        try {
            // Merge text from all rows in the chunk
            const rowTexts = await Promise.all(chunkRows.map(r => r.innerText().catch(() => "")))
            const fullText = rowTexts.join("\n")
            
            // Use the first row element for interactions (clicks etc) unless specific logic needs others
            // But for "one click view", we might need to search across all rows in chunk
            const element = chunkRows[0] 

            if (fullText.includes("暂无数据")) {
                if (chunkIndex < 3) appendLog(`[Debug] Placeholder row detected, skipping: ${fullText.replace(/\s+/g, ' ').slice(0, 120)}`)
                continue
            }
            
            // Skip purely empty chunks
            if (!fullText.trim()) continue

            if (fullText.includes("认证资料") || fullText.includes("人脸识别") || (fullText.includes("信用额度") && !fullText.includes("订单号"))) {
                if (chunkIndex < 3) appendLog(`[Debug] Skipping invalid row (likely profile info): ${fullText.replace(/\s+/g, ' ').substring(0, 50)}...`)
                continue
            }
            
            if (chunkIndex < 3) {
                 const cleanText = fullText.replace(/\s+/g, ' ').substring(0, 500)
                 appendLog(`[Debug] Order ${chunkIndex + 1} Raw (Merged): ${cleanText}`)
            }
            
            // NOTE: Generic parsing logic
            // Adjust based on actual RRZ HTML structure if needed.
            
            // 1. Order No
            let orderNo = ""
            
            if (!orderNo) {
                try {
                    // Search links in all rows of the chunk
                    for (const row of chunkRows) {
                        const hrefs = await row.$$eval("a[href]", nodes =>
                            nodes
                                .map(n => (n as HTMLAnchorElement).getAttribute("href") || "")
                                .filter(Boolean)
                                .slice(0, 50)
                        )
                        for (const href of hrefs) {
                            const hit = tryExtractOrderNoFromHref(href)
                            if (hit) {
                                orderNo = hit
                                break
                            }
                        }
                        if (orderNo) break
                    }
                } catch {}
            }

            const maskedOrderMatch = fullText.match(/(?:订单号|订单编号)[:：]?\s*([A-Za-z0-9-]+\*{3,}[A-Za-z0-9-]+)/)
            
            if (maskedOrderMatch) {
                const maskedNo = maskedOrderMatch[1]
                appendLog(`Found masked order number: ${maskedNo}. Attempting to click to reveal...`)
                
                try {
                    // Try to find the element in any row of the chunk
                    let clicked = false
                    for (const row of chunkRows) {
                        const orderNoElement = await row.$(`text="${maskedNo}"`) || await row.$(`:text-matches("${maskedNo.replace(/\*/g, '\\*')}")`)
                        
                        if (orderNoElement) {
                            await orderNoElement.click()
                            await page.waitForTimeout(500)
                            
                            // Re-read text from this specific row (or just rely on full re-read if needed, but here simple is better)
                            const newText = await row.innerText()
                            const fullOrderMatch = newText.match(/(?:订单号|订单编号)[:：]?\s*([A-Za-z0-9]{15,})/)
                            if (fullOrderMatch) {
                                orderNo = fullOrderMatch[1]
                                appendLog(`Revealed full order number: ${orderNo}`)
                                clicked = true
                                break
                            } else {
                                const fallbackMatch = newText.match(/O\d{20,}/)
                                if (fallbackMatch) {
                                    orderNo = fallbackMatch[0]
                                    appendLog(`Revealed full order number (fallback): ${orderNo}`)
                                    clicked = true
                                    break
                                }
                            }
                        }
                    }
                    if (!clicked) {
                        appendLog("Could not find clickable element for masked order number.")
                    }
                } catch (clickErr) {
                    appendLog(`Failed to click order number: ${clickErr}`)
                }
            }
            
            if (!orderNo) {
                orderNo = tryExtractOrderNoFromText(fullText)
            }

            if (orderNo && /^\d{4}-\d{2}-\d{2}/.test(orderNo)) {
                orderNo = ""
            }

            if (orderNo && !fullText.includes("订单号") && !fullText.includes("订单编号")) {
                const looksLikePureDigits = /^\d{12,20}$/.test(orderNo)
                if (!looksLikePureDigits) orderNo = ""
            }

            if (!orderNo) {
                try {
                    // Try to find title attribute in any row
                    for (const row of chunkRows) {
                        const titleCandidates = await row.$$eval("[title]", nodes =>
                            nodes
                                .map(n => (n as HTMLElement).getAttribute("title") || "")
                                .filter(Boolean)
                                .slice(0, 50)
                        )
                        for (const t of titleCandidates) {
                            const parsed = (t || "").trim()
                            const hit = parsed ? (parsed.includes("*") ? "" : parsed) : ""
                            const v = tryExtractOrderNoFromText(hit)
                            if (v) {
                                orderNo = v
                                break
                            }
                        }
                        if (orderNo) break
                    }
                    if (!orderNo && chunkIndex < 3) {
                        // Log candidates from first row as sample
                        // (Simplified logging for chunk mode)
                    }
                } catch {}
            }

            if (!orderNo) {
                try {
                    for (const row of chunkRows) {
                        const hrefs = await row.$$eval("a[href]", nodes =>
                            nodes
                                .map(n => (n as HTMLAnchorElement).getAttribute("href") || "")
                                .filter(Boolean)
                                .slice(0, 30)
                        )
                        if (chunkIndex < 3 && hrefs.length > 0) {
                            appendLog(`[Debug] Order ${chunkIndex + 1} href candidates: ${hrefs.slice(0, 6).join(" | ")}`)
                        }
                        // Note: actual extraction from href was already tried above, this is mostly for fallback/logging or secondary try
                        // If we really want to re-try extraction from href here we could, but let's assume the first pass covered it.
                    }
                } catch {}
            }

            if (orderNo) {
                orderNo = orderNo.split(/\s+/)[0]
            }
            
            if (!orderNo) {
                if (chunkIndex < 5) appendLog(`[Warning] No order number found for item ${chunkIndex + 1}`)
                continue 
            }

            // 2. Product Name & Variant
            const lines = fullText.split('\n').map(l => l.trim()).filter(l => l)
            let productName = ""
            let variantName = ""

            const isBadProductLine = (l: string) => {
                if (!l) return true
                if (l.startsWith("店铺(")) return true
                // Explicitly filter out "配件清单" and "物流收货信息"
                if (/^配件清单\s*\(/.test(l) || l.startsWith("配件清单")) return true
                if (l.includes("物流收货信息")) return true
                
                const badKeywords = [
                    "点击查看",
                    "+添加分组",
                    "订单续租",
                    "订单结算比例",
                    "续租每期费率",
                    "寄出方式",
                    "归还方式",
                    "寄出单号",
                    "寄回单号",
                    "寄出物流",
                    "发货物流",
                    "物流：",
                    "认证资料",
                    "人脸识别",
                    "一键查看",
                    "一键复制",
                    "注册手机",
                    "地址已修改",
                    "成功下单",
                    "累计下单",
                    "待发货",
                    "去发货",
                    "取消订单",
                    "订单备注",
                    "预租订单",
                    "到期购买价",
                    "信用评估额度",
                    "商品押金",
                    "已结租金",
                    "应付总费用",
                    "应付总租金",
                    "应付运费",
                    "优惠减免",
                    "实付金额",
                    "付款时间",
                    "发货时间",
                    "预览"
                ]
                // If line contains *any* bad keyword, skip it
                return badKeywords.some(k => l.includes(k))
            }
            
            const nameCandidates = lines.filter(l => 
                l.length > 5 && 
                !/^\d{4}-\d{2}-\d{2}/.test(l) &&
                !l.includes("订单编号") && 
                !l.includes("订单号") &&
                !l.includes("下单时间") && 
                !l.includes("发货时间") &&
                !l.includes("运单号") &&
                !l.includes("风控") &&
                !l.includes("¥") && 
                !l.includes("￥") &&
                // Filter out lines that look like tracking numbers (e.g. SF12345678)
                !/^[A-Z]{2,}\d{10,}$/.test(l) &&
                !isBadProductLine(l)
            )
            
            if (nameCandidates.length > 0) {
                const brands = ["三星", "Samsung", "Galaxy", "Apple", "iPhone", "DJI", "大疆", "华为", "小米", "vivo", "OPPO", "MacBook", "iPad", "索尼", "Canon", "Nikon"]
                const brandLine = nameCandidates.find(l => brands.some(b => l.includes(b)))
                if (brandLine) {
                    productName = brandLine
                } else {
                    productName = nameCandidates[0]
                }
            }
            
            const packageLineIndex = lines.findIndex(l => l.includes("套餐：") || l.includes("套餐:"))
            
            if (packageLineIndex !== -1) {
                const line = lines[packageLineIndex]
                if (line.length < 10 && lines[packageLineIndex + 1]) {
                    variantName = lines[packageLineIndex + 1]
                } else {
                    variantName = line
                }
                // Cleanup variant name
                variantName = variantName.replace(/套餐[:：]?\s*/, "").trim()
            } else {
                 const altPackageLine = lines.find(l => (l.includes("套餐") || l.includes("标配") || l.includes("套装")) && l.length > 5)
                 if (altPackageLine) {
                     variantName = altPackageLine
                     // Cleanup variant name if it starts with known prefixes
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
                 if (fullText.includes("人人租")) {
                     promotionChannel = "人人租"
                 } else if (fullText.includes("支付宝")) {
                     promotionChannel = "支付宝-人人租"
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
                { keywords: ["今日未还款", "待结算", "结算待支付"], value: "DUE_REPAYMENT" },
                { keywords: ["今日已还款"], value: "RENTING" },
                { keywords: ["待确认收货"], value: "PENDING_RECEIPT" },
                { keywords: ["待收货", "待签收", "签收中"], value: "PENDING_RECEIPT" },
                { keywords: ["已发货", "已寄出", "待揽收"], value: "SHIPPED" },
                { keywords: ["待发货", "去发货", "待寄出", "待出库"], value: "PENDING_SHIPMENT" },
                { keywords: ["下单待审核", "待审核", "审核中"], value: "PENDING_REVIEW" },
                { keywords: ["待支付", "待付款", "未支付"], value: "WAIT_PAY" },
                { keywords: ["申请售后", "退款中", "退货中", "寄回中", "已发起归还"], value: "RETURNING" }
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
                const mapped = mapRrzStatusText(rawStatus)
                if (mapped) status = mapped
            }
            
            if (chunkIndex < 5) {
                appendLog(`[Debug] Order ${chunkIndex + 1} Status Result: ${status} (Matched Keyword: "${rawStatus}")`)
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
            if (chunkIndex < 5) appendLog(`[Debug] Order ${chunkIndex + 1}: Checking for phone in text...`)

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
                     if (chunkIndex < 5) appendLog(`[Debug] Order ${chunkIndex + 1}: Found masked phone ${maskedPhone}. Trying to reveal...`)
                     
                     try {
                        const elementId = await element.getAttribute("id")
                    let clicked = false

                    if (elementId && elementId.startsWith("orderScreenshot")) {
                        const selector = `#${elementId} div.userInfo_register > span[style*="cursor"]`
                        const btn = await page.$(selector).catch(() => null)
                        if (btn) {
                            if (chunkIndex < 5) appendLog(`[Debug] Clicking phone selector 1: ${selector}`)
                            await btn.scrollIntoViewIfNeeded().catch(() => {})
                            await btn.click({ force: true })
                            clicked = true
                        }

                        if (!clicked) {
                            const legacySelector = `#${elementId} > div.good_info > div > div:nth-child(4) > div > div.ant-card-body > div > div > div > div:nth-child(2) > div > span:nth-child(2)`
                            const legacyBtn = await page.$(legacySelector).catch(() => null)
                            if (legacyBtn) {
                                if (chunkIndex < 5) appendLog(`[Debug] Clicking phone selector 2 (legacy)`)
                                await legacyBtn.scrollIntoViewIfNeeded().catch(() => {})
                                await legacyBtn.click({ force: true })
                                clicked = true
                            }
                        }
                    }

                    if (!clicked) {
                        const userInfoBtn = await element.$('div.userInfo_register > span[style*="cursor"]')
                        if (userInfoBtn) {
                            if (chunkIndex < 5) appendLog(`[Debug] Clicking phone selector 3 (userInfo_register)`)
                            await userInfoBtn.scrollIntoViewIfNeeded().catch(() => {})
                            await userInfoBtn.click({ force: true })
                            clicked = true
                        }
                    }

                    if (!clicked) {
                        const svg = await element.$("svg[data-icon='eye-invisible']") || await element.$(".anticon-eye-invisible svg")
                        if (svg) {
                            if (chunkIndex < 5) appendLog(`[Debug] Clicking phone selector 4 (eye-invisible svg)`)
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
                            if (chunkIndex < 5) appendLog(`[Debug] Clicking phone selector 5 (eye-invisible icon)`)
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
                            if (chunkIndex < 5) appendLog(`[Debug] Clicking phone text directly: ${maskedPhone}`)
                            await phoneText.scrollIntoViewIfNeeded().catch(() => {})
                            await phoneText.click({ force: true })
                            clicked = true
                        }
                    }

                    if (clicked) {
                        await page.waitForTimeout(1000)
                    } else {
                        if (chunkIndex < 5) appendLog(`[Warning] Failed to find any clickable element for phone ${maskedPhone}`)
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
            let oneClickRevealText = ""
            
            // Try to click "一键查看" if present (often reveals customer info)
            try {
                const oneClickBtn = await element.$("text=一键查看").catch(() => null)
                if (oneClickBtn) {
                    if (chunkIndex < 5) appendLog(`[Debug] Order ${chunkIndex + 1}: Found '一键查看' button, clicking...`)
                    await oneClickBtn.click({ force: true }).catch(() => {})
                    await page.waitForTimeout(1000)
                    
                    // Read popover/tooltip/modal content
                    oneClickRevealText = await readVisiblePopoverText()
                    if (oneClickRevealText && chunkIndex < 5) {
                        appendLog(`[Debug] Order ${chunkIndex + 1} One-click revealed: ${oneClickRevealText.slice(0, 100)}...`)
                    }
                    
                    // Close popover
                    try { await page.keyboard.press("Escape") } catch {}
                }
            } catch (e) {
                appendLog(`Error clicking '一键查看': ${e}`)
            }

            let recipientPhone = ""
            let customerName = ""
            let address = ""

            const infoText = [textAfterClick, oneClickRevealText].filter(Boolean).join("\n")
            // Avoid grabbing "Registered Phone" which is often different from recipient phone
            const primaryInfoText = infoText.split(/注册手机[:：]/)[0] || infoText

            const userInfoMatch = infoText.match(/用户信息[\s\S]*?姓名[:：]\s*([^\s]+)[\s\S]*?号码[:：]\s*(1\d{0,2}\*{2,}\d{2,4}|\*{4,}\d{2,4}|\d{10,11})[\s\S]*?地址[:：]\s*([\s\S]+?)(?:\s*注册号码|$)/)
            if (userInfoMatch) {
                customerName = userInfoMatch[1].trim()
                recipientPhone = userInfoMatch[2].trim()
                address = userInfoMatch[3].trim()
            } else {
                const nameInline = infoText.match(/姓名[:：]\s*([^\s]+)/)
                const phoneInline = infoText.match(/号码[:：]\s*(1\d{0,2}\*{2,}\d{2,4}|\*{4,}\d{2,4}|\d{10,11})/)
                const addressInline = infoText.match(/地址[:：]\s*([\s\S]+?)(?:\s*注册号码|$)/)
                if (nameInline) customerName = nameInline[1].trim()
                if (phoneInline) recipientPhone = phoneInline[1].trim()
                if (addressInline) address = addressInline[1].trim()
            }

            if (!recipientPhone || !address || !customerName) {
                const phoneRegex = /(?:^|[^\d])(1\d{0,2}\*{2,}\d{2,4}|\*{4,}\d{2,4}|\d{10,11})(?:$|[^\d])/g
                const phoneMatches = [...primaryInfoText.matchAll(phoneRegex)]
                if (phoneMatches.length > 0) {
                    recipientPhone = phoneMatches[0][1]
                    const phoneIndex = phoneMatches[0].index! + phoneMatches[0][0].indexOf(recipientPhone)
                    
                    // Look for name BEFORE the phone
                    const beforePhoneText = primaryInfoText.slice(Math.max(0, phoneIndex - 50), phoneIndex).trimEnd()
                    
                    // 1. "杨*敏 189..."
                    const nameSpaceMatch = beforePhoneText.match(/([一-龥]{1,6}\*?[一-龥]{0,6})\s*$/)
                    
                    // 2. "姓名：杨*敏"
                    const nameLabelMatch = beforePhoneText.match(/姓名[:：]\s*([^\s]+)/)

                    if (nameLabelMatch) {
                        customerName = nameLabelMatch[1].trim()
                    } else if (nameSpaceMatch) {
                        customerName = nameSpaceMatch[1].trim()
                    }

                    // Look for address AFTER the phone
                    const postPhone = primaryInfoText.substring(phoneIndex + recipientPhone.length).trim()
                    
                    // 1. "地址：广东省..."
                    const addressMatch = postPhone.match(/地址[:：]\s*([\s\S]+?)(?:\s*注册号码|$)/)
                    
                    // 2. Just text starting with Province "广东省..."
                    const provinceMatch = postPhone.match(/((?:北京|天津|上海|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆|香港|澳门).*?)(?:\s*注册手机|\s*\[|$)/)

                    if (addressMatch) {
                        address = addressMatch[1].trim()
                    } else if (provinceMatch) {
                        address = provinceMatch[1].trim()
                    }
                }
            }

            // If primary extraction failed, try finding phone line by line
            if (!recipientPhone) {
                // Find line with phone-like pattern
                const phoneLineIdx = lines.findIndex(l => /(?:^|[^\d])(1\d{0,2}\*{2,}\d{2,4}|\*{4,}\d{2,4}|\d{10,11})(?:$|[^\d])/.test(l))
                if (phoneLineIdx !== -1) {
                    const l = lines[phoneLineIdx]
                    const m = l.match(/(?:^|[^\d])(1\d{0,2}\*{2,}\d{2,4}|\*{4,}\d{2,4}|\d{10,11})(?:$|[^\d])/)
                    if (m) {
                        recipientPhone = m[1]
                        // Name might be on the same line before phone
                        const pre = l.substring(0, m.index).trim()
                        if (pre && pre.length < 10) {
                            customerName = pre
                        }
                        
                        // Address might be on the next line
                        if (!address && lines[phoneLineIdx + 1]) {
                             const nextL = lines[phoneLineIdx + 1]
                             if (nextL.length > 6 && !nextL.includes("注册手机") && !nextL.includes("地址已修改")) {
                                 address = nextL
                             }
                        }
                    }
                }
            }

            if (!recipientPhone) {
                const fullPhone = primaryInfoText.match(/(?:^|[^\d])(1\d{10})(?:$|[^\d])/)?.[1] || ""
                if (fullPhone) recipientPhone = fullPhone
            }

            if (!customerName) {
                const nameByPhone =
                    primaryInfoText.match(/([一-龥]{1,6}\*?[一-龥]{0,6})\s*(?:\(|（)?\s*(?:1\d{10}|1\d{2}\*{2,}\d{2,4}|\d{11})/)?.[1] ||
                    primaryInfoText.match(/([一-龥]{1,6}\*?[一-龥]{0,6})(?=\s*(?:1\d{10}|1\d{2}\*{2,}\d{2,4}))/)?.[1] ||
                    ""
                if (nameByPhone) customerName = nameByPhone.trim()
            }

            if (!address) {
                const candidates = Array.from(primaryInfoText.matchAll(/([^\s]{2,}(?:省|市|自治区|特别行政区)[^\n]{4,}?)(?=\s|$)/g)).map(m => (m[1] || "").trim())
                const filtered = candidates.filter(t => t.length >= 6 && !t.includes("押金") && !t.includes("租金") && !t.includes("订单") && !t.includes("店铺"))
                if (filtered.length > 0) {
                    filtered.sort((a, b) => b.length - a.length)
                    address = filtered[0]
                }
            }

            // Logistics
            let logisticsCompany = ""
            let trackingNumber = ""
            let latestLogisticsInfo = ""
            let returnLogisticsCompany = ""
            let returnTrackingNumber = ""
            const returnLatestLogisticsInfo = ""

            const revealed = await clickToRevealFullLogisticsIfPresent(element)
            if (revealed) {
                const popText = await readVisiblePopoverText()
                if (popText) {
                    latestLogisticsInfo = popText
                    try {
                        await page.keyboard.press("Escape").catch(() => void 0)
                    } catch {}
                }
            }

            const normalizeLogisticsCompany = (t: string) => {
                if (!t) return ""
                if (t.includes("顺丰")) return "顺丰速运"
                if (t.includes("京东")) return "京东快递"
                if (t.includes("圆通")) return "圆通速递"
                if (t.includes("中通")) return "中通快递"
                if (t.includes("申通")) return "申通快递"
                if (t.includes("韵达")) return "韵达快递"
                return ""
            }

            const extractTrackingInfo = (t: string) => {
                const { tracking, bracketCompany } = extractTrackingInfoFromText(t)
                const company = normalizeLogisticsCompany(bracketCompany || t)
                return { tracking, company }
            }

            const fillTrackingFromLabel = (label: string) => {
                const idx = lines.findIndex(l => l.includes(label))
                if (idx === -1) return { tracking: "", company: "" }
                const sameLine = lines[idx]
                let content = sameLine.substring(sameLine.indexOf(label) + label.length).replace(/^[:：]/, "").trim()
                if ((!content || content === "【】") && lines[idx + 1]) {
                     content = lines[idx + 1].trim()
                }
                if (content && !content.includes("【") && lines[idx + 1] && lines[idx + 1].includes("【")) {
                     content = `${content} ${lines[idx + 1].trim()}`
                }
                if (content && !content.includes("【") && lines[idx + 2] && lines[idx + 2].includes("【")) {
                    content = `${content} ${lines[idx + 2].trim()}`
                }
                
                return extractTrackingInfo(content)
            }

            let attributeText = ""
            try {
                const attrs = await element.$$eval("[title], [data-clipboard-text]", nodes =>
                    nodes
                        .flatMap(n => {
                            const el = n as HTMLElement
                            const t = el.getAttribute("title") || ""
                            const c = el.getAttribute("data-clipboard-text") || ""
                            return [t, c].filter(Boolean)
                        })
                        .slice(0, 80)
                )
                attributeText = (attrs || []).join(" ")
            } catch {}

            if (!trackingNumber) {
                const { tracking, company } = fillTrackingFromLabel("寄出单号")
                if (tracking) {
                    trackingNumber = tracking
                    if (company) logisticsCompany = company
                }
            }
            
            if (!trackingNumber) {
                 const { tracking, company } = fillTrackingFromLabel("发货物流")
                 if (tracking) {
                     trackingNumber = tracking
                     if (company) logisticsCompany = company
                 }
            }

            if (!returnTrackingNumber) {
                const { tracking, company } = fillTrackingFromLabel("寄回单号")
                if (tracking) {
                    returnTrackingNumber = tracking
                    if (company) returnLogisticsCompany = company
                }
            }
            
            // If not found in specific line, try global search
            if (!trackingNumber) {
                const { tracking, bracketCompany } = extractTrackingInfoFromText(fullText)
                if (tracking) {
                    trackingNumber = tracking
                    const company = normalizeLogisticsCompany(bracketCompany || fullText)
                    if (company) logisticsCompany = company
                }
            }

            if (!trackingNumber && latestLogisticsInfo) {
                const { tracking, company } = extractTrackingInfo(latestLogisticsInfo)
                if (tracking) {
                    trackingNumber = tracking
                    if (company) logisticsCompany = company
                }
            }

            if (!trackingNumber && attributeText) {
                const { tracking, bracketCompany } = extractTrackingInfoFromText(attributeText)
                if (tracking) {
                    trackingNumber = tracking
                    const company = normalizeLogisticsCompany(bracketCompany || attributeText)
                    if (company) logisticsCompany = company
                }
            }

            if (status === "UNKNOWN") {
                if (fullText.includes("订单状态更改为关闭") || fullText.includes("交易关闭") || fullText.includes("已关闭")) {
                    status = "CLOSED"
                } else if (returnTrackingNumber || fullText.includes("寄回单号") || fullText.includes("归还中") || fullText.includes("退租中")) {
                    status = "RETURNING"
                } else if (trackingNumber || fullText.includes("寄出单号") || fullText.includes("发货时间")) {
                    status = "SHIPPED"
                } else if (fullText.includes("续租")) {
                    status = "RENTING"
                }
            }

            if (status === "UNKNOWN") {
                const key = rawStatus || "UNIDENTIFIED"
                unknownStatusCounts.set(key, (unknownStatusCounts.get(key) || 0) + 1)
                const snippet = fullText.replace(/\s+/g, " ").substring(0, 300)
                const totalUnknown = [...unknownStatusCounts.values()].reduce((a, b) => a + b, 0)
                if (totalUnknown <= 10) {
                    appendLog(`[System] 人人租未知状态: 订单=${orderNo}, 提取状态="${key}", 全文片段=${snippet}`)
                }
            }
            
            // Dates
            let rentStartDate, returnDeadline, duration = 0
            
            const periodLine = lines.find(l => l.includes("租期：") || l.includes("租期:"))
            if (periodLine) {
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
                 const dateRegex = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/g
                 const allDates = [...fullText.matchAll(dateRegex)].map(m => m[1])
                 if (allDates.length >= 2) {
                     // If we have at least 2 precise timestamps, assume the last two are relevant
                     // Or check for just dates
                 }
                 
                 // Fallback: simple date search
                 const simpleDates = [...fullText.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map(m => m[1])
                 if (simpleDates.length >= 2 && !rentStartDate) {
                     const unique = Array.from(new Set(simpleDates)).sort()
                     if (unique.length >= 2) {
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
            
            // --- Debug Section Start ---
            const looksLikeTracking = (s: string) => /^[A-Z]{2,}\d{10,}$/.test(s)
            if (looksLikeTracking(productName)) {
                appendLog(`[Debug][异常标题] 订单=${orderNo}, 标题疑似单号="${productName}", 全文:\n${fullText}`)
            }
            if (!customerName || !recipientPhone || !address) {
                appendLog(`[Debug][缺失信息] 订单=${orderNo}, 姓名=${customerName}, 电话=${recipientPhone}, 地址=${address}, 全文:\n${fullText}`)
            }
            // --- Debug Section End ---

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
                platform: "\u4eba\u4eba\u79df", 
                merchantName: (() => {
                    const m = fullText.match(/店铺\(\d+\)[:：]\s*([^\s]+)/)
                    return m?.[1]?.trim() || ""
                })(),
                productName,
                variantName,
                itemTitle: productName,
                itemSku: variantName,
                logisticsCompany,
                trackingNumber,
                latestLogisticsInfo,
                returnLogisticsCompany,
                returnTrackingNumber,
                returnLatestLogisticsInfo,
                promotionChannel,
                createdAt: (() => {
                    const m = fullText.match(/下单时间[:：]?\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/)
                    return m ? new Date(m[1]) : undefined
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
        appendLog(`[System][人人租] 未识别状态汇总: ${top}`)
    }
    
    return parsedOrders
}

const _collectedOrders: RrzParsedOrder[] = []
export function getCollectedOrders() { return [..._collectedOrders] }
export function clearCollectedOrders() { _collectedOrders.length = 0 }
export async function closeContext() {
  if (runtime.context) { await runtime.context.close().catch(() => void 0); runtime.context = undefined; runtime.page = undefined }
}
export async function moveWindow(x: number, y: number) {
  if (!runtime.context) return
  try {
    const pages = runtime.context.pages()
    const page = pages[0]; if (!page) return
    const cdp = await runtime.context.newCDPSession(page)
    const { windowId } = await cdp.send('Browser.getWindowForTarget')
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: x, top: y, windowState: 'normal' } })
    await cdp.detach()
    if (runtime.page && !runtime.page.isClosed()) await runtime.page.bringToFront().catch(() => void 0)
  } catch { /* ignore */ }
}

async function saveOrdersBatch(orders: RrzParsedOrder[]) {
  _collectedOrders.push(...orders)
  appendLog(`[sync-tool] 已收集 ${orders.length} 条订单（累计 ${_collectedOrders.length} 条）`)
  return
  if (false) {
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
  } // end disabled DB save
}

export async function startRrzSync(siteId: string) {
  try {
    const config = await loadConfig()
    appendLog(`Starting Rrz Sync for siteId: ${siteId}`)
    
    if (!config) {
        throw new Error("Online orders config not found")
    }

    const site = config.sites.find(s => 
        s.id === siteId || 
        s.id.toLowerCase() === siteId.toLowerCase() ||
        s.name.trim() === '人人租'
    )
    
    const targetSite = site ?? config.sites.find(s => s.name.includes('人人租') || s.id.includes('rrz'))
    if (!targetSite) {
        throw new Error(`Site ${siteId} not found in config`)
    }

    const previousLogs = runtime.status.logs || []
    runtime.shouldStop = false;
    updateStatus({ status: "running", message: "Starting...", logs: previousLogs, lastRunAt: new Date().toISOString() })
    appendLog(`Starting sync for ${targetSite.name} (ID: ${targetSite.id})`)

    const headless = config?.headless ?? false 
    appendLog(`Using headless mode: ${headless}`)
    
    {
        const rt = getRuntimeWithApi()
        rt.rrzApiRouteAttached = false
        rt.expectedApiPage = undefined
        rt.latestOrderListData = undefined
        rt.latestOrderListText = undefined
        rt.latestOrderListUrl = undefined
        ensurePageMaps(rt)
        rt.orderListDataByPage?.clear()
        rt.orderListUrlByPage?.clear()
        rt.orderListTextByPage?.clear()
    }

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
    const clickOk = await openRrzOrderListByClicks(page)
    if (!clickOk) {
        appendLog("Menu click navigation failed, falling back to configured order_menu_link if available.")
        if (targetSite.selectors.order_menu_link) {
            const targetUrl = targetSite.selectors.order_menu_link
            try {
                const origin = getOriginFromUrl(targetUrl)
                await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000, referer: origin ? `${origin}/` : undefined })
                await waitRandom(page, 1200, 3000)
                appendLog(`After navigation URL: ${page.url()}`)
            } catch (err) {
                appendLog(`Navigation failed: ${err}`)
            }
        }
    }
    
    await handlePopup(page)
    await logPageStructure(page, "after_nav")
    let orderRoot = await pickOrderRoot(page, "after_nav")
    await logOrderDomStats(orderRoot, "after_nav")

    if (targetSite.selectors.all_orders_tab_selector) {
        await handlePopup(page)
        orderRoot = await switchToAllOrdersTab(page, orderRoot, targetSite.selectors.all_orders_tab_selector)
        orderRoot = await pickOrderRoot(page, "after_switch_tab")
        const ok = await waitForOrderListReady(page, orderRoot, 25000)
        if (!ok) {
            appendLog("[Warning] Order list still not ready after switching tab.")
            await saveDebugScreenshot(page, "after_switch_tab")
        }
        await logPageStructure(page, "after_switch_tab")
        await logOrderDomStats(orderRoot, "after_switch_tab")
    }

    // Reset pagination to page 1
    try {
        await handlePopup(page)
        const page1Btn = (await orderRoot.$(".ant-pagination-item-1").catch(() => null)) || (await orderRoot.$("li[title='1']").catch(() => null)) || (await orderRoot.$("text=1").catch(() => null))
        if (page1Btn) {
            const isActive = await page1Btn.getAttribute("class").then(c => c?.includes("active"))
            if (!isActive) {
                appendLog("Resetting pagination to page 1...")
                await page1Btn.click({ force: true })
                await waitRandom(page, 2500, 4000)
            }
        }
    } catch (e) {
        appendLog(`Failed to reset pagination: ${e}`)
    }

    {
        orderRoot = await pickOrderRoot(page, "after_pagination_reset")
        const ok = await waitForOrderListReady(page, orderRoot, 25000)
        if (!ok) {
            appendLog("[Warning] Order list not ready after pagination reset.")
            await saveDebugScreenshot(page, "after_pagination_reset")
        }
        await logOrderDomStats(orderRoot, "after_pagination_reset")
    }

    let currentPage = 1
    const configMaxPages = Number(targetSite.maxPages ?? (targetSite as unknown as { max_pages?: number }).max_pages)
    const MAX_PAGES = !isNaN(configMaxPages) && configMaxPages > 0 ? configMaxPages : 50
    
    appendLog(`Max pages set to: ${MAX_PAGES}`)
    
    let hasMore = true
    const stopThreshold = targetSite.stopThreshold ?? config?.stopThreshold ?? 20
    let consecutiveFinalStateCount = 0
    const finalStatuses = ["COMPLETED", "CLOSED", "BOUGHT_OUT", "CANCELED"]
    appendLog(`Incremental stop threshold: ${stopThreshold}`)
    
    let pendingSaveOrders: RrzParsedOrder[] = []
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
        const ok = await openRrzOrderListByClicks(page)
        if (!ok && targetSite.selectors.order_menu_link) {
            const origin = getOriginFromUrl(targetSite.selectors.order_menu_link)
            await page.goto(targetSite.selectors.order_menu_link, { waitUntil: "domcontentloaded", timeout: 30000, referer: origin ? `${origin}/` : undefined })
            await waitRandom(page, 1200, 3000)
        }
        await handlePopup(page)
        orderRoot = await pickOrderRoot(page, "crash_recovery")
        if (targetSite.selectors.all_orders_tab_selector) {
            orderRoot = await switchToAllOrdersTab(page, orderRoot, targetSite.selectors.all_orders_tab_selector)
            orderRoot = await pickOrderRoot(page, "crash_recovery_after_tab")
        }
        if (currentPage > 1) {
            appendLog(`Re-navigating to page ${currentPage} after crash recovery...`)
            for (let p = 1; p < currentPage; p++) {
                if (targetSite.selectors.pagination_next_selector) {
                    const nb = await orderRoot.$(targetSite.selectors.pagination_next_selector).catch(() => null)
                    if (nb) { await nb.click({ force: true }); await waitRandom(page, 2000, 3500) }
                }
            }
            orderRoot = await pickOrderRoot(page, `crash_recovery_page_${currentPage}`)
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
            if (currentPage % 2 === 1) {
                await simulateHumanMouse(page, 1, 3)
                await simulateHumanScroll(page, 1, 2)
            }
            await waitRandom(page, 800, 1600)
            return await parseOrders(page, orderRoot, targetSite, currentPage)
        })()
        let pageOrders: RrzParsedOrder[]
        try {
            pageOrders = await Promise.race([pageWorkPromise, pageTimeoutPromise])
        } finally {
            clearTimeout(pageTimeoutHandle)
        }

        pageRetryCount = 0

        if (stopThreshold > 0 && pageOrders.length > 0) {
            const orderNos = pageOrders.map(o => o.orderNo).filter(Boolean)
            try {
                const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip incremental stop
                const finalSet = new Set(existingFinalOrders.map(o => o.orderNo))

                let shouldStop = false
                for (const order of pageOrders) {
                    if (!order.orderNo) continue
                    if (finalSet.has(order.orderNo)) {
                        consecutiveFinalStateCount++
                        if (consecutiveFinalStateCount >= stopThreshold) {
                                appendLog(`已连续发现 ${consecutiveFinalStateCount} 个历史终态订单 (最后检测: ${order.orderNo})，触发增量同步停止阈值。`)
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
            await simulateHumanMouse(page, 1, 3)
            await simulateHumanScroll(page, 1, 3)
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

        // Try DOM-based pagination first
        let domPageAdvanced = false
        if (targetSite.selectors.pagination_next_selector) {
             const nextBtn = await orderRoot.$(targetSite.selectors.pagination_next_selector).catch(() => null)
             
             if (nextBtn) {
                 const classAttr = await nextBtn.getAttribute('class') || ""
                 const isDisabled = await nextBtn.getAttribute('disabled') !== null || classAttr.includes('disabled')
                 
                 if (!isDisabled) {
                     appendLog(`Navigating to next page (Page ${currentPage + 1})...`)
                     {
                         const rt = getRuntimeWithApi()
                         ensurePageMaps(rt)
                         const nextPage = currentPage + 1
                         rt.expectedApiPage = nextPage
                         rt.orderListDataByPage?.delete(nextPage)
                         rt.orderListUrlByPage?.delete(nextPage)
                         rt.orderListTextByPage?.delete(nextPage)
                     }
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
                     orderRoot = await pickOrderRoot(page, `after_page_${currentPage}`)
                     domPageAdvanced = true
                 } else {
                     appendLog("Next page button is disabled. Reached end of list.")
                     hasMore = false
                 }
             }
        }

        // API-driven pagination fallback: if DOM pagination didn't advance but we got a full page,
        // directly fetch the next page via the intercepted API URL (increment page param).
        if (!domPageAdvanced && hasMore) {
            const rt = getRuntimeWithApi()
            const prevUrl = rt.orderListUrlByPage?.get(currentPage) || rt.latestOrderListUrl || ""
            if (prevUrl && pageOrders.length > 0) {
                try {
                    // Check per_page from URL to know if this was a full page
                    let perPage = 15
                    try {
                        const u = new URL(prevUrl)
                        const pp = Number(u.searchParams.get("per_page"))
                        if (pp > 0) perPage = pp
                    } catch {}

                    if (pageOrders.length < perPage) {
                        // Last page (partial), no more data
                        appendLog(`[API Pagination] Got ${pageOrders.length}/${perPage} orders, reached last page.`)
                        hasMore = false
                    } else {
                        const nextPage = currentPage + 1
                        const nextUrl = prevUrl.replace(/([?&]page=)\d+/, `$1${nextPage}`)
                        if (nextUrl === prevUrl) {
                            appendLog("API pagination: could not find page param in URL, stopping.")
                            hasMore = false
                        } else {
                            appendLog(`[API Pagination] Fetching page ${nextPage} via API: ${nextUrl}`)
                            ensurePageMaps(rt)
                            rt.expectedApiPage = nextPage
                            rt.orderListDataByPage?.delete(nextPage)
                            rt.orderListUrlByPage?.delete(nextPage)
                            rt.orderListTextByPage?.delete(nextPage)
                            // Trigger the API call from within the page context so cookies/auth are included
                            await page.evaluate((url: string) => {
                                return fetch(url, { credentials: "include" }).catch(() => null)
                            }, nextUrl)
                            await waitRandom(page, 2000, 3500)
                            currentPage = nextPage
                        }
                    }
                } catch (apiPageErr) {
                    appendLog(`[API Pagination] Error fetching next page: ${apiPageErr}`)
                    hasMore = false
                }
            } else {
                hasMore = false
            }
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
    })
    appendLog("Sync completed successfully.")

  } catch (e) {
    const msg = String(e)
    if (msg.includes("RRZ_LOGIN_REQUIRED")) {
        updateStatus({
            status: "awaiting_user",
            message: "需要人工介入: 人人租登录已失效，请重新登录",
            needsAttention: true,
            logs: [...(runtime.status.logs || []), `[Error] RRZ_LOGIN_REQUIRED`]
        })
        appendLog("Sync paused: login required.")
        return
    }

    updateStatus({
        status: "error",
        message: `Error: ${msg}`,
        logs: [...(runtime.status.logs || []), `[Error] ${msg}`]
    })
    appendLog(`Sync failed: ${msg}`)
  } finally {
      // Do not close page to allow reuse
  }
}
