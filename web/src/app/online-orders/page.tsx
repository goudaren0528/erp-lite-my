import { getCurrentUser } from "@/lib/auth"
import { getAppConfigValue } from "@/app/actions"
import { redirect } from "next/navigation"
import { OnlineOrdersClient } from "./online-orders-client"

export default async function OnlineOrdersPage() {
  const currentUser = await getCurrentUser()
  const isAdmin = currentUser?.role === 'ADMIN'
  const canAccessOnlineOrders = isAdmin || currentUser?.permissions?.includes('online_orders')

  if (!canAccessOnlineOrders) {
    redirect('/')
  }

  const enabledValue = await getAppConfigValue("zanchen_platform_enabled")
  const initialEnabled = enabledValue === "true"

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">线上订单管理</h2>
        <p className="text-muted-foreground">查看和管理线上订单数据。</p>
        <div className="mt-3">
          <OnlineOrdersClient initialEnabled={initialEnabled} />
        </div>
      </div>
      <div className="rounded-md border p-6 text-sm text-muted-foreground">
        暂无线上订单数据
      </div>
    </div>
  )
}
