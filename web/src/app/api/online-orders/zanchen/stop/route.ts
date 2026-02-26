import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { stopZanchenSync } from "@/lib/online-orders/zanchen"
import { stopChenglinSync } from "@/lib/online-orders/chenglin"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser()
  const isAdmin = currentUser?.role === "ADMIN"
  const canManage = isAdmin || currentUser?.permissions?.includes("online_orders")
  if (!canManage) {
    return NextResponse.json({ status: "error", message: "无权限操作" }, { status: 403 })
  }
  
  // Try to stop Chenglin as well, just in case
  // Or check query param?
  // Zanchen and Chenglin are mutually exclusive in current UI design usually, or run independently.
  // The current UI button calls this endpoint without params.
  // We should stop both or check.
  // Since we don't pass siteId to stop, let's just try stopping both safely.
  
  stopChenglinSync()
  const status = await stopZanchenSync()
  
  return NextResponse.json(status)
}
