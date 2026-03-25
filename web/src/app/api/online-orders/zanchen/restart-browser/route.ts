import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { restartZanchenBrowser } from "@/lib/online-orders/zanchen"
import { restartChenglinBrowser } from "@/lib/online-orders/chenglin"
import { restartAolzuBrowser } from "@/lib/online-orders/aolzu"
import { restartYoupinBrowser } from "@/lib/online-orders/youpin"
import { restartLlxzuBrowser } from "@/lib/online-orders/llxzu"
import { restartRrzBrowser } from "@/lib/online-orders/rrz"
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
    return NextResponse.json({ success: false, message: "无权限操作" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const rawSiteId = typeof body?.siteId === "string" ? body.siteId : "zanchen"
  const config = await loadConfig()
  const site = config?.sites.find(s => s.id === rawSiteId)
  const platformKey = detectPlatformKey(rawSiteId, site?.name || "", site?.loginUrl, config?.sites ?? [])

  if (platformKey === "chenglin") {
    return NextResponse.json(await restartChenglinBrowser())
  }
  if (platformKey === "aolzu") {
    return NextResponse.json(await restartAolzuBrowser())
  }
  if (platformKey === "youpin") {
    return NextResponse.json(await restartYoupinBrowser())
  }
  if (platformKey === "llxzu") {
    return NextResponse.json(await restartLlxzuBrowser())
  }
  if (platformKey === "rrz") {
    return NextResponse.json(await restartRrzBrowser())
  }
  return NextResponse.json(await restartZanchenBrowser())
}
