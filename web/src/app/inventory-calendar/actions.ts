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
            status: { notIn: ['SCRAPPED', 'LOST', 'SOLD', 'DELETED'] }
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
        let directStock = nameStockMap.get(p.name) || 0
        let hasSharedComponents = false
        const allBomItemTypes = new Set<string>()

        p.specs.forEach(spec => {
            spec.bomItems.forEach(bom => {
                if (allBomItemTypes.has(bom.itemTypeId)) {
                    hasSharedComponents = true
                }
                allBomItemTypes.add(bom.itemTypeId)
            })
        })

        // Fallback: If direct stock is 0 but we have specs with stock, try to derive a meaningful total.
        // This handles cases where user tracks stock at Spec level (via BOM) but views Product level.
        if (directStock === 0 && specsWithStock.length > 0) {
            if (hasSharedComponents) {
                // If components are shared (e.g. Bundles sharing a Body), use MAX to avoid overcounting
                // Example: 5 Bodies. Spec A (Body) has 5. Spec B (Body+Lens) has 5. Total is 5, not 10.
                directStock = Math.max(...specsWithStock.map(s => s.stock))
            } else {
                // If components are distinct (e.g. Colors/Sizes), use SUM
                // Example: 5 Red, 5 Blue. Total is 10.
                directStock = specsWithStock.reduce((acc, s) => acc + s.stock, 0)
            }
        }

        return {
            id: p.id,
            name: p.name,
            variants: p.variants, // Keep original variants JSON/Array
            matchKeywords: p.matchKeywords,
            totalStock: directStock, // Use direct stock match or derived fallback
            hasSharedComponents,
            specs: specsWithStock.map(s => ({
                id: s.id,
                specId: s.specId,
                name: s.name,
                stock: s.stock,
                bomItems: s.bomItems.map(b => ({
                    itemTypeId: b.itemTypeId,
                    quantity: b.quantity
                }))
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
                    'COMPLETED' 
                ]
            }
        },
        select: {
            id: true,
            orderNo: true,
            platform: true,
            xianyuOrderNo: true,
            miniProgramOrderNo: true,
            productName: true,
            variantName: true,
            rentStartDate: true,
            returnDeadline: true,
            status: true,
            productId: true,
            specId: true,
            sn: true, // Include SN for occupancy matching
            deliveryTime: true, // Actual delivery time
            actualDeliveryTime: true,
            completedAt: true,
        }
    })

    // Fetch online orders that occupy stock
    const onlineOrders = await prisma.onlineOrder.findMany({
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
            productId: true,
            specId: true,
            updatedAt: true,
            returnLatestLogisticsInfo: true,
            latestLogisticsInfo: true
        }
    })

    return { products, offlineOrders, onlineOrders, componentStock: Object.fromEntries(stockMap) }
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

export async function getInventoryItems(productName: string, variantName?: string) {
    // 1. Try to find InventoryItemType by exact name match (Product View logic)
    // If variantName is provided, we might be looking for a Spec's BOM.
    
    // Logic:
    // If variantName is present, we first look for the Spec to get BOM.
    // If no variantName, we look for ItemType with productName.

    let items: Array<Record<string, unknown>> = []

    if (variantName) {
        // Spec View: Find Product -> Spec -> BOM
        // First find product by name (assuming productName is valid)
        const product = await prisma.product.findFirst({
            where: { name: productName },
            include: {
                specs: {
                    where: { name: variantName },
                    include: {
                        bomItems: {
                            include: {
                                itemType: {
                                    include: {
                                        items: {
                                            where: { status: { notIn: ['SCRAPPED', 'LOST', 'SOLD', 'DELETED'] } },
                                            include: { warehouse: true }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })

        if (product?.specs[0]?.bomItems) {
            // Flatten BOM items
            items = product.specs[0].bomItems.flatMap(bom =>
                bom.itemType.items.map(item => ({
                    ...(item as unknown as Record<string, unknown>),
                    componentName: bom.itemType.name
                }))
            )
        }
    } else {
        // Item View: Find ItemType by name
        const itemType = await prisma.inventoryItemType.findFirst({
            where: { name: productName },
            include: {
                items: {
                    where: { status: { notIn: ['SCRAPPED', 'LOST', 'SOLD', 'DELETED'] } },
                    include: { warehouse: true }
                }
            }
        })

        if (itemType) {
            items = itemType.items
        } else {
            // Fallback: If no direct ItemType match, look for Product -> Specs -> BOMs
            // This aligns with the 'derived stock' logic in getInventoryData
            const product = await prisma.product.findFirst({
                where: { name: productName },
                include: {
                    specs: {
                        include: {
                            bomItems: {
                                include: {
                                    itemType: {
                                        include: {
                                            items: {
                                                    where: { status: { notIn: ['SCRAPPED', 'LOST', 'SOLD', 'DELETED'] } },
                                                    include: { warehouse: true }
                                                }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            })

            if (product) {
                // Collect all unique items from all BOMs
                const itemMap = new Map<string, Record<string, unknown>>()
                
                product.specs.forEach(spec => {
                    spec.bomItems.forEach(bom => {
                        bom.itemType.items.forEach(item => {
                            if (!itemMap.has(item.id)) {
                                itemMap.set(item.id, {
                                    ...(item as unknown as Record<string, unknown>),
                                    componentName: bom.itemType.name
                                })
                            }
                        })
                    })
                })
                
                items = Array.from(itemMap.values())
            }
        }
    }

    return items
}
