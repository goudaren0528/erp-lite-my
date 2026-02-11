import { prisma } from "@/lib/db"
import fs from "fs"
import path from "path"

const CONFIG_KEY_PREFIX = "offline_order_sync_config_"

export type OfflineSyncConfig = {
  enabled: boolean
  intervalMinutes: number
}

export type LogEntry = {
  timestamp: string
  message: string
  orderNos?: string[]
}

export type OfflineSyncStatus = {
  isRunning: boolean
  lastRunAt?: string
  nextRunAt?: string
  successCount: number
  failureCount: number
  lastError?: string
  logs: LogEntry[]
  lastSyncedOrderNos?: string[]
}

type SyncRuntime = {
  timers: Map<string, NodeJS.Timeout>
  statuses: Map<string, OfflineSyncStatus>
}

const globalForSync = globalThis as unknown as { offlineSyncRuntime?: SyncRuntime }

function resolveLogDir() {
  const cwd = process.cwd()
  if (path.basename(cwd).toLowerCase() === "web") return path.join(cwd, "logs")
  const webDir = path.join(cwd, "web")
  if (fs.existsSync(webDir)) return path.join(webDir, "logs")
  return path.join(cwd, "logs")
}

const LOG_DIR = resolveLogDir()

function getLogFilePath(siteId: string, dateStr?: string) {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true })
    }
    const date = dateStr || new Date().toISOString().split("T")[0]
    return path.join(LOG_DIR, `offline-sync-${siteId}-${date}.log`)
}

function appendLogToFile(siteId: string, entry: LogEntry) {
    try {
        const filePath = getLogFilePath(siteId)
        // Ensure directory exists again just in case
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true })
        }
        fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf-8")
    } catch (e) {
        console.error("Failed to write offline sync log to file:", e)
    }
}

export function getLogsFromFile(siteId: string, date?: string): LogEntry[] {
    const filePath = getLogFilePath(siteId, date)
    if (!fs.existsSync(filePath)) return []

    try {
        const content = fs.readFileSync(filePath, "utf-8")
        return content
            .split("\n")
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line) as LogEntry
                } catch {
                    return null
                }
            })
            .filter((item): item is LogEntry => item !== null)
    } catch (e) {
        console.error("Failed to read offline sync logs:", e)
        return []
    }
}

const runtime: SyncRuntime = globalForSync.offlineSyncRuntime ?? {
  timers: new Map(),
  statuses: new Map()
}

if (!runtime.timers || !(runtime.timers instanceof Map)) {
  runtime.timers = new Map()
}
if (!runtime.statuses || !(runtime.statuses instanceof Map)) {
  runtime.statuses = new Map()
}

globalForSync.offlineSyncRuntime = runtime

function getStatus(siteId: string): OfflineSyncStatus {
  if (!runtime.statuses.has(siteId)) {
    runtime.statuses.set(siteId, {
      isRunning: false,
      successCount: 0,
      failureCount: 0,
      logs: []
    })
  }
  return runtime.statuses.get(siteId)!
}

function addLog(siteId: string, msg: string, orderNos?: string[]) {
  const status = getStatus(siteId)
  const time = new Date().toLocaleTimeString()
  const entry = {
    timestamp: time,
    message: msg,
    orderNos
  }
  status.logs.push(entry)
  if (status.logs.length > 2000) status.logs.shift()
  
  appendLogToFile(siteId, entry)
}

export async function getSyncConfig(siteId: string): Promise<OfflineSyncConfig> {
  // Migration: If siteId is 'zanchen', check for legacy key first if new key doesn't exist
  // actually, we can just use the new key format. 
  // But to preserve data, we should migrate or just use the new key.
  // User said "except Zanchen other platforms default to disabled".
  // So for Zanchen we want to preserve the existing config if possible.
  
  const key = `${CONFIG_KEY_PREFIX}${siteId}`
  let config = await prisma.appConfig.findUnique({ where: { key } })
  
  if (!config && siteId === "zanchen") {
    // Try legacy key
    const legacyConfig = await prisma.appConfig.findUnique({ where: { key: "offline_order_sync_config" } })
    if (legacyConfig) {
      // Migrate it? Or just read it. Let's just read it for now to be safe.
      // But saveSyncConfig will write to the new key, effectively migrating on next save.
      // Or we can just use the legacy key for zanchen forever? 
      // Better to standardize.
      // Let's return legacy content but don't persist it to new key yet.
      try {
        return JSON.parse(legacyConfig.value)
      } catch {
        return { enabled: false, intervalMinutes: 60 }
      }
    }
  }

  if (!config) {
    return { enabled: false, intervalMinutes: 60 }
  }
  try {
    return JSON.parse(config.value)
  } catch {
    return { enabled: false, intervalMinutes: 60 }
  }
}

