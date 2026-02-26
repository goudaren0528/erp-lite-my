import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { loadConfig, startZanchenSync } from "@/lib/online-orders/zanchen"
import { startChenglinSync } from "@/lib/online-orders/chenglin"
import { notifyManualRun } from "@/lib/online-orders/scheduler"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser()
  const isAdmin = currentUser?.role === "ADMIN"
  const canManage = isAdmin || currentUser?.permissions?.includes("online_orders")
  if (!canManage) {
    return NextResponse.json({ status: "error", message: "无权限操作" }, { status: 403 })
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

  let status;
  if (isChenglin) {
      console.log(`[API] Triggering Chenglin sync for siteId: ${siteId}`)
      // Don't await here, let it run in background so UI doesn't hang
      startChenglinSync(siteId).catch(err => {
          console.error(`[API] Chenglin sync failed to start:`, err)
      })
      status = { status: "running", message: "诚赁同步已启动" }
  } else {
      status = await startZanchenSync(siteId)
  }
  
  if (status.status !== "error") {
      await notifyManualRun(siteId)
  }

  const statusCode = status.status === "error" ? 500 : 200
  return NextResponse.json(status, { status: statusCode })
}
