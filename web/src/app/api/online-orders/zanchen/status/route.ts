import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { validateBearerToken } from "@/lib/api-token"
import { getZanchenStatus, loadConfig } from "@/lib/online-orders/zanchen"
import { getChenglinStatus } from "@/lib/online-orders/chenglin"
import { getAolzuStatus } from "@/lib/online-orders/aolzu"
import { getYoupinStatus } from "@/lib/online-orders/youpin"
import { getLlxzuStatus } from "@/lib/online-orders/llxzu"
import { getRrzStatus } from "@/lib/online-orders/rrz"

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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader) {
    const valid = await validateBearerToken(authHeader)
    if (!valid) return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 })
  } else {
    const currentUser = await getCurrentUser()
    const isAdmin = currentUser?.role === "ADMIN"
    const canManage = isAdmin || currentUser?.permissions?.includes("online_orders")
    if (!canManage) {
      return NextResponse.json({ status: "error", message: "无权限操作" }, { status: 403 })
    }
  }
  
  const siteId = req.nextUrl.searchParams.get("siteId")
  const config = await loadConfig()
  const site = siteId ? config?.sites.find(s => s.id === siteId) : undefined
  const platformKey = siteId ? detectPlatformKey(siteId, site?.name || "", site?.loginUrl, config?.sites ?? []) : "zanchen"

  if (platformKey === "chenglin") {
      return NextResponse.json(getChenglinStatus())
  }
  
  if (platformKey === "aolzu") {
      return NextResponse.json(getAolzuStatus())
  }
  
  if (platformKey === "youpin") {
      return NextResponse.json(getYoupinStatus())
  }
  
  if (platformKey === "llxzu") {
      return NextResponse.json(getLlxzuStatus())
  }

  if (platformKey === "rrz") {
      return NextResponse.json(getRrzStatus())
  }
  
  return NextResponse.json(getZanchenStatus())
}
