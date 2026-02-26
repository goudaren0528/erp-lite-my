
import { Page } from "playwright"
import { getRunningPage as getZanchenPage } from "./zanchen"
import { getRunningPage as getChenglinPage } from "./chenglin"

// Centralized session manager to retrieve the active page for a given site
// This allows the remote interaction API to support multiple platforms

export function getSessionPage(siteId: string): Page | undefined {
  if (siteId === "zanchen") {
    return getZanchenPage()
  } else if (siteId === "chenglin") {
    return getChenglinPage()
  }
  // Future sites can be added here
  
  // Fallback: try to find any active page if siteId is not specific or "auto"
  if (!siteId || siteId === "auto") {
      const zanchen = getZanchenPage()
      if (zanchen && !zanchen.isClosed()) return zanchen
      
      const chenglin = getChenglinPage()
      if (chenglin && !chenglin.isClosed()) return chenglin
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
    
    return sessions
}
