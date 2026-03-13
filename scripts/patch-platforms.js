// Patches platform files in sync-tool to remove prisma/Next.js dependencies
const fs = require('fs')
const path = require('path')

function patch(filePath, patches) {
  let content = fs.readFileSync(filePath, 'utf8')
  for (const [from, to] of patches) {
    if (typeof from === 'string') {
      if (!content.includes(from)) {
        console.warn(`  [WARN] Pattern not found in ${path.basename(filePath)}: ${from.slice(0, 60)}`)
      }
      content = content.split(from).join(to)
    } else {
      // regex
      content = content.replace(from, to)
    }
  }
  fs.writeFileSync(filePath, content, 'utf8')
  console.log(`  Patched: ${path.basename(filePath)}`)
}

const dir = 'sync-tool/src/lib/platforms'

// ─── zanchen.ts ───────────────────────────────────────────────────────────────
patch(`${dir}/zanchen.ts`, [
  // Remove prisma import (already removed by earlier step, but ensure)
  [`import { prisma } from "@/lib/db"\n`, ''],
  [`import { autoMatchSpecId } from "@/lib/spec-auto-match"\n`, ''],
  [`import { normalizeText, parseVariantNames, matchProductByTitle, matchDeviceMapping } from "@/lib/product-matching"\n`, ''],
  // Add normalizeText stub after imports block (after playwright import line)
  [
    `import { chromium, type BrowserContext, type Frame, type Page, type ElementHandle } from "playwright"`,
    `import { chromium, type BrowserContext, type Frame, type Page, type ElementHandle } from "playwright"

// Stub: normalizeText (simplified version for sync-tool)
function normalizeText(s: string) { return s.replace(/\\s+/g, '').toLowerCase() }
// Stub: matchDeviceMapping / matchProductByTitle (not needed in sync-tool)
function matchDeviceMapping(_t: unknown, _s: unknown, _p: unknown) { return null }
function matchProductByTitle(_t: unknown, _s: unknown, _p: unknown) { return null }`
  ],
  // Replace loadConfig (prisma-based) with external config setter
  [
    `export async function loadConfig(): Promise<OnlineOrdersConfig | null> {
  const appConfigClient = (prisma as unknown as { appConfig?: typeof prisma.appConfig }).appConfig
  if (!appConfigClient) return null
  const record = await appConfigClient.findUnique({ where: { key: CONFIG_KEY } })
  if (!record?.value) return null
  try {
    const config = JSON.parse(record.value) as OnlineOrdersConfig
    
    // Sanitize URLs in config to prevent errors
    if (config.sites) {
        config.sites.forEach(site => {
            if (site.loginUrl) {
                 site.loginUrl = site.loginUrl.trim();
                 if (site.loginUrl.includes("http:// http")) site.loginUrl = site.loginUrl.replace("http:// http", "http://");
                 else if (site.loginUrl.match(/^http\\/\\//)) site.loginUrl = site.loginUrl.replace(/^http\\/\\//, "http://");
            }
        });
    }
    if (config.webhookUrls) {
        config.webhookUrls = config.webhookUrls.map(url => {
            let u = url.trim();
            if (u.includes("http:// http")) u = u.replace("http:// http", "http://");
            else if (u.match(/^http\\/\\//)) u = u.replace(/^http\\/\\//, "http://");
            return u;
        });
    }

    return config
  } catch {
    return null
  }
}`,
    `// In sync-tool, config is passed in externally (fetched from ERP API)
let _externalConfig: OnlineOrdersConfig | null = null
export function setExternalConfig(cfg: OnlineOrdersConfig) { _externalConfig = cfg }
export async function loadConfig(): Promise<OnlineOrdersConfig | null> { return _externalConfig }`
  ],
  // Replace saveOrdersToDB with collect-to-array
  [
    `async function saveOrdersToDB(orders: NonNullable<NonNullable<ZanchenStatus["lastResult"]>["parsedOrders"]>) {`,
    `// Collected orders buffer (replaces DB save in sync-tool)
const _collectedOrders: NonNullable<NonNullable<ZanchenStatus["lastResult"]>["parsedOrders"]> = []
export function getCollectedOrders() { return [..._collectedOrders] }
export function clearCollectedOrders() { _collectedOrders.length = 0 }

async function saveOrdersToDB(orders: NonNullable<NonNullable<ZanchenStatus["lastResult"]>["parsedOrders"]>) {
  _collectedOrders.push(...orders)
  addLog(\`[sync-tool] 已收集 \${orders.length} 条订单（累计 \${_collectedOrders.length} 条）\`)
  return
  // Original DB save below (disabled in sync-tool)
  if (false) {`
  ],
  // Close the disabled block before saveSnapshot
  [
    `async function saveSnapshot(lastResult: NonNullable<ZanchenStatus["lastResult"]>) {`,
    `  } // end disabled DB save
}

async function saveSnapshot(lastResult: NonNullable<ZanchenStatus["lastResult"]>) {`
  ],
  // Replace saveSnapshot (prisma) with no-op
  [
    `async function saveSnapshot(lastResult: NonNullable<ZanchenStatus["lastResult"]>) {
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
}`,
    `async function saveSnapshot(_lastResult: NonNullable<ZanchenStatus["lastResult"]>) {
  return false // no-op in sync-tool
}`
  ],
  // Replace existingFinalOrders prisma query with empty array (skip incremental stop in sync-tool)
  [
    `          const existingFinalOrders = await prisma.order.findMany({
            where: {
              orderNo: { in: orderNos },
              status: { in: finalStatuses }
            },
            select: { orderNo: true, status: true }
          })`,
    `          const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip incremental stop`
  ],
  // Replace existingOrder prisma query in extractParsedOrders
  [
    `        const existingOrder = await prisma.order.findUnique({`,
    `        const existingOrder = null // sync-tool: no DB\n        if (false) await (null as unknown as { findUnique: () => void }).findUnique({`
  ],
])

