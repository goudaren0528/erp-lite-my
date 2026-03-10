import { loadConfig, startZanchenSync, getZanchenStatus } from "./zanchen"
import { startChenglinSync, getChenglinStatus } from "./chenglin"
import { startAolzuSync, getAolzuStatus } from "./aolzu"
import { startYoupinSync, getYoupinStatus } from "./youpin"
import { startLlxzuSync, getLlxzuStatus } from "./llxzu"
import { startRrzSync, getRrzStatus } from "./rrz"
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

// Global logger export for other modules
export const schedulerLogger = {
    log: addLog
}

export function getSchedulerStatus() {
  return {
      ...runtime.status,
      siteLastRun: runtime.siteLastRun
  }
}

async function runScheduler() {
  // if (runtime.status.isRunning) return // Removed to allow parallel runs
  
  const config = await loadConfig()
  if (!config) return

  // runtime.status.isRunning = true // No longer a single global flag
  
  try {
    const sites = config.sites || []
    if (sites.length === 0) return

    const now = Date.now()
    const nowDate = new Date()
    // Current HH:mm string in local time
    const nowHHmm = `${String(nowDate.getHours()).padStart(2, "0")}:${String(nowDate.getMinutes()).padStart(2, "0")}`

    // Run all site checks in parallel
    const promises = sites.map(async (site) => {
        // Determine if enabled
        let enabled = false
        let interval = 3600 // seconds, used as fallback if no scheduledTimes
        let scheduledTimes: string[] = []
      
        if (site.id === 'zanchen') {
            enabled = config.autoSyncEnabled ?? false
            interval = config.interval ?? 3600
            scheduledTimes = config.scheduledTimes ?? []
        } else {
            enabled = site.autoSync?.enabled ?? false
            interval = site.autoSync?.interval ?? 3600
            scheduledTimes = site.autoSync?.scheduledTimes ?? []
        }
      
        if (!enabled) {
            if (site.id !== 'zanchen') {
                 addLog(`[调度] 跳过 ${site.name}: 自动同步未启用`)
            }
            return
        }

        // Check if due
        const lastRunStr = runtime.siteLastRun[site.id]
        const previousRunTime = lastRunStr ? new Date(lastRunStr).getTime() : 0

        let isDue = false

        if (site.id === 'zanchen') {
            if (scheduledTimes.length === 0) return // No times configured — skip
            // Scheduled times logic for zanchen
            const matchesSchedule = scheduledTimes.some(t => t === nowHHmm)
            const recentlyRun = previousRunTime > 0 && (now - previousRunTime < 60 * 1000)
            isDue = matchesSchedule && !recentlyRun
            if (isDue) {
                runtime.status.nextRunAt = undefined // clear stale next run
            }
        } else if (scheduledTimes.length === 0) {
            // No scheduled times configured — never auto-run
            return
        } else {
            // Scheduled times logic: fire if current HH:mm matches any scheduled time
            // and we haven't already run within the last 60 seconds (to avoid double-fire)
            const matchesSchedule = scheduledTimes.some(t => t === nowHHmm)
            const recentlyRun = previousRunTime > 0 && (now - previousRunTime < 60 * 1000)
            isDue = matchesSchedule && !recentlyRun
        }

        if (!isDue) return

        // Update site last run at start
        runtime.siteLastRun[site.id] = new Date().toISOString()
        if (site.id === 'zanchen') {
             runtime.status.nextRunAt = new Date(Date.now() + interval * 1000).toISOString()
        }

        addLog(`开始同步站点: ${site.name}`)
        
        const siteIdLower = (site.id || "").toLowerCase()
        const siteNameLower = (site.name || "").toLowerCase()
        const isChenglin = siteIdLower === "chenglin" || siteIdLower === "chenlin" || site.name.includes("诚赁") || siteNameLower.includes("chenglin") || siteNameLower.includes("chenlin")
        const isAolzu = siteIdLower === "aolzu" || siteIdLower === "aozu" || siteIdLower.includes("aolzu") || siteIdLower.includes("aozu") || site.name.includes("奥租") || siteNameLower.includes("aolzu") || siteNameLower.includes("aozu")
        const isYoupin = siteIdLower === "youpin" || siteIdLower.includes("youpin") || site.name.includes("优品") || siteNameLower.includes("youpin")
        const isLlxzu = siteIdLower === "llxzu" || siteIdLower.includes("llxzu") || site.name.includes("零零享") || siteNameLower.includes("llxzu")
        const isRrz = siteIdLower === "rrz" || siteIdLower.includes("rrz") || site.name.includes("人人租") || siteNameLower.includes("rrz")

        type SyncStatus = { status: string; message?: string; lastResult?: { parsedOrders?: unknown[] } }
        const poll = async (getStatus: () => SyncStatus) => {
            while (true) {
                const status = getStatus()
                if (status.status !== "running" && status.status !== "idle" && status.status !== "awaiting_user") {
                    if (status.status === "error") {
                        addLog(`站点 ${site.name} 同步失败: ${status.message}`)
                    } else {
                        const count = status.lastResult?.parsedOrders?.length || 0
                        addLog(`站点 ${site.name} 同步完成，获取订单: ${count} 单`)
                    }
                    break
                }
                if (status.status === "idle") break
                await new Promise(r => setTimeout(r, 2000))
            }
        }

        if (isChenglin) {
            addLog(`检测到诚赁站点，准备启动 Chenglin Worker...`)
            try {
                await startChenglinSync(site.id)
                await poll(() => getChenglinStatus() as unknown as SyncStatus)
            } catch (e) {
                addLog(`站点 ${site.name} 同步失败: ${e}`)
                console.error(`[Scheduler] Chenglin sync failed:`, e)
            }
            return
        }

        if (isAolzu) {
            addLog(`检测到奥租站点，准备启动 Aolzu Worker...`)
            startAolzuSync(site.id).catch(e => {
                addLog(`站点 ${site.name} 同步失败: ${e}`)
                console.error(`[Scheduler] Aolzu sync failed:`, e)
            })
            await poll(() => getAolzuStatus() as unknown as SyncStatus)
            return
        }

        if (isYoupin) {
            addLog(`检测到优品租站点，准备启动 Youpin Worker...`)
            startYoupinSync(site.id).catch(e => {
                addLog(`站点 ${site.name} 同步失败: ${e}`)
                console.error(`[Scheduler] Youpin sync failed:`, e)
            })
            await poll(() => getYoupinStatus() as unknown as SyncStatus)
            return
        }

        if (isLlxzu) {
            addLog(`检测到零零享站点，准备启动 Llxzu Worker...`)
            startLlxzuSync(site.id).catch(e => {
                addLog(`站点 ${site.name} 同步失败: ${e}`)
                console.error(`[Scheduler] Llxzu sync failed:`, e)
            })
            await poll(() => getLlxzuStatus() as unknown as SyncStatus)
            return
        }

        if (isRrz) {
            addLog(`检测到人人租站点，准备启动 Rrz Worker...`)
            startRrzSync(site.id).catch(e => {
                addLog(`站点 ${site.name} 同步失败: ${e}`)
                console.error(`[Scheduler] Rrz sync failed:`, e)
            })
            await poll(() => getRrzStatus() as unknown as SyncStatus)
            return
        }

        await startZanchenSync(site.id)
        await poll(() => getZanchenStatus() as unknown as SyncStatus)
    })

    await Promise.all(promises)

  } catch (e) {
    addLog(`自动同步任务异常: ${e}`)
  } finally {
    // runtime.status.isRunning = false
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
  runtime.siteLastRun[siteId] = new Date().toISOString()
}
