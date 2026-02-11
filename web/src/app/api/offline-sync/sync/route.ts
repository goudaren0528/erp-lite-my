import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { triggerManualSync } from "@/lib/offline-sync/service"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser()
  const isAdmin = currentUser?.role === "ADMIN"
  const permissions = currentUser?.permissions || []
  const canManage = isAdmin || permissions.includes("offline_orders") || permissions.includes("orders")
  if (!canManage) {
    return NextResponse.json({ status: "error", message: "无权限操作" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const siteId = typeof body?.siteId === "string" ? body.siteId : "zanchen"
  
  try {
    const status = await triggerManualSync(siteId)
    return NextResponse.json(status)
  } catch (e) {
    return NextResponse.json({ status: "error", message: String(e) }, { status: 500 })
  }
}
