import path from "path"
import fs from "fs"
import { chromium, type BrowserContext, type Page } from "playwright"
import { loadConfig, type SiteConfig, type OnlineOrdersConfig } from "./zanchen"
import { schedulerLogger } from "./scheduler"
import { prisma } from "@/lib/db"

// Re-use types or define specific ones
export type AolzuStatus = {
  status: "idle" | "running" | "awaiting_user" | "error" | "success"
  message?: string
  needsAttention?: boolean
  logs?: string[]
  lastRunAt?: string
}

type AolzuParsedOrder = {
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
}

type AolzuRuntime = {
  status: AolzuStatus
  context?: BrowserContext
  page?: Page
  headless?: boolean
  shouldStop?: boolean
}

const globalForAolzu = globalThis as unknown as { aolzuRuntime?: AolzuRuntime }

const runtime: AolzuRuntime = globalForAolzu.aolzuRuntime ?? {
  status: { status: "idle", logs: [] },
  shouldStop: false
}
globalForAolzu.aolzuRuntime = runtime

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

async function openAolzuOrderListByClicks(page: Page) {
  const orderMenu =
    "#main > div > div.sidebar-menu-con.menu-bar > div.ivu-shrinkable-menu > ul.ivu-menu.ivu-menu-dark.ivu-menu-vertical > li:nth-child(2)"
  const goodsOrderMenu =
    "#main > div > div.sidebar-menu-con.menu-bar > div.ivu-shrinkable-menu > ul.ivu-menu.ivu-menu-light.ivu-menu-vertical > li > ul > li:nth-child(1)"
  const allOrdersTab = "#main > div > div.single-page-con > div > div > div > div > ul > li:nth-child(1)"

  const ok1 = await clickNav(page, orderMenu)
  if (!ok1) return false
  const ok2 = await clickNav(page, goodsOrderMenu)
  if (!ok2) return false
  const ok3 = await clickNav(page, allOrdersTab)
  if (!ok3) return false
  // Wait for page to fully load including pagination controls
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => void 0)
  await waitRandom(page, 1500, 2500)
  return true
}

async function setAolzuPageSizeTo50(page: Page) {
  // Generic selectors that work regardless of page structure
  const sizerSelectors = [
    ".ivu-page-options-sizer .ivu-select-selection",
    ".ivu-page-options-sizer",
  ]

  const isPageSize50 = async () => {
    try {
      const text = await page.locator(".ivu-page-options-sizer .ivu-select-selection").textContent({ timeout: 2000 }).catch(() => "")
      return (text || "").includes("50")
    } catch { return false }
  }

  for (let i = 0; i < 5; i += 1) {
    try {
      await page.waitForLoadState("domcontentloaded").catch(() => void 0)
      await waitRandom(page, 800, 1200)

      // Already set to 50?
      if (await isPageSize50()) {
        appendLog("每页已是 50 条，跳过设置")
        return true
      }

      // Find the sizer
      let sizerEl = null
      for (const sel of sizerSelectors) {
        sizerEl = await page.waitForSelector(sel, { timeout: 3000 }).catch(() => null)
        if (sizerEl) break
      }

      if (!sizerEl) throw new Error("Page size sizer not found")

      // Scroll sizer into view and click it
      await sizerEl.scrollIntoViewIfNeeded().catch(() => void 0)
      await waitRandom(page, 300, 600)
      await sizerEl.click({ force: true })
      await waitRandom(page, 600, 1000)

      // Click the 50/page option from the dropdown
      let clicked = false
      const optionSelectors = [
        "body .ivu-select-dropdown .ivu-select-item:has-text('50 条/页')",
        "body .ivu-select-dropdown .ivu-select-item:has-text('50条/页')",
        "body .ivu-select-dropdown .ivu-select-item:has-text('50')",
        "body .ivu-select-dropdown-list li:nth-child(3)",
      ]

      for (const sel of optionSelectors) {
        const opt = await page.waitForSelector(sel, { state: "visible", timeout: 2000 }).catch(() => null)
        if (opt) {
          await opt.click({ force: true })
          clicked = true
          break
        }
      }

      if (!clicked) throw new Error("Page size option '50' not found or not clickable")

      appendLog("已点击 50 条/页，等待页面刷新...")
      await page.waitForTimeout(1500)

      if (await isPageSize50()) {
        appendLog("已确认每页 50 条生效")
        return true
      }

      appendLog("未检测到 50 条/页生效，继续重试...")
    } catch (e) {
      appendLog(`设置每页条数失败，重试中: ${e}`)
      await page.waitForTimeout(1500)
    }
  }
  return false
}

