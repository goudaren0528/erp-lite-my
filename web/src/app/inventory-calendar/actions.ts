'use server'

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { parseISO, subDays, addDays } from "date-fns"

export async function getInventoryData(startStr: string, endStr: string) {
    const start = parseISO(startStr)
    const end = parseISO(endStr)
    
    // Extend query range to cover pre/post buffer days (start-2, end+3)
    // We fetch a bit wider range (e.g., +/- 7 days) to be safe
    const queryStart = subDays(start, 7)
    const queryEnd = addDays(end, 7)

    // Fetch inventory counts (serialized)
    const itemCounts = await prisma.inventoryItem.groupBy({
        by: ['itemTypeId'],
        where: {
            status: { notIn: ['SCRAPPED', 'LOST', 'SOLD'] }
        },
        _count: true
    })
    
    // Fetch inventory stocks (non-serialized)
    const stocks = await prisma.inventoryStock.findMany()

    // Fetch Inventory Item Types to map Names to Stocks
    const itemTypes = await prisma.inventoryItemType.findMany({
        select: { id: true, name: true }
    })
    
    // Build stock map (ItemTypeId -> Stock)
    const stockMap = new Map<string, number>()
    // Also build Name -> Stock map for Product view
    const nameStockMap = new Map<string, number>()

    // Helper to add to maps
    const addToMaps = (itemTypeId: string, qty: number) => {
        // ID Map
        stockMap.set(itemTypeId, (stockMap.get(itemTypeId) || 0) + qty)
        
        // Name Map
        const type = itemTypes.find(t => t.id === itemTypeId)
        if (type && type.name) {
            nameStockMap.set(type.name, (nameStockMap.get(type.name) || 0) + qty)
        }
    }

    itemCounts.forEach(i => {
        addToMaps(i.itemTypeId, i._count)
    })
    stocks.forEach(s => {
        addToMaps(s.itemTypeId, s.quantity)
    })

    // Fetch all products with specs and BOMs
    const productsDb = await prisma.product.findMany({
        select: { 
            id: true, 
            name: true, 
            variants: true, 
            matchKeywords: true, 
            specs: {
                include: {
                    bomItems: true
                }
            }
        }
    })

    // Calculate dynamic total stock based on BOM availability
    const products = productsDb.map(p => {
        // Calculate Spec Stocks (BOM based)
        const specsWithStock = p.specs?.map(spec => {
            if (!spec.bomItems || spec.bomItems.length === 0) return { ...spec, stock: 0 }
            
            // Aggregate BOM requirements by itemTypeId to handle duplicate entries
            const requirements = new Map<string, number>()
            spec.bomItems.forEach(bom => {
                requirements.set(bom.itemTypeId, (requirements.get(bom.itemTypeId) || 0) + bom.quantity)
            })

            // Find limiting factor
            let minBuildable = Number.MAX_SAFE_INTEGER
            
            for (const [itemTypeId, requiredQty] of requirements.entries()) {
                const available = stockMap.get(itemTypeId) || 0
                if (requiredQty <= 0) continue 
                
                const buildable = Math.floor(available / requiredQty)
                if (buildable < minBuildable) {
                    minBuildable = buildable
                }
            }
            
            // If no valid requirements found (e.g. all qty <= 0), default to 0 to be safe
            if (minBuildable === Number.MAX_SAFE_INTEGER) minBuildable = 0

            return { ...spec, stock: minBuildable }
        }) || []

        // Calculate Product Total Stock
        // Logic: Use direct stock of InventoryItemType with same name as Product
        // If not found, default to 0 (as per user requirement: "Item View unrelated to BOM")
        const directStock = nameStockMap.get(p.name) || 0

        return {
            id: p.id,
            name: p.name,
            variants: p.variants, // Keep original variants JSON/Array
            matchKeywords: p.matchKeywords,
            totalStock: directStock, // Use direct stock match
            specs: specsWithStock.map(s => ({
                id: s.id,
                name: s.name,
                stock: s.stock
            }))
        }
    })

    // Fetch offline orders that occupy stock
    const offlineOrders = await prisma.order.findMany({
        where: {
            OR: [
                {
                    rentStartDate: { lte: queryEnd },
                    returnDeadline: { gte: queryStart }
                },
                {
                    rentStartDate: { lte: queryEnd },
                    returnDeadline: null
                }
            ],
            status: {
                in: [
                    'PENDING_SHIPMENT', 
                    'SHIPPED_PENDING_CONFIRMATION', 
                    'PENDING_RECEIPT', 
                    'RENTING', 
                    'OVERDUE', 
                    'RETURNING',
                    'COMPLETED' // Include COMPLETED to check actual return time if needed, though usually COMPLETED frees up stock. 
                    // Wait, user wants forecast. If completed, it's done. 
                    // But if looking at past dates, we need history. 
                    // For simplicity and performance, we focus on active orders + recently completed if logic demands.
                    // But standard logic: if status is COMPLETED, it is NOT occupying stock NOW.
                    // However, for calendar view of the past, we might want to see it was occupied.
                    // Let's stick to active statuses for "Available Stock" calculation usually.
                    // But if user scrolls to last month, they expect to see what WAS occupied?
                    // Yes. So we should include COMPLETED but filter by actual return time.
                ]
            }
        },
        select: {
            id: true,
            orderNo: true,
            productName: true,
            variantName: true,
            rentStartDate: true,
            returnDeadline: true,
            status: true,
            productId: true,
            deliveryTime: true, // Actual delivery time
            // We need actual return time, usually updated at 'completedAt' or we can infer from logs or just use returnDeadline if not perfect.
            // Let's check if we have a return time field. Schema says 'returnLatestLogisticsInfo' but maybe not a date.
            // We'll use returnDeadline for now as base, and logic in client can handle 'COMPLETED' by checking if date < today?
            // Actually, if order is COMPLETED, we can assume it was returned.
            // For accurate history, we need 'actualReturnTime'.
            // Checking schema... Order has 'actualDeliveryTime'.
            // It has 'createdAt'.
            // Let's add 'actualDeliveryTime' to selection.
            actualDeliveryTime: true,
            completedAt: true,
        }
    })

    // Fetch online orders that occupy stock
    const onlineOrders = await prisma.onlineOrder.findMany({
        where: {
            rentStartDate: { lte: queryEnd },
            returnDeadline: { gte: queryStart },
            status: {
                notIn: ['TRADE_CLOSED', 'WAIT_BUYER_PAY', 'CANCELED', 'REFUNDED', '已关闭', '已取消', '已买断']
            }
        },
        select: {
            id: true,
            orderNo: true,
            productName: true,
            variantName: true,
            rentStartDate: true,
            returnDeadline: true,
            status: true,
            platform: true,
            updatedAt: true
        }
    })

    return { products, offlineOrders, onlineOrders }
}