export async function saveSyncConfig(siteId: string, config: OfflineSyncConfig) {
  const key = `${CONFIG_KEY_PREFIX}${siteId}`
  await prisma.appConfig.upsert({
    where: { key },
    update: { value: JSON.stringify(config) },
    create: { key, value: JSON.stringify(config) }
  })
  // Restart scheduler for this site
  startScheduler(siteId)
}

export function getSyncStatus(siteId: string) {
  return getStatus(siteId)
}

async function runSync(siteId: string) {
  const status = getStatus(siteId)
  if (status.isRunning) return
  status.isRunning = true
  addLog(siteId, "开始执行线下订单同步...")

  try {
    // 1. Fetch system orders (Source)
    // Filter for orders from this platform.
    // We assume siteId maps to platform name/code.
    // Zanchen -> "ZANCHEN" (uppercase usually in DB based on previous code)
    // For others, we might need a mapping or just use siteId.toUpperCase()
    // Or we need to look up the site config to get the platform identifier?
    // In `online-orders` module, `site.id` is used.
    // The `OnlineOrder` table has a `platform` column.
    // Let's assume siteId (e.g. "zanchen", "meituan") maps to platform "ZANCHEN", "MEITUAN"?
    // Or just "zanchen"?
    // Previous code used `platform: "ZANCHEN"`.
    // Let's use siteId.toUpperCase() as a heuristic, or pass it in.
    
    const platformKeyword = siteId === 'zanchen' ? 'ZANCHEN' : siteId; 
    // Ideally we should match what is stored in OnlineOrder.platform.
    // If the crawler stores "zanchen", then we use "zanchen".
    // The crawler inferPlatform usually returns user-friendly names or "ZANCHEN"?
    // Checking zanchen.ts: inferPlatform returns "ZANCHEN" (line 1148 in read tool output previously? No, logic was `const platform = inferPlatform(...)`).
    // In zanchen.ts `inferPlatform` likely returns "ZANCHEN" or similar.
    // Wait, let's look at `prisma.onlineOrder.findMany` in previous `runSync`. It used `platform: "ZANCHEN"`.
    // So uppercase seems correct for Zanchen.
    // For others, we might need to be flexible.
    // But since we only have Zanchen crawler now, others are hypothetical or manual?
    // If user adds a new platform, the crawler for it will populate `platform` field.
    // Let's use a loose match or exact match if we know it.
    // For now, let's use siteId (which is usually lowercase ID) and maybe check if we need mapping.
    // Given the user instructions, I will default to `siteId.toUpperCase()` but maybe we should allow partial match?
    // Actually, `OnlineOrder` records are created by the crawler.
    // The crawler for a site should set the platform correctly.
    // If I am running sync for siteId="zanchen", I want orders with platform="ZANCHEN".
    
    // NOTE: If we want to support other platforms, we need to know what they put in `platform` column.
    // Since we don't have other crawlers yet, this is future-proofing.
    
    // We can fetch ALL online orders and filter in memory? No, inefficient.
    // Let's try `contains` or just uppercase.
    
    const systemOrders = await prisma.onlineOrder.findMany({
      where: {
        platform: { contains: platformKeyword } // Safer flexible matching
      },
      select: {
        orderNo: true,
        status: true,
        logisticsCompany: true,
        trackingNumber: true,
        latestLogisticsInfo: true,
        returnLogisticsCompany: true,
        returnTrackingNumber: true,
        returnLatestLogisticsInfo: true,
        rentStartDate: true,
        returnDeadline: true
      }
    })

    if (systemOrders.length === 0) {
      addLog(siteId, "未发现线上订单，跳过同步")
      status.isRunning = false
      return
    }

    // 2. Fetch offline orders that have miniProgramOrderNo (Target)
    const offlineOrders = await prisma.order.findMany({
      where: {
        creatorId: { not: "system" },
        miniProgramOrderNo: { not: null } 
      },
      select: {
        id: true,
        miniProgramOrderNo: true,
        status: true,
        logisticsCompany: true,
        trackingNumber: true,
        latestLogisticsInfo: true,
        returnLogisticsCompany: true,
        returnTrackingNumber: true,
        returnLatestLogisticsInfo: true,
        rentStartDate: true,
        returnDeadline: true
      }
    })

    let updatedCount = 0
    const syncedNos: string[] = []
    
    const systemOrderMap = new Map(systemOrders.map(o => [o.orderNo, o]))

    for (const offlineOrder of offlineOrders) {
      if (!offlineOrder.miniProgramOrderNo) continue
      
      const onlineOrder = systemOrderMap.get(offlineOrder.miniProgramOrderNo)
      if (!onlineOrder) continue

      const updates: any = {}
      let needsUpdate = false

      if (onlineOrder.status && onlineOrder.status !== offlineOrder.status) {
        updates.status = onlineOrder.status
        needsUpdate = true
      }

      if (onlineOrder.logisticsCompany && onlineOrder.logisticsCompany !== offlineOrder.logisticsCompany) {
        updates.logisticsCompany = onlineOrder.logisticsCompany
        needsUpdate = true
      }
      if (onlineOrder.trackingNumber && onlineOrder.trackingNumber !== offlineOrder.trackingNumber) {
        updates.trackingNumber = onlineOrder.trackingNumber
        needsUpdate = true
      }
      if (onlineOrder.latestLogisticsInfo && onlineOrder.latestLogisticsInfo !== offlineOrder.latestLogisticsInfo) {
        updates.latestLogisticsInfo = onlineOrder.latestLogisticsInfo
        needsUpdate = true
      }

      if (onlineOrder.returnLogisticsCompany && onlineOrder.returnLogisticsCompany !== offlineOrder.returnLogisticsCompany) {
        updates.returnLogisticsCompany = onlineOrder.returnLogisticsCompany
        needsUpdate = true
      }
      if (onlineOrder.returnTrackingNumber && onlineOrder.returnTrackingNumber !== offlineOrder.returnTrackingNumber) {
        updates.returnTrackingNumber = onlineOrder.returnTrackingNumber
        needsUpdate = true
      }
      if (onlineOrder.returnLatestLogisticsInfo && onlineOrder.returnLatestLogisticsInfo !== offlineOrder.returnLatestLogisticsInfo) {
        updates.returnLatestLogisticsInfo = onlineOrder.returnLatestLogisticsInfo
        needsUpdate = true
      }
      
      if (needsUpdate) {
        await prisma.order.update({
          where: { id: offlineOrder.id },
          data: updates
        })
        updatedCount++
        if (offlineOrder.miniProgramOrderNo) {
          syncedNos.push(offlineOrder.miniProgramOrderNo)
        }
      }
    }

    addLog(siteId, `同步完成: 更新了 ${updatedCount} 个线下订单`, syncedNos.length > 0 ? syncedNos : undefined)
    status.successCount++
    status.lastRunAt = new Date().toISOString()
    status.lastSyncedOrderNos = syncedNos
    status.lastError = undefined

  } catch (error) {
    console.error(`Offline sync failed for ${siteId}:`, error)
    addLog(siteId, `同步失败: ${String(error)}`)
    status.failureCount++
    status.lastError = String(error)
  } finally {
    status.isRunning = false
  }
}

