'use client'

import { useState, useEffect, useMemo } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, addDays, subDays, startOfDay, isBefore } from "date-fns"
import { zhCN } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Loader2, Settings, ExternalLink } from "lucide-react"
import { getInventoryData, getInventoryCalendarConfig, saveInventoryCalendarConfig } from "./actions"
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

// Helper to get status display
const getStatusDisplay = (status: string) => {
    return statusMap[status] || { label: status, color: 'bg-gray-100 text-gray-800' }
}

// Types
type ProductSpec = {
    id: string
    name: string
    stock: number
}

type Product = {
    id: string
    name: string
    variants: any[]
    matchKeywords: string | null
    totalStock: number
    specs?: ProductSpec[]
}

type OrderSimple = {
    id: string
    orderNo: string
    productName: string | null
    variantName: string | null
    rentStartDate: Date | null
    returnDeadline: Date | null
    status: string
    productId?: string | null
    isOnline?: boolean
    deliveryTime?: Date | null
    actualDeliveryTime?: Date | null
    completedAt?: Date | null
    platform?: string
}

interface InventoryCalendarClientProps {
    canManage: boolean
}

export function InventoryCalendarClient({ canManage }: InventoryCalendarClientProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [products, setProducts] = useState<Product[]>([])
    const [orders, setOrders] = useState<OrderSimple[]>([])
    const [loading, setLoading] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)
    
    // Config state
    const [deliveryBufferDays, setDeliveryBufferDays] = useState(2)
    const [returnBufferDays, setReturnBufferDays] = useState(3)
    const [isSavingConfig, setIsSavingConfig] = useState(false)
    const [isConfigOpen, setIsConfigOpen] = useState(false)
    
    // Tab state: "item" (Product) or "spec" (Variant)
    const [activeTab, setActiveTab] = useState("item")
    
    // Selection state
    const [selectedProductId, setSelectedProductId] = useState<string>("")
    const [selectedVariantId, setSelectedVariantId] = useState<string>("") // Composite ID: productId:specName
    
    // Sheet state
    const [sheetOpen, setSheetOpen] = useState(false)
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [selectedDayOrders, setSelectedDayOrders] = useState<OrderSimple[]>([])
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
                
                // Set default selection if empty
                if (parsedProducts.length > 0) {
                     // Only set if not already set or invalid
                     if (!selectedProductId || !parsedProducts.find((p: any) => p.id === selectedProductId)) {
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
                    ...res.onlineOrders.map(o => ({ 
                        ...o, 
                        isOnline: true, 
                        rentStartDate: o.rentStartDate ? new Date(o.rentStartDate) : null,
                        returnDeadline: o.returnDeadline ? new Date(o.returnDeadline) : null,
                        completedAt: ['TRADE_SUCCESS', 'COMPLETED', 'FINISHED', '已完成'].includes(o.status) ? new Date(o.updatedAt) : null,
                        productId: null
                    }))
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

    // Flattened variants for Spec View
    const allVariants = useMemo(() => {
        return products.flatMap(p => {
            // Use specs if available (contains stock), otherwise fallback to variants (names only)
            if (p.specs && p.specs.length > 0) {
                return p.specs.map(s => ({
                    id: `${p.id}:${s.name}`, // Composite ID
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
                id: `${p.id}:${v.name}`,
                name: v.name,
                productId: p.id,
                productName: p.name,
                fullName: `${p.name} - ${v.name}`,
                stock: 0
            }))
        })
    }, [products])

    // Update default variant selection
    useEffect(() => {
        if (activeTab === "spec" && allVariants.length > 0) {
             if (!selectedVariantId || !allVariants.find(v => v.id === selectedVariantId)) {
                 setSelectedVariantId(allVariants[0].id)
             }
        }
    }, [activeTab, allVariants, selectedVariantId])

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
        // If completedAt is BEFORE the planned endRaw, we cut it short.
        if (o.completedAt) {
            // If completedAt is valid, occupancy ends on that day (or maybe the day before? let's assume inclusive)
            // But if we want to show it as "Available" starting from next day?
            // "Occupancy Range" = [Start, End].
            // If completedAt = Today 10am. Is it occupied Today? Yes. Available Tomorrow? Yes.
            // So End = completedAt.
            // Compare completedAt with endRaw + buffer.
            // Actually, buffer applies to "Return Deadline".
            // If actual return happens, does buffer still apply?
            // "Return Buffer" represents "Inspection/Cleaning time".
            // So if returned at T, it is available at T + Buffer.
            const actualEnd = addDays(new Date(o.completedAt), returnBufferDays)
            
            // If actual end is earlier than planned end (with buffer), use actual.
            const plannedEndWithBuffer = addDays(endRaw, returnBufferDays)
            
            if (actualEnd < plannedEndWithBuffer) {
                // Use actual return time + buffer
                endRaw = new Date(o.completedAt) // We will add buffer below if we used this logic
                // Wait, let's simplify.
                // Logic: End Date = (ActualReturn OR PlanReturn) + Buffer
                // If Completed, use CompletedAt.
                endRaw = new Date(o.completedAt)
            }
        }

        let end = addDays(endRaw, returnBufferDays)
        
        // Adjust start if actual delivery occurred earlier (or later, but we track from earliest known occupancy)
        if (o.actualDeliveryTime || o.deliveryTime) {
            const delivery = new Date(o.actualDeliveryTime || o.deliveryTime!)
            // If delivered earlier than buffer, use delivery date
            if (delivery < start) {
                start = delivery
            }
            // If delivered later, we stick to planned start because stock was reserved/prepared
        }

        start.setHours(0,0,0,0)
        end.setHours(23,59,59,999)
        
        return { start, end }
    }

    // Filtered orders
    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            const pid = getOrderProductId(o)
            
            if (activeTab === "item") {
                if (!selectedProductId) return false
                return pid === selectedProductId
            } else {
                // Spec View
                if (!selectedVariantId) return false
                const [targetPid, targetSpecName] = selectedVariantId.split(':')
                
                // Must match product ID first
                if (pid !== targetPid) return false
                
                // Then match variant name
                // Order variant name might be null if it's a general product order (rare for specific stock check)
                // If order has no variant name, does it count for all specs? 
                // Usually we assume if variant is unspecified, we can't allocate to specific spec.
                // But let's try to match strict.
                return o.variantName === targetSpecName
            }
        })
    }, [orders, activeTab, selectedProductId, selectedVariantId, products])

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

    const handleDayClick = (day: Date, orders: OrderSimple[]) => {
        setSelectedDate(day)
        setSelectedDayOrders(orders)
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

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-2">
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
                                                const dayOccupancy = filteredOrders.filter(o => {
                                                    const range = getOrderOccupancyRange(o)
                                                    if (!range) return false
                                                    return day >= range.start && day <= range.end
                                                })
                                                
                                                const occupiedCount = dayOccupancy.length
                                                const available = currentStock - occupiedCount
                                                
                                                let statusColor = "bg-green-500/10 border-green-500/30 text-green-700"
                                                if (available <= 0) statusColor = "bg-red-500/10 border-red-500/30 text-red-700"
                                                else if (available < 2) statusColor = "bg-yellow-500/10 border-yellow-500/30 text-yellow-700"
                                                
                                                const isToday = isSameDay(day, new Date())
                                                const isPast = isBefore(day, startOfDay(new Date()))

                                                return (
                                                    <div 
                                                        key={day.toString()} 
                                                        className={`min-h-[120px] p-2 rounded-md border cursor-pointer hover:shadow-sm transition-all 
                                                            ${isToday ? 'ring-2 ring-primary ring-offset-1' : 'border-border'}
                                                            ${isPast ? 'bg-gray-100 text-muted-foreground grayscale' : ''}
                                                        `}
                                                        onClick={() => handleDayClick(day, dayOccupancy)}
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            <span className={`text-sm font-medium ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</span>
                                                        </div>
                                                        
                                                        <div className={`flex flex-col gap-1 text-xs p-2 rounded ${isPast ? 'bg-gray-200 border-gray-300 text-gray-600' : statusColor}`}>
                                                            <div className="flex justify-between">
                                                                <span>已用:</span>
                                                                <span className="font-semibold">{occupiedCount}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span>可用:</span>
                                                                <span className="font-semibold">{available}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>
                            {selectedDate && format(selectedDate, 'yyyy年MM月dd日', { locale: zhCN })} 占用详情
                        </SheetTitle>
                        <SheetDescription>
                            显示占用当日库存的订单列表 (共 {selectedDayOrders.length} 条)
                        </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-4">
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
                                            无占用记录
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
                                                    {order.isOnline ? (order.platform || "-") : "-"}
                                                </TableCell>
                                                <TableCell className="font-medium font-mono text-xs">
                                                    {order.orderNo}
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
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