type CalendarConfigRow = {
    productId?: string
    productName?: string
    totalStock?: number
    matchKeywords?: string | null
}

const parseKeywords = (raw?: string | null) => {
    if (!raw) return []
    return raw
        .split(/[\n,，;；、|]+/g)
        .map(v => v.trim())
        .filter(Boolean)
}

export async function getInventoryCalendarConfig() {
    const user = await getCurrentUser()
    const canManage = user?.role === 'ADMIN' || user?.permissions?.includes('inventory_manage')
    
    // Default values
    const config = {
        deliveryBufferDays: 2, // Days before rent start to occupy
        returnBufferDays: 3    // Days after return deadline to free up
    }
    
    if (!canManage) return config

    const appConfig = await prisma.appConfig.findUnique({
        where: { key: 'inventory_calendar_config' }
    })

    if (appConfig?.value) {
        try {
            const parsed = JSON.parse(appConfig.value)
            return { ...config, ...parsed }
        } catch {}
    }

    return config
}

export async function saveInventoryCalendarConfig(config: { deliveryBufferDays: number, returnBufferDays: number }) {
    const user = await getCurrentUser()
    const canManage = user?.role === 'ADMIN' || user?.permissions?.includes('inventory_manage')
    if (!canManage) return { success: false, message: "无权限操作" }

    await prisma.appConfig.upsert({
        where: { key: 'inventory_calendar_config' },
        create: {
            key: 'inventory_calendar_config',
            value: JSON.stringify(config)
        },
        update: {
            value: JSON.stringify(config)
        }
    })

    return { success: true, message: "配置已保存" }
}

