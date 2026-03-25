import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { validateBearerToken } from "@/lib/api-token"
import { loadConfig, startZanchenSync } from "@/lib/online-orders/zanchen"
import { startChenglinSync } from "@/lib/online-orders/chenglin"
import { startAolzuSync } from "@/lib/online-orders/aolzu"
import { startYoupinSync } from "@/lib/online-orders/youpin"
import { startLlxzuSync } from "@/lib/online-orders/llxzu"
import { startRrzSync } from "@/lib/online-orders/rrz"
import { notifyManualRun } from "@/lib/online-orders/scheduler"

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

  const body = await req.json().catch(() => ({}))
  const siteId = typeof body?.siteId === "string" ? body.siteId : "zanchen"
  
  const config = await loadConfig()
  const site = config?.sites.find(s => s.id === siteId)
  const sites = config?.sites ?? []
  const platformKey = detectPlatformKey(siteId, site?.name || "", site?.loginUrl, sites)

  let status;
  if (platformKey === "chenglin") {
      console.log(`[API] Triggering Chenglin sync for siteId: ${siteId}`)
      startChenglinSync(siteId).catch(err => {
          console.error(`[API] Chenglin sync failed to start:`, err)
      })
      status = { status: "running", message: "诚赁同步已启动" }
  } else if (platformKey === "aolzu") {
      console.log(`[API] Triggering Aolzu sync for siteId: ${siteId}`)
      startAolzuSync(siteId).catch(err => {
          console.error(`[API] Aolzu sync failed to start:`, err)
      })
      status = { status: "running", message: "奥租同步已启动" }
  } else if (platformKey === "youpin") {
      console.log(`[API] Triggering Youpin sync for siteId: ${siteId}`)
      startYoupinSync(siteId).catch(err => {
          console.error(`[API] Youpin sync failed to start:`, err)
      })
      status = { status: "running", message: "优品租同步已启动" }
  } else if (platformKey === "llxzu") {
      console.log(`[API] Triggering Llxzu sync for siteId: ${siteId}`)
      startLlxzuSync(siteId).catch(err => {
          console.error(`[API] Llxzu sync failed to start:`, err)
      })
      status = { status: "running", message: `${site?.name?.trim() || "零零享"}同步已启动` }
  } else if (platformKey === "rrz") {
      console.log(`[API] Triggering Rrz sync for siteId: ${siteId}`)
      startRrzSync(siteId).catch(err => {
          console.error(`[API] Rrz sync failed to start:`, err)
      })
      status = { status: "running", message: "人人租同步已启动" }
  } else {
      status = await startZanchenSync(siteId)
  }
  
  if (status.status !== "error") {
      await notifyManualRun(siteId)
  }

  const statusCode = status.status === "error" ? 500 : 200
  return NextResponse.json(status, { status: statusCode })
}
