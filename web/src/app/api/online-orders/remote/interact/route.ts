import { NextRequest, NextResponse } from "next/server"
import { getRunningPage } from "@/lib/online-orders/zanchen"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
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
    const body = await req.json()
    const { type, x, y, text, key, deltaX, deltaY } = body

    if (type === "click") {
      await page.mouse.click(x, y)
    } else if (type === "mousemove") {
      await page.mouse.move(x, y)
    } else if (type === "mousedown") {
      await page.mouse.down()
    } else if (type === "mouseup") {
      await page.mouse.up()
    } else if (type === "type") {
      if (text) await page.keyboard.type(text)
    } else if (type === "press") {
      if (key) await page.keyboard.press(key)
    } else if (type === "scroll") {
        await page.mouse.wheel(deltaX || 0, deltaY || 0)
    } else if (type === "reload") {
        await page.reload()
    } else if (type === "goto") {
        if (text) await page.goto(text)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
