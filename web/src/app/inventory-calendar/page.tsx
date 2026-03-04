import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { InventoryCalendarClient } from "./client"

export default async function InventoryCalendarPage() {
    const user = await getCurrentUser()
    const canView = user?.role === 'ADMIN' || user?.permissions?.includes('inventory_calendar') || user?.permissions?.includes('inventory_manage')
    const canManage = user?.role === 'ADMIN' || user?.permissions?.includes('inventory_manage')

    if (!canView) {
        redirect('/')
    }

    return (
        <div className="space-y-6 p-4 sm:p-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">库存日历</h2>
            <InventoryCalendarClient canManage={!!canManage} />
        </div>
    )
}
