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
export type ChenglinStatus = {
  status: "idle" | "running" | "awaiting_user" | "error" | "success"
  message?: string
  needsAttention?: boolean
  logs?: string[]
}

type ChenglinParsedOrder = {
  orderNo: string
  customerName: string
  recipientPhone: string
  address: string
  totalAmount: number
  rentPrice: number
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
  returnLogisticsCompany: string
  returnTrackingNumber: string
  specId?: string | null
}

type ChenglinRuntime = {
  status: ChenglinStatus
  context?: BrowserContext
  page?: Page
  headless?: boolean
  shouldStop?: boolean
}

const globalForChenglin = globalThis as unknown as { chenglinRuntime?: ChenglinRuntime }
// Use a singleton pattern that persists across hot reloads if possible, 
// but in Next.js dev mode, this might still be reset.
// However, the issue described "only saw Sync completed successfully" implies 
// that the 'status' object was replaced entirely, losing previous logs.

const runtime: ChenglinRuntime = globalForChenglin.chenglinRuntime ?? {
  status: { status: "idle", logs: [] },
  shouldStop: false
}
globalForChenglin.chenglinRuntime = runtime

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
      await loc.click({ timeout: 8000 })
      await waitRandom(page, 900, 2200)
      return true
    } catch {
      await page.waitForTimeout(800)
    }
  }
  return false
}

async function openChenglinOrderListByClicks(page: Page) {
  const menu = "#app > div > div.sidebar-container > div > div.scrollbar-wrapper.el-scrollbar__wrap > div > ul > div:nth-child(4) > li > div"
  const list = "#app > div > div.sidebar-container > div > div.scrollbar-wrapper.el-scrollbar__wrap > div > ul > div:nth-child(4) > li > ul > div:nth-child(1) > a > li"
  const ok1 = await clickNav(page, menu)
  if (!ok1) return false
  const ok2 = await clickNav(page, list)
  if (!ok2) return false
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => void 0)
  return true
}

function getLogFilePath() {
  const date = new Date().toISOString().split('T')[0]
  const logDir = path.join(_appBasePath(), "logs")
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  return path.join(logDir, `chenglin-${date}.log`)
}

export function getChenglinStatus() {
    return runtime.status
}

/** Inject a shared page/context from main process (shared browser mode) */
export function setSharedPage(page: import("playwright").Page, context: import("playwright").BrowserContext) {
  runtime.page = page
  runtime.context = context
  ;(runtime as Record<string, unknown>)._isShared = true
}

function updateStatus(updates: Partial<ChenglinStatus>) {
    const currentLogs = runtime.status.logs || []
    let newLogs = currentLogs
    
    // If updates include new logs (rarely used, usually via appendLog), merge them
    if (updates.logs && updates.logs !== currentLogs) {
        // If someone passes logs explicitly, we respect it, but we should be careful
        newLogs = updates.logs
    }

    runtime.status = {
        ...runtime.status,
        ...updates,
        logs: newLogs // Ensure logs persist unless explicitly replaced
    }
}

function appendLog(message: string) {
  try {
    const filePath = getLogFilePath()
    const timestamp = new Date().toLocaleTimeString()
    const fullMsg = `[${timestamp}] ${message}`
    
    // Ensure logs directory exists
    const logDir = path.dirname(filePath)
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
    }

    fs.appendFileSync(filePath, fullMsg + "\n")
    console.log(`[Chenglin] ${message}`)
    
    // Use updateStatus to handle runtime state update safely
    const currentLogs = runtime.status.logs || []
    updateStatus({
        logs: [...currentLogs, fullMsg].slice(-2000)
    })
    
    // Also push to scheduler UI log
    try {
        /* schedulerLogger removed */
    } catch(err) {
        console.error("Failed to push to scheduler log", err)
    }
  } catch (e) {
    console.error("Failed to write log", e)
    // Fallback
    const timestamp = new Date().toLocaleTimeString()
    const fullMsg = `[${timestamp}] ${message}`
    const currentLogs = runtime.status.logs || []
    updateStatus({
        logs: [...currentLogs, fullMsg].slice(-2000)
    })
  }
}

