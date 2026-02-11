import { loadConfig, startZanchenSync, getZanchenStatus, stopZanchenSync, type OnlineOrdersConfig } from "./zanchen"
import { initSchedulers as initOfflineSchedulers } from "../offline-sync/service"

export type LogEntry = {
  timestamp: string
  message: string
  orderNos?: string[]
}

export type SchedulerStatus = {
  isRunning: boolean
  lastRunAt?: string
  nextRunAt?: string // Deprecated/Global
  logs: LogEntry[]
  siteLastRun?: Record<string, string>
}

type SchedulerRuntime = {
  timer?: NodeJS.Timeout
  status: SchedulerStatus
  siteLastRun: Record<string, string>
}

const globalForScheduler = globalThis as unknown as { zanchenScheduler?: SchedulerRuntime }

const runtime: SchedulerRuntime = globalForScheduler.zanchenScheduler ?? {
  status: {
    isRunning: false,
    logs: []
  },
  siteLastRun: {}
}
globalForScheduler.zanchenScheduler = runtime

function addLog(message: string) {
  const time = new Date().toLocaleTimeString()
  runtime.status.logs.unshift({
    timestamp: time,
    message
  })
  if (runtime.status.logs.length > 100) runtime.status.logs.pop()
}

export function getSchedulerStatus() {
  return {
      ...runtime.status,
      siteLastRun: runtime.siteLastRun
  }
}

async function runScheduler() {
  if (runtime.status.isRunning) return
  
  const config = await loadConfig()
  if (!config) return

  runtime.status.isRunning = true
  
  try {
    const sites = config.sites || []
    if (sites.length === 0) return

    for (const site of sites) {
        // Determine if enabled and interval
        let enabled = false
        let interval = 3600 // seconds
      
        if (site.id === 'zanchen') {
            enabled = config.autoSyncEnabled ?? false
            interval = config.interval ?? 3600
        } else {
            enabled = site.autoSync?.enabled ?? false
            interval = site.autoSync?.interval ?? 3600
        }
      
        if (!enabled) continue

        // Check if due
        const lastRunStr = runtime.siteLastRun[site.id]
        const previousRunTime = lastRunStr ? new Date(lastRunStr).getTime() : 0
        const now = Date.now()
        
        // Update next run time for UI (Zanchen only for now)
        if (site.id === 'zanchen') {
             const nextRunMs = (previousRunTime > 0 ? previousRunTime + interval * 1000 : now + interval * 1000)
             runtime.status.nextRunAt = new Date(nextRunMs).toISOString()
        }
        
        // If never run, run immediately. Otherwise check interval.
        if (previousRunTime > 0 && (now - previousRunTime < interval * 1000)) continue

        // Update site last run at start for Fixed Rate scheduling
        runtime.siteLastRun[site.id] = new Date().toISOString()
        const currentExecutionTime = Date.now() // current time is the run time
        
        // Update next run time immediately
        if (site.id === 'zanchen') {
             const nextRunMs = currentExecutionTime + interval * 1000
             runtime.status.nextRunAt = new Date(nextRunMs).toISOString()
        }

        addLog(`开始同步站点: ${site.name}`)
        runtime.status.lastRunAt = new Date().toISOString() // Update global last run for UI
        
        await startZanchenSync(site.id)

        // Poll until finished
        while (true) {
            const status = getZanchenStatus()
            if (status.status !== "running" && status.status !== "idle" && status.status !== "awaiting_user") {
            // Success or Error
            if (status.status === "error") {
                addLog(`站点 ${site.name} 同步失败: ${status.message}`)
            } else {
                const count = status.lastResult?.parsedOrders?.length || 0
                addLog(`站点 ${site.name} 同步完成，获取订单: ${count} 单`)
            }
            break
            }
            // Also break if idle (which means it didn't start or finished abruptly)
            if (status.status === "idle" && !status.lastRunAt) {
                // Probably just started or waiting
            } else if (status.status === "idle") {
                // Finished
                break
            }

            // Wait 2s
            await new Promise(r => setTimeout(r, 2000))
        }
        
        // Small delay between sites
        await new Promise(r => setTimeout(r, 5000))
    }
  } catch (e) {
    addLog(`自动同步任务异常: ${e}`)
  } finally {
    runtime.status.isRunning = false
  }
}

export function startScheduler() {
  if (runtime.timer) clearInterval(runtime.timer)
  addLog("线上订单自动抓取调度器已启动")
  
  // Also start offline sync schedulers with a small delay to avoid log clutter
  setTimeout(async () => {
    try {
      await initOfflineSchedulers()
    } catch (e) {
      console.error("Failed to start offline schedulers:", e)
    }
  }, 5000)
  
  // Check every minute
  runtime.timer = setInterval(runScheduler, 60 * 1000)
  
  // Initial check
  runScheduler().catch(e => console.error("Initial scheduler run failed:", e))
}

export async function notifyManualRun(siteId: string) {
  // Update last run time to now, so the scheduler will skip the next immediate run
  // and wait for the full interval.
  runtime.siteLastRun[siteId] = new Date().toISOString()
  
  // Also update next run time for UI
  if (siteId === 'zanchen') {
     try {
         const config = await loadConfig()
         if (config) {
             const interval = config.interval ?? 3600
             const manualRunTime = runtime.siteLastRun[siteId] ? new Date(runtime.siteLastRun[siteId]).getTime() : Date.now()
             const nextRunMs = manualRunTime + interval * 1000
             runtime.status.nextRunAt = new Date(nextRunMs).toISOString()
         }
     } catch (e) {
         console.error("Failed to update next run time:", e)
     }
  }
}