// ─── chenglin.ts ──────────────────────────────────────────────────────────────
patch(`${dir}/chenglin.ts`, [
  [`import { prisma } from "@/lib/db"\n`, ''],
  [`import { autoMatchSpecId } from "@/lib/spec-auto-match"\n`, ''],
  [`import { loadConfig, type SiteConfig, type OnlineOrdersConfig } from "./zanchen"`,
   `import { loadConfig, type SiteConfig, type OnlineOrdersConfig } from "./zanchen"`],
  [`import { schedulerLogger } from "./scheduler"\n`, ''],
  // Remove schedulerLogger usage
  [/schedulerLogger\.log\([^)]*\)/g, '/* schedulerLogger removed */'],
  // Replace saveOrdersBatch with collect
  [
    `async function saveOrdersBatch(orders: ChenglinParsedOrder[]) {`,
    `const _collectedOrders: ChenglinParsedOrder[] = []
export function getCollectedOrders() { return [..._collectedOrders] }
export function clearCollectedOrders() { _collectedOrders.length = 0 }

async function saveOrdersBatch(orders: ChenglinParsedOrder[]) {
  _collectedOrders.push(...orders)
  appendLog(\`[sync-tool] 已收集 \${orders.length} 条订单（累计 \${_collectedOrders.length} 条）\`)
  return
  if (false) {`
  ],
  // Find end of saveOrdersBatch and close the if(false) block
  // The function ends before startChenglinSync
  [
    `export async function startChenglinSync(siteId: string) {`,
    `  } // end disabled DB save
}

export async function startChenglinSync(siteId: string) {`
  ],
  // Replace existingFinalOrders prisma query
  [
    `                const existingFinalOrders = await prisma.onlineOrder.findMany({
                    where: {
                        orderNo: { in: orderNos },`,
    `                const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip
                if (false) await (null as unknown as { findMany: () => void }).findMany({
                    where: {
                        orderNo: { in: orderNos },`
  ],
])

// ─── aolzu.ts ─────────────────────────────────────────────────────────────────
patch(`${dir}/aolzu.ts`, [
  [`import { prisma } from "@/lib/db"\n`, ''],
  [`import { autoMatchSpecId } from "@/lib/spec-auto-match"\n`, ''],
  [`import { schedulerLogger } from "./scheduler"\n`, ''],
  [/schedulerLogger\.log\([^)]*\)/g, '/* schedulerLogger removed */'],
  [
    `async function saveOrdersBatch(orders: AolzuParsedOrder[]) {`,
    `const _collectedOrders: AolzuParsedOrder[] = []
export function getCollectedOrders() { return [..._collectedOrders] }
export function clearCollectedOrders() { _collectedOrders.length = 0 }

async function saveOrdersBatch(orders: AolzuParsedOrder[]) {
  _collectedOrders.push(...orders)
  appendLog(\`[sync-tool] 已收集 \${orders.length} 条订单（累计 \${_collectedOrders.length} 条）\`)
  return
  if (false) {`
  ],
  [
    `export async function startAolzuSync(siteId: string) {`,
    `  } // end disabled DB save
}

export async function startAolzuSync(siteId: string) {`
  ],
  [
    `                    const existingFinalOrders = await prisma.onlineOrder.findMany({
                        where: {
                            orderNo: { in: orderNos },`,
    `                    const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip
                    if (false) await (null as unknown as { findMany: () => void }).findMany({
                        where: {
                            orderNo: { in: orderNos },`
  ],
])

