'use client'

import { useState, useEffect, useMemo } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, addDays, subDays, startOfDay, isBefore } from "date-fns"
import { zhCN } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Loader2, Settings, ExternalLink, Calendar as CalendarIcon, Table as TableIcon } from "lucide-react"
import { getInventoryData, getInventoryCalendarConfig, saveInventoryCalendarConfig, getInventoryItems } from "./actions"
import { toast } from "sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
  } from "@/components/ui/pagination"

// Status Translation Map
const statusMap: Record<string, { label: string; color: string }> = {
    PENDING_PAYMENT: { label: '待支付', color: 'bg-yellow-100 text-yellow-800' },
    PENDING_REVIEW: { label: '待审核', color: 'bg-orange-100 text-orange-800' },
    PENDING_SHIPMENT: { label: '待发货', color: 'bg-blue-100 text-blue-800' },
    SHIPPED_PENDING_CONFIRMATION: { label: '已发货', color: 'bg-indigo-100 text-indigo-800' },
    PENDING_RECEIPT: { label: '待收货', color: 'bg-blue-100 text-blue-800' },
    RENTING: { label: '待归还', color: 'bg-green-100 text-green-800' },
    OVERDUE: { label: '已逾期', color: 'bg-red-100 text-red-800' },
    RETURNING: { label: '归还中', color: 'bg-purple-100 text-purple-800' },
    COMPLETED: { label: '已完成', color: 'bg-gray-100 text-gray-800' },
    BOUGHT_OUT: { label: '已购买', color: 'bg-emerald-100 text-emerald-800' },
    CLOSED: { label: '已关闭', color: 'bg-gray-100 text-gray-600' },
    CANCELED: { label: '已取消', color: 'bg-gray-100 text-gray-600' },
    
    // Inventory Status
    AVAILABLE: { label: '可用', color: 'bg-emerald-50 text-emerald-700' },
    SCRAPPED: { label: '已报废', color: 'bg-red-100 text-red-800' },
    LOST: { label: '已丢失', color: 'bg-gray-100 text-gray-800' },
    SOLD: { label: '已售出', color: 'bg-blue-100 text-blue-800' },
    DELETED: { label: '已删除', color: 'bg-gray-200 text-gray-500' },
    REPAIRING: { label: '维修中', color: 'bg-yellow-100 text-yellow-800' },
    INSPECTION: { label: '检测中', color: 'bg-orange-100 text-orange-800' },

    // Chinese status fallback
    待审核: { label: "待审核", color: "bg-orange-100 text-orange-800" },
    待发货: { label: "待发货", color: "bg-blue-100 text-blue-800" },
    已发货待确认: { label: "已发货", color: "bg-indigo-100 text-indigo-800" },
    待收货: { label: "待收货", color: "bg-blue-100 text-blue-800" },
    待归还: { label: "待归还", color: "bg-green-100 text-green-800" },
    已逾期: { label: "已逾期", color: "bg-red-100 text-red-800" },
    设备归还中: { label: "归还中", color: "bg-purple-100 text-purple-800" },
    已完成: { label: "已完成", color: "bg-gray-100 text-gray-800" },
    已购买: { label: "已购买", color: "bg-emerald-100 text-emerald-800" },
    已关闭: { label: "已关闭", color: "bg-gray-100 text-gray-600" },
}

// Platform Translation Map
const platformMap: Record<string, string> = {
    TAOBAO: "淘宝",
    XIANYU: "闲鱼",
    ZANCHEN: "赞晨",
    OTHER: "其他"
}

// Helper to get status display
const getStatusDisplay = (status: string) => {
    return statusMap[status] || { label: status, color: 'bg-gray-100 text-gray-800' }
}

const getPlatformDisplay = (platform?: string | null) => {
    if (!platform) return "-"
    return platformMap[platform] || platform
}

const getDisplayOrderNo = (order: OrderSimple) => {
    if (order.isOnline) return order.orderNo
    return order.xianyuOrderNo || order.miniProgramOrderNo || order.orderNo
}

const extractSignedAt = (raw?: string | null) => {
    if (!raw) return null
    const match = raw.match(/签收时间:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*([0-9]{2}:[0-9]{2}:[0-9]{2})/)
    if (!match) return null
    return new Date(`${match[1]}T${match[2]}`)
}

const StatsCell = ({ available, inCount, outCount, compact = false, onInClick, onOutClick, onStockClick }: { available: number, inCount: number, outCount: number, compact?: boolean, onInClick?: () => void, onOutClick?: () => void, onStockClick?: () => void }) => {
    const textSize = compact ? 'text-[10px]' : 'text-xs'
    const gap = compact ? 'gap-0' : 'gap-1'
    const bgClass = available <= 0 ? 'bg-red-100/70' : available < 2 ? 'bg-yellow-100/70' : 'bg-emerald-50/70'

    const getClickableClass = (handler?: () => void) => 
        handler ? "cursor-pointer hover:underline underline-offset-2" : "cursor-default"

    return (
        <div className={`flex flex-col justify-center h-full w-full ${textSize} ${gap} ${bgClass} rounded-sm`}>
            <div className={`flex justify-center items-center text-foreground ${getClickableClass(onInClick)}`} onClick={onInClick}>
                入库: {inCount}
            </div>
            <div className={`flex justify-center items-center text-foreground ${getClickableClass(onOutClick)}`} onClick={onOutClick}>
                出库: {outCount}
            </div>
            <div className={`flex justify-center items-center text-foreground ${getClickableClass(onStockClick)}`} onClick={onStockClick}>
                在库: {available}
            </div>
        </div>
    )
}

