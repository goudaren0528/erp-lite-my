import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    const canClear = currentUser?.role === "ADMIN" || currentUser?.permissions?.includes("online_orders_clear")
    if (!canClear) {
      return NextResponse.json({ error: "无权限操作" }, { status: 403 })
    }

    const { platform } = await req.json()
    if (!platform) return NextResponse.json({ error: "platform required" }, { status: 400 })
    const { count } = await prisma.onlineOrder.deleteMany({ where: { platform } })
    return NextResponse.json({ success: true, deleted: count })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
