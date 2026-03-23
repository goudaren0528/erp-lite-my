import path from "path"
import fs from "fs"
import { chromium, type BrowserContext, type Page } from "playwright"

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
export type YoupinStatus = {
  status: "idle" | "running" | "awaiting_user" | "error" | "success"
  message?: string
  needsAttention?: boolean
  logs?: string[]
  lastRunAt?: string
}


type YoupinParsedOrder = {
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
  logisticsCompany: string
  trackingNumber: string
  promotionChannel: string
  specId?: string | null
  createdAt?: Date
}

type YoupinRuntime = {
  status: YoupinStatus
  context?: BrowserContext
  page?: Page
  headless?: boolean
  shouldStop?: boolean
}

const globalForYoupin = globalThis as unknown as { youpinRuntime?: YoupinRuntime }

const runtime: YoupinRuntime = globalForYoupin.youpinRuntime ?? {
  status: { status: "idle", logs: [] },
  shouldStop: false
}
globalForYoupin.youpinRuntime = runtime

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
    "Accept-Language": "zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3",
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

async function openYoupinOrderListByClicks(page: Page) {
  const orderMgmtMenu =
    "#app > div.app-wrapper.openSidebar > div.sidebar-container.has-logo > div.el-scrollbar > div.scrollbar-wrapper.el-scrollbar__wrap > div > ul > div:nth-child(6) > li > div"
  const orderListMenu =
    "#app > div.app-wrapper.openSidebar > div.sidebar-container.has-logo > div.el-scrollbar > div.scrollbar-wrapper.el-scrollbar__wrap > div > ul > div:nth-child(6) > li > ul > div:nth-child(1) > a > li"
  const allOrdersTab = "#main > div > div.single-page-con > div > div > div > div > ul > li:nth-child(1)"

  const ok1 = await clickNav(page, orderMgmtMenu)
  if (!ok1) return false
  const ok2 = await clickNav(page, orderListMenu)
  if (!ok2) return false
  const ok3 = await clickNav(page, allOrdersTab)
  if (!ok3) return false
  await simulateHumanScroll(page, 1, 3)
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => void 0)
  return true
}

function getLogFilePath() {
  const date = new Date().toISOString().split('T')[0]
  const logDir = path.join(_appBasePath(), "logs")
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  return path.join(logDir, `youpin-${date}.log`)
}

export function getYoupinStatus() {
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

export function stopYoupinSync() {
    runtime.shouldStop = true
    appendLog("User requested stop.")
    updateStatus({ status: "idle", message: "已停止" })
}

export async function restartYoupinBrowser() {
    appendLog("Browser restart requested.")
    runtime.shouldStop = true
    if (runtime.context) {
        await runtime.context.close().catch(() => void 0)
        runtime.context = undefined
        runtime.page = undefined
        appendLog("Browser context closed.")
    }
    updateStatus({ status: "idle", message: "浏览器已重启，可重新开始同步", needsAttention: false })
    return { success: true }
}

export async function clearYoupinSession() {
    appendLog("Manual clear session requested.")
    try {
        // Close the existing context entirely so next launch picks up the stealth init script
        if (runtime.context) {
            await runtime.context.close().catch(() => void 0)
            runtime.context = undefined
            runtime.page = undefined
            appendLog("Browser context closed. Will relaunch with stealth on next sync start.")
        }
        updateStatus({ status: "awaiting_user", message: "已清除登录状态，请重新点击「开始同步」以重新打开浏览器登录", needsAttention: true })
        return { success: true }
    } catch (e) {
        appendLog(`Clear session error: ${e}`)
        return { success: false, error: String(e) }
    }
}

function updateStatus(updates: Partial<YoupinStatus>) {
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
    console.log(`[Youpin] ${message}`)
    
    const currentLogs = runtime.status.logs || []
    updateStatus({
        logs: [...currentLogs, fullMsg].slice(-2000)
    })
    
    try {
        /* schedulerLogger removed */
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
  
  const userDataDir = path.join(_appBasePath(), ".playwright", "youpin")
  
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

      await runtime.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
        ;(window as unknown as Record<string, unknown>).chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}), app: {} }
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
        Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] })
      })
  } catch (e) {
      appendLog(`Failed to launch browser: ${e}`)
      throw e
  }
  
  return runtime.context
}