export async function startScheduler(siteId: string) {
  // Clear existing timer for this site
  if (runtime.timers.has(siteId)) {
    clearInterval(runtime.timers.get(siteId)!)
    runtime.timers.delete(siteId)
  }

  const config = await getSyncConfig(siteId)
  const status = getStatus(siteId)
  
  if (!config.enabled) {
    addLog(siteId, "自动同步已关闭")
    status.nextRunAt = undefined
    return
  }

  const intervalMinutes = Math.max(5, config.intervalMinutes)
  const intervalMs = intervalMinutes * 60 * 1000

  addLog(siteId, `自动同步已开启，间隔 ${intervalMinutes} 分钟`)
  
  status.nextRunAt = new Date(Date.now() + intervalMs).toISOString()
  
  const timer = setInterval(() => {
    void runSync(siteId)
    status.nextRunAt = new Date(Date.now() + intervalMs).toISOString()
  }, intervalMs)
  
  runtime.timers.set(siteId, timer)
}

// Helper to start all known schedulers?
// We can't easily know all sites here without importing from zanchen.ts or DB.
// But we can lazily start when config is accessed or explicitly called.
// For "zanchen" specifically, we can auto-start it.
// Or we export a `initSchedulers` function.

export async function ensureScheduler(siteId: string) {
  if (runtime.timers.has(siteId)) return
  await startScheduler(siteId)
}

export async function initSchedulers() {
  // Initialize zanchen by default as it's the main one
  await startScheduler("zanchen")

  // Try to load other sites from config
  try {
    const onlineConfig = await prisma.appConfig.findUnique({ 
      where: { key: "online_orders_sync_config" } 
    })
    
    if (onlineConfig && onlineConfig.value) {
      const parsed = JSON.parse(onlineConfig.value)
      if (parsed.sites && Array.isArray(parsed.sites)) {
        for (const site of parsed.sites) {
          if (site.id && site.id !== "zanchen") {
             // Avoid double start if possible, but startScheduler handles it (clears existing timer)
             await startScheduler(site.id)
          }
        }
      }
    }
  } catch (e) {
    console.error("Failed to init other schedulers:", e)
  }
}


// Initialize on import (if needed, but usually better called explicitly)
// We can't await top level easily in all envs.
// We'll rely on the API/UI to trigger startScheduler initially or use an instrumentation hook.

export async function triggerManualSync(siteId: string) {
  // Run sync immediately
  await runSync(siteId)
  
  // Reset scheduler so next run respects the interval from NOW
  await startScheduler(siteId)
  
  return getStatus(siteId)
}
// For now, we'll let the first config read trigger it.
