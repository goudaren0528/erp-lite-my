import { NextRequest, NextResponse } from "next/server"
import { getSessionPage, resolveSessionSiteId } from "@/lib/online-orders/session-manager"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUser()
  const canManage = currentUser?.role === "ADMIN" || currentUser?.permissions?.includes("online_orders")
  if (!canManage) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get("siteId") || "auto"
  const resolvedSiteId = await resolveSessionSiteId(siteId)

  const page = getSessionPage(resolvedSiteId)
  if (!page || page.isClosed()) {
    // Return a placeholder or 404
    return NextResponse.json({ error: "No active session" }, { status: 404 })
  }

  try {
    const buffer = await page.screenshot({ type: "jpeg", quality: 60 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
