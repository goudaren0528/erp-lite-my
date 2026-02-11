import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { stopZanchenSync } from "@/lib/online-orders/zanchen"

export const dynamic = "force-dynamic"

export async function POST() {
  const currentUser = await getCurrentUser()
  const isAdmin = currentUser?.role === "ADMIN"
  const canManage = isAdmin || currentUser?.permissions?.includes("online_orders")
  if (!canManage) {
    return NextResponse.json({ status: "error", message: "无权限操作" }, { status: 403 })
  }

  const status = await stopZanchenSync()
  return NextResponse.json(status)
}
