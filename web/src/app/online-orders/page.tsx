import { getCurrentUser } from "@/lib/auth"
import { getAppConfigValue } from "@/app/actions"
import { redirect } from "next/navigation"
import { OnlineOrdersClient } from "./online-orders-client"
import { defaultConfig } from "@/lib/online-orders/default-config"

export default async function OnlineOrdersPage() {
  const currentUser = await getCurrentUser()
  const isAdmin = currentUser?.role === 'ADMIN'
  const canAccessOnlineOrders = isAdmin || currentUser?.permissions?.includes('online_orders')

  if (!canAccessOnlineOrders) {
    redirect('/')
  }

  const rawConfig = await getAppConfigValue("online_orders_sync_config")
  let initialConfig = defaultConfig
  if (rawConfig) {
    try {
      const parsed = JSON.parse(rawConfig)
      if (parsed && Array.isArray(parsed.sites)) {
        const defaultSiteMap = new Map(defaultConfig.sites.map(site => [site.id, site]))
        const parsedSiteIds = new Set(
          (parsed.sites as unknown[]).flatMap((s) => {
            if (!s || typeof s !== "object") return []
            const id = (s as { id?: unknown }).id
            return typeof id === "string" && id ? [id] : []
          })
        )
        const missingDefaultSites = defaultConfig.sites.filter(site => !parsedSiteIds.has(site.id))
        
        initialConfig = {
          ...defaultConfig,
          ...parsed,
          sites: [
            ...parsed.sites.map((site: typeof defaultConfig.sites[number]) => {
              const fallback = defaultSiteMap.get(site.id)
              return {
                ...fallback,
                ...site,
                maxPages: typeof site.maxPages === "number" ? site.maxPages : fallback?.maxPages ?? 0,
                selectors: {
                  ...fallback?.selectors,
                  ...site.selectors
                }
              }
            }),
            ...missingDefaultSites
          ].sort((a, b) => {
            if (a.id === "zanchen") return -1
            if (b.id === "zanchen") return 1
            return 0
          })
        }
      }
    } catch {
      initialConfig = defaultConfig
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">线上订单管理</h2>
        <p className="text-muted-foreground">查看和管理线上订单数据。</p>
        <div className="mt-3">
          <OnlineOrdersClient
            initialConfig={initialConfig}
            canClearOrders={isAdmin || !!currentUser?.permissions?.includes('online_orders_clear')}
          />
        </div>
      </div>
    </div>
  )
}
