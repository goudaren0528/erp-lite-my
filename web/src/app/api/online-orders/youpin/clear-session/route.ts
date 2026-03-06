import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { clearYoupinSession } from "@/lib/online-orders/youpin"

export const dynamic = "force-dynamic"

export async function POST() {
  const currentUser = await getCurrentUser()
  const isAdmin = currentUser?.role === "ADMIN"
  const canManage = isAdmin || currentUser?.permissions?.includes("online_orders")
  if (!canManage) {
    return NextResponse.json({ success: false, message: "无权限操作" }, { status: 403 })
  }

  const result = await clearYoupinSession()
  return NextResponse.json(result)
}