function getLogFilePath() {
  const date = new Date().toISOString().split('T')[0]
  const logDir = path.join(process.cwd(), "logs")
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  return path.join(logDir, `aolzu-${date}.log`)
}

export function getAolzuStatus() {
    return runtime.status
}

export function getRunningPage() {
    return runtime.page
}

function updateStatus(updates: Partial<AolzuStatus>) {
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
    console.log(`[Aolzu] ${message}`)
    
    const currentLogs = runtime.status.logs || []
    updateStatus({
        logs: [...currentLogs, fullMsg].slice(-2000)
    })
    
    try {
        if (schedulerLogger && schedulerLogger.log) {
            schedulerLogger.log(`[奥租] ${message}`)
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
  if (runtime.context) {
      try {
          runtime.context.pages(); 
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
  
  const userDataDir = path.join(process.cwd(), ".playwright", "aolzu")
  
  let finalHeadless = headless
  if (process.platform === 'linux' && !process.env.DISPLAY) {
      appendLog(`[System] Linux environment without DISPLAY detected, forcing headless mode.`)
      finalHeadless = true
  }

  appendLog(`Launching browser (headless: ${finalHeadless})`)
  
  try {
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
  
  if (await isOnLoginPage(page, site) || page.url() === "about:blank") {
     appendLog(`Navigating to login: ${site.loginUrl}`)
     const origin = getOriginFromUrl(site.loginUrl)
     await page.goto(site.loginUrl, { waitUntil: "domcontentloaded", referer: origin ? `${origin}/` : undefined })
  }

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

  appendLog("Waiting for login to complete (check url change or manual intervention)...")
  
  if (await isOnLoginPage(page, site)) {
      updateStatus({ status: "awaiting_user", message: "需要人工介入: 请在弹出的窗口完成登录", needsAttention: true })
      appendLog("需要人工介入: 检测到处于登录页")
      
      const config = await loadConfig()
      if (config?.webhookUrls && config.webhookUrls.length > 0) {
          sendWebhookSimple(config, "奥租平台需要登录验证")
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

async function handlePopup(page: Page) {
    try {
        // Generic popup handling, might need adjustment for Aolzu
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

async function parseOrders(page: Page, site: SiteConfig): Promise<AolzuParsedOrder[]> {
    const rowSelector = site.selectors.order_row_selectors
    const templateSelector = site.selectors.order_row_selector_template
    const parsedOrders: AolzuParsedOrder[] = []
    
    if (!rowSelector && !templateSelector) {
        appendLog("No row selector configured, skipping parsing.")
        return []
    }

    let orderElements: (import("playwright").ElementHandle<SVGElement | HTMLElement>)[] = []

    try {
        if (page.isClosed()) {
            appendLog("Page is closed, cannot parse orders.")
            return []
        }
        
        if (templateSelector && templateSelector.includes("{i}")) {
        const start = site.selectors.order_row_index_start ? Number(site.selectors.order_row_index_start) : 1
        const end = site.selectors.order_row_index_end ? Number(site.selectors.order_row_index_end) : 20 
        const step = site.selectors.order_row_index_step ? Number(site.selectors.order_row_index_step) : 1
        
        appendLog(`Using template selector: ${templateSelector} (start=${start}, step=${step}, end=${end})`)
        
        const firstSelector = templateSelector.replace("{i}", String(start))
        try {
            // Use a short timeout to check for first element presence but don't crash if missing
            // This is to allow for cases where page might be empty or loading slowly
            await page.waitForSelector(firstSelector, { timeout: 10000 })
        } catch {
            appendLog(`Timeout waiting for first order row: ${firstSelector}. Page might be empty or selector changed.`)
        }

        let consecutiveMisses = 0
        const MAX_CONSECUTIVE_MISSES = 3

        for (let i = start; i <= end; i += step) {
            const currentSelector = templateSelector.replace("{i}", String(i))
            try {
                // Use page.$ which is safer than waitForSelector for optional elements
                // and wrap in try-catch to handle potential target closed errors
                const element = await page.$(currentSelector).catch(e => {
                    appendLog(`Error querying selector ${currentSelector}: ${e}`)
                    return null
                })
                
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
            } catch (e) {
                appendLog(`Unexpected error scanning row ${i}: ${e}`)
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
            
            // NOTE: This parsing logic is based on Chenglin and needs to be adapted for Aolzu
            // once we have sample data or page structure.
            // Assuming similar structure for now or relying on generic extraction.
            
            // 1. Order No
            let orderNo = ""
            // Based on logs: "订单号：O202602252026526819999080448"
            const orderNoMatch = fullText.match(/(?:订单号|订单编号)[:：]?\s*([A-Za-z0-9]{15,})/)
            if (orderNoMatch) {
                orderNo = orderNoMatch[1]
            }
            
            if (!orderNo) {
                // Fallback: Try finding "O" followed by many digits
                // Log shows: O202602252026526819999080448 (length ~27)
                const fallbackMatch = fullText.match(/O\d{20,}/)
                if (fallbackMatch) orderNo = fallbackMatch[0]
            }

            if (orderNo) {
                // Clean up order number if it accidentally captured extra text
                orderNo = orderNo.split(/\s+/)[0]
            }
            
            if (!orderNo) {
                // If still no order number, log warning and skip
                if (index < 5) appendLog(`[Warning] No order number found for item ${index + 1}`)
                continue 
            }

            // 2. Product Name & Variant
            // Raw text structure:
            // "...商品编号：1997918053520920578 【出游租】三星 Galaxy S23 Ultra套餐：租完可归还/买断 三星 S23 Ultra 8GB+256GB95新 修改价格..."
            // productName = text between 商品编号：\d+ and 套餐：
            // variantName = text after 套餐： until price/quantity marker

            let productName = ""
            let variantName = ""

            // Extract productName: after 商品编号：<digits><space> up to 套餐：
            const titleMatch = fullText.match(/商品编号[：:]\s*\d+\s+([\s\S]+?)套餐[：:]/)
            if (titleMatch) {
                // Strip known noise fields that appear between 商品编号 and the actual product name
                let raw = titleMatch[1]
                    .replace(/发货时间[：:]\s*[\d\-: ]+/g, "")
                    .replace(/快递单号[：:]\s*\S+/g, "")
                    .replace(/【[^】]*(速运|快递|物流)[^】]*】/g, "")
                    .replace(/\s+/g, " ")
                    .trim()
                productName = raw
            }

            // Fallback: if no 商品编号, try to find product name before 套餐：
            // Some orders have: "发货时间：... 快递单号：... 【顺丰速运】 商品名 套餐：..."
            // Strip known prefixes and take the last segment before 套餐：
            if (!productName) {
                const beforeSku = fullText.match(/([\s\S]+?)套餐[：:]/)
                if (beforeSku) {
                    // Remove known noise: 发货时间, 快递单号, 物流公司 brackets, 商品编号
                    let cleaned = beforeSku[1]
                        .replace(/发货时间[：:][^\n]+/g, "")
                        .replace(/快递单号[：:][^\n]+/g, "")
                        .replace(/【[^】]*速运[^】]*】/g, "")
                        .replace(/【[^】]*快递[^】]*】/g, "")
                        .replace(/商品编号[：:]\s*\d+/g, "")
                        .replace(/店铺名称[：:][^\n]+/g, "")
                        .replace(/下单时间[：:][^\n]+/g, "")
                        .replace(/订单号[：:][^\n]+/g, "")
                        .replace(/支付宝[^\n]+/g, "")
                        .trim()
                    // Take the last non-empty segment
                    const segments = cleaned.split(/\s+/).filter(s => s.length > 0)
                    if (segments.length > 0) {
                        // Find the last meaningful chunk (product names often start with 【 or are multi-char)
                        // Join trailing segments that look like a product name
                        let nameStart = segments.length - 1
                        for (let j = segments.length - 1; j >= 0; j--) {
                            if (segments[j].startsWith("【") || /[\u4e00-\u9fa5A-Za-z]/.test(segments[j])) {
                                nameStart = j
                                if (segments[j].startsWith("【")) break
                            } else {
                                break
                            }
                        }
                        productName = segments.slice(nameStart).join(" ").trim()
                    }
                }
            }

            // Extract variantName: after 套餐： up to first price (￥) or quantity (数量) or 修改
            const skuMatch = fullText.match(/套餐[：:]([\s\S]+?)(?:修改价格|数量\s*x|￥[\d.]+|$)/)
            if (skuMatch) {
                variantName = skuMatch[1].trim()
            }

            // Log raw text for orders where parsing may be uncertain
            if (!productName || !variantName) {
                const cleanText = fullText.replace(/\s+/g, ' ').substring(0, 600)
                appendLog(`[Debug] OrderNo: ${orderNo} parse issue - productName="${productName}" variantName="${variantName}" Raw: ${cleanText}`)
            }

            // 3. Status
            // Mapping based on actual Aolzu platform status text (left) -> internal status (right)
            // 待付款 -> WAIT_PAY
            // 待审核 -> PENDING_REVIEW
            // 待发货 -> PENDING_SHIPMENT
            // 待收货 -> PENDING_RECEIPT
            // 租用中 / 租用中(即将逾期) / 待归还 -> RENTING
            // 归还中 / 已归还 -> RETURNING
            // 买断订单 -> BOUGHT_OUT
            // 交易完成 -> COMPLETED
            // 订单关闭 / 申请取消 / 售后订单 -> CLOSED
            // 已逾期 -> OVERDUE
            const statusRules: Array<{ keywords: string[]; value: string }> = [
                { keywords: ["交易完成"],                          value: "COMPLETED" },
                { keywords: ["买断订单"],                          value: "BOUGHT_OUT" },
                { keywords: ["已逾期"],                            value: "OVERDUE" },
                { keywords: ["订单关闭", "申请取消", "售后订单"],  value: "CLOSED" },
                { keywords: ["已归还", "归还中"],                  value: "RETURNING" },
                { keywords: ["租用中", "待归还"],                  value: "RENTING" },
                { keywords: ["待收货"],                            value: "PENDING_RECEIPT" },
                { keywords: ["待发货"],                            value: "PENDING_SHIPMENT" },
                { keywords: ["待审核"],                            value: "PENDING_REVIEW" },
                { keywords: ["待付款"],                            value: "WAIT_PAY" },
            ]

            let status = "UNKNOWN"
            for (const rule of statusRules) {
                if (rule.keywords.some(k => fullText.includes(k))) {
                    status = rule.value
                    break
                }
            }

            if (status === "UNKNOWN") {
                // silently skip logging for unknown status
            }
            
            // 4. Money
            // Log: "已交租：￥57.0/￥57.0"
            // Log: "买断价：3800"
            // Log: "商品押金 ￥3800.0"
            
            const rentMatch = fullText.match(/已交租[:：]?\s*￥?([\d.]+)/)
            const rentPrice = rentMatch ? parseFloat(rentMatch[1]) : 0
            
            const depositMatch = fullText.match(/商品押金\s*￥?([\d.]+)/)
            const deposit = depositMatch ? parseFloat(depositMatch[1]) : 0
            
            // Total amount? Maybe same as rent for now, or sum
            const totalAmount = rentPrice
            
            // 5. Customer, Address
            // Log: "黄*歆 180****4588 广西壮族自治区,西乡塘区,南宁市 广西壮族自治区-南宁市-西乡塘区-心圩街道..."
            // Pattern: Name Phone Province,City,District Address
            
            // Match phone with stars: 1\d{2}\*{4}\d{4} or 1\d{10}
            // Use more robust phone match that doesn't capture leading digits
            const phoneRegex = /(?:^|[^\d])(1\d{2}\*{4}\d{4}|1\d{10})(?:$|[^\d])/g
            const phoneMatches = [...fullText.matchAll(phoneRegex)]
            
            let recipientPhone = ""
            let customerName = ""
            let address = ""
            
            let bestMatchIndex = -1
            let bestMatchPhone = ""
            
            // Prioritize phone number that is followed by address-like structure
            for (const match of phoneMatches) {
                const phone = match[1]
                const matchStart = match.index! + match[0].indexOf(phone)
                const postPhone = fullText.substring(matchStart + phone.length).trim()
                
                // Check if next 50 chars contain address keywords
                const addressLookahead = postPhone.substring(0, 50)
                if (/省|市|区|自治区|街道/.test(addressLookahead)) {
                    bestMatchPhone = phone
                    bestMatchIndex = matchStart
                    break
                }
            }
            
            // If no address match, prefer masked phone (usually recipient) over unmasked (usually binding phone)
            if (!bestMatchPhone && phoneMatches.length > 0) {
                 const maskedMatch = phoneMatches.find(m => m[1].includes("*"))
                 if (maskedMatch) {
                     bestMatchPhone = maskedMatch[1]
                     bestMatchIndex = maskedMatch.index! + maskedMatch[0].indexOf(bestMatchPhone)
                 } else {
                     // Fallback to first phone found
                     bestMatchPhone = phoneMatches[0][1]
                     bestMatchIndex = phoneMatches[0].index! + phoneMatches[0][0].indexOf(bestMatchPhone)
                 }
            }
            
            if (bestMatchPhone) {
                recipientPhone = bestMatchPhone
                const phoneIndex = bestMatchIndex
                
                const beforePhoneText = fullText.slice(0, phoneIndex).trimEnd()
                const tokens = beforePhoneText.split(/\s+/)
                const invalidNameKeywords = [
                    "下单", "标签", "小程序", "快捷", "租物", "发货", "取消", "编辑", "展开", "详细", "复制",
                    "归还", "商品", "押金", "授权", "代扣", "买断", "交租", "完成", "首月", "预授", "租金",
                    "去发货", "已发货", "待发货", "取消订单"
                ]
                
                for (let i = tokens.length - 1; i >= 0; i--) {
                    let candidate = tokens[i]
                    if (candidate && (candidate.includes(":") || candidate.includes("："))) {
                        candidate = candidate.split(/[:：]/).pop() || ""
                    }
                    if (!candidate) continue
                    if (invalidNameKeywords.some(k => candidate.includes(k))) continue
                    if (/^[\u4e00-\u9fa5]{1,4}(?:[*][\u4e00-\u9fa5]{0,2})?$/.test(candidate)) {
                        customerName = candidate
                        break
                    }
                }
                
                if (!customerName && index < 3) {
                    const snippet = fullText.slice(Math.max(0, phoneIndex - 80), phoneIndex).replace(/\s+/g, " ")
                    appendLog(`[Debug] Name missing. Phone=${recipientPhone}. BeforePhone="${snippet}"`)
                }
                
                // Address is after phone
                const postPhone = fullText.substring(phoneIndex + recipientPhone.length).trim()
                
                // Address logic
                // Log: "广西壮族自治区,西乡塘区,南宁市 广西壮族自治区-南宁市-..."
                // Try to capture lines after phone
                const addressLines = postPhone.split('\n').filter(l => l.trim().length > 5)
                
                if (addressLines.length > 0) {
                    const potentialAddress = addressLines[0].trim()
                    
                    // Validation: Address should not be a product ID or system label
                    const invalidPrefixes = ["商品编号", "套餐", "下单时间", "￥", "订单号", "状态", "Rent", "Buyout", "成功下单", "累计下单"]
                    const isInvalid = invalidPrefixes.some(p => potentialAddress.startsWith(p) || potentialAddress.includes("：" + p))
                    
                    if (!isInvalid) {
                        address = potentialAddress
                        // If address line 1 looks like just region "Province,City...", take next line too?
                        if (addressLines.length > 1 && (addressLines[0].includes(",") || addressLines[0].length < 20)) {
                             const nextLine = addressLines[1].trim()
                             if (!invalidPrefixes.some(p => nextLine.startsWith(p))) {
                                address += " " + nextLine
                             }
                        }
                    } else {
                        // If first line is invalid, maybe address is on the same line as phone but after spaces?
                        // Or maybe we missed it.
                        // Try to find address pattern (Province/City) in postPhone
                        // Heuristic: Look for "省" "市" "区"
                        const regionMatch = postPhone.match(/[\u4e00-\u9fa5]{2,}(?:省|市|自治区)[\s\S]{5,30}/)
                        if (regionMatch) {
                            // Extract until newline or invalid keyword
                            let extracted = regionMatch[0].split('\n')[0]
                            // Cut off at known invalid keywords if they appear in the middle
                            for (const p of invalidPrefixes) {
                                if (extracted.includes(p)) {
                                    extracted = extracted.split(p)[0].trim()
                                }
                            }
                            
                            if (!invalidPrefixes.some(p => extracted.startsWith(p))) {
                                address = extracted
                            }
                        }
                    }
                }
                
                // Clean up address if it contains stats like "成功下单：0次"
                if (address) {
                    address = address.split("成功下单")[0].trim()
                }
            }

            // Logistics
            // Log: "快递单号： SF5102220317927"
            // Log: "【顺丰速运】"
            let logisticsCompany = ""
            let trackingNumber = ""
            
            const trackingMatch = fullText.match(/(?:快递单号|物流单号)[:：]?\s*([A-Za-z0-9]+)/)
            if (trackingMatch) trackingNumber = trackingMatch[1]
            
            if (fullText.includes("顺丰") || trackingNumber.startsWith("SF")) {
                logisticsCompany = "顺丰速运"
            } else if (fullText.includes("京东")) {
                logisticsCompany = "京东快递"
            } else if (fullText.includes("圆通")) {
                logisticsCompany = "圆通速递"
            }

            // Dates
            // Log: "2026-02-28 2026-03-06 (共7天)"
            // Log: "预计发货： 2026-02-26"
            // Log: "下单时间：2026-02-25 17:12:38"
            
            // Try to find the range pattern first
            const dateRangeMatch = fullText.match(/(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s*\(共(\d+)天\)/)
            let rentStartDate, returnDeadline, duration = 0
            
            if (dateRangeMatch) {
                rentStartDate = new Date(dateRangeMatch[1])
                returnDeadline = new Date(dateRangeMatch[2])
                const d = parseInt(dateRangeMatch[3])
                duration = isNaN(d) ? 0 : d
            } else {
                // Fallback: Find pairs of dates
                const allDates = [...fullText.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map(m => m[1])
                if (allDates.length >= 2) {
                    // Assume the last two are start/end if they are adjacent or in a block
                    // Or just take the last two unique dates
                    const uniqueDates = Array.from(new Set(allDates))
                    if (uniqueDates.length >= 2) {
                        // Sort them just in case
                        uniqueDates.sort()
                        // Take the last two? Usually rental dates are in the future compared to order date
                        // But if order is old, they are all in past.
                        // Heuristic: Order date is usually first. Rental dates are later.
                        // Let's take the last two.
                        rentStartDate = new Date(uniqueDates[uniqueDates.length - 2])
                        returnDeadline = new Date(uniqueDates[uniqueDates.length - 1])
                    }
                }
            }
            
            // Fallback duration
            if (!duration) {
                const durationMatch = fullText.match(/\(共(\d+)天\)/)
                if (durationMatch) {
                    const d = parseInt(durationMatch[1])
                    duration = isNaN(d) ? 0 : d
                }
            }
            
            parsedOrders.push({
                orderNo,
                customerName,
                recipientPhone,
                address,
                totalAmount: isNaN(totalAmount) ? 0 : totalAmount,
                rentPrice: isNaN(rentPrice) ? 0 : rentPrice,
                deposit: isNaN(deposit) ? 0 : deposit,
                status,
                rentStartDate,
                returnDeadline,
                duration: isNaN(duration) ? 0 : duration,
                platform: "奥租", 
                productName,
                variantName,
                itemTitle: productName,
                itemSku: variantName,
                logisticsCompany,
                trackingNumber
            })
            
        } catch (e) {
            appendLog(`Error parsing order row: ${e}`)
        }
    }

    } catch (e) {
        appendLog(`Critical error in parseOrders: ${e}`)
        return []
    }
    
    return parsedOrders
}

async function saveOrdersBatch(orders: AolzuParsedOrder[]) {
    let savedCount = 0
    try {
        appendLog(`[Database] Preparing to save ${orders.length} orders. Sample: ${JSON.stringify(orders[0] || {}, null, 2)}`)
        
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
                    create: { ...order, createdAt: new Date(), updatedAt: new Date() }
                })
                savedCount++
            } catch (innerErr) {
                appendLog(`Failed to save order ${order.orderNo}: ${innerErr}`)
            }
        }
        appendLog(`Recovered ${savedCount}/${orders.length} orders in fallback mode.`)
    }
}

export async function startAolzuSync(siteId: string) {
  try {
    const config = await loadConfig()
    appendLog(`Starting Aolzu Sync for siteId: ${siteId}`)
    
    if (!config) {
        throw new Error("Online orders config not found")
    }

    const site = config.sites.find(s => 
        s.id === siteId || 
        s.id.toLowerCase() === siteId.toLowerCase() ||
        s.name.trim() === '奥租'
    )
    
    const targetSite = site ?? config.sites.find(s => s.name.includes('奥租') || s.id.includes('aolzu'))
    if (!targetSite) {
        throw new Error(`Site ${siteId} not found in config`)
    }

    runtime.shouldStop = false;
    updateStatus({ status: "running", message: "Starting...", logs: [], lastRunAt: new Date().toISOString() })
    appendLog(`Starting sync for ${targetSite.name} (ID: ${targetSite.id})`)

    const headless = config?.headless ?? false 
    appendLog(`Using headless mode: ${headless}`)
    
    const page = await ensurePage(headless)
    
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

    appendLog("Opening order list via menu clicks...")
    const clickOk = await openAolzuOrderListByClicks(page)
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
                // Page may have crashed — reset context so next retry starts fresh
                if (String(err).includes("crashed") || String(err).includes("Target page") || String(err).includes("Session closed")) {
                    appendLog("Page crash detected, resetting browser context...")
                    try { await runtime.context?.close() } catch {}
                    runtime.context = undefined
                    runtime.page = undefined
                    throw new Error(`Page crashed during navigation: ${err}`)
                }
            }
        }
    }
    
    await handlePopup(page)
    const pageSizeOk = await setAolzuPageSizeTo50(page)
    if (!pageSizeOk) {
        appendLog("设置每页 50 条失败，继续尝试抓取（页面可能已是正确状态）...")
    }

    let currentPage = 1
    const siteAny = targetSite as unknown as { max_pages?: number | string }
    const configMaxPages = Number(targetSite.maxPages ?? siteAny.max_pages)
    const MAX_PAGES = !isNaN(configMaxPages) && configMaxPages > 0 ? configMaxPages : 50
    
    appendLog(`Max pages set to: ${MAX_PAGES}`)
    
    let hasMore = true
    const stopThreshold = config?.stopThreshold ?? 20
    let consecutiveFinalStateCount = 0
    const finalStatuses = ["COMPLETED", "CLOSED", "BOUGHT_OUT", "CANCELED"]
    appendLog(`Incremental stop threshold: ${stopThreshold}`)
    
    let pendingSaveOrders: AolzuParsedOrder[] = []
    const BATCH_SIZE = 200

    while (hasMore && currentPage <= MAX_PAGES) {
        if (runtime.shouldStop) {
            appendLog("User stopped the sync process.");
            hasMore = false;
            break;
        }

        appendLog(`Processing page ${currentPage}...`)
        await simulateHumanMouse(page)
        await simulateHumanScroll(page, 1, 3)
        await waitRandom(page, 800, 1600)
        const pageOrders = await parseOrders(page, targetSite)

        if (stopThreshold > 0 && pageOrders.length > 0) {
            const orderNos = pageOrders.map(o => o.orderNo).filter(Boolean)
            try {
                const existingFinalOrders = await prisma.onlineOrder.findMany({
                    where: {
                        orderNo: { in: orderNos },
                        platform: "奥租",
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
                     await nextBtn.click({ force: true })
                     await waitRandom(page, 3000, 5000) 
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
    }
    
    if (pendingSaveOrders.length > 0) {
        appendLog(`Saving remaining ${pendingSaveOrders.length} orders...`)
        await saveOrdersBatch(pendingSaveOrders)
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
        message: msg,
    })
    appendLog(`Error: ${msg}`)
  }
}

export function stopAolzuSync() {
    appendLog("Stop command received.")
    runtime.shouldStop = true;
    updateStatus({ status: "idle", message: "已停止" })

    // Close browser so next run starts with a clean session
    if (runtime.context) {
        runtime.context.close().catch(() => {})
        runtime.context = undefined
        runtime.page = undefined
        appendLog("Browser session closed.")
    }

    return runtime.status
}

export function getRunningAolzuPage(): Page | undefined {
  if (runtime.page && !runtime.page.isClosed()) {
      return runtime.page
  }
  return undefined
}
