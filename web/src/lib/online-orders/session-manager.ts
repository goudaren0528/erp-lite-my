
import { Page } from "playwright"
import { getRunningPage as getZanchenPage } from "./zanchen"
import { getRunningPage as getChenglinPage } from "./chenglin"
import { getRunningPage as getYoupinPage } from "./youpin"
import { getRunningPage as getAolzuPage } from "./aolzu"
import { getRunningPage as getLlxzuPage } from "./llxzu"
import { getRunningPage as getRrzPage } from "./rrz"

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

export function getSessionPage(siteId: string): Page | undefined {
  if (siteId === "zanchen") {
    return getZanchenPage()
  } else if (siteId === "chenglin") {
    return getChenglinPage()
  } else if (siteId === "youpin") {
    return getYoupinPage()
  } else if (siteId === "aolzu") {
    return getAolzuPage()
  } else if (siteId === "llxzu") {
    return getLlxzuPage()
  } else if (siteId === "rrz") {
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
