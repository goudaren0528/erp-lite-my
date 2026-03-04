import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getZanchenStatus, loadConfig } from "@/lib/online-orders/zanchen"
import { getChenglinStatus } from "@/lib/online-orders/chenglin"
import { getAolzuStatus } from "@/lib/online-orders/aolzu"
import { getYoupinStatus } from "@/lib/online-orders/youpin"
import { getLlxzuStatus } from "@/lib/online-orders/llxzu"
import { getRrzStatus } from "@/lib/online-orders/rrz"

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
  // We need to check if this site is intended to be handled by Chenglin or Aolzu logic
  let isChenglin = false
  let isAolzu = false
  let isYoupin = false
  let isLlxzu = false
  let isRrz = false
  
  if (siteId) {
      if (siteId === "chenglin" || siteId === "chenlin" || siteId.toLowerCase().includes("chenglin") || siteId.toLowerCase().includes("chenlin")) {
          isChenglin = true
      } else if (siteId === "aolzu" || siteId === "aozu" || siteId.toLowerCase().includes("aolzu") || siteId.toLowerCase().includes("aozu")) {
          isAolzu = true
      } else if (siteId === "youpin" || siteId.toLowerCase().includes("youpin")) {
          isYoupin = true
      } else if (siteId === "llxzu" || siteId.toLowerCase().includes("llxzu")) {
          isLlxzu = true
      } else if (siteId === "rrz" || siteId.toLowerCase().includes("rrz")) {
          isRrz = true
      } else {
          // Check config by name
          const config = await loadConfig()
          const site = config?.sites.find(s => s.id === siteId)
          if (site) {
              if (site.name.includes("诚赁") || site.name.toLowerCase().includes("chenglin") || site.name.toLowerCase().includes("chenlin")) {
                  isChenglin = true
              } else if (site.name.includes("奥租") || site.name.toLowerCase().includes("aolzu") || site.name.toLowerCase().includes("aozu")) {
                  isAolzu = true
              } else if (site.name.includes("优品") || site.name.toLowerCase().includes("youpin")) {
                  isYoupin = true
              } else if (site.name.includes("零零享") || site.name.toLowerCase().includes("llxzu")) {
                  isLlxzu = true
              } else if (site.name.includes("人人租") || site.name.toLowerCase().includes("rrz")) {
                  isRrz = true
              }
          }
      }
  }

  if (isChenglin) {
      return NextResponse.json(getChenglinStatus())
  }
  
  if (isAolzu) {
      return NextResponse.json(getAolzuStatus())
  }
  
  if (isYoupin) {
      return NextResponse.json(getYoupinStatus())
  }
  
  if (isLlxzu) {
      return NextResponse.json(getLlxzuStatus())
  }

  if (isRrz) {
      return NextResponse.json(getRrzStatus())
  }
  
  return NextResponse.json(getZanchenStatus())
}
