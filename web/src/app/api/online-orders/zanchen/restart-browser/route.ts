import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { restartZanchenBrowser } from "@/lib/online-orders/zanchen"
import { restartChenglinBrowser } from "@/lib/online-orders/chenglin"
import { restartAolzuBrowser } from "@/lib/online-orders/aolzu"
import { restartYoupinBrowser } from "@/lib/online-orders/youpin"
import { restartLlxzuBrowser } from "@/lib/online-orders/llxzu"
import { restartRrzBrowser } from "@/lib/online-orders/rrz"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser()
  const isAdmin = currentUser?.role === "ADMIN"
  const canManage = isAdmin || currentUser?.permissions?.includes("online_orders")
  if (!canManage) {
    return NextResponse.json({ success: false, message: "无权限操作" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const siteId = typeof body?.siteId === "string" ? body.siteId.toLowerCase() : "zanchen"

  if (siteId.includes("chenglin") || siteId.includes("chenlin")) {
    return NextResponse.json(await restartChenglinBrowser())
  }
  if (siteId.includes("aolzu") || siteId.includes("aozu")) {
    return NextResponse.json(await restartAolzuBrowser())
  }
  if (siteId.includes("youpin")) {
    return NextResponse.json(await restartYoupinBrowser())
  }
  if (siteId.includes("llxzu")) {
    return NextResponse.json(await restartLlxzuBrowser())
  }
  if (siteId.includes("rrz")) {
    return NextResponse.json(await restartRrzBrowser())
  }
  return NextResponse.json(await restartZanchenBrowser())
}