async function ensurePage(headless: boolean): Promise<Page> {
  if (runtime.page && !runtime.page.isClosed()) {
      appendLog("Reusing existing page session.");
      return runtime.page;
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
    if (site.loginUrl && url && url.includes("login")) return true
    
    const loginHints = [
        site.selectors.username_input,
        site.selectors.password_input,
        site.selectors.login_button,
        "input[type='password']",
        "button:has-text('登录')",
        "button:has-text('Login')"
    ].filter(Boolean)

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

  // Always navigate to loginUrl unless we can confirm we're already on a valid order page.
  const currentUrl = page.url()
  const orderMenuLink = site.selectors.order_menu_link
  const alreadyOnOrderPage = orderMenuLink
    ? currentUrl.startsWith(orderMenuLink)
    : (currentUrl !== "about:blank" && !currentUrl.includes("login") && currentUrl.includes(new URL(site.loginUrl).hostname))
  
  if (!alreadyOnOrderPage) {
    appendLog(`Navigating to login: ${site.loginUrl}`)
    const origin = getOriginFromUrl(site.loginUrl)
    await page.goto(site.loginUrl, { waitUntil: "domcontentloaded", referer: origin ? `${origin}/` : undefined })
    // 等页面完全稳定，不做任何填写操作，避免触发验证码刷新
    await waitRandom(page, 1000, 1500)
  }

  // Re-check: if session is still valid, skip waiting for login
  if (!(await isOnLoginPage(page, site))) {
    appendLog("Already logged in, skipping manual login wait.")
    return true
  }

  // 优品租：不自动填账密，不点登录，不做任何操作
  // 任何自动操作都可能导致 uuid 和验证码图片不一致
  appendLog("已打开登录页，等待人工完成登录（填账密+验证码+点登录）...")
  updateStatus({ status: "awaiting_user", message: "需要人工介入: 请在浏览器中填写账号、密码、验证码后点击登录", needsAttention: true })
  const config = await loadConfig()
  if (config?.webhookUrls && config.webhookUrls.length > 0) {
    sendWebhookSimple(config, "优品租登录需要人工介入")
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

async function handlePopup(page: Page) {
    try {
        // Generic popup handling, might need adjustment for Youpin
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
                appendLog("Could not find specific close button, trying generic close icon...")
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

async function parseOrders(page: Page, site: SiteConfig): Promise<YoupinParsedOrder[]> {
    const rowSelector = site.selectors.order_row_selectors
    const templateSelector = site.selectors.order_row_selector_template
    const parsedOrders: YoupinParsedOrder[] = []
    
    if (!rowSelector && !templateSelector) {
        appendLog("No row selector configured, skipping parsing.")
        return []
    }

    let orderElements: (import("playwright").ElementHandle<SVGElement | HTMLElement>)[] = []

    if (templateSelector && templateSelector.includes("{i}")) {
        // Fallback strategy: If template selector is too complex (full CSS path), try to simplify it.
        // User provided: #app > ... > tr:nth-child({i})
        // We can try to just use "table tr" if the complex one fails.
        
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
            
            // Try to find ANY table row that looks like an order
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
                } catch {}
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

    for (const [index, element] of orderElements.entries()) {
        try {
            const fullText = await element.innerText()
            
            // Debug: Log first few orders content to understand structure
            if (index < 3) {
                 const cleanText = fullText.replace(/\s+/g, ' ').substring(0, 500)
                 appendLog(`[Debug] Order ${index + 1} Raw: ${cleanText}`)
            }
            
            // NOTE: This parsing logic is generic and needs to be adapted for Youpin
            // once we have sample data or page structure.
            
            // 1. Order No
            let orderNo = ""
            const orderNoMatch = fullText.match(/(?:订单号|订单编号)[:：]?\s*([A-Za-z0-9]{10,})/)
            if (orderNoMatch) {
                orderNo = orderNoMatch[1]
            }
            
            if (!orderNo) {
                // Fallback: Try finding common order number patterns
                const fallbackMatch = fullText.match(/[A-Z0-9]{15,}/)
                if (fallbackMatch) orderNo = fallbackMatch[0]
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
            
            // Try to find the line with main product name keywords
            const nameCandidates = lines.filter(l => 
                l.length > 5 && 
                !l.includes("订单编号") && 
                !l.includes("下单时间") && 
                !l.includes("发货时间") &&
                !l.includes("运单号") &&
                !l.includes("风控") &&
                !/^\d{10,}$/.test(l) &&           // 排除纯数字订单号
                !/^\d{4}-\d{2}-\d{2}/.test(l) &&  // 排除日期行
                !l.includes("ID：") &&
                !l.includes("支付宝") &&
                !l.includes("订单来源") &&
                !/^\d+\.\d+\(/.test(l) &&          // 排除金额行如 140.00(总)
                !/^\d+天$/.test(l) &&              // 排除 "7天"
                !l.includes("查看详情") &&
                !l.includes("续租申请") &&
                !l.includes("添加快递") &&
                !l.includes("关闭订单") &&
                !l.includes("全额免押") &&
                !l.includes("身份证")
            )
            
            if (nameCandidates.length > 0) {
                const brands = ["三星", "Samsung", "Galaxy", "Apple", "iPhone", "DJI", "大疆", "华为", "小米", "vivo", "OPPO", "MacBook", "iPad", "索尼", "Canon", "Nikon", "佳能", "尼康", "富士"]
                const brandLine = nameCandidates.find(l => brands.some(b => l.includes(b)))
                if (brandLine) {
                    productName = brandLine
                } else {
                    productName = nameCandidates[0]
                }
            }
            
            // Variant / Package
            // Fix: Handle cases where "标准套餐：" is on one line and content is on the next
            const packageLineIndex = lines.findIndex(l => l.includes("套餐：") || l.includes("套餐:"))
            
            if (packageLineIndex !== -1) {
                const line = lines[packageLineIndex]
                // If the line is short (just a label like "标准套餐："), check the next line
                if (line.length < 10 && lines[packageLineIndex + 1]) {
                    variantName = lines[packageLineIndex + 1]
                } else {
                    variantName = line
                }
                variantName = variantName.replace(/套餐[:：]?\s*/, "").trim()
            } else {
                 // Fallback: look for "套餐" or "标配" or "套装"
                 const altPackageLine = lines.find(l => (l.includes("套餐") || l.includes("标配") || l.includes("套装")) && l.length > 5)
                 if (altPackageLine) {
                     variantName = altPackageLine
                     variantName = variantName.replace(/^(套餐|标配|套装)[:：]?\s*/, "").trim()
                 } else {
                     if (index < 3) appendLog(`[Debug] No variant found. Lines: ${JSON.stringify(lines)}`)
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
                 // Fallback: Check for known channel keywords in full text
                 if (fullText.includes("支付宝-优品租")) {
                     promotionChannel = "支付宝-优品租"
                 } else if (fullText.includes("租物")) {
                     promotionChannel = "租物"
                 }
                 
                 if (!promotionChannel && index < 3) appendLog(`[Debug] No channel found. Lines: ${JSON.stringify(lines)}`)
            }

            // 3. Status
            // Mapping based on actual Youpin platform status text (left) -> internal status (right)
            // 待审核 -> PENDING_REVIEW
            // 待支付 -> WAIT_PAY
            // 待发货 -> PENDING_SHIPMENT
            // 租用中 -> RENTING
            // 已归还 -> COMPLETED  (归还完成，终态)
            // 归还中 -> RETURNING  (设备运输途中)
            // 已买断 -> BOUGHT_OUT
            // 已关闭 -> COMPLETED
            // 取消申请 -> CLOSED
            // 逾期订单 -> OVERDUE
            const statusRules: Array<{ keywords: string[]; value: string }> = [
                { keywords: ["已买断"],          value: "BOUGHT_OUT" },
                { keywords: ["逾期订单"],         value: "OVERDUE" },
                { keywords: ["已关闭"],           value: "COMPLETED" },
                { keywords: ["取消申请"],         value: "CLOSED" },
                { keywords: ["已归还"],           value: "COMPLETED" },
                { keywords: ["归还中"],           value: "RETURNING" },
                { keywords: ["租用中"],           value: "RENTING" },
                { keywords: ["待发货"],           value: "PENDING_SHIPMENT" },
                { keywords: ["待支付"],           value: "WAIT_PAY" },
                { keywords: ["待审核"],           value: "PENDING_REVIEW" },
            ]

            let status = "UNKNOWN"
            for (const rule of statusRules) {
                if (rule.keywords.some(k => fullText.includes(k))) {
                    status = rule.value
                    break
                }
            }
            
            // 4. Money
            // Log: "77.00(总) 11(元/天) 3948.00(买断) 3500.00(总) 3500.00(免押)"
            // Need to parse carefully. 
            // "77.00(总)" likely total rent
            // "3500.00(免押)" likely deposit (waived)
            
            // Regex for Amount(Label)
            const moneyRegex = /([\d.]+)\s*\(([^)]+)\)/g
            const moneyMatches = [...fullText.matchAll(moneyRegex)]
            
            let rentPrice = 0
            let deposit = 0
            let totalAmount = 0
            
            for (const match of moneyMatches) {
                const amount = parseFloat(match[1])
                const label = match[2]
                
                if (label.includes("总") && rentPrice === 0) {
                    rentPrice = amount // First "Total" is usually rent total? Or look for context
                    totalAmount = amount
                } else if (label.includes("免押") || label.includes("押金")) {
                    deposit = amount
                }
            }
            
            // If regex failed, fallback to searching for "￥"
            if (rentPrice === 0) {
                const rentMatch = fullText.match(/￥?([\d.]+)\(总\)/)
                if (rentMatch) rentPrice = parseFloat(rentMatch[1])
            }

            // 5. Customer, Address
            // Log: "关** 137******31 广东省广州市白云区万科金域悦府c****** 下单用户 关**(137******31)"
            // Name Phone Address
            
            // Match phone with masking support: 1\d{2}\*{6}\d{2} (11 chars total usually)
            // Log has 137******31 (3+6+2 = 11)
            const phoneRegex = /(?:^|[^\d])(1\d{2}\*{4,8}\d{2,4}|1\d{10})(?:$|[^\d])/g
            const phoneMatches = [...fullText.matchAll(phoneRegex)]
            
            let recipientPhone = ""
            let customerName = ""
            let address = ""
            
            if (phoneMatches.length > 0) {
                // Use the first phone found as it seems to be the recipient
                recipientPhone = phoneMatches[0][1]
                const phoneIndex = phoneMatches[0].index! + phoneMatches[0][0].indexOf(recipientPhone)
                
                // Name is before phone
                // Log: "关** 137..."
                const beforePhoneText = fullText.slice(0, phoneIndex).trimEnd()
                const tokens = beforePhoneText.split(/\s+/)
                
                // Iterate backwards to find name
                for (let i = tokens.length - 1; i >= 0; i--) {
                    const part = tokens[i]
                    if (!part) continue
                    
                    // Filter keywords
                    const invalidKeywords = ["已签收", "已传", "身份证", "租用中", "待发货", "状态", "时间"]
                    if (invalidKeywords.some(k => part.includes(k))) continue
                    
                    // Check pattern: 2-4 chars (including *)
                    if (/^[\u4e00-\u9fa5*]{2,5}$/.test(part)) {
                        customerName = part
                        break
                    }
                }
                
                // Address is after phone
                // Log: "137******31 广东省广州市..."
                const postPhone = fullText.substring(phoneIndex + recipientPhone.length).trim()
                // Take the immediate text after phone until "下单用户" or other keyword
                const addressEndIndex = postPhone.indexOf("下单用户")
                if (addressEndIndex !== -1) {
                    address = postPhone.substring(0, addressEndIndex).trim()
                } else {
                    // Just take first line or segment
                    address = postPhone.split(/\s{2,}|\n/)[0].trim()
                }
            }

            // Logistics
            let logisticsCompany = ""
            let trackingNumber = ""
            
            // Try matching tracking number directly if "运单号" prefix is separated or missing
            // Look for SF + digits
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
            
            if (!trackingNumber) {
                // Try finding "运单号" line and next line
                const trackingLineIndex = lines.findIndex(l => l.includes("运单号") || l.includes("快递单号") || l.includes("物流单号"))
                
                if (trackingLineIndex !== -1) {
                    const line = lines[trackingLineIndex]
                    
                    // Case 1: "运单号 SF123456" (on same line)
                    // Remove "运单号" and see if anything remains
                    const cleanLine = line.replace(/.*(?:运单号|快递单号|物流单号)[:：]?\s*/, "").trim()
                    
                    if (cleanLine.length > 5 && /^[A-Za-z0-9]+$/.test(cleanLine)) {
                        trackingNumber = cleanLine
                    } 
                    // Case 2: "运单号" (on one line), "SF123456" (on next line)
                    else if (lines[trackingLineIndex + 1]) {
                         const nextLine = lines[trackingLineIndex + 1].trim()
                         // Basic check: alphanumeric and reasonable length
                         if (/^[A-Za-z0-9]{8,}$/.test(nextLine)) {
                             trackingNumber = nextLine
                         }
                    }
                }
            }
            
            if (!trackingNumber && status !== "WAIT_PAY" && status !== "PENDING_SHIPMENT" && status !== "PENDING_REVIEW" && status !== "CLOSED") {
                 if (index < 3) appendLog(`[Debug] No tracking found. Raw snippet: ${fullText.substring(0, 200)}`)
            }

            // Dates
            // Log: "2026-02-25 00:00:00 2026-03-04 00:00:00"
            // Look for two dates close to each other
            let rentStartDate, returnDeadline, duration = 0
            
            const dateRegex = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/g
            const allDates = [...fullText.matchAll(dateRegex)].map(m => m[1])
            
            // Heuristic: Rental dates often end with 00:00:00
            const midnightDates = allDates.filter(d => d.includes("00:00:00"))
            
            if (midnightDates.length >= 2) {
                // Usually the last two midnight dates are the rental period
                rentStartDate = new Date(midnightDates[midnightDates.length - 2])
                returnDeadline = new Date(midnightDates[midnightDates.length - 1])
            } else if (allDates.length >= 2) {
                // Fallback: Take the last two dates found (assuming Order/Pay/Ship come before Rental period)
                rentStartDate = new Date(allDates[allDates.length - 2])
                returnDeadline = new Date(allDates[allDates.length - 1])
            }
            
            // Duration
            // Log: "7天"
            const durationMatch = fullText.match(/(\d+)天/)
            if (durationMatch) {
                duration = parseInt(durationMatch[1])
            }

            // "已归还" 状态后处理：根据租期截止日距今是否超过15天决定最终状态
            // 超过15天 → COMPLETED（历史终态），否则 → RETURNING（近期归还，仍在处理）
            if (status === "COMPLETED" && fullText.includes("已归还")) {
                const refDate = returnDeadline ?? rentStartDate
                if (refDate) {
                    const daysSince = (Date.now() - refDate.getTime()) / (1000 * 60 * 60 * 24)
                    if (daysSince <= 15) {
                        status = "RETURNING"
                    }
                }
                // If no date available, keep COMPLETED (safe default for old orders)
            }

            // Order creation time: "下单时间 2026-03-19 09:32:22"
            const youpinCreatedMatch = fullText.match(/下单时间\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/)
            const orderCreatedAt = youpinCreatedMatch ? new Date(youpinCreatedMatch[1]) : undefined

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
                platform: "\u4f18\u54c1\u79df", 
                productName,
                variantName,
                itemTitle: productName,
                itemSku: variantName,
                logisticsCompany,
                trackingNumber,
                promotionChannel,
                createdAt: orderCreatedAt
            })
            
        } catch (e) {
            appendLog(`Error parsing order row: ${e}`)
        }
    }
    
    return parsedOrders
}

const _collectedOrders: YoupinParsedOrder[] = []
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

async function saveOrdersBatch(orders: YoupinParsedOrder[]) {
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

export async function startYoupinSync(siteId: string) {
  try {
    const config = await loadConfig()
    appendLog(`Starting Youpin Sync for siteId: ${siteId}`)
    
    if (!config) {
        throw new Error("Online orders config not found")
    }

    const site = config.sites.find(s => 
        s.id === siteId || 
        s.id.toLowerCase() === siteId.toLowerCase() ||
        s.name.trim() === '优品租'
    )
    
    const targetSite = site ?? config.sites.find(s => s.name.includes('优品租') || s.id.includes('youpin'))
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
    const currentUrl = page.url()
    const alreadyOnOrderList = currentUrl.includes("qnvipmall.com/order/order-list")

    let clickOk = alreadyOnOrderList
    if (alreadyOnOrderList) {
        appendLog("Already on order list page, skipping menu navigation.")
    } else {
        clickOk = await openYoupinOrderListByClicks(page)
    }

    if (!clickOk) {
        appendLog("Menu click navigation failed, falling back to configured order_menu_link if available.")
        if (targetSite.selectors.order_menu_link) {
            const targetUrl = targetSite.selectors.order_menu_link
            try {
                const origin = getOriginFromUrl(targetUrl)
                await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000, referer: origin ? `${origin}/` : undefined })
                await waitRandom(page, 1200, 3000)
                await clickNav(page, "#main > div > div.single-page-con > div > div > div > div > ul > li:nth-child(1)")
            } catch (err) {
                appendLog(`Navigation failed: ${err}`)
            }
        } else {
            // Fallback: navigate directly to order list URL
            try {
                await page.goto("https://merchant.qnvipmall.com/order/order-list", { waitUntil: "domcontentloaded", timeout: 30000 })
                await waitRandom(page, 1200, 3000)
            } catch (err) {
                appendLog(`Direct navigation to order list failed: ${err}`)
            }
        }
    }
    
    await handlePopup(page)

    let currentPage = 1
    const siteAny = targetSite as unknown as { max_pages?: number | string }
    const configMaxPages = Number(targetSite.maxPages ?? siteAny.max_pages)
    const MAX_PAGES = !isNaN(configMaxPages) && configMaxPages > 0 ? configMaxPages : 50
    
    appendLog(`Max pages set to: ${MAX_PAGES}`)
    
    let hasMore = true
    const stopThreshold = targetSite.stopThreshold ?? config?.stopThreshold ?? 20
    let consecutiveFinalStateCount = 0
    const finalStatuses = ["COMPLETED", "CLOSED", "BOUGHT_OUT", "CANCELED"]
    appendLog(`Incremental stop threshold: ${stopThreshold}`)
    
    let pendingSaveOrders: YoupinParsedOrder[] = []
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
        const ok = await openYoupinOrderListByClicks(page)
        if (!ok) {
            if (targetSite.selectors.order_menu_link) {
                const origin = getOriginFromUrl(targetSite.selectors.order_menu_link)
                await page.goto(targetSite.selectors.order_menu_link, { waitUntil: "domcontentloaded", timeout: 30000, referer: origin ? `${origin}/` : undefined })
            } else {
                await page.goto("https://merchant.qnvipmall.com/order/order-list", { waitUntil: "domcontentloaded", timeout: 30000 })
            }
            await waitRandom(page, 1200, 3000)
        }
        await handlePopup(page)
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
        appendLog(`Processing page ${currentPage}...`)

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
        let pageOrders: YoupinParsedOrder[]
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
            appendLog(`Page ${currentPage}: Parsed ${pageOrders.length} orders. (Total Pending: ${pendingSaveOrders.length})`)
        } else {
            appendLog(`Warning: No orders parsed on page ${currentPage}.`)
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
            appendLog(`Batch size reached (${pendingSaveOrders.length}), saving to database...`)
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
                 appendLog(`Next page button not found with selector: "${targetSite.selectors.pagination_next_selector}". Stopping.`)
                 hasMore = false
             }
        } else {
            appendLog("No pagination_next_selector configured. Stopping after first page.")
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
    })
    appendLog("Sync completed successfully.")

  } catch (e) {
    const msg = String(e)
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
