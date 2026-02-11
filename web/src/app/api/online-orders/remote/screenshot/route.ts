import { NextRequest, NextResponse } from "next/server"
import { getRunningPage } from "@/lib/online-orders/zanchen"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUser()
  const canManage = currentUser?.role === "ADMIN" || currentUser?.permissions?.includes("online_orders")
  if (!canManage) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  const page = getRunningPage()
  if (!page || page.isClosed()) {
    return NextResponse.json({ error: "No active session" }, { status: 404 })
  }

  try {
    const buffer = await page.screenshot({ type: "jpeg", quality: 60 })
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch (e) {
    return NextResponse.json({ error: "Screenshot failed" }, { status: 500 })
  }
}
