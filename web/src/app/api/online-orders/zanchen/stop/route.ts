import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { stopZanchenSync } from "@/lib/online-orders/zanchen"
import { stopChenglinSync } from "@/lib/online-orders/chenglin"
import { stopAolzuSync } from "@/lib/online-orders/aolzu"
import { stopYoupinSync } from "@/lib/online-orders/youpin"
import { stopLlxzuSync } from "@/lib/online-orders/llxzu"
import { stopRrzSync } from "@/lib/online-orders/rrz"
import { loadConfig } from "@/lib/online-orders/zanchen"

export const dynamic = "force-dynamic"

function detectPlatformKeyByNameOrId(siteId: string, siteName: string): string {
  const id = siteId.toLowerCase()
  if (siteName.includes("诚赁") || id.includes("chenglin") || id.includes("chenlin")) return "chenglin"
  if (siteName.includes("奥租") || id.includes("aolzu") || id.includes("aozu")) return "aolzu"
  if (siteName.includes("优品") || id.includes("youpin")) return "youpin"
  if (siteName.includes("零零享") || id.includes("llxzu")) return "llxzu"
  if (siteName.includes("人人租") || id.includes("rrz")) return "rrz"
  return "zanchen"
}

function normalizeLoginUrl(raw?: string): { exact: string; origin: string } | null {
  const text = raw?.trim()
  if (!text) return null
  try {
    const withProtocol = /^https?:\/\//i.test(text) ? text : `http://${text}`
    const parsed = new URL(withProtocol)
    const origin = parsed.origin.toLowerCase()
    const pathname = (parsed.pathname || "/").replace(/\/+$/, "") || "/"
    return { exact: `${origin}${pathname.toLowerCase()}`, origin }
  } catch {
    return null
  }
}

function detectPlatformKey(siteId: string, siteName: string, loginUrl: string | undefined, sites: { id: string; name: string; loginUrl?: string }[]): string {
  const explicitKey = detectPlatformKeyByNameOrId(siteId, siteName)
  if (explicitKey !== "zanchen") return explicitKey
  const current = normalizeLoginUrl(loginUrl)
  if (!current) return explicitKey

  let sameOriginKey: string | null = null
  for (const candidate of sites) {
    if (candidate.id === siteId) continue
    const candidateKey = detectPlatformKeyByNameOrId(candidate.id, candidate.name || "")
    if (candidateKey === "zanchen") continue
    const candidateUrl = normalizeLoginUrl(candidate.loginUrl)
    if (!candidateUrl) continue
    if (candidateUrl.exact === current.exact) return candidateKey
    if (!sameOriginKey && candidateUrl.origin === current.origin) {
      sameOriginKey = candidateKey
    }
  }
  return sameOriginKey ?? explicitKey
}

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser()
  const isAdmin = currentUser?.role === "ADMIN"
  const canManage = isAdmin || currentUser?.permissions?.includes("online_orders")
  if (!canManage) {
    return NextResponse.json({ status: "error", message: "无权限操作" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const siteId = typeof body?.siteId === "string" ? body.siteId : "zanchen"
  const config = await loadConfig()
  const site = config?.sites.find(s => s.id === siteId)
  const platformKey = detectPlatformKey(siteId, site?.name || "", site?.loginUrl, config?.sites ?? [])

  if (platformKey === "chenglin") {
    stopChenglinSync()
    return NextResponse.json({ status: "idle", message: "已发送停止指令" })
  }

  if (platformKey === "aolzu") {
    stopAolzuSync()
    return NextResponse.json({ status: "idle", message: "已发送停止指令" })
  }

  if (platformKey === "youpin") {
    stopYoupinSync()
    return NextResponse.json({ status: "idle", message: "已发送停止指令" })
  }

  if (platformKey === "llxzu") {
    stopLlxzuSync()
    return NextResponse.json({ status: "idle", message: "已发送停止指令" })
  }

  if (platformKey === "rrz") {
    stopRrzSync()
    return NextResponse.json({ status: "idle", message: "已发送停止指令" })
  }

  const status = await stopZanchenSync()
  return NextResponse.json(status)
}
