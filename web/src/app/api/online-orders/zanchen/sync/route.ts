import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { validateBearerToken } from "@/lib/api-token"
import { loadConfig, startZanchenSync } from "@/lib/online-orders/zanchen"
import { startChenglinSync } from "@/lib/online-orders/chenglin"
import { startAolzuSync } from "@/lib/online-orders/aolzu"
import { startYoupinSync } from "@/lib/online-orders/youpin"
import { startLlxzuSync } from "@/lib/online-orders/llxzu"
import { startRrzSync } from "@/lib/online-orders/rrz"
import { notifyManualRun } from "@/lib/online-orders/scheduler"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader) {
    const valid = await validateBearerToken(authHeader)
    if (!valid) return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 })
  } else {
    const currentUser = await getCurrentUser()
    const isAdmin = currentUser?.role === "ADMIN"
    const canManage = isAdmin || currentUser?.permissions?.includes("online_orders")
    if (!canManage) {
      return NextResponse.json({ status: "error", message: "无权限操作" }, { status: 403 })
    }
  }

  const body = await req.json().catch(() => ({}))
  const siteId = typeof body?.siteId === "string" ? body.siteId : "zanchen"
  
  // Resolve site to check name if ID is generic
  const config = await loadConfig()
  const site = config?.sites.find(s => s.id === siteId)
  const isChenglin = 
      siteId === "chenglin" || 
      siteId === "chenlin" || 
      siteId.toLowerCase().includes("chenglin") ||
      siteId.toLowerCase().includes("chenlin") ||
      (site && (site.name.includes("诚赁") || site.name.toLowerCase().includes("chenglin") || site.name.toLowerCase().includes("chenlin")))

  const isAolzu = 
      siteId === "aolzu" || 
      siteId === "aozu" || 
      siteId.toLowerCase().includes("aolzu") ||
      siteId.toLowerCase().includes("aozu") ||
      (site && (site.name.includes("奥租") || site.name.toLowerCase().includes("aolzu") || site.name.toLowerCase().includes("aozu")))

  const isYoupin = 
      siteId === "youpin" || 
      siteId.toLowerCase().includes("youpin") ||
      (site && (site.name.includes("优品") || site.name.toLowerCase().includes("youpin")))

  const isLlxzu = 
      siteId === "llxzu" || 
      siteId.toLowerCase().includes("llxzu") ||
      (site && (site.name.includes("零零享") || site.name.toLowerCase().includes("llxzu")))

  const isRrz = 
      siteId === "rrz" || 
      siteId.toLowerCase().includes("rrz") ||
      (site && (site.name.includes("人人租") || site.name.toLowerCase().includes("rrz")))

  let status;
  if (isChenglin) {
      console.log(`[API] Triggering Chenglin sync for siteId: ${siteId}`)
      // Don't await here, let it run in background so UI doesn't hang
      startChenglinSync(siteId).catch(err => {
          console.error(`[API] Chenglin sync failed to start:`, err)
      })
      status = { status: "running", message: "诚赁同步已启动" }
  } else if (isAolzu) {
      console.log(`[API] Triggering Aolzu sync for siteId: ${siteId}`)
      startAolzuSync(siteId).catch(err => {
          console.error(`[API] Aolzu sync failed to start:`, err)
      })
      status = { status: "running", message: "奥租同步已启动" }
  } else if (isYoupin) {
      console.log(`[API] Triggering Youpin sync for siteId: ${siteId}`)
      startYoupinSync(siteId).catch(err => {
          console.error(`[API] Youpin sync failed to start:`, err)
      })
      status = { status: "running", message: "优品租同步已启动" }
  } else if (isLlxzu) {
      console.log(`[API] Triggering Llxzu sync for siteId: ${siteId}`)
      startLlxzuSync(siteId).catch(err => {
          console.error(`[API] Llxzu sync failed to start:`, err)
      })
      status = { status: "running", message: "零零享同步已启动" }
  } else if (isRrz) {
      console.log(`[API] Triggering Rrz sync for siteId: ${siteId}`)
      startRrzSync(siteId).catch(err => {
          console.error(`[API] Rrz sync failed to start:`, err)
      })
      status = { status: "running", message: "人人租同步已启动" }
  } else {
      status = await startZanchenSync(siteId)
  }
  
  if (status.status !== "error") {
      await notifyManualRun(siteId)
  }

  const statusCode = status.status === "error" ? 500 : 200
  return NextResponse.json(status, { status: statusCode })
}