// Types
type BomItem = {
    itemTypeId: string
    quantity: number
}

type ProductSpec = {
    id: string
    name: string
    stock: number
    bomItems?: BomItem[]
}

type Product = {
    id: string
    name: string
    variants: any[]
    matchKeywords: string | null
    totalStock: number
    hasSharedComponents?: boolean
    specs?: ProductSpec[]
}

type OrderSimple = {
    id: string
    orderNo: string
    productName: string | null
    variantName: string | null
    productId?: string | null
    specId?: string | null
    rentStartDate: Date | null
    returnDeadline: Date | null
    status: string
    isOnline?: boolean
    deliveryTime?: Date | null
    actualDeliveryTime?: Date | null
    completedAt?: Date | null
    platform?: string | null
    xianyuOrderNo?: string | null
    miniProgramOrderNo?: string | null
    sn?: string | null
}

type InventoryItem = {
    id: string
    sn: string | null
    status: string
    warehouse: { name: string }
    componentName?: string
}

interface InventoryCalendarClientProps {
    canManage: boolean
}

export function InventoryCalendarClient({ canManage }: InventoryCalendarClientProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [products, setProducts] = useState<Product[]>([])
    const [orders, setOrders] = useState<OrderSimple[]>([])
    const [componentStock, setComponentStock] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)
    
    // Config state
    const [deliveryBufferDays, setDeliveryBufferDays] = useState(2)
    const [returnBufferDays, setReturnBufferDays] = useState(3)
    const [isSavingConfig, setIsSavingConfig] = useState(false)
    const [isConfigOpen, setIsConfigOpen] = useState(false)
    
    // View mode: "calendar" or "table"
    const [viewMode, setViewMode] = useState<"calendar" | "table">("calendar")
    
    // Tab state: "item" (Product) or "spec" (Variant)
    const [activeTab, setActiveTab] = useState("item")
    
    // Selection state
    const [selectedProductId, setSelectedProductId] = useState<string>("ALL")
    const [selectedVariantId, setSelectedVariantId] = useState<string>("ALL") // Composite ID: productId:specName
    
    // Sheet state
    const [sheetOpen, setSheetOpen] = useState(false)
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [selectedDayOrders, setSelectedDayOrders] = useState<OrderSimple[]>([])
    const [selectedDayType, setSelectedDayType] = useState<'occupy' | 'in' | 'out' | 'stock'>('occupy')
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
    const [loadingItems, setLoadingItems] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const pageSize = 10

    // Fetch config
    useEffect(() => {
        getInventoryCalendarConfig().then(config => {
            setDeliveryBufferDays(config.deliveryBufferDays)
            setReturnBufferDays(config.returnBufferDays)
        })
    }, [])

    const handleSaveConfig = async () => {
        setIsSavingConfig(true)
        try {
            const res = await saveInventoryCalendarConfig({ deliveryBufferDays, returnBufferDays })
            if (res.success) {
                toast.success(res.message)
                setIsConfigOpen(false)
                setRefreshKey(v => v + 1) // Refresh to apply new calculation
            } else {
                toast.error(res.message)
            }
        } catch (e) {
            toast.error("保存失败")
        } finally {
            setIsSavingConfig(false)
        }
    }

    // Fetch data
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            try {
                const start = startOfMonth(currentMonth)
                // Fetch two months
                const nextMonth = addMonths(currentMonth, 1)
                const end = endOfMonth(nextMonth)
                const startStr = format(start, 'yyyy-MM-dd')
                const endStr = format(end, 'yyyy-MM-dd')
                
                const res = await getInventoryData(startStr, endStr)
                
                const parsedProducts = res.products.map((p: any) => ({
                    ...p,
                    variants: typeof p.variants === 'string' ? JSON.parse(p.variants) : p.variants
                }))

                setProducts(parsedProducts)
                setComponentStock(res.componentStock || {})
                
                // Set default selection if empty
                if (parsedProducts.length > 0) {
                     // Only set if not already set or invalid
                     if ((!selectedProductId || selectedProductId === "ALL") && viewMode === 'calendar') {
                         setSelectedProductId(parsedProducts[0].id)
                     }
                }
                
                const combinedOrders: OrderSimple[] = [
                    ...res.offlineOrders.map(o => ({ 
                        ...o, 
                        isOnline: false,
                        rentStartDate: o.rentStartDate ? new Date(o.rentStartDate) : null,
                        returnDeadline: o.returnDeadline ? new Date(o.returnDeadline) : null,
                        deliveryTime: o.deliveryTime ? new Date(o.deliveryTime) : null,
                        actualDeliveryTime: o.actualDeliveryTime ? new Date(o.actualDeliveryTime) : null,
                        completedAt: o.completedAt ? new Date(o.completedAt) : null
                    })),
                    ...res.onlineOrders.map(o => {
                        const isCompleted = ['TRADE_SUCCESS', 'COMPLETED', 'FINISHED', '已完成'].includes(o.status)
                        const completedAt = isCompleted ? (extractSignedAt(o.returnLatestLogisticsInfo) || null) : null

                        return {
                            ...o, 
                            isOnline: true, 
                            rentStartDate: o.rentStartDate ? new Date(o.rentStartDate) : null,
                            returnDeadline: o.returnDeadline ? new Date(o.returnDeadline) : null,
                            completedAt
                        }
                    })
                ]
                setOrders(combinedOrders)
            } catch (e) {
                toast.error("Failed to load inventory data")
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [currentMonth, refreshKey])

    // Helper: Map order to product ID
    const getOrderProductId = (order: OrderSimple) => {
        if (order.productId) return order.productId
        
        // Match by name or keywords
        const p = products.find(p => {
            if (p.name === order.productName) return true
            if (p.matchKeywords) {
                try {
                    const keywords = JSON.parse(p.matchKeywords)
                    if (Array.isArray(keywords)) {
                        return keywords.some(k => order.productName?.includes(k) || (order as any).itemTitle?.includes(k))
                    }
                } catch {}
            }
            return false
        })
        return p?.id || "UNKNOWN"
    }

    const specLookup = useMemo(() => {
        const byId = new Map<string, { spec: ProductSpec; product: Product }>()
        const byName = new Map<string, { spec: ProductSpec; product: Product }>()
        products.forEach(p => {
            p.specs?.forEach(s => {
                byId.set(s.id, { spec: s, product: p })
                byName.set(`${p.id}:${s.name}`, { spec: s, product: p })
            })
        })
        return { byId, byName }
    }, [products])

    const getOrderSpecInfo = (order: OrderSimple) => {
        if (order.specId) {
            const hit = specLookup.byId.get(order.specId)
            if (hit) return hit
        }
        const pid = getOrderProductId(order)
        if (pid && order.variantName) {
            const hit = specLookup.byName.get(`${pid}:${order.variantName}`)
            if (hit) return hit
        }
        return null
    }

    // Flattened variants for Spec View
    const allVariants = useMemo(() => {
        return products.flatMap(p => {
            // Use specs if available (contains stock), otherwise fallback to variants (names only)
            if (p.specs && p.specs.length > 0) {
                return p.specs.map(s => ({
                    id: s.id,
                    name: s.name,
                    productId: p.id,
                    productName: p.name,
                    fullName: `${p.name} - ${s.name}`,
                    stock: s.stock
                }))
            }
            
            // Fallback for legacy data without specs relation
            const vars = Array.isArray(p.variants) ? p.variants : []
            return vars.map((v: any) => ({
                id: v.specId || `${p.id}:${v.name}`,
                name: v.name,
                productId: p.id,
                productName: p.name,
                fullName: `${p.name} - ${v.name}`,
                stock: 0
            }))
        })
    }, [products])

    // Enforce selection in Calendar view
    useEffect(() => {
        if (viewMode === 'calendar') {
            if ((!selectedProductId || selectedProductId === 'ALL') && products.length > 0) {
                setSelectedProductId(products[0].id)
            }
        }
    }, [viewMode, products, selectedProductId])

    useEffect(() => {
        if (viewMode === 'calendar' && activeTab === 'spec') {
            if ((!selectedVariantId || selectedVariantId === 'ALL') && allVariants.length > 0) {
                setSelectedVariantId(allVariants[0].id)
            }
        }
    }, [viewMode, activeTab, allVariants, selectedVariantId])

    // Occupancy calculation logic
    const getOrderOccupancyRange = (o: OrderSimple) => {
        // Skip canceled/closed orders explicitly (though server should filter them)
        if (['CANCELED', 'CLOSED', 'REFUNDED', 'TRADE_CLOSED', '已关闭', '已取消'].includes(o.status)) return null

        if (!o.rentStartDate) return null
        
        let start = subDays(new Date(o.rentStartDate), deliveryBufferDays)
        // Default end is return deadline + buffer
        // If no return deadline (unlikely for valid order), use start + 30 days
        let endRaw = o.returnDeadline ? new Date(o.returnDeadline) : addDays(new Date(o.rentStartDate), 30)
        
        // If order is completed/returned, stock is freed upon completion
        // We use completedAt as the point where stock becomes available again.
        // However, 'end' represents the LAST day of occupancy.
        if (o.completedAt) {
            // Always use actual completion time if available, regardless of whether it's early or late
            endRaw = new Date(o.completedAt)
        }

        let end = addDays(endRaw, returnBufferDays)
        
        let outDate = start
        if (o.actualDeliveryTime || o.deliveryTime) {
            const delivery = new Date(o.actualDeliveryTime || o.deliveryTime!)
            if (delivery < start) {
                start = delivery
            }
            outDate = delivery
        }

        start.setHours(0,0,0,0)
        end.setHours(23,59,59,999)
        
        return { start, end, outDate }
    }

    const aggregateBomItems = (items?: BomItem[]) => {
        if (!items || items.length === 0) return null
        const map = new Map<string, number>()
        items.forEach(i => {
            map.set(i.itemTypeId, (map.get(i.itemTypeId) || 0) + i.quantity)
        })
        return map
    }

    const computeBuildable = (items?: BomItem[], occupied?: Map<string, number>) => {
        const requirements = aggregateBomItems(items)
        if (!requirements) return null
        let minBuildable = Number.MAX_SAFE_INTEGER

        requirements.forEach((requiredQty, itemTypeId) => {
            if (requiredQty <= 0) return
            const base = componentStock[itemTypeId] || 0
            const used = occupied?.get(itemTypeId) || 0
            const available = Math.max(0, base - used)
            const buildable = Math.floor(available / requiredQty)
            if (buildable < minBuildable) minBuildable = buildable
        })

        if (minBuildable === Number.MAX_SAFE_INTEGER) return 0
        return minBuildable
    }

    // New helper: Calculate daily stats (In/Out/Occupied)
    const calculateDailyStats = (date: Date, relevantOrders: OrderSimple[], totalStock: number) => {
        let occupiedCount = 0
        let inCount = 0
        let outCount = 0
        const occupiedComponents = new Map<string, number>()

        relevantOrders.forEach(o => {
            const range = getOrderOccupancyRange(o)
            if (!range) return

            if (date >= range.start && date <= range.end) {
                occupiedCount++
                const specInfo = getOrderSpecInfo(o)
                const requirements = aggregateBomItems(specInfo?.spec.bomItems)
                if (requirements) {
                    requirements.forEach((qty, itemTypeId) => {
                        occupiedComponents.set(itemTypeId, (occupiedComponents.get(itemTypeId) || 0) + qty)
                    })
                }
            }

            if (isSameDay(date, range.end)) {
                inCount++
            }

            const outDate = range.outDate || range.start
            if (isSameDay(date, outDate)) {
                outCount++
            }
        })

        let availableByBom: number | null = null

        if (activeTab === 'spec') {
            const selectedVariant = allVariants.find(v => v.id === selectedVariantId)
            const specInfo = selectedVariant ? specLookup.byId.get(selectedVariant.id) : null
            const buildable = computeBuildable(specInfo?.spec.bomItems, occupiedComponents)
            if (buildable !== null) availableByBom = buildable
        } else {
            const product = products.find(p => p.id === selectedProductId)
            if (product?.specs && product.specs.length > 0) {
                const specBuildables = product.specs
                    .map(s => computeBuildable(s.bomItems, occupiedComponents))
                    .filter((v): v is number => v !== null)
                if (specBuildables.length > 0) {
                    availableByBom = product.hasSharedComponents
                        ? Math.max(...specBuildables)
                        : specBuildables.reduce((acc, v) => acc + v, 0)
                }
            }
        }

        const available = availableByBom !== null ? availableByBom : Math.max(0, totalStock - occupiedCount)
        const occupied = Math.max(0, totalStock - available)

        return {
            occupied,
            available,
            inCount,
            outCount
        }
    }

    // Filtered orders
    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            if (!getOrderSpecInfo(o)) return false
            const pid = getOrderProductId(o)
            
            if (activeTab === "item") {
                if (!selectedProductId) return false
                return pid === selectedProductId
            } else {
                if (!selectedVariantId) return false
                const selectedVariant = allVariants.find(v => v.id === selectedVariantId)
                if (!selectedVariant) return false

                if (pid !== selectedVariant.productId) return false

                if (o.specId) {
                    return o.specId === selectedVariant.id
                }

                return o.variantName === selectedVariant.name
            }
        })
    }, [orders, activeTab, selectedProductId, selectedVariantId, products, allVariants])

    // Generate Calendar Days
    const calendarDays = useMemo(() => {
        const start = startOfMonth(currentMonth)
        const end = endOfMonth(currentMonth)
        return eachDayOfInterval({ start, end })
    }, [currentMonth])

    // Get current stock capacity
    const currentStock = useMemo(() => {
        if (activeTab === "item") {
            const p = products.find(p => p.id === selectedProductId)
            return p?.totalStock || 0
        } else {
            const v = allVariants.find(v => v.id === selectedVariantId)
            return v?.stock || 0
        }
    }, [activeTab, selectedProductId, selectedVariantId, products, allVariants])

    const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1))
    const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1))

    const handleDayClick = async (day: Date, orders: OrderSimple[], type: 'occupy' | 'in' | 'out' | 'stock') => {
        setSelectedDate(day)
        setSelectedDayType(type)
        setSelectedDayOrders(orders)
        
        if (type === 'stock') {
            setLoadingItems(true)
            setInventoryItems([])
            
            let pName = ''
            let vName: string | undefined = undefined
            
            if (activeTab === 'item') {
                const p = products.find(p => p.id === selectedProductId)
                if (p) pName = p.name
            } else {
                const v = allVariants.find(v => v.id === selectedVariantId)
                if (v) {
                    pName = v.productName
                    vName = v.name
                }
            }
            
            if (pName) {
                try {
                    const items = await getInventoryItems(pName, vName)
                    setInventoryItems(items)
                } catch (e) {
                    toast.error("Failed to load inventory details")
                } finally {
                    setLoadingItems(false)
                }
            } else {
                setLoadingItems(false)
            }
        }

        setCurrentPage(1) // Reset pagination
        setSheetOpen(true)
    }

    const openOrder = (order: OrderSimple) => {
        if (order.isOnline) {
            window.open(`/online-orders?q=${encodeURIComponent(order.orderNo)}`, '_blank')
        } else {
            window.open(`/orders?q=${encodeURIComponent(order.orderNo)}`, '_blank')
        }
    }

    // Pagination logic
    const totalPages = Math.ceil(selectedDayOrders.length / pageSize)
    const currentSheetOrders = selectedDayOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    const dayTypeLabel = selectedDayType === 'in' ? '入库' : selectedDayType === 'out' ? '出库' : selectedDayType === 'stock' ? '在库' : '占用'
    const dayEmptyLabel = selectedDayType === 'in' ? '无入库记录' : selectedDayType === 'out' ? '无出库记录' : selectedDayType === 'stock' ? '无库存记录' : '无占用记录'

    // Calendar view render
    const renderCalendarView = () => (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {[currentMonth, addMonths(currentMonth, 1)].map((monthDate, index) => {
                const days = eachDayOfInterval({
                    start: startOfMonth(monthDate),
                    end: endOfMonth(monthDate)
                })
                
                return (
                    <div key={index} className="space-y-2">
                        <div className="text-center font-medium py-1 text-sm bg-muted/10 rounded">
                            {format(monthDate, 'yyyy年 MM月', { locale: zhCN })}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2 bg-muted/30 rounded-sm">
                                    {day}
                                </div>
                            ))}
                            
                            {/* Empty cells for start of month */}
                            {Array.from({ length: startOfMonth(monthDate).getDay() }).map((_, i) => (
                                <div key={`empty-${i}`} className="h-32 bg-muted/5 rounded-md border border-dashed border-muted/20" />
                            ))}

                            {/* Days */}
                            {days.map(day => {
                                const stats = calculateDailyStats(day, filteredOrders, currentStock)
                                const dayInOrders = filteredOrders.filter(o => {
                                    const range = getOrderOccupancyRange(o)
                                    return range && isSameDay(day, range.end)
                                })
                                const dayOutOrders = filteredOrders.filter(o => {
                                    const range = getOrderOccupancyRange(o)
                                    if (!range) return false
                                    const outDate = range.outDate || range.start
                                    return isSameDay(day, outDate)
                                })
                                const dayOccupancy = filteredOrders.filter(o => {
                                    const range = getOrderOccupancyRange(o)
                                    return range && day >= range.start && day <= range.end
                                })
                                
                                let statusColor = "bg-green-500/10 border-green-500/30 text-green-700"
                                if (stats.available <= 0) statusColor = "bg-red-500/10 border-red-500/30 text-red-700"
                                else if (stats.available < 2) statusColor = "bg-yellow-500/10 border-yellow-500/30 text-yellow-700"
                                
                                const isToday = isSameDay(day, new Date())
                                const isPast = isBefore(day, startOfDay(new Date()))

                                return (
                                    <div 
                                        key={day.toString()} 
                                        className={`min-h-[120px] p-2 rounded-md border hover:shadow-sm transition-all flex flex-col justify-between
                                            ${isToday ? 'ring-2 ring-primary ring-offset-1' : 'border-border'}
                                            ${isPast ? 'bg-gray-100 text-muted-foreground grayscale' : ''}
                                        `}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`text-sm font-medium ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</span>
                                        </div>
                                        
                                        <div className="flex-1">
                                            <StatsCell 
                                                available={stats.available}
                                                inCount={stats.inCount}
                                                outCount={stats.outCount}
                                                compact={false}
                                                onInClick={() => handleDayClick(day, dayInOrders, 'in')}
                                                onOutClick={() => handleDayClick(day, dayOutOrders, 'out')}
                                                onStockClick={() => handleDayClick(day, dayOccupancy, 'stock')}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })}
        </div>
    )


    // Pre-calculate orders per product/variant to avoid O(N*M) filtering
    const productOrderMap = useMemo(() => {
        const map = new Map<string, OrderSimple[]>()
        
        // Helper to add order to map
        const addToMap = (key: string, o: OrderSimple) => {
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(o)
        }

        orders.forEach(o => {
            const pid = getOrderProductId(o)
            
            // For Item View: Key is ProductId
            addToMap(pid, o)
            
            // For Spec View: Key is ProductId:VariantName
            if (o.variantName) {
                const specKey = `${pid}:${o.variantName}`
                addToMap(specKey, o)
            }
        })
        
        return map
    }, [orders, products])

    // Pre-calculate daily stats for a specific set of orders
    // Returns a Map<DayString, Stats>
    const getDailyStatsMap = (relevantOrders: OrderSimple[], totalStock: number, start: Date, end: Date) => {
        const statsMap = new Map<string, { occupied: number, available: number, inCount: number, outCount: number }>()
        
        // Initialize map for the range? Or just compute on the fly?
        // Computing on the fly for each day is slow.
        // Better: Iterate orders and mark days.
        
        // But we need to support random access by day.
        // Let's iterate orders and populate a map of days.
        
        relevantOrders.forEach(o => {
            const range = getOrderOccupancyRange(o)
            if (!range) return

            // Optimization: Only process if range overlaps with view window
            if (range.end < start || range.start > end) return

            // Iterate days in range
            let current = range.start < start ? start : range.start
            const last = range.end > end ? end : range.end
            
            // Check Out (Start Date)
            // Even if start is before view window, we might want to know? 
            // No, only if start is IN view window.
            const outDate = range.outDate || range.start
            if (outDate >= start && outDate <= end) {
                const k = outDate.toDateString()
                if (!statsMap.has(k)) statsMap.set(k, { occupied: 0, available: totalStock, inCount: 0, outCount: 0 })
                statsMap.get(k)!.outCount++
            }
            
            // Check In (End Date)
            if (range.end >= start && range.end <= end) {
                const k = range.end.toDateString()
                if (!statsMap.has(k)) statsMap.set(k, { occupied: 0, available: totalStock, inCount: 0, outCount: 0 })
                statsMap.get(k)!.inCount++
            }

            // Occupancy
            // Loop from current to last
            // This loop can still be slow if range is huge (e.g. 1 year rental).
            // But usually rentals are short.
            // If range is huge, maybe we shouldn't loop?
            // For 60 days view, max loop is 60. Acceptable.
            for (let d = new Date(current); d <= last; d.setDate(d.getDate() + 1)) {
                const k = d.toDateString()
                if (!statsMap.has(k)) statsMap.set(k, { occupied: 0, available: totalStock, inCount: 0, outCount: 0 })
                statsMap.get(k)!.occupied++
            }
        })
        
        // Post-process availability
        // We initialized available = totalStock, now subtract occupied
        for (const val of statsMap.values()) {
            val.available = Math.max(0, totalStock - val.occupied)
        }
        
        return statsMap
    }

    // Table view render
    const tableData = useMemo(() => {
        if (viewMode !== 'table') return []
        
        // Always start from today for table view
        const start = startOfDay(new Date())
        const end = addDays(start, 60) // Show next 60 days

        let rows = activeTab === "item" 
            ? products.map(p => ({
                id: p.id,
                name: p.name,
                stock: p.totalStock,
                key: p.id
            }))
            : allVariants.map(v => ({
                id: v.id,
                name: v.fullName,
                stock: v.stock,
                key: v.id
            }))

        // Filter rows based on selection
        if (activeTab === "item" && selectedProductId && selectedProductId !== "ALL") {
            rows = rows.filter(r => r.id === selectedProductId)
        } else if (activeTab === "spec" && selectedVariantId && selectedVariantId !== "ALL") {
            rows = rows.filter(r => r.id === selectedVariantId)
        }

        return rows.map(row => {
            const rowOrders = productOrderMap.get(row.key) || []
            const statsMap = getDailyStatsMap(rowOrders, row.stock, start, end)
            return { ...row, statsMap }
        })
    }, [viewMode, activeTab, products, allVariants, productOrderMap, selectedProductId, selectedVariantId])

    const renderTableView = () => {
        // Generate 60 days from today
        const start = startOfDay(new Date())
        const end = addDays(start, 60)
        const days = eachDayOfInterval({ start, end })

        return (
            <div className="overflow-hidden border rounded-md">
                <div className="overflow-x-auto">
                    <div className="inline-block min-w-full align-middle">
                        <div className="max-h-[80vh] overflow-y-auto relative">
                            <table className="min-w-full divide-y divide-border border-separate border-spacing-0">
                                <thead className="bg-muted/50 sticky top-0 z-20">
                                    <tr>
                                        <th scope="col" className="sticky left-0 z-30 bg-background px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-[200px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-b">
                                            商品/规格
                                        </th>
                                        {days.map(day => {
                                            const isToday = isSameDay(day, new Date())
                                            return (
                                                <th key={day.toString()} className={`px-2 py-3 text-center text-xs font-medium text-muted-foreground min-w-[50px] border-l border-b ${isToday ? 'bg-primary/5 text-primary' : ''}`}>
                                                    <div className="whitespace-nowrap">{format(day, 'MM-dd')}</div>
                                                    <div className="text-[10px] font-normal">{format(day, 'EE', { locale: zhCN })}</div>
                                                </th>
                                            )
                                        })}
                                    </tr>
                                </thead>
                                <tbody className="bg-background divide-y divide-border">
                                    {tableData.map((row, rowIndex) => {
                                        const rowOrders = productOrderMap.get(row.key) || []
                                        const statsMap = row.statsMap
                                        const zebra = rowIndex % 2 === 1
                                        
                                        return (
                                            <tr key={row.id} className={`group ${zebra ? 'bg-muted/60' : ''} hover:bg-muted/70`}>
                                                <td className={`sticky left-0 z-10 px-3 py-2 whitespace-nowrap text-sm font-medium text-foreground border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${zebra ? 'bg-muted/60' : 'bg-background'} group-hover:bg-muted/70`}>
                                                    <div className="flex flex-col">
                                                        <span>{row.name}</span>
                                                        <span className="text-xs text-muted-foreground font-normal">库存: {row.stock}</span>
                                                    </div>
                                                </td>
                                                {days.map(day => {
                                                    const dateKey = day.toDateString()
                                                    const stats = statsMap.get(dateKey) || { occupied: 0, available: row.stock, inCount: 0, outCount: 0 }
                                                    const dayInOrders = rowOrders.filter(o => {
                                                        const range = getOrderOccupancyRange(o)
                                                        return range && isSameDay(day, range.end)
                                                    })
                                                    const dayOutOrders = rowOrders.filter(o => {
                                                        const range = getOrderOccupancyRange(o)
                                                        if (!range) return false
                                                        const outDate = range.outDate || range.start
                                                        return isSameDay(day, outDate)
                                                    })
                                                    const dayOccupancy = rowOrders.filter(o => {
                                                        const range = getOrderOccupancyRange(o)
                                                        return range && day >= range.start && day <= range.end
                                                    })

                                                    return (
                                                        <td 
                                                            key={day.toString()} 
                                                            className={`px-1 py-1 text-center border-l hover:brightness-95 transition-all p-0`}
                                                        >
                                                            <div className="h-full min-h-[40px]">
                                                                <StatsCell 
                                                                    available={stats.available}
                                                                    inCount={stats.inCount}
                                                                    outCount={stats.outCount}
                                                                    compact={true}
                                                                    onInClick={() => handleDayClick(day, dayInOrders, 'in')}
                                                                    onOutClick={() => handleDayClick(day, dayOutOrders, 'out')}
                                                                    onStockClick={() => handleDayClick(day, dayOccupancy, 'stock')}
                                                                />
                                                            </div>
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-2">
                    <div className="flex bg-muted p-1 rounded-lg">
                        <Button 
                            variant={viewMode === 'calendar' ? 'default' : 'ghost'} 
                            size="sm" 
                            onClick={() => setViewMode('calendar')}
                            className="h-8 px-2"
                        >
                            <CalendarIcon className="h-4 w-4 mr-1" />
                            日历
                        </Button>
                        <Button 
                            variant={viewMode === 'table' ? 'default' : 'ghost'} 
                            size="sm" 
                            onClick={() => setViewMode('table')}
                            className="h-8 px-2"
                        >
                            <TableIcon className="h-4 w-4 mr-1" />
                            表格
                        </Button>
                    </div>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[200px]">
                        <TabsList>
                            <TabsTrigger value="item">物品库存</TabsTrigger>
                            <TabsTrigger value="spec">规格库存</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    
                    {activeTab === "item" ? (
                        <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                            <SelectTrigger className="w-[250px]">
                                <SelectValue placeholder="选择商品" />
                            </SelectTrigger>
                            <SelectContent>
                                {viewMode === 'table' && <SelectItem value="ALL">全部商品</SelectItem>}
                                {products.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                            <SelectTrigger className="w-[300px]">
                                <SelectValue placeholder="选择规格" />
                            </SelectTrigger>
                            <SelectContent>
                                {viewMode === 'table' && <SelectItem value="ALL">全部规格</SelectItem>}
                                {allVariants.map(v => (
                                    <SelectItem key={v.id} value={v.id}>{v.fullName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {canManage && (
                        <Popover open={isConfigOpen} onOpenChange={setIsConfigOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="icon">
                                    <Settings className="h-4 w-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80">
                                <div className="grid gap-4">
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none">占用计算配置</h4>
                                        <p className="text-sm text-muted-foreground">
                                            设置订单前后的库存占用缓冲时间
                                        </p>
                                    </div>
                                    <div className="grid gap-2">
                                        <div className="grid grid-cols-3 items-center gap-4">
                                            <Label htmlFor="deliveryBuffer">发货缓冲</Label>
                                            <div className="col-span-2 flex items-center gap-2">
                                                <Input
                                                    id="deliveryBuffer"
                                                    type="number"
                                                    value={deliveryBufferDays}
                                                    onChange={(e) => setDeliveryBufferDays(Number(e.target.value))}
                                                    className="h-8"
                                                />
                                                <span className="text-xs text-muted-foreground">天</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 items-center gap-4">
                                            <Label htmlFor="returnBuffer">归还缓冲</Label>
                                            <div className="col-span-2 flex items-center gap-2">
                                                <Input
                                                    id="returnBuffer"
                                                    type="number"
                                                    value={returnBufferDays}
                                                    onChange={(e) => setReturnBufferDays(Number(e.target.value))}
                                                    className="h-8"
                                                />
                                                <span className="text-xs text-muted-foreground">天</span>
                                            </div>
                                        </div>
                                    </div>
                                    <Button onClick={handleSaveConfig} disabled={isSavingConfig}>
                                        {isSavingConfig && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        保存配置
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>
                    )}
                    <div className="flex items-center gap-1 border rounded-md p-1 bg-muted/20">
                        <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-8 w-8">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm font-medium px-2">
                            {format(currentMonth, 'yyyy年MM月', { locale: zhCN })} - {format(addMonths(currentMonth, 1), 'yyyy年MM月', { locale: zhCN })}
                        </span>
                        <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-8 w-8">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <span>库存日历 - {activeTab === "item" ? "物品视图" : "规格视图"}</span>
                            <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                总容量: {currentStock}
                            </span>
                        </div>
                        <div className="flex gap-4 text-xs font-normal text-muted-foreground">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500"></span> 充足</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500"></span> 紧张</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500"></span> 缺货</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-200 border border-gray-300"></span> 过去</span>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        viewMode === 'calendar' ? renderCalendarView() : renderTableView()
                    )}
                </CardContent>
            </Card>

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>
                            {selectedDate && format(selectedDate, 'yyyy年MM月dd日', { locale: zhCN })} {dayTypeLabel}详情
                        </SheetTitle>
                        <SheetDescription>
                            {selectedDayType === 'stock' ? (
                                <span>显示当前库存详情 (共 {inventoryItems.length} 件)</span>
                            ) : (
                                <span>显示{dayTypeLabel}当日订单列表 (共 {selectedDayOrders.length} 条)</span>
                            )}
                        </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-4">
                        {selectedDayType === 'stock' ? (
                            loadingItems ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>序列号</TableHead>
                                            <TableHead>状态</TableHead>
                                            <TableHead>仓库</TableHead>
                                            {activeTab === 'spec' && <TableHead>组件</TableHead>}
                                            <TableHead>占用情况</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {inventoryItems.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={activeTab === 'spec' ? 5 : 4} className="text-center text-muted-foreground h-24">
                                                    无库存记录
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            inventoryItems.map((item) => {
                                                // Check occupancy
                                                // An item is occupied if there is an active order on selectedDate that matches its SN
                                                // selectedDayOrders contains orders that occupy stock on this day (as passed from render logic)
                                                // But we need to check if SN matches.
                                                // If order has no SN, it occupies 'some' item, but we can't link it.
                                                
                                                const occupyingOrder = selectedDayOrders.find(o => o.sn === item.sn && item.sn)
                                                
                                                return (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="font-mono text-xs font-medium">
                                                            {item.sn || '-'}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className={`${getStatusDisplay(item.status).color} border-0`}>
                                                                {getStatusDisplay(item.status).label}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>{item.warehouse?.name || '-'}</TableCell>
                                                        {activeTab === 'spec' && (
                                                            <TableCell className="text-xs text-muted-foreground">
                                                                {item.componentName}
                                                            </TableCell>
                                                        )}
                                                        <TableCell>
                                                            {occupyingOrder ? (
                                                                <div className="flex flex-col gap-1">
                                                                    <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200 w-fit">
                                                                        已占用
                                                                    </Badge>
                                                                    <span className="text-[10px] text-muted-foreground">
                                                                        订单: {getDisplayOrderNo(occupyingOrder)}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                                    可用
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            )
                        ) : (
                        <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>来源</TableHead>
                                    <TableHead>平台</TableHead>
                                    <TableHead>订单号</TableHead>
                                    <TableHead>状态</TableHead>
                                    <TableHead className="text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {currentSheetOrders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                                            {dayEmptyLabel}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    currentSheetOrders.map((order) => {
                                        const statusInfo = getStatusDisplay(order.status)
                                        return (
                                            <TableRow key={order.id}>
                                                <TableCell>
                                                    <Badge variant={order.isOnline ? "secondary" : "outline"}>
                                                        {order.isOnline ? "线上" : "线下"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {order.isOnline ? getPlatformDisplay(order.platform) : "-"}
                                                </TableCell>
                                                <TableCell className="font-medium font-mono text-xs">
                                                    {getDisplayOrderNo(order)}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={`${statusInfo.color} border-0`}>
                                                        {statusInfo.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-8 w-8"
                                                        onClick={() => openOrder(order)}
                                                    >
                                                        <ExternalLink className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                )}
                            </TableBody>
                        </Table>

                        {totalPages > 1 && (
                            <Pagination>
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious 
                                            href="#" 
                                            onClick={(e) => {
                                                e.preventDefault()
                                                if (currentPage > 1) setCurrentPage(p => p - 1)
                                            }}
                                            className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                                        />
                                    </PaginationItem>
                                    {Array.from({ length: totalPages }).map((_, i) => (
                                        <PaginationItem key={i}>
                                            <PaginationLink 
                                                href="#" 
                                                onClick={(e) => {
                                                    e.preventDefault()
                                                    setCurrentPage(i + 1)
                                                }}
                                                isActive={currentPage === i + 1}
                                            >
                                                {i + 1}
                                            </PaginationLink>
                                        </PaginationItem>
                                    ))}
                                    <PaginationItem>
                                        <PaginationNext 
                                            href="#" 
                                            onClick={(e) => {
                                                e.preventDefault()
                                                if (currentPage < totalPages) setCurrentPage(p => p + 1)
                                            }}
                                            className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                                        />
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        )}
                        </>
                    )}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
