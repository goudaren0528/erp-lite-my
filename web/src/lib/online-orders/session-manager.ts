
import { Page } from "playwright"
import { getRunningPage as getZanchenPage } from "./zanchen"
import { getRunningPage as getChenglinPage } from "./chenglin"
import { getRunningPage as getYoupinPage } from "./youpin"
import { getRunningPage as getAolzuPage } from "./aolzu"
import { getRunningPage as getLlxzuPage } from "./llxzu"
import { getRunningPage as getRrzPage } from "./rrz"
import { loadConfig } from "./zanchen"

// Centralized session manager to retrieve the active page for a given site
// This allows the remote interaction API to support multiple platforms

// All registered platforms — single source of truth
// Add new platforms here when adding a new crawler
export const REGISTERED_PLATFORMS: { id: string; name: string }[] = [
  { id: "zanchen", name: "赞晨" },
  { id: "chenglin", name: "诚赁" },
  { id: "youpin", name: "优品租" },
  { id: "aolzu", name: "奥租" },
  { id: "llxzu", name: "零零享" },
  { id: "rrz", name: "人人租" },
]

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

export function getSessionPage(siteId: string): Page | undefined {
  const normalized = detectPlatformKeyByNameOrId(siteId || "auto", "")

  if (siteId === "zanchen" || (normalized === "zanchen" && siteId !== "auto" && !!siteId)) {
    return getZanchenPage()
  } else if (siteId === "chenglin" || normalized === "chenglin") {
    return getChenglinPage()
  } else if (siteId === "youpin" || normalized === "youpin") {
    return getYoupinPage()
  } else if (siteId === "aolzu" || normalized === "aolzu") {
    return getAolzuPage()
  } else if (siteId === "llxzu" || normalized === "llxzu") {
    return getLlxzuPage()
  } else if (siteId === "rrz" || normalized === "rrz") {
    return getRrzPage()
  }
  
  // Future sites can be added here
  
  // Fallback: try to find any active page if siteId is not specific or "auto"
  if (!siteId || siteId === "auto") {
      const zanchen = getZanchenPage()
      if (zanchen && !zanchen.isClosed()) return zanchen
      
      const chenglin = getChenglinPage()
      if (chenglin && !chenglin.isClosed()) return chenglin
      
      const youpin = getYoupinPage()
      if (youpin && !youpin.isClosed()) return youpin
      
      const aolzu = getAolzuPage()
      if (aolzu && !aolzu.isClosed()) return aolzu
      
      const llxzu = getLlxzuPage()
      if (llxzu && !llxzu.isClosed()) return llxzu

      const rrz = getRrzPage()
      if (rrz && !rrz.isClosed()) return rrz
  }
  
  return undefined
}

export async function resolveSessionSiteId(siteId: string): Promise<string> {
  if (!siteId || siteId === "auto") return "auto"
  if (REGISTERED_PLATFORMS.some(p => p.id === siteId)) return siteId

  try {
    const config = await loadConfig()
    const sites = config?.sites ?? []
    const site = sites.find(s => s.id === siteId)
    if (!site) return siteId
    return detectPlatformKey(site.id, site.name || "", site.loginUrl, sites)
  } catch {
    return siteId
  }
}

export function getAllActiveSessions(): { id: string, name: string }[] {
    const sessions = []
    
    const zanchen = getZanchenPage()
    if (zanchen && !zanchen.isClosed()) {
        sessions.push({ id: "zanchen", name: "赞晨 (Zanchen)" })
    }
    
    const chenglin = getChenglinPage()
    if (chenglin && !chenglin.isClosed()) {
        sessions.push({ id: "chenglin", name: "诚赁 (Chenglin)" })
    }
    
    const youpin = getYoupinPage()
    if (youpin && !youpin.isClosed()) {
        sessions.push({ id: "youpin", name: "优品租 (Youpin)" })
    }
    
    const aolzu = getAolzuPage()
    if (aolzu && !aolzu.isClosed()) {
        sessions.push({ id: "aolzu", name: "奥租 (Aolzu)" })
    }
    
    const llxzu = getLlxzuPage()
    if (llxzu && !llxzu.isClosed()) {
        sessions.push({ id: "llxzu", name: "零零享 (Llxzu)" })
    }

    const rrz = getRrzPage()
    if (rrz && !rrz.isClosed()) {
        sessions.push({ id: "rrz", name: "人人租 (Rrz)" })
    }
    
    return sessions
}
