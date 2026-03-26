import { NextRequest, NextResponse } from "next/server"
import { getSessionPage, resolveSessionSiteId } from "@/lib/online-orders/session-manager"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser()
  const canManage = currentUser?.role === "ADMIN" || currentUser?.permissions?.includes("online_orders")
  if (!canManage) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { siteId, type, x, y, text, key, deltaX, deltaY } = body

    const resolvedSiteId = await resolveSessionSiteId(siteId || "auto")
    const page = getSessionPage(resolvedSiteId)
    if (!page || page.isClosed()) {
      return NextResponse.json({ error: "No active session for this site" }, { status: 404 })
    }

    const toNum = (v: unknown) => {
      if (typeof v === "number") return v
      if (typeof v === "string" && v.trim() !== "") return Number(v)
      return NaN
    }

    const px = toNum(x)
    const py = toNum(y)
    const dx = toNum(deltaX)
    const dy = toNum(deltaY)

    if (type === "click") {
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 })
      }
      await page.mouse.click(px, py, { delay: 45 })
    } else if (type === "mousemove") {
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 })
      }
      await page.mouse.move(px, py)
    } else if (type === "mousedown") {
      if (Number.isFinite(px) && Number.isFinite(py)) {
        await page.mouse.move(px, py)
      }
      await page.mouse.down()
    } else if (type === "mouseup") {
      if (Number.isFinite(px) && Number.isFinite(py)) {
        await page.mouse.move(px, py)
      }
      await page.mouse.up()
    } else if (type === "type") {
      if (typeof text === "string" && text.length > 0) {
        await page.keyboard.type(text, { delay: 25 })
      }
    } else if (type === "press") {
      if (key) await page.keyboard.press(key)
    } else if (type === "scroll") {
        await page.mouse.wheel(Number.isFinite(dx) ? dx : 0, Number.isFinite(dy) ? dy : 0)
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
