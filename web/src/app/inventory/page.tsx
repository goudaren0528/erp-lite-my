import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { InventoryClient } from "./client"

export default async function InventoryPage() {
    const user = await getCurrentUser()
    const canView = user?.role === 'ADMIN' || user?.permissions?.includes('inventory_manage')

    if (!canView) {
        redirect('/')
    }

    const itemTypes = await prisma.inventoryItemType.findMany({
        orderBy: { createdAt: 'desc' }
    })
    const warehouses = await prisma.warehouse.findMany({
        orderBy: { createdAt: 'desc' }
    })
    const stocks = await prisma.inventoryStock.findMany({
        include: { itemType: true, warehouse: true },
        orderBy: { updatedAt: 'desc' }
    })
    const items = await prisma.inventoryItem.findMany({
        include: { itemType: true, warehouse: true },
        orderBy: { updatedAt: 'desc' }
    })

    return (
        <div className="space-y-6 p-8">
            <h2 className="text-3xl font-bold tracking-tight">库存管理</h2>
            <InventoryClient 
                itemTypes={itemTypes} 
                warehouses={warehouses} 
                stocks={stocks} 
                items={items} 
            />
        </div>
    )
}
