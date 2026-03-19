import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { InventoryClient } from "./client"

const INACTIVE_STATUSES = ['COMPLETED', 'CLOSED', 'CANCELLED', 'BOUGHT_OUT']

export default async function InventoryPage() {
    const user = await getCurrentUser()
    const canView = user?.role === 'ADMIN' || user?.permissions?.includes('inventory_manage')

    if (!canView) {
        redirect('/')
    }

    const [itemTypes, warehouses, stocks, items, activeOrders, activeOnlineOrders] = await Promise.all([
        prisma.inventoryItemType.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.warehouse.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.inventoryStock.findMany({ include: { itemType: true, warehouse: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.inventoryItem.findMany({ include: { itemType: true, warehouse: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.order.findMany({
            where: { sn: { not: null }, status: { notIn: INACTIVE_STATUSES } },
            select: { sn: true, rentStartDate: true, returnDeadline: true }
        }),
        prisma.onlineOrder.findMany({
            where: { manualSn: { not: null }, status: { notIn: INACTIVE_STATUSES } },
            select: { manualSn: true, rentStartDate: true, returnDeadline: true }
        }),
    ])

    // Build a map: sn -> list of active order date ranges
    type SnOrderEntry = { rentStartDate: Date | null; returnDeadline: Date | null }
    const snOrderMap = new Map<string, SnOrderEntry[]>()
    for (const o of activeOrders) {
        if (!o.sn) continue
        if (!snOrderMap.has(o.sn)) snOrderMap.set(o.sn, [])
        snOrderMap.get(o.sn)!.push({ rentStartDate: o.rentStartDate, returnDeadline: o.returnDeadline })
    }
    for (const o of activeOnlineOrders) {
        if (!o.manualSn) continue
        if (!snOrderMap.has(o.manualSn)) snOrderMap.set(o.manualSn, [])
        snOrderMap.get(o.manualSn)!.push({ rentStartDate: o.rentStartDate, returnDeadline: o.returnDeadline })
    }

    // Serialize to plain object for client component
    const snOrderMapObj: Record<string, { rentStartDate: string | null; returnDeadline: string | null }[]> = {}
    for (const [sn, entries] of snOrderMap.entries()) {
        snOrderMapObj[sn] = entries.map(e => ({
            rentStartDate: e.rentStartDate ? e.rentStartDate.toISOString() : null,
            returnDeadline: e.returnDeadline ? e.returnDeadline.toISOString() : null,
        }))
    }

    return (
        <div className="space-y-6 p-8">
            <h2 className="text-3xl font-bold tracking-tight">库存管理</h2>
            <InventoryClient 
                itemTypes={itemTypes} 
                warehouses={warehouses} 
                stocks={stocks} 
                items={items}
                snOrderMap={snOrderMapObj}
            />
        </div>
    )
}
