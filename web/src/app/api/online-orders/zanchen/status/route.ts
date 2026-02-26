import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getZanchenStatus, loadConfig } from "@/lib/online-orders/zanchen"
import { getChenglinStatus } from "@/lib/online-orders/chenglin"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUser()
  const isAdmin = currentUser?.role === "ADMIN"
  const canManage = isAdmin || currentUser?.permissions?.includes("online_orders")
  if (!canManage) {
    return NextResponse.json({ status: "error", message: "无权限操作" }, { status: 403 })
  }
  
  const siteId = req.nextUrl.searchParams.get("siteId")
  
  // Resolve site to check name if ID is generic
  // We need to check if this site is intended to be handled by Chenglin logic
  let isChenglin = false
  if (siteId) {
      if (siteId === "chenglin" || siteId === "chenlin" || siteId.toLowerCase().includes("chenglin") || siteId.toLowerCase().includes("chenlin")) {
          isChenglin = true
      } else {
          // Check config by name
          const config = await loadConfig()
          const site = config?.sites.find(s => s.id === siteId)
          if (site && (site.name.includes("诚赁") || site.name.toLowerCase().includes("chenglin") || site.name.toLowerCase().includes("chenlin"))) {
              isChenglin = true
          }
      }
  }

  if (isChenglin) {
      return NextResponse.json(getChenglinStatus())
  }
  
  return NextResponse.json(getZanchenStatus())
}