async function ensureContext(headless: boolean): Promise<BrowserContext> {
  // Check if context is valid and if headless mode matches
  if (runtime.context) {
      try {
          // Check if context is actually alive (pages() throws if closed)
          runtime.context.pages()
          // Shared mode: never close the injected context
          if ((runtime as Record<string, unknown>)._isShared) return runtime.context
          // Check if we need to switch headless mode
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
  
  const userDataDir = path.join(_appBasePath(), ".playwright", "chenglin")
  
  // In production (when not on Windows dev machine), prefer headless
  // But respect config if provided, unless we are on Linux without display
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
  // If page already exists and is open, just return it
  if (runtime.page && !runtime.page.isClosed()) {
      appendLog("Reusing existing page session.");
      return runtime.page;
  }
  
  const context = await ensureContext(headless)
  
  if (runtime.page) {
      if (!runtime.page.isClosed()) {
          // Double check if page is actually responsive
          try {
              // Add timeout to prevent hanging if browser is manually closed/frozen
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
      // Ensure context is still open before asking for pages
      // If context was closed externally, context.pages() might throw or return empty
      // But more likely context.newPage() will throw "Target page, context or browser has been closed"
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
      // Force restart context
      await runtime.context?.close().catch(() => {})
      runtime.context = undefined
      // Recursive call with fresh context
      return ensurePage(headless)
  }
}

async function isOnLoginPage(page: Page, site: SiteConfig) {
    const url = page.url()
    if (site.loginUrl && url && url.includes("login")) return true
    
    // Check for login inputs
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
  
  // Check if already logged in
  if (await isOnLoginPage(page, site) || page.url() === "about:blank") {
     appendLog(`Navigating to login: ${site.loginUrl}`)
     const origin = getOriginFromUrl(site.loginUrl)
     await page.goto(site.loginUrl, { waitUntil: "domcontentloaded", referer: origin ? `${origin}/` : undefined })
  }

  // Auto-fill if selectors exist
  const { username_input, password_input, login_button } = site.selectors
  if (username_input && site.username) {
     try {
        if (await page.isVisible(username_input, { timeout: 2000 })) {
            appendLog("Filling username...")
            await page.fill(username_input, site.username)
        }
     } catch {}
  }
  if (password_input && site.password) {
     try {
        if (await page.isVisible(password_input, { timeout: 2000 })) {
            appendLog("Filling password...")
            await page.fill(password_input, site.password)
        }
     } catch {}
  }
  if (login_button) {
     try {
        if (await page.isVisible(login_button, { timeout: 2000 })) {
            appendLog("Clicking login button...")
            await page.click(login_button)
            await waitRandom(page, 1200, 2600)
        }
     } catch {}
  }

  // Wait for login success (timeout 5 mins for manual intervention)
  appendLog("Waiting for login to complete (check url change or manual intervention)...")
  
  // NEW: Notify user for intervention if stuck on login page
  if (await isOnLoginPage(page, site)) {
      updateStatus({ status: "awaiting_user", message: "需要人工介入: 请在弹出的窗口完成登录", needsAttention: true })
      appendLog("需要人工介入: 检测到处于登录页")
      
      // Try to notify webhook if configured
      const config = await loadConfig()
      if (config?.webhookUrls && config.webhookUrls.length > 0) {
          sendWebhookSimple(config, "诚赁平台需要登录验证")
      }
  }

  const start = Date.now()
  while (Date.now() - start < 300_000) {
      if (!(await isOnLoginPage(page, site)) && page.url() !== "about:blank") {
          appendLog("Login appears successful.")
          updateStatus({ status: "running", message: "登录成功，继续执行...", needsAttention: false })
          return true
      }
      
      // Update status periodically to keep UI informed
      if (Date.now() - start > 10000 && runtime.status.status === "awaiting_user") {
           // Keep status as awaiting_user
           // Maybe update message?
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

async function switchToAllOrdersTab(page: Page, selector: string) {
    appendLog(`Trying to switch to 'All Orders' tab using: ${selector}`)
    try {
        await page.waitForSelector(selector, { timeout: 5000 })
        await page.click(selector)
        appendLog("Clicked 'All Orders' tab, waiting for content update...")
        await page.waitForTimeout(2000) // Wait for AJAX
    } catch (e) {
        appendLog(`Failed to switch tab: ${e}`)
    }
}

async function setChenglinPageSize(page: Page) {
    const perPageInputSelector =
      "#pane-全部订单 > div.flex-c.jc-s > div:nth-child(2) > div > span.el-pagination__sizes > div > div > input"
    for (let i = 0; i < 4; i += 1) {
        try {
            const input = page.locator(perPageInputSelector).first()
            await input.waitFor({ state: "visible", timeout: 8000 })
            await simulateHumanMouse(page, 1, 2)
            await waitRandom(page, 600, 1800)
            await input.click({ timeout: 8000, force: true })
            await waitRandom(page, 120, 260)
            await page.keyboard.press("ArrowDown").catch(() => void 0)
            await waitRandom(page, 200, 450)

            const clicked = await page
              .evaluate(() => {
                const dropdowns = Array.from(document.querySelectorAll<HTMLElement>("body .el-select-dropdown.el-popper"))
                const visible = dropdowns.filter(el => {
                  const style = window.getComputedStyle(el)
                  const rect = el.getBoundingClientRect()
                  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
                })
                const dropdown = visible[visible.length - 1]
                if (!dropdown) return false

                const items = Array.from(dropdown.querySelectorAll<HTMLElement>("li.el-select-dropdown__item"))
                const enabled = items.filter(el => !el.classList.contains("is-disabled") && !el.getAttribute("disabled"))
                if (enabled.length === 0) return false

                const pick100 = enabled.find(el => (el.innerText || "").trim().includes("100"))
                const target = pick100 || enabled[enabled.length - 1]
                target.click()
                return true
              })
              .catch(() => false)
            if (!clicked) throw new Error("Dropdown option click failed")
            appendLog("已设置每页数量，等待页面刷新...")
            await page.waitForTimeout(6000)
            return true
        } catch (e) {
            appendLog(`设置每页数量失败，重试中: ${e}`)
            await page.waitForTimeout(1000)
        }
    }
    return false
}

async function handlePopup(page: Page) {
    try {
        // Check for common popup texts
        // Using very specific selectors for "Work Order Reminder"
        // Also support "Remind me later" button
        const popupSelector = [
            "text=工单提醒",
            "div:has-text('工单反馈未处理')",
            ".ant-modal-title:has-text('工单提醒')", // Assuming AntD based on screenshot look
            "body > div.el-message-box__wrapper", // Element UI message box wrapper
            ".el-message-box__title:has-text('工单提醒')"
        ].join(",")

        // Use race to check if popup exists quickly (don't wait long)
        const popup = await page.$(popupSelector).catch(() => null)
        
        if (popup) {
            appendLog("Detected 'Work Order Reminder' or generic popup.")
            // Try to find the "Remind me later" button
            // "稍后提醒"
            let closeBtn = await page.$("button:has-text('稍后提醒')") || await page.$("text=稍后提醒")
            
            // Try generic Element UI close button (user provided selector)
            if (!closeBtn) {
                 closeBtn = await page.$("body > div.el-message-box__wrapper > div > div.el-message-box__btns > button:nth-child(1)")
            }
            
            if (closeBtn) {
                appendLog("Clicking close/later button to dismiss popup...")
                await closeBtn.click()
                await page.waitForTimeout(1000) // Wait for animation
            } else {
                appendLog("Could not find specific close button, trying generic close icon...")
                // Try finding a close icon (X)
                // usually .ant-modal-close or .close or .el-message-box__close
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

async function parseOrders(page: Page, site: SiteConfig): Promise<ChenglinParsedOrder[]> {
    const rowSelector = site.selectors.order_row_selectors
    const templateSelector = site.selectors.order_row_selector_template
    const parsedOrders: ChenglinParsedOrder[] = []
    
    if (!rowSelector && !templateSelector) {
        appendLog("No row selector configured, skipping parsing.")
        return []
    }

    let orderElements: (import("playwright").ElementHandle<SVGElement | HTMLElement>)[] = []

    if (templateSelector && templateSelector.includes("{i}")) {
        // Template mode
        const start = site.selectors.order_row_index_start ? Number(site.selectors.order_row_index_start) : 1
        const end = site.selectors.order_row_index_end ? Number(site.selectors.order_row_index_end) : 20 
        const step = site.selectors.order_row_index_step ? Number(site.selectors.order_row_index_step) : 1
        
        appendLog(`Using template selector: ${templateSelector} (start=${start}, step=${step}, end=${end})`)
        
        // Check first item to confirm page loaded
        const firstSelector = templateSelector.replace("{i}", String(start))
        try {
            await page.waitForSelector(firstSelector, { timeout: 10000 })
        } catch {
            appendLog(`Timeout waiting for first order row: ${firstSelector}`)
            const fallbackRows = await page.$$("#pane-全部订单 table tbody tr.el-table__row, #pane-全部订单 table tbody tr").catch(() => [])
            if (fallbackRows.length > 0) {
                appendLog(`Fallback: found ${fallbackRows.length} table rows in #pane-全部订单`)
                orderElements = fallbackRows
            } else {
                appendLog("Fallback: no rows found in #pane-全部订单")
            }
        }

        let consecutiveMisses = 0
        const MAX_CONSECUTIVE_MISSES = 10

        if (orderElements.length === 0) {
            for (let i = start; i <= end; i += step) {
                const currentSelector = templateSelector.replace("{i}", String(i))
                try {
                    const element = await page.$(currentSelector)
                    if (element) {
                        orderElements.push(element)
                        consecutiveMisses = 0
                    } else {
                        consecutiveMisses++
                        if (consecutiveMisses >= MAX_CONSECUTIVE_MISSES) {
                            appendLog(`Stopped scanning after ${MAX_CONSECUTIVE_MISSES} consecutive missing items at index ${i}.`)
                            break
                        }
                    }
                } catch {}
            }
        }
    } else {
        // Standard Selector Mode
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

    for (const element of orderElements) {
        try {
            const fullText = await element.innerText()
            
            // 1. Order No
            const orderNoText = await element
              .$eval(".sli-li span", el => (el as HTMLElement).innerText)
              .catch(() => "")
            const orderNoMatch = orderNoText.match(/订单编号[:：]?\s*([A-Za-z0-9]{8,})/)
            let orderNo = orderNoMatch ? orderNoMatch[1] : ""
            
            if (!orderNo) {
                const match = fullText.match(/订单编号[:：]?\s*([A-Za-z0-9]{8,})/)
                if (match) orderNo = match[1]
                else continue // Skip if no order number
            }

            // 2. Product Name & Variant
            const goodsNames = await element.$$eval(".goods_name", els => els.map(el => (el as HTMLElement).innerText))
            const productName = goodsNames[0] || ""
            const variantName = goodsNames[1] || ""

            // 3. Status - Strict Mapping based on User Whitelist
            // User requirement: "只匹配这些状态... '必过'那些都不是订单状态"
            // Priority: Match strictly against the provided list. 
            // If multiple keywords exist, we should prioritize explicit status over tags.
            // Since we iterate through a defined list, the order in the list determines priority if we break on first match.
            // But actually, we just need to find *any* valid status keyword.
            
            let status = "UNKNOWN"
            
            const statusRules = [
                { keywords: ["派单审核中", "审核中", "未授权"], label: "PENDING_REVIEW" },
                { keywords: ["待支付"], label: "WAIT_PAY" },
                { keywords: ["待发货", "待分配", "订单待分配", "待分配员工"], label: "PENDING_SHIPMENT" },
                { keywords: ["已发货"], label: "SHIPPED" },
                { keywords: ["待收货"], label: "PENDING_RECEIPT" },
                { keywords: ["租用中", "待归还", "续租订单", "即将归还"], label: "RENTING" },
                { keywords: ["归还中", "退租中", "设备归还中", "已验机正常"], label: "RETURNING" },
                { keywords: ["到期还款"], label: "DUE_REPAYMENT" },
                { keywords: ["已逾期", "归还逾期", "逾期"], label: "OVERDUE" },
                { keywords: ["买断订单", "已买断", "已购买"], label: "BOUGHT_OUT" },
                { keywords: ["已完成", "已完结"], label: "COMPLETED" },
                { keywords: ["取消订单", "已取消", "取消", "异常退货", "拒绝订单", "审核拒绝", "已关闭", "已拒绝"], label: "CLOSED" }
            ]

            for (const rule of statusRules) {
                if (rule.keywords.some(k => fullText.includes(k))) {
                    status = rule.label
                    break 
                }
            }
            
            // Debug Log for UNKNOWN
            if (status === "UNKNOWN") {
                 // Log full raw text for debugging, flattened to single line
                 const cleanText = fullText.replace(/\s+/g, ' ')
                 appendLog(`[Warning] OrderNo: ${orderNo} has UNKNOWN status. Raw: ${cleanText}`)
            }
            
            // 4. Money
            const rentMatch = fullText.match(/租金总共[:：]?\s*([\d.]+)/)
            const rentPrice = rentMatch ? parseFloat(rentMatch[1]) : 0
            
            const totalMatch = fullText.match(/优惠后[:：]?\s*([\d.]+)/)
            const totalAmount = totalMatch ? parseFloat(totalMatch[1]) : rentPrice
            
            // 5. Customer, Address & Tracking
            const recipientMatch = fullText.match(/收货[:：]?\s*([^\s\d]+)\s*(\d{3}\*{4}\d{4}|\d{11})/)
            const customerName = recipientMatch ? recipientMatch[1] : ""
            const recipientPhone = recipientMatch ? recipientMatch[2] : ""
            
            let address = ""
            if (recipientPhone) {
                const phoneIndex = fullText.indexOf(recipientPhone)
                if (phoneIndex !== -1) {
                    const afterPhone = fullText.slice(phoneIndex + recipientPhone.length).trim()
                    
                    // Regex for Province-City style addresses (e.g. 江西省-吉安市...)
                    const provinceCityMatch = afterPhone.match(/([\u4e00-\u9fa5]{2,5}(?:省|市|自治区)-[\u4e00-\u9fa5]{2,5}(?:市|区|县).*)/)
                    
                    if (provinceCityMatch) {
                        address = provinceCityMatch[1].split('\n')[0].trim()
                    } else {
                        // Fallback: take first non-empty line
                        const lines = afterPhone.split(/[\n\r]+/).map(l => l.trim()).filter(l => l)
                        if (lines.length > 0) {
                            address = lines[0]
                            if (address === "查看详情" || address.startsWith("物流")) address = ""
                        }
                    }
                }
            }

            // Logistics Extraction
            let logisticsCompany = ""
            let trackingNumber = ""
            let returnLogisticsCompany = ""
            let returnTrackingNumber = ""

            // 1. Try to find explicit "Logistics Company"
            const logisticsCompanyMatch = fullText.match(/(?:物流公司|快递公司)[:：]?\s*([^\s]+)/)
            if (logisticsCompanyMatch) {
                 logisticsCompany = logisticsCompanyMatch[1]
                 // Filter out noise if it captured "单号" or similar
                 if (logisticsCompany.includes("单号")) logisticsCompany = ""
            }
            
            // 2. Fallback or specific tags
            if (!logisticsCompany && fullText.includes("【顺丰快递】")) {
                logisticsCompany = "顺丰速运"
            }

            // 3. Tracking Number
            // Try specific "Tracking Number" label first
            const trackingMatch = fullText.match(/(?:快递单号|物流单号|运单号)[:：]?\s*([A-Za-z0-9]+)/)
            if (trackingMatch) {
                trackingNumber = trackingMatch[1]
            } 
            // Fallback for SF format if strictly matching SF prefix
            if (!trackingNumber && fullText.includes("SF")) {
                 const sfMatch = fullText.match(/SF\d{10,}/)
                 if (sfMatch) trackingNumber = sfMatch[0]
            }

            // 4. Return Logistics
            const returnCompanyMatch = fullText.match(/归还(?:物流|快递)[:：]?\s*([^\s]+)/)
            if (returnCompanyMatch) returnLogisticsCompany = returnCompanyMatch[1]

            const returnTrackingMatch = fullText.match(/归还(?:单号|运单号)[:：]?\s*([A-Za-z0-9]+)/)
            if (returnTrackingMatch) returnTrackingNumber = returnTrackingMatch[1]

            // 6. Dates & Duration
            const startMatch = fullText.match(/起租[:：]?\s*(\d{4}-\d{2}-\d{2})/)
            const rentStartDate = startMatch ? new Date(startMatch[1]) : undefined
            
            const endMatch = fullText.match(/归还[:：]?\s*(\d{4}-\d{2}-\d{2})/)
            const returnDeadline = endMatch ? new Date(endMatch[1]) : undefined
            
            let duration = 0
            if (rentStartDate && returnDeadline) {
                const diffTime = Math.abs(returnDeadline.getTime() - rentStartDate.getTime())
                duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) 
            }

            parsedOrders.push({
                orderNo,
                customerName,
                recipientPhone,
                address,
                totalAmount,
                rentPrice,
                status,
                rentStartDate,
                returnDeadline,
                duration,
                platform: "\u8bda\u8d41", 
                productName,
                variantName,
                itemTitle: productName,
                itemSku: variantName,
                logisticsCompany,
                trackingNumber,
                returnLogisticsCompany,
                returnTrackingNumber
            })
            
        } catch (e) {
            appendLog(`Error parsing order row: ${e}`)
        }
    }
    
    return parsedOrders
}

const _collectedOrders: ChenglinParsedOrder[] = []
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

async function saveOrdersBatch(orders: ChenglinParsedOrder[]) {
  _collectedOrders.push(...orders)
  appendLog(`[sync-tool] 已收集 ${orders.length} 条订单（累计 ${_collectedOrders.length} 条）`)
  return
  if (false) {
    let savedCount = 0
    // Prisma upsert doesn't support createMany with update in one go easily without loop
    // But we can use transaction
    // Or just loop, it's fast enough for 200 items usually
    
    // Using transaction for better performance
    try {
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
                create: { ...order, createdAt: new Date(), updatedAt: new Date() }
            })
        )
        
        await prisma.$transaction(operations)
        savedCount = orders.length
        appendLog(`Successfully saved batch of ${savedCount} orders.`)
        
        // Update runtime status message to reflect save
        runtime.status = {
            ...runtime.status,
            message: `已保存 ${savedCount} 个订单到数据库`
        }
    } catch (e) {
        appendLog(`Error saving batch: ${e}`)
        // Fallback to one-by-one to save at least some?
        for (const order of orders) {
            try {
                await prisma.onlineOrder.upsert({
                    where: { orderNo: order.orderNo },
                    update: { ...order, updatedAt: new Date() },
                    create: { ...order, createdAt: new Date(), updatedAt: new Date() }
                })
                savedCount++
            } catch {
                // ignore individual errors
            }
        }
        appendLog(`Recovered ${savedCount}/${orders.length} orders in fallback mode.`)
    }
  } // end disabled DB save
}

export async function startChenglinSync(siteId: string) {
  try {
    const config = await loadConfig()
    // Debug config loading
    appendLog(`Starting Chenglin Sync for siteId: ${siteId}`)
    
    if (!config) {
        throw new Error("Online orders config not found")
    }

    // Find site with case-insensitive check and trim
    const site = config.sites.find(s => 
        s.id === siteId || 
        s.id.toLowerCase() === siteId.toLowerCase() ||
        s.name.trim() === '诚赁'
    )
    
    const targetSite = site ?? config.sites.find(s => s.name.includes('诚赁') || s.id.includes('chenglin') || s.id.includes('chenlin'))
    if (!targetSite) {
        throw new Error(`Site ${siteId} not found in config (Available: ${config.sites.map(s => `${s.name}=${s.id}`).join(', ')})`)
    }

    // Reset status to running immediately
    // Preserve existing logs so history is not lost on restart
    const previousLogs = runtime.status.logs || []
    runtime.shouldStop = false;
    updateStatus({ status: "running", message: "Starting...", logs: previousLogs })
    appendLog(`Starting sync for ${targetSite.name} (ID: ${targetSite.id})`)

    // Use site specific headless setting if available, otherwise global default
    // Check if autoSync config has headless override? Usually it's global.
    const headless = config?.headless ?? false 
    appendLog(`Using headless mode: ${headless}`)
    
    let page = await ensurePage(headless)
    
    // Bring to front
    try {
        await page.bringToFront()
    } catch {
        // ignore
    }

    await login(page, targetSite)
    
    // Wait for any post-login redirects
    await page.waitForLoadState("domcontentloaded")
    await waitRandom(page, 1200, 3000)
    
    // Check for popup on Dashboard (immediately after login)
    await handlePopup(page)
    await simulateHumanMouse(page)

    appendLog("Opening order list via menu clicks...")
    const clickOk = await openChenglinOrderListByClicks(page)
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
    
    // Check for popup AGAIN after navigation (on Order List page)
    await handlePopup(page)

    // NEW: Handle All Orders Tab
    if (targetSite.selectors.all_orders_tab_selector) {
        // Double check popup again just in case it appeared late
        await handlePopup(page)
        await switchToAllOrdersTab(page, targetSite.selectors.all_orders_tab_selector)
        await setChenglinPageSize(page)
    }

    let currentPage = 1
    // Use site config max pages if set, otherwise default to 50
    // Check if max_pages is string or number in SiteConfig
    // Note: In frontend SiteConfig it's defined as maxPages (camelCase)
    // But in some places it might be max_pages (snake_case)
    // We should check both to be safe
    // Cast to any to access potentially loose typed properties
    const siteAny = targetSite as unknown as { max_pages?: number | string }
    const configMaxPages = Number(targetSite.maxPages ?? siteAny.max_pages)
    const MAX_PAGES = !isNaN(configMaxPages) && configMaxPages > 0 ? configMaxPages : 50
    
    appendLog(`Max pages set to: ${MAX_PAGES} (Configured: ${targetSite.maxPages} or ${siteAny.max_pages})`)
    
    let hasMore = true
    const stopThreshold = targetSite.stopThreshold ?? config?.stopThreshold ?? 20
    let consecutiveFinalStateCount = 0
    const finalStatuses = ["COMPLETED", "CLOSED", "BOUGHT_OUT", "CANCELED"]
    appendLog(`Incremental stop threshold: ${stopThreshold}`)
    
    // Batch save buffer
    let pendingSaveOrders: ChenglinParsedOrder[] = []
    const BATCH_SIZE = 200

    const PAGE_CRASH_ERRORS = ["Target page", "Session closed", "crashed", "Target closed", "Connection closed"]
    const isCrashError = (e: unknown) => PAGE_CRASH_ERRORS.some(s => String(e).includes(s))
    let pageRetryCount = 0
    const MAX_PAGE_RETRIES = 3

    // Helper: rebuild browser context and navigate back to order list
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
        const ok = await openChenglinOrderListByClicks(page)
        if (!ok && targetSite.selectors.order_menu_link) {
            const origin = getOriginFromUrl(targetSite.selectors.order_menu_link)
            await page.goto(targetSite.selectors.order_menu_link, { waitUntil: "domcontentloaded", timeout: 30000, referer: origin ? `${origin}/` : undefined })
            await waitRandom(page, 1200, 3000)
        }
        await handlePopup(page)
        if (targetSite.selectors.all_orders_tab_selector) {
            await switchToAllOrdersTab(page, targetSite.selectors.all_orders_tab_selector)
            await setChenglinPageSize(page)
        }
        // Re-navigate to the correct page by clicking next N-1 times
        if (currentPage > 1) {
            appendLog(`Re-navigating to page ${currentPage} after crash recovery...`)
            for (let p = 1; p < currentPage; p++) {
                if (targetSite.selectors.pagination_next_selector) {
                    const nb = await page.$(targetSite.selectors.pagination_next_selector)
                    if (nb) {
                        await nb.click({ force: true })
                        await waitRandom(page, 2000, 3500)
                    }
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

        // Guard: detect already-closed page before doing any work
        if (page.isClosed()) {
            throw new Error("Target page, context or browser has been closed")
        }

        // Wrap page processing in a per-page timeout so a hung page doesn't block forever
        const PAGE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes max per page
        let pageTimeoutHandle: ReturnType<typeof setTimeout> | undefined
        const pageTimeoutPromise = new Promise<never>((_, reject) => {
            pageTimeoutHandle = setTimeout(() => {
                reject(new Error("Target page, context or browser has been closed"))
            }, PAGE_TIMEOUT_MS)
        })
        const pageWorkPromise = (async () => {
            await simulateHumanMouse(page)
            await waitRandom(page, 800, 1600)
            return await parseOrders(page, targetSite)
        })()
        let pageOrders: ChenglinParsedOrder[]
        try {
            pageOrders = await Promise.race([pageWorkPromise, pageTimeoutPromise])
        } finally {
            clearTimeout(pageTimeoutHandle)
        }

        // Reset retry counter on successful parse
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
            // Log progress for every page so user sees activity
            appendLog(`Page ${currentPage}: Parsed ${pageOrders.length} orders. (Total Pending: ${pendingSaveOrders.length})`)
        } else {
            appendLog(`Warning: No orders parsed on page ${currentPage}.`)
        }

        // Check for popup again during pagination (in case it appears randomly)
        await handlePopup(page)
        await waitRandom(page, 1000, 3000)
        if (currentPage > 0 && currentPage % 5 === 0) {
            appendLog(`[System] 已抓取 ${currentPage} 页，随机暂停一段时间...`)
            await simulateHumanMouse(page, 2, 5)
            await waitRandom(page, 3000, 5000)
        }

        // Check if batch size reached
        if (pendingSaveOrders.length >= BATCH_SIZE) {
            appendLog(`Batch size reached (${pendingSaveOrders.length}), saving to database...`)
            await saveOrdersBatch(pendingSaveOrders)
            pendingSaveOrders = []
        }
        
        // Report progress
        // Use a more accurate count if possible, but currentPage * 20 is just an estimate.
        // However, user noticed discrepancy. Let's track total processed.
        // We can't easily know total saved without a counter outside saveOrdersBatch.
        // But we can just say "Page X"
        const progressMsg = `正在抓取第 ${currentPage} 页 (当前缓存 ${pendingSaveOrders.length} 个待保存)`;
        
        // Use appendLog to ensure it appears in the log list
        appendLog(progressMsg);
        
        // Also update the status message specifically
        updateStatus({
            message: progressMsg
        });

        if (currentPage >= MAX_PAGES) {
            appendLog(`Reached max pages limit (${MAX_PAGES}). Stopping.`)
            hasMore = false
            break
        }

        // Check for next page
        if (targetSite.selectors.pagination_next_selector) {
             // Wait for pagination to appear
             const nextBtn = await page.$(targetSite.selectors.pagination_next_selector)
             
             if (nextBtn) {
                 // Check if disabled? usually class includes 'disabled' or attribute 'disabled'
                 const classAttr = await nextBtn.getAttribute('class') || ""
                 const isDisabled = await nextBtn.getAttribute('disabled') !== null || classAttr.includes('disabled')
                 
                 if (!isDisabled) {
                     appendLog(`Navigating to next page (Page ${currentPage + 1})...`)
                     await nextBtn.scrollIntoViewIfNeeded().catch(() => void 0)
                     await waitRandom(page, 600, 1400)
                     // Timeout guard on click + post-click wait
                     const clickTimeout = new Promise<never>((_, reject) =>
                         setTimeout(() => reject(new Error("Target page, context or browser has been closed")), 60000)
                     )
                     await Promise.race([
                         (async () => {
                             await nextBtn.click({ force: true })
                             await waitRandom(page, 6000, 8000)
                         })(),
                         clickTimeout
                     ])
                     currentPage++
                 } else {
                     appendLog("Next page button is disabled. Reached end of list.")
                     hasMore = false
                 }
             } else {
                 // appendLog("Next page button not found.") 
                 // Maybe single page result
                 hasMore = false
             }
        } else {
            hasMore = false // No pagination configured, stop after first page
        }
        } catch (pageErr) {
            if (isCrashError(pageErr) && pageRetryCount < MAX_PAGE_RETRIES) {
                pageRetryCount++
                appendLog(`[Crash] Page crash detected on page ${currentPage} (retry ${pageRetryCount}/${MAX_PAGE_RETRIES}): ${pageErr}`)
                updateStatus({ message: `页面崩溃，正在重试第 ${currentPage} 页 (${pageRetryCount}/${MAX_PAGE_RETRIES})...` })
                await rebuildAndNavigate()
                appendLog(`Crash recovery complete, retrying page ${currentPage}...`)
                // Loop continues, retrying same currentPage
            } else {
                appendLog(`Fatal error on page ${currentPage} (retries exhausted or non-crash): ${pageErr}`)
                throw pageErr
            }
        }
    }
    
    // Save remaining orders
    if (pendingSaveOrders.length > 0) {
        appendLog(`Saving remaining ${pendingSaveOrders.length} orders...`)
        await saveOrdersBatch(pendingSaveOrders)
    }

    runtime.status = { 
        status: "success", 
        message: "Sync completed", 
        logs: runtime.status.logs 
    }
    appendLog("Sync completed successfully.")

  } catch (e) {
    const msg = String(e)
    runtime.status = { 
        status: "error", 
        message: msg,
        logs: runtime.status.logs
    }
    appendLog(`Error: ${msg}`)
  } finally {
      // Ensure status is reset if it was running, unless it's an error we want to keep visible?
      // Actually, 'success' or 'error' are terminal states, so that's fine.
      // But if we want to allow re-run, we might need to know it's done.
      // The current UI checks for 'running' to disable the button.
      // So 'success' or 'error' will re-enable the button.
  }
}

export function stopChenglinSync() {
    appendLog("Stop command received.")
    runtime.shouldStop = true
    updateStatus({ status: "idle", message: "已停止" })
    return runtime.status
}

export async function restartChenglinBrowser() {
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

export function getRunningPage(): Page | undefined {
  if (runtime.page && !runtime.page.isClosed()) {
      return runtime.page
  }
  return undefined
}
