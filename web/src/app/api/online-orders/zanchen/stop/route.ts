import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { stopZanchenSync } from "@/lib/online-orders/zanchen"
import { stopChenglinSync } from "@/lib/online-orders/chenglin"
import { stopAolzuSync } from "@/lib/online-orders/aolzu"
import { stopYoupinSync } from "@/lib/online-orders/youpin"
import { stopLlxzuSync } from "@/lib/online-orders/llxzu"
import { stopRrzSync } from "@/lib/online-orders/rrz"

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
  const siteIdLower = siteId.toLowerCase()

  if (
    siteIdLower === "chenglin" ||
    siteIdLower === "chenlin" ||
    siteIdLower.includes("chenglin") ||
    siteIdLower.includes("chenlin")
  ) {
    stopChenglinSync()
    return NextResponse.json({ status: "idle", message: "已发送停止指令" })
  }

  if (siteIdLower === "aolzu" || siteIdLower === "aozu" || siteIdLower.includes("aolzu") || siteIdLower.includes("aozu")) {
    stopAolzuSync()
    return NextResponse.json({ status: "idle", message: "已发送停止指令" })
  }

  if (siteIdLower === "youpin" || siteIdLower.includes("youpin")) {
    stopYoupinSync()
    return NextResponse.json({ status: "idle", message: "已发送停止指令" })
  }

  if (siteIdLower === "llxzu" || siteIdLower.includes("llxzu")) {
    stopLlxzuSync()
    return NextResponse.json({ status: "idle", message: "已发送停止指令" })
  }

  if (siteIdLower === "rrz" || siteIdLower.includes("rrz")) {
    stopRrzSync()
    return NextResponse.json({ status: "idle", message: "已发送停止指令" })
  }

  const status = await stopZanchenSync()
  return NextResponse.json(status)
}