// ─── youpin.ts ────────────────────────────────────────────────────────────────
patch(`${dir}/youpin.ts`, [
  [`import { prisma } from "@/lib/db"\n`, ''],
  [`import { autoMatchSpecId } from "@/lib/spec-auto-match"\n`, ''],
  [`import { schedulerLogger } from "./scheduler"\n`, ''],
  [/schedulerLogger\.log\([^)]*\)/g, '/* schedulerLogger removed */'],
  [
    `async function saveOrdersBatch(orders: YoupinParsedOrder[]) {`,
    `const _collectedOrders: YoupinParsedOrder[] = []
export function getCollectedOrders() { return [..._collectedOrders] }
export function clearCollectedOrders() { _collectedOrders.length = 0 }

async function saveOrdersBatch(orders: YoupinParsedOrder[]) {
  _collectedOrders.push(...orders)
  appendLog(\`[sync-tool] 已收集 \${orders.length} 条订单（累计 \${_collectedOrders.length} 条）\`)
  return
  if (false) {`
  ],
  [
    `export async function startYoupinSync(siteId: string) {`,
    `  } // end disabled DB save
}

export async function startYoupinSync(siteId: string) {`
  ],
  [
    `                const existingFinalOrders = await prisma.onlineOrder.findMany({
                    where: {
                        orderNo: { in: orderNos },`,
    `                const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip
                if (false) await (null as unknown as { findMany: () => void }).findMany({
                    where: {
                        orderNo: { in: orderNos },`
  ],
])

// ─── llxzu.ts ─────────────────────────────────────────────────────────────────
patch(`${dir}/llxzu.ts`, [
  [`import { prisma } from "@/lib/db"\n`, ''],
  [`import { autoMatchSpecId } from "@/lib/spec-auto-match"\n`, ''],
  [`import { schedulerLogger } from "./scheduler"\n`, ''],
  [/schedulerLogger\.log\([^)]*\)/g, '/* schedulerLogger removed */'],
  [
    `async function saveOrdersBatch(orders: LlxzuParsedOrder[]) {`,
    `const _collectedOrders: LlxzuParsedOrder[] = []
export function getCollectedOrders() { return [..._collectedOrders] }
export function clearCollectedOrders() { _collectedOrders.length = 0 }

async function saveOrdersBatch(orders: LlxzuParsedOrder[]) {
  _collectedOrders.push(...orders)
  appendLog(\`[sync-tool] 已收集 \${orders.length} 条订单（累计 \${_collectedOrders.length} 条）\`)
  return
  if (false) {`
  ],
  [
    `export async function startLlxzuSync(siteId: string) {`,
    `  } // end disabled DB save
}

export async function startLlxzuSync(siteId: string) {`
  ],
  [
    `                const existingFinalOrders = await prisma.onlineOrder.findMany({
                    where: {
                        orderNo: { in: orderNos },`,
    `                const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip
                if (false) await (null as unknown as { findMany: () => void }).findMany({
                    where: {
                        orderNo: { in: orderNos },`
  ],
])

// ─── rrz.ts ───────────────────────────────────────────────────────────────────
patch(`${dir}/rrz.ts`, [
  [`import { prisma } from "@/lib/db"\n`, ''],
  [`import { autoMatchSpecId } from "@/lib/spec-auto-match"\n`, ''],
  [`import { schedulerLogger } from "./scheduler"\n`, ''],
  [/schedulerLogger\.log\([^)]*\)/g, '/* schedulerLogger removed */'],
  [
    `async function saveOrdersBatch(orders: RrzParsedOrder[]) {`,
    `const _collectedOrders: RrzParsedOrder[] = []
export function getCollectedOrders() { return [..._collectedOrders] }
export function clearCollectedOrders() { _collectedOrders.length = 0 }

async function saveOrdersBatch(orders: RrzParsedOrder[]) {
  _collectedOrders.push(...orders)
  appendLog(\`[sync-tool] 已收集 \${orders.length} 条订单（累计 \${_collectedOrders.length} 条）\`)
  return
  if (false) {`
  ],
  [
    `export async function startRrzSync(siteId: string) {`,
    `  } // end disabled DB save
}

export async function startRrzSync(siteId: string) {`
  ],
  [
    `                const existingFinalOrders = await prisma.onlineOrder.findMany({
                    where: {
                        orderNo: { in: orderNos },`,
    `                const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip
                if (false) await (null as unknown as { findMany: () => void }).findMany({
                    where: {
                        orderNo: { in: orderNos },`
  ],
])

console.log('All platform files patched.')
