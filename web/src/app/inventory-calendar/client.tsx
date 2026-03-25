'use client'

import { useState, useEffect, useMemo, useCallback } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, addDays, subDays, startOfDay, isBefore } from "date-fns"
import { zhCN } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Loader2, Settings, ExternalLink, Calendar as CalendarIcon, Table as TableIcon, Edit, Wand2 } from "lucide-react"
import { getInventoryData, getInventoryCalendarConfig, saveInventoryCalendarConfig, getInventoryItems, type InventoryCalendarConfig, type RegionBufferConfig } from "./actions"
import { batchAutoMatchOrderSpecs } from "@/app/actions"
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Check, ChevronsUpDown } from "lucide-react"
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

// 34 provinces list
const PROVINCES = [
    '北京', '天津', '上海', '重庆',
    '河北', '山西', '辽宁', '吉林', '黑龙江',
    '江苏', '浙江', '安徽', '福建', '江西', '山东',
    '河南', '湖北', '湖南', '广东', '海南',
    '四川', '贵州', '云南', '陕西', '甘肃', '青海',
    '内蒙古', '广西', '西藏', '宁夏', '新疆',
    '香港', '澳门', '台湾',
]

const extractProvince = (address?: string | null): string | null => {
    if (!address) return null
    for (const p of PROVINCES) {
        if (address.includes(p)) return p
    }
    return null
}

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
    
    // New status from crawlers
    DUE_REPAYMENT: { label: '待结算', color: 'bg-red-100 text-red-800' },
    WAIT_PAY: { label: '待支付', color: 'bg-yellow-100 text-yellow-800' },

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
    CHENGLIN: "诚赁",
    AOLZU: "奥租",
    YOUPIN: "优品租",
    LLXZU: "零零享",
    RRZ: "人人租",
    OTHER: "其他"
}

// Map platform name to online-orders tab siteId
const PLATFORM_TO_SITE_ID: Record<string, string> = {
    '奥租': 'aolzu',
    '零零享': 'llxzu',
    '优品租': 'youpin',
    '诚赁': 'chenglin',
    '赞晨': 'zanchen',
    '人人租': 'rrz',
    'ZANCHEN': 'zanchen',
    'CHENGLIN': 'chenglin',
    'AOLZU': 'aolzu',
    'YOUPIN': 'youpin',
    'LLXZU': 'llxzu',
    'RRZ': 'rrz',
}

const buildOnlineOrderUrl = (orderNo: string, platform?: string | null) => {
    const params = new URLSearchParams({ q: orderNo })
    const siteId = platform ? PLATFORM_TO_SITE_ID[platform] : undefined
    if (siteId) params.set('tab', siteId)
    return `/online-orders?${params.toString()}`
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
    return order.orderNo
}

const extractSignedAt = (raw?: string | null) => {
    if (!raw) return null
    const match = raw.match(/签收时间:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*([0-9]{2}:[0-9]{2}:[0-9]{2})/)
    if (!match) return null
    return new Date(`${match[1]}T${match[2]}`)
}


// RegionBufferRow component for config UI
function RegionBufferRow({ rb, onChange, onDelete }: {
    rb: { id: string; provinces: string[]; deliveryBufferDays: number; returnBufferDays: number }
    onChange: (updated: typeof rb) => void
    onDelete: () => void
}) {
    const [showProvinces, setShowProvinces] = useState(false)
    const allSelected = PROVINCES.every(p => rb.provinces.includes(p))

    const toggleProvince = (p: string) => {
        const next = rb.provinces.includes(p)
            ? rb.provinces.filter(x => x !== p)
            : [...rb.provinces, p]
        onChange({ ...rb, provinces: next })
    }

    const toggleAll = () => {
        onChange({ ...rb, provinces: allSelected ? [] : [...PROVINCES] })
    }

    return (
        <div className="border rounded-md p-2 space-y-2 text-xs">
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 flex-1">
                    <Label className="text-xs whitespace-nowrap">发货</Label>
                    <Input type="number" className="h-6 w-12 text-xs px-1" value={rb.deliveryBufferDays} onChange={e => onChange({ ...rb, deliveryBufferDays: Number(e.target.value) })} />
                    <span className="text-muted-foreground">天</span>
                    <Label className="text-xs whitespace-nowrap ml-1">归还</Label>
                    <Input type="number" className="h-6 w-12 text-xs px-1" value={rb.returnBufferDays} onChange={e => onChange({ ...rb, returnBufferDays: Number(e.target.value) })} />
                    <span className="text-muted-foreground">天</span>
                </div>
                <Button size="sm" variant="ghost" className="h-6 text-xs px-1" onClick={() => setShowProvinces(v => !v)}>
                    {rb.provinces.length === 0 ? '选省份' : rb.provinces.length + '省'} {showProvinces ? '▲' : '▼'}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={onDelete}>✕</Button>
            </div>
            {showProvinces && (
                <div className="space-y-1">
                    <div className="flex items-center gap-1 pb-1 border-b">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3 w-3" />
                        <span className="text-muted-foreground">全选/反选</span>
                    </div>
                    <div className="grid grid-cols-5 gap-x-2 gap-y-0.5">
                        {PROVINCES.map(p => (
                            <label key={p} className="flex items-center gap-
0.5 cursor-pointer hover:text-primary">
                                <input type="checkbox" checked={rb.provinces.includes(p)} onChange={() => toggleProvince(p)} className="h-3 w-3" />
                                <span>{p}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}


const StatsCell = ({ available, inCount, outCount, rentCount, compact = false, onInClick, onOutClick, onStockClick, onRentClick }: { available: number, inCount: number, outCount: number, rentCount: number, compact?: boolean, onInClick?: () => void, onOutClick?: () => void, onStockClick?: () => void, onRentClick?: () => void }) => {
    const bgClass = available <= 0 ? 'bg-red-100/70' : available < 2 ? 'bg-yellow-100/70' : 'bg-emerald-50/70'
    const stockColor = available < 0 ? 'text-red-600 font-bold' : ''

    const getClickableClass = (handler?: () => void) => 
        handler ? "cursor-pointer hover:underline underline-offset-2" : "cursor-default"

    // Vertical 4-row layout for both compact and normal
    return (
        <div className={`flex flex-col justify-center h-full w-full ${bgClass} rounded-sm px-1 py-0.5 gap-px`}>
            <div className={`flex items-center justify-between text-[10px] leading-tight ${getClickableClass(onInClick)}`} onClick={onInClick}>
                <span className="text-muted-foreground">到</span>
                <span className="tabular-nums">{inCount}</span>
            </div>
            <div className={`flex items-center justify-between text-[10px] leading-tight ${getClickableClass(onOutClick)}`} onClick={onOutClick}>
                <span className="text-muted-foreground">发</span>
                <span className="tabular-nums">{outCount}</span>
            </div>
            <div className={`flex items-center justify-between text-[10px] leading-tight ${getClickableClass(onRentClick)}`} onClick={onRentClick}>
                <span className="text-muted-foreground">租</span>
                <span className="tabular-nums">{rentCount}</span>
            </div>
            <div className={`flex items-center justify-between text-[10px] leading-tight ${getClickableClass(onStockClick)}`} onClick={onStockClick}>
                <span className="text-muted-foreground">库</span>
                <span className={`tabular-nums ${stockColor}`}>{available}</span>
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
    specId?: string
    name: string
    stock: number
    bomItems?: BomItem[]
}

type Product = {
    id: string
    name: string
    variants: unknown[]
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
    itemTitle?: string | null
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
    address?: string | null
    duration?: number | null
}

type InventoryItem = {
    id: string
    sn: string | null
    status: string
    warehouse: { name: string }
    componentName?: string
}

type ItemType = {
    id: string
    name: string
    stock: number
}

interface InventoryCalendarClientProps {
    canManage: boolean
}


// C: Extracted Sheet as separate component to isolate pagination re-renders
function DayDetailSheet({
    open, onOpenChange,
    selectedDate, selectedDayType, selectedDayOrders, selectedDayStats,
    inventoryItems, loadingItems, activeTab,
    openOrder,
}: {
    open: boolean
    onOpenChange: (v: boolean) => void
    selectedDate: Date | null
    selectedDayType: string
    selectedDayOrders: OrderSimple[]
    selectedDayStats: { occupied: number; available: number; totalStock: number } | null
    inventoryItems: InventoryItem[]
    loadingItems: boolean
    activeTab: string
    openOrder: (o: OrderSimple) => void
}) {
    const [currentPage, setCurrentPage] = useState(1)
    const [inventoryItemPage, setInventoryItemPage] = useState(1)
    const pageSize = 10

    const totalPages = Math.ceil(selectedDayOrders.length / pageSize)
    const currentSheetOrders = selectedDayOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    const dayTypeLabel = selectedDayType === 'in' ? '入库' : selectedDayType === 'out' ? '出库' : selectedDayType === 'stock' ? '在库' : '占用'
    const dayEmptyLabel = selectedDayType === 'in' ? '无入库记录' : selectedDayType === 'out' ? '无出库记录' : selectedDayType === 'stock' ? '无库存记录' : '无占用记录'

    return (
    <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:w-[720px] sm:max-w-[720px] overflow-y-auto">
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
                    ) : inventoryItems.length === 0 ? (
                        // Non-serialized item: show summary + occupying orders
                        <div className="space-y-4">
                            {selectedDayStats && (
                                <div className="flex gap-4 p-3 rounded-md bg-muted/40 border text-sm">
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-xs text-muted-foreground">总库存</span>
                                        <span className="text-xl font-bold">{selectedDayStats.totalStock}</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-xs text-muted-foreground">当日占用</span>
                                        <span className="text-xl font-bold text-red-600">{selectedDayStats.occupied}</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-xs text-muted-foreground">当日在库</span>
                                        <span className="text-xl font-bold text-green-600">{selectedDayStats.available}</span>
                                    </div>
                                </div>
                            )}
                            {selectedDayOrders.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground font-medium">当日占用订单 ({selectedDayOrders.length} 条)</p>
                                    <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>来源</TableHead>
                                                <TableHead>订单号</TableHead>
                                                <TableHead>规格</TableHead>
                                                <TableHead>状态</TableHead>
                                                <TableHead>租期</TableHead>
                                                <TableHead className="text-right">操作</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {selectedDayOrders.map(o => {
                                                const statusInfo = getStatusDisplay(o.status)
                                                return (
                                                    <TableRow key={o.id}>
                                                        <TableCell>
                                                            <Badge variant={o.isOnline ? "secondary" : "outline"}>
                                                                {o.isOnline ? "线上" : "线下"}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs">{getDisplayOrderNo(o)}</TableCell>
                                                        <TableCell className="text-xs">{o.variantName || o.productName || '-'}</TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className={`${statusInfo.color} border-0`}>{statusInfo.label}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                            {o.rentStartDate ? format(new Date(o.rentStartDate), 'MM-dd') : '-'}
                                                            {o.returnDeadline ? ` ~ ${format(new Date(o.returnDeadline), 'MM-dd')}` : ''}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openOrder(o)}>
                                                                <ExternalLink className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                    </div>
                                </div>
                            )}
                            {selectedDayOrders.length === 0 && (
                                <p className="text-center text-sm text-muted-foreground py-8">当日无占用订单，全部在库</p>
                            )}
                        </div>
                    ) : (
                        // Serialized item: show item list with occupancy
                        (() => {
                            // Step 1: SN-exact match (order.sn === item.sn)
                            const snOrderMap = new Map<string, OrderSimple>()
                            const unsnOrders: OrderSimple[] = []
                            selectedDayOrders.forEach(o => {
                                if (o.sn) snOrderMap.set(o.sn, o)
                                else unsnOrders.push(o)
                            })
    
                            // Step 2: For items not matched by SN, assign unsnOrders in order
                            const unmatchedItems = inventoryItems.filter(item => !item.sn || !snOrderMap.has(item.sn))
                            // Build item -> order map for count-based assignment
                            const itemOrderMap = new Map<string, OrderSimple>()
                            unmatchedItems.forEach((item, i) => {
                                if (i < unsnOrders.length) itemOrderMap.set(item.id, unsnOrders[i])
                            })
    
                            return (
                                <div className="space-y-3">
                                    {selectedDayStats && (
                                        <div className="flex gap-4 p-3 rounded-md bg-muted/40 border text-sm">
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span className="text-xs text-muted-foreground">总库存</span>
                                                <span className="text-xl font-bold">{selectedDayStats.totalStock}</span>
                                            </div>
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span className="text-xs text-muted-foreground">当日占用</span>
                                                <span className="text-xl font-bold text-red-600">{selectedDayStats.occupied}</span>
                                            </div>
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span className="text-xs text-muted-foreground">当日在库</span>
                                                <span className="text-xl font-bold text-green-600">{selectedDayStats.available}</span>
                                            </div>
                                        </div>
                                    )}
                                    <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>序列号</TableHead>
                                                <TableHead>仓库</TableHead>
                                                {activeTab === 'spec' && <TableHead>组件</TableHead>}
                                                <TableHead>占用情况</TableHead>
                                                <TableHead>平台</TableHead>
                                                <TableHead>订单号</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        {/* Inventory item pagination */}
                                        {(() => { const _invTotal = inventoryItems.length; const _invPages = Math.ceil(_invTotal / 50); return null; })()}
                                        <TableBody>
                                            {inventoryItems.slice((inventoryItemPage - 1) * 50, inventoryItemPage * 50).map((item) => {
                                                // Exact SN match first, then count-based assignment
                                                const occupyingOrder = (item.sn ? snOrderMap.get(item.sn) : undefined)
                                                    ?? itemOrderMap.get(item.id)
                                                const orderNo = occupyingOrder ? getDisplayOrderNo(occupyingOrder) : null
    
                                                return (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="font-mono text-xs font-medium">
                                                            {item.sn || '-'}
                                                        </TableCell>
                                                        <TableCell>{item.warehouse?.name || '-'}</TableCell>
                                                        {activeTab === 'spec' && (
                                                            <TableCell className="text-xs text-muted-foreground">
                                                                {item.componentName}
                                                            </TableCell>
                                                        )}
                                                        <TableCell>
                                                            {occupyingOrder ? (
                                                                <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">
                                                                    占用中
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                                    可用
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-xs">
                                                            {occupyingOrder
                                                                ? occupyingOrder.isOnline
                                                                    ? (platformMap[occupyingOrder.platform || ''] || occupyingOrder.platform || '-')
                                                                    : '线下'
                                                                : '-'}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs">
                                                            {orderNo ? (
                                                                <a
                                                                    href={occupyingOrder!.isOnline
                                                                        ? buildOnlineOrderUrl(orderNo, occupyingOrder!.platform)
                                                                        : `/orders?q=${encodeURIComponent(orderNo)}`
                                                                    }
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
                                                                >
                                                                    {orderNo}
                                                                </a>
                                                            ) : '-'}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                    </div>
                                        {Math.ceil(inventoryItems.length / 50) > 1 && (() => {
                                            const invTotalPages = Math.ceil(inventoryItems.length / 50)
                                            const windowSize = 10
                                            const half = Math.floor(windowSize / 2)
                                            let startPage = Math.max(1, inventoryItemPage - half)
                                            const endPage = Math.min(invTotalPages, startPage + windowSize - 1)
                                            if (endPage - startPage + 1 < windowSize) startPage = Math.max(1, endPage - windowSize + 1)
                                            const pageNums = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)
                                            return (
                                                <div className="flex items-center justify-center gap-1 mt-2 flex-wrap">
                                                    <button className="px-2 py-0.5 border rounded text-xs disabled:opacity-40" disabled={inventoryItemPage <= 1} onClick={() => setInventoryItemPage(p => p - 1)}>‹</button>
                                                    {pageNums.map(page => (
                                                        <button key={page} className={`px-2 py-0.5 border rounded text-xs ${inventoryItemPage === page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} onClick={() => setInventoryItemPage(page)}>{page}</button>
                                                    ))}
                                                    <button className="px-2 py-0.5 border rounded text-xs disabled:opacity-40" disabled={inventoryItemPage >= invTotalPages} onClick={() => setInventoryItemPage(p => p + 1)}>›</button>
                                                </div>
                                            )
                                        })()}
                                </div>
                            )
                        })()
                    )
                ) : (
                <>
                <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>来源</TableHead>
                            <TableHead>平台</TableHead>
                            <TableHead>商品/规格</TableHead>
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
                                        <TableCell>
                                            <div className="flex flex-col max-w-[180px]">
                                                <span className="text-sm font-medium truncate" title={order.productName || ''}>{order.productName || '-'}</span>
                                                <span className="text-xs text-muted-foreground truncate" title={order.variantName || ''}>{order.variantName || '-'}</span>
                                            </div>
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
                </div>
    
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
                            {(() => {
                                const windowSize = 10
                                const half = Math.floor(windowSize / 2)
                                let startPage = Math.max(1, currentPage - half)
                                const endPage = Math.min(totalPages, startPage + windowSize - 1)
                                if (endPage - startPage + 1 < windowSize) {
                                    startPage = Math.max(1, endPage - windowSize + 1)
                                }
                                return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map(page => (
                                    <PaginationItem key={page}>
                                        <PaginationLink
                                            href="#"
                                            onClick={(e) => { e.preventDefault(); setCurrentPage(page) }}
                                            isActive={currentPage === page}
                                        >
                                            {page}
                                        </PaginationLink>
                                    </PaginationItem>
                                ))
                            })()}
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
    )
}

export function InventoryCalendarClient({ canManage }: InventoryCalendarClientProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [products, setProducts] = useState<Product[]>([])
    const [orders, setOrders] = useState<OrderSimple[]>([])
    const [itemTypes, setItemTypes] = useState<ItemType[]>([])
    const [componentStock, setComponentStock] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)
    const [isMobile, setIsMobile] = useState(false)
    
    // Config state
    const [calendarConfig, setCalendarConfig] = useState<InventoryCalendarConfig>({
        defaultDeliveryBufferDays: 2,
        defaultReturnBufferDays: 3,
        regionBuffers: [],
    })
    const [isSavingConfig, setIsSavingConfig] = useState(false)
    const [isConfigOpen, setIsConfigOpen] = useState(false)
    const [isBatchMatching, setIsBatchMatching] = useState(false)
    
    // View mode: "calendar" or "table"
    const [viewMode, setViewMode] = useState<"calendar" | "table">("calendar")
    
    // Tab state: "item" (Product) or "spec" (Variant)
    const [activeTab, setActiveTab] = useState("item")
    
    // Selection state
    const [selectedItemTypeId, setSelectedItemTypeId] = useState<string>("ALL")
    const [selectedVariantId, setSelectedVariantId] = useState<string>("ALL") // spec id
    
    // Sheet state
    const [sheetOpen, setSheetOpen] = useState(false)
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [selectedDayOrders, setSelectedDayOrders] = useState<OrderSimple[]>([])
    const [selectedDayType, setSelectedDayType] = useState<'occupy' | 'in' | 'out' | 'stock'>('occupy')
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
    const [loadingItems, setLoadingItems] = useState(false)
    const [selectedDayStats, setSelectedDayStats] = useState<{ occupied: number; available: number; totalStock: number } | null>(null)

    // Fetch config
    useEffect(() => {
        getInventoryCalendarConfig().then(config => {
            setCalendarConfig(config)
        })
    }, [])

    const handleSaveConfig = async () => {
        setIsSavingConfig(true)
        try {
            const res = await saveInventoryCalendarConfig(calendarConfig)
            if (res.success) {
                toast.success(res.message)
                setIsConfigOpen(false)
                setRefreshKey(v => v + 1)
            } else {
                toast.error(res.message)
            }
        } catch (e) {
            toast.error("保存失败")
        } finally {
            setIsSavingConfig(false)
        }
    }

    const handleBatchMatch = async () => {
        setIsBatchMatching(true)
        try {
            const res = await batchAutoMatchOrderSpecs()
            if (res.success) {
                toast.success(res.message)
                setRefreshKey(v => v + 1)
            }
        } catch (e) {
            toast.error("批量匹配失败")
        } finally {
            setIsBatchMatching(false)
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
                
                const parsedProducts = res.products.map((p: Omit<Product, 'variants'> & { variants: unknown }) => {
                    const raw = p.variants
                    const variants =
                        typeof raw === 'string'
                            ? (JSON.parse(raw) as unknown[])
                            : (Array.isArray(raw) ? raw : [])
                    return { ...p, variants }
                })

                setProducts(parsedProducts)
                setComponentStock(res.componentStock || {})
                setItemTypes((res.itemTypes || []) as ItemType[])
                
                // Set default selection if empty
                const fetchedItemTypes = (res.itemTypes || []) as ItemType[]
                if (fetchedItemTypes.length > 0) {
                    if ((!selectedItemTypeId || selectedItemTypeId === "ALL") && viewMode === 'calendar') {
                        setSelectedItemTypeId(fetchedItemTypes[0].id)
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
                        completedAt: o.completedAt ? new Date(o.completedAt) : null,
                        address: o.address ?? null,
                        duration: o.duration ?? null,
                    })),
                    ...res.onlineOrders.map(o => {
                        const isCompleted = ['TRADE_SUCCESS', 'COMPLETED', 'FINISHED', '已完成'].includes(o.status)
                        const completedAt = isCompleted ? (extractSignedAt(o.returnLatestLogisticsInfo) || null) : null

                        return {
                            ...o, 
                            isOnline: true, 
                            rentStartDate: o.rentStartDate ? new Date(o.rentStartDate) : null,
                            returnDeadline: o.returnDeadline ? new Date(o.returnDeadline) : null,
                            completedAt,
                            address: o.address ?? null,
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

    useEffect(() => {
        const mql = window.matchMedia('(max-width: 640px)')
        const update = () => setIsMobile(mql.matches)
        update()
        if (mql.addEventListener) mql.addEventListener('change', update)
        else mql.addListener(update)
        return () => {
            if (mql.removeEventListener) mql.removeEventListener('change', update)
            else mql.removeListener(update)
        }
    }, [])

    // Helper: Map order to product ID
    const getOrderProductId = (order: OrderSimple) => {
        if (order.productId) return order.productId
        
        // Match by name or keywords (case-insensitive)
        const orderName = (order.productName || order.itemTitle || "").toLowerCase()
        const p = products.find(p => {
            if (p.name.toLowerCase() === orderName) return true
            // Partial name match: product name contained in order name
            if (orderName.includes(p.name.toLowerCase())) return true
            if (p.matchKeywords) {
                try {
                    const keywords = JSON.parse(p.matchKeywords)
                    if (Array.isArray(keywords)) {
                        return keywords.some((k: string) => {
                            const kl = k.toLowerCase()
                            return orderName.includes(kl) || (order.itemTitle || "").toLowerCase().includes(kl)
                        })
                    }
                } catch {}
            }
            return false
        })
        return p?.id || "UNKNOWN"
    }

    const specLookup = useMemo(() => {
        const byId = new Map<string, { spec: ProductSpec; product: Product }>()
        const bySpecId = new Map<string, { spec: ProductSpec; product: Product }>()
        const byName = new Map<string, { spec: ProductSpec; product: Product }>()
        products.forEach(p => {
            p.specs?.forEach(s => {
                byId.set(s.id, { spec: s, product: p })
                if (s.specId) bySpecId.set(s.specId, { spec: s, product: p })
                byName.set(`${p.id}:${s.name}`, { spec: s, product: p })
            })
        })
        return { byId, bySpecId, byName }
    }, [products])

    const getOrderSpecInfo = (order: OrderSimple) => {
        // Only match orders that have an explicit specId linked to a known spec with BOM data
        if (order.specId) {
            const hit = specLookup.byId.get(order.specId)
            if (hit) return hit
            const hitBySpecId = specLookup.bySpecId.get(order.specId)
            if (hitBySpecId) return hitBySpecId
        }
        return null
    }

    type VariantOption = {
        id: string
        name: string
        productId: string
        productName: string
        fullName: string
        stock: number
    }

    const allVariants = useMemo(() => {
        return products.flatMap<VariantOption>(p => {
            // Use specs if available (contains stock), otherwise fallback to variants (names only)
            if (p.specs && p.specs.length > 0) {
                return p.specs.map(s => ({
                    id: s.id,
                    name: s.name,
                    productId: p.id,
                    productName: p.name,
                    fullName: s.name.includes(p.name) ? s.name : `${p.name} - ${s.name}`,
                    stock: s.stock
                }))
            }
            
            // Fallback for legacy data without specs relation
            const vars = Array.isArray(p.variants) ? p.variants : []
            return vars
                .map(v => {
                    if (!v || typeof v !== "object") return null
                    const raw = v as { specId?: unknown; name?: unknown }
                    const name = typeof raw.name === "string" ? raw.name : ""
                    if (!name) return null
                    const specId = typeof raw.specId === "string" ? raw.specId : ""
                    return {
                        id: specId || `${p.id}:${name}`,
                        name,
                        productId: p.id,
                        productName: p.name,
                        fullName: name.includes(p.name) ? name : `${p.name} - ${name}`,
                        stock: 0
                    }
                })
                .filter((v): v is VariantOption => v !== null)
        })
    }, [products])

    // Enforce selection in Calendar view
    useEffect(() => {
        if (viewMode === 'calendar') {
            if ((!selectedItemTypeId || selectedItemTypeId === 'ALL') && itemTypes.length > 0) {
                setSelectedItemTypeId(itemTypes[0].id)
            }
        }
    }, [viewMode, itemTypes, selectedItemTypeId])

    useEffect(() => {
        if (viewMode === 'calendar' && activeTab === 'spec') {
            if ((!selectedVariantId || selectedVariantId === 'ALL') && allVariants.length > 0) {
                setSelectedVariantId(allVariants[0].id)
            }
        }
    }, [viewMode, activeTab, allVariants, selectedVariantId])

    // Occupancy calculation logic
    const getBufferDays = useCallback((address?: string | null) => {
        const province = extractProvince(address)
        if (province && calendarConfig.regionBuffers.length > 0) {
            const normalize = (s: string) => s.replace(/[省市]$/, '').replace(/自治区$/, '').replace(/壮族自治区$/, '').replace(/回族自治区$/, '').replace(/维吾尔自治区$/, '').replace(/藏族自治区$/, '')
            const normProvince = normalize(province)
            const match = calendarConfig.regionBuffers.find(r =>
                r.provinces.some(p => normalize(p) === normProvince)
            )
            if (match) return { deliveryBufferDays: match.deliveryBufferDays, returnBufferDays: match.returnBufferDays }
        }
        return { deliveryBufferDays: calendarConfig.defaultDeliveryBufferDays, returnBufferDays: calendarConfig.defaultReturnBufferDays }
    }, [calendarConfig])

    const getOrderOccupancyRange = useCallback((o: OrderSimple) => {
        if (['CANCELED', 'CLOSED', 'REFUNDED', 'TRADE_CLOSED', '已关闭', '已取消'].includes(o.status)) return null
        if (!o.rentStartDate) return null

        const { deliveryBufferDays, returnBufferDays } = getBufferDays(o.address)

        let start = subDays(new Date(o.rentStartDate), deliveryBufferDays)
        let endRaw: Date
        if (!o.isOnline && o.rentStartDate && o.duration) {
            // Offline order: returnDeadline is "须寄回日" (1 day after last rental day)
            // Use rentStartDate + duration - 1 as the actual last rental day
            endRaw = addDays(new Date(o.rentStartDate), o.duration - 1)
        } else {
            endRaw = o.returnDeadline ? new Date(o.returnDeadline) : addDays(new Date(o.rentStartDate), 30)
        }

        if (o.completedAt) {
            endRaw = new Date(o.completedAt)
        }

        const end = addDays(endRaw, returnBufferDays)

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
    }, [getBufferDays])

    const getOrderRentRange = useCallback((o: OrderSimple) => {
        if (['CANCELED', 'CLOSED', 'REFUNDED', 'TRADE_CLOSED', '已关闭', '已取消'].includes(o.status)) return null
        if (!o.rentStartDate) return null
        const start = new Date(o.rentStartDate)
        let end: Date
        if (!o.isOnline && o.duration) {
            end = addDays(start, o.duration - 1)
        } else {
            end = o.returnDeadline ? new Date(o.returnDeadline) : addDays(start, 30)
        }
        start.setHours(0,0,0,0)
        end.setHours(23,59,59,999)
        return { start, end }
    }, [])

    // B: Pre-compute occupancy range for every order once
    // All callers use this map instead of calling getOrderOccupancyRange per-render
    const orderRangeMap = useMemo(() => {
        const map = new Map<string, { start: Date; end: Date; outDate: Date } | null>()
        orders.forEach(o => {
            map.set(o.id, getOrderOccupancyRange(o))
        })
        return map
    }, [orders, getOrderOccupancyRange])

    const orderRentRangeMap = useMemo(() => {
        const map = new Map<string, { start: Date; end: Date } | null>()
        orders.forEach(o => {
            map.set(o.id, getOrderRentRange(o))
        })
        return map
    }, [orders, getOrderRentRange])

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
        let rentCount = 0
        const occupiedComponents = new Map<string, number>()

        const productId = activeTab === 'spec'
            ? allVariants.find(v => v.id === selectedVariantId)?.productId
            : undefined
        const allProductOrders = activeTab === 'spec'
            ? (productId ? (productOrderMap.get(productId) || []) : relevantOrders)
            : relevantOrders

        allProductOrders.forEach(o => {
            const range = (orderRangeMap.get(o.id) ?? null)
            if (!range) return
            if (date >= range.start && date <= range.end) {
                const specInfo = getOrderSpecInfo(o)
                const requirements = aggregateBomItems(specInfo?.spec.bomItems)
                if (requirements) {
                    requirements.forEach((qty, itemTypeId) => {
                        occupiedComponents.set(itemTypeId, (occupiedComponents.get(itemTypeId) || 0) + qty)
                    })
                }
            }
        })

        relevantOrders.forEach(o => {
            const range = (orderRangeMap.get(o.id) ?? null)
            if (!range) return

            if (date >= range.start && date <= range.end) {
                occupiedCount++
            }

            if (isSameDay(date, range.end)) {
                inCount++
            }

            const outDate = range.outDate || range.start
            if (isSameDay(date, outDate)) {
                outCount++
            }

            const rentRange = (orderRentRangeMap.get(o.id) ?? null)
            if (rentRange && date >= rentRange.start && date <= rentRange.end) {
                rentCount++
            }
        })

        let available: number
        let occupied: number

        if (activeTab === 'spec') {
            const selectedVariant = allVariants.find(v => v.id === selectedVariantId)
            const specInfo = selectedVariant ? specLookup.byId.get(selectedVariant.id) : null
            const buildable = computeBuildable(specInfo?.spec.bomItems, occupiedComponents)
            available = buildable !== null ? buildable : (totalStock - occupiedCount)
            occupied = Math.max(0, totalStock - available)
        } else {
            available = totalStock - occupiedCount
            occupied = occupiedCount
        }

        return {
            occupied,
            available,
            inCount,
            outCount,
            rentCount,
        }
    }

    // Pre-compute: which specIds use a given itemTypeId (via BOM)
    const specsByItemType = useMemo(() => {
        const map = new Map<string, Set<string>>() // itemTypeId -> Set<specId>
        products.forEach(p => {
            p.specs?.forEach(s => {
                s.bomItems?.forEach(b => {
                    if (!map.has(b.itemTypeId)) map.set(b.itemTypeId, new Set())
                    map.get(b.itemTypeId)!.add(s.id)
                })
            })
        })
        return map
    }, [products])

    // Filtered orders — only orders with a matched spec (specId linked to a known ProductSpec with BOM)
    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            const specInfo = getOrderSpecInfo(o)
            if (!specInfo) return false

            if (activeTab === "item") {
                if (!selectedItemTypeId || selectedItemTypeId === "ALL") return true
                // Include order if its spec's BOM contains the selected itemType
                const specIds = specsByItemType.get(selectedItemTypeId)
                return specIds ? specIds.has(specInfo.spec.id) : false
            } else {
                if (!selectedVariantId) return false
                const selectedVariant = allVariants.find(v => v.id === selectedVariantId)
                if (!selectedVariant) return false
                return specInfo.spec.id === selectedVariant.id
            }
        })
    }, [orders, activeTab, selectedItemTypeId, selectedVariantId, products, allVariants, specsByItemType, getOrderOccupancyRange])

    // Generate Calendar Days
    const calendarDays = useMemo(() => {
        const start = startOfMonth(currentMonth)
        const end = endOfMonth(currentMonth)
        return eachDayOfInterval({ start, end })
    }, [currentMonth])

    // Get current stock capacity
    const currentStock = useMemo(() => {
        if (activeTab === "item") {
            return componentStock[selectedItemTypeId] || 0
        } else {
            const v = allVariants.find(v => v.id === selectedVariantId)
            return v?.stock || 0
        }
    }, [activeTab, selectedItemTypeId, selectedVariantId, componentStock, allVariants])

    const todayAllItemsMovement = useMemo(() => {
        if (activeTab !== "item") return null
        const today = new Date()
        let inTotal = 0
        let outTotal = 0

        orders.forEach((o) => {
            const range = (orderRangeMap.get(o.id) ?? null)
            if (!range) return
            if (!o.specId) return

            const hit = specLookup.byId.get(o.specId) || specLookup.bySpecId.get(o.specId)
            if (!hit) return

            const qtySum = hit.spec.bomItems?.reduce((acc, b) => acc + (Number.isFinite(b.quantity) ? b.quantity : 0), 0) ?? 0
            if (qtySum <= 0) return

            const outDate = range.outDate || range.start
            if (isSameDay(today, outDate)) outTotal += qtySum
            if (isSameDay(today, range.end)) inTotal += qtySum
        })

        return { inTotal, outTotal }
    }, [activeTab, orders, orderRangeMap, specLookup])

    const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1))
    const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1))

    const handleDayClick = async (day: Date, orders: OrderSimple[], type: 'occupy' | 'in' | 'out' | 'stock', stats?: { occupied: number; available: number; totalStock: number }) => {
        setSelectedDate(day)
        setSelectedDayType(type)
        setSelectedDayOrders(orders)
        setSelectedDayStats(stats || null)
        
        if (type === 'stock') {
            // For non-serialized items, we don't need to fetch inventory items
            // We'll show the summary + occupying orders directly
            const isSerializedView = (() => {
                return true // fetch and let the display logic handle it
            })()

            setLoadingItems(true)
            setInventoryItems([])
            
            let pName = ''
            let vName: string | undefined = undefined
            
            if (activeTab === 'item') {
                const t = itemTypes.find(t => t.id === selectedItemTypeId)
                if (t) pName = t.name
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
                    setInventoryItems(items as InventoryItem[])
                } catch (e) {
                    toast.error("Failed to load inventory details")
                } finally {
                    setLoadingItems(false)
                }
            } else {
                setLoadingItems(false)
            }
        }

        setSheetOpen(true)
    }

    const openOrder = (order: OrderSimple) => {
        if (order.isOnline) {
            window.open(buildOnlineOrderUrl(order.orderNo, order.platform), '_blank')
        } else {
            window.open(`/orders?q=${encodeURIComponent(order.orderNo)}`, '_blank')
        }
    }


    // Calendar view render
    const renderCalendarView = () => (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            {(isMobile ? [currentMonth] : [currentMonth, addMonths(currentMonth, 1)]).map((monthDate, index) => {
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
                                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1.5 sm:py-2 bg-muted/30 rounded-sm">
                                    {day}
                                </div>
                            ))}
                            
                            {/* Empty cells for start of month */}
                            {Array.from({ length: startOfMonth(monthDate).getDay() }).map((_, i) => (
                                <div key={`empty-${i}`} className="h-20 sm:h-32 bg-muted/5 rounded-md border border-dashed border-muted/20" />
                            ))}

                            {/* Days */}
                            {days.map(day => {
                                const stats = calculateDailyStats(day, filteredOrders, currentStock)
                                const dayInOrders = filteredOrders.filter(o => {
                                    const range = (orderRangeMap.get(o.id) ?? null)
                                    return range && isSameDay(day, range.end)
                                })
                                const dayOutOrders = filteredOrders.filter(o => {
                                    const range = (orderRangeMap.get(o.id) ?? null)
                                    if (!range) return false
                                    const outDate = range.outDate || range.start
                                    return isSameDay(day, outDate)
                                })
                                const dayOccupancy = filteredOrders.filter(o => {
                                    const range = (orderRangeMap.get(o.id) ?? null)
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
                                        className={`min-h-[88px] sm:min-h-[120px] p-1.5 sm:p-2 rounded-md border hover:shadow-sm transition-all flex flex-col justify-between
                                            ${isToday ? 'ring-2 ring-primary ring-offset-1' : 'border-border'}
                                            ${isPast ? 'bg-gray-100 text-muted-foreground grayscale' : ''}
                                        `}
                                    >
                                        <div className="flex justify-between items-start mb-1 sm:mb-2">
                                            <span className={`text-xs sm:text-sm font-medium ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</span>
                                        </div>
                                        
                                        <div className="flex-1">
                                            <StatsCell 
                                                available={stats.available}
                                                inCount={stats.inCount}
                                                outCount={stats.outCount}
                                                rentCount={stats.rentCount}
                                                compact={isMobile}
                                                onInClick={() => handleDayClick(day, dayInOrders, 'in')}
                                                onOutClick={() => handleDayClick(day, dayOutOrders, 'out')}
                                                onRentClick={() => handleDayClick(day, dayOccupancy, 'occupy')}
                                                onStockClick={() => handleDayClick(day, dayOccupancy, 'stock', { occupied: stats.occupied, available: stats.available, totalStock: currentStock })}
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


    // Pre-calculate orders per itemType (item view) and per spec/product (spec view)
    const productOrderMap = useMemo(() => {
        const map = new Map<string, OrderSimple[]>()
        
        const addToMap = (key: string, o: OrderSimple) => {
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(o)
        }

        orders.forEach(o => {
            const specInfo = getOrderSpecInfo(o)
            if (!specInfo) return

            // Key by productId (for spec view BOM occupancy across all specs of same product)
            addToMap(specInfo.product.id, o)
            // Key by specId (for spec view)
            addToMap(specInfo.spec.id, o)
            // Key by each itemTypeId in the spec's BOM (for item view)
            specInfo.spec.bomItems?.forEach(b => {
                addToMap(b.itemTypeId, o)
            })
        })
        
        return map
    }, [orders, products, getOrderOccupancyRange])

    // Pre-calculate daily stats for a specific set of orders
    // Returns a Map<DayString, Stats>
    const getDailyStatsMap = (relevantOrders: OrderSimple[], totalStock: number, start: Date, end: Date, allProductOrders?: OrderSimple[]) => {
        const statsMap = new Map<string, { occupied: number, available: number, inCount: number, outCount: number, rentCount: number }>()
        
        const bomOrders = allProductOrders || relevantOrders
        
        relevantOrders.forEach(o => {
            const range = (orderRangeMap.get(o.id) ?? null)
            if (!range) return
            if (range.end < start || range.start > end) return

            const outDate = range.outDate || range.start
            if (outDate >= start && outDate <= end) {
                const k = outDate.toDateString()
                if (!statsMap.has(k)) statsMap.set(k, { occupied: 0, available: totalStock, inCount: 0, outCount: 0, rentCount: 0 })
                statsMap.get(k)!.outCount++
            }
            if (range.end >= start && range.end <= end) {
                const k = range.end.toDateString()
                if (!statsMap.has(k)) statsMap.set(k, { occupied: 0, available: totalStock, inCount: 0, outCount: 0, rentCount: 0 })
                statsMap.get(k)!.inCount++
            }
            // rentCount
            const rentRange = (orderRentRangeMap.get(o.id) ?? null)
            if (rentRange) {
                const rStart = rentRange.start < start ? start : rentRange.start
                const rEnd = rentRange.end > end ? end : rentRange.end
                for (let d = new Date(rStart); d <= rEnd; d.setDate(d.getDate() + 1)) {
                    const k = d.toDateString()
                    if (!statsMap.has(k)) statsMap.set(k, { occupied: 0, available: totalStock, inCount: 0, outCount: 0, rentCount: 0 })
                    statsMap.get(k)!.rentCount++
                }
            }
        })

        bomOrders.forEach(o => {
            const range = (orderRangeMap.get(o.id) ?? null)
            if (!range) return
            if (range.end < start || range.start > end) return

            const current = range.start < start ? start : range.start
            const last = range.end > end ? end : range.end
            for (let d = new Date(current); d <= last; d.setDate(d.getDate() + 1)) {
                const k = d.toDateString()
                if (!statsMap.has(k)) statsMap.set(k, { occupied: 0, available: totalStock, inCount: 0, outCount: 0, rentCount: 0 })
                statsMap.get(k)!.occupied++
            }
        })
        
        for (const val of statsMap.values()) {
            val.available = totalStock - val.occupied
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
            ? itemTypes.map(t => ({
                id: t.id,
                name: t.name,
                stock: t.stock,
                key: t.id
            }))
            : allVariants.map(v => ({
                id: v.id,
                name: v.fullName,
                stock: v.stock,
                key: v.id
            }))

        // Filter rows based on selection
        if (activeTab === "item" && selectedItemTypeId && selectedItemTypeId !== "ALL") {
            rows = rows.filter(r => r.id === selectedItemTypeId)
        } else if (activeTab === "spec" && selectedVariantId && selectedVariantId !== "ALL") {
            rows = rows.filter(r => r.id === selectedVariantId)
        }

        return rows.map(row => {
            // For item view: orders keyed by itemTypeId; for spec view: by productId (all specs share inventory)
            const allProductOrders = activeTab === 'spec'
                ? (() => {
                    const productId = allVariants.find(v => v.id === row.id)?.productId
                    return productId ? (productOrderMap.get(productId) || []) : []
                  })()
                : (productOrderMap.get(row.key) || [])
            const rowOrders = productOrderMap.get(row.key) || []
            const statsMap = getDailyStatsMap(rowOrders, row.stock, start, end, allProductOrders)
            return { ...row, statsMap }
        })
    }, [viewMode, activeTab, itemTypes, allVariants, productOrderMap, selectedItemTypeId, selectedVariantId, getOrderOccupancyRange, getOrderRentRange])

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
                                        <th scope="col" className="sticky left-0 z-30 bg-background px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-[140px] sm:w-[200px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-b">
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
                                                <td className={`sticky left-0 z-10 px-3 py-2 whitespace-nowrap text-sm font-medium text-foreground border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[140px] sm:w-[200px] ${zebra ? 'bg-muted/60' : 'bg-background'} group-hover:bg-muted/70`}>
                                                    <div className="flex flex-col">
                                                        <span>{row.name}</span>
                                                        <span className="text-xs text-muted-foreground font-normal">库存: {row.stock}</span>
                                                    </div>
                                                </td>
                                                {days.map(day => {
                                                    const dateKey = day.toDateString()
                                                    const stats = statsMap.get(dateKey) || { occupied: 0, available: row.stock, inCount: 0, outCount: 0, rentCount: 0 }
                                                    const dayInOrders = rowOrders.filter(o => {
                                                        const range = (orderRangeMap.get(o.id) ?? null)
                                                        return range && isSameDay(day, range.end)
                                                    })
                                                    const dayOutOrders = rowOrders.filter(o => {
                                                        const range = (orderRangeMap.get(o.id) ?? null)
                                                        if (!range) return false
                                                        const outDate = range.outDate || range.start
                                                        return isSameDay(day, outDate)
                                                    })
                                                    const dayOccupancy = rowOrders.filter(o => {
                                                        const range = (orderRangeMap.get(o.id) ?? null)
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
                                                                    rentCount={stats.rentCount ?? 0}
                                                                    compact={true}
                                                                    onInClick={() => handleDayClick(day, dayInOrders, 'in')}
                                                                    onOutClick={() => handleDayClick(day, dayOutOrders, 'out')}
                                                                    onRentClick={() => handleDayClick(day, dayOccupancy, 'occupy')}
                                                                    onStockClick={() => handleDayClick(day, dayOccupancy, 'stock', { occupied: stats.occupied, available: stats.available, totalStock: row.stock })}
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
                <div className="flex flex-wrap items-center gap-2 w-full">
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

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-[200px]">
                        <TabsList>
                            <TabsTrigger value="item">物品库存</TabsTrigger>
                            <TabsTrigger value="spec">规格库存</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    
                    {activeTab === "item" ? (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="w-full sm:w-[250px] justify-between font-normal">
                                    <span className="truncate">
                                        {selectedItemTypeId && selectedItemTypeId !== 'ALL'
                                            ? (itemTypes.find(t => t.id === selectedItemTypeId)?.name ?? '选择物品')
                                            : (viewMode === 'table' ? '全部物品' : '选择物品')}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[250px] p-0">
                                <Command>
                                    <CommandInput placeholder="搜索物品..." />
                                    <CommandList className="max-h-[200px]">
                                        <CommandEmpty>未找到物品</CommandEmpty>
                                        <CommandGroup>
                                            {viewMode === 'table' && (
                                                <CommandItem value="ALL" onSelect={() => setSelectedItemTypeId('ALL')}>
                                                    <Check className={`mr-2 h-4 w-4 ${selectedItemTypeId === 'ALL' ? 'opacity-100' : 'opacity-0'}`} />
                                                    全部物品
                                                </CommandItem>
                                            )}
                                            {itemTypes.map(t => (
                                                <CommandItem key={t.id} value={t.name} onSelect={() => setSelectedItemTypeId(t.id)}>
                                                    <Check className={`mr-2 h-4 w-4 ${selectedItemTypeId === t.id ? 'opacity-100' : 'opacity-0'}`} />
                                                    {t.name}
                                                    <span className="ml-auto text-xs text-muted-foreground">{t.stock}</span>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    ) : (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="w-full sm:w-[300px] justify-between font-normal">
                                    <span className="truncate">
                                        {selectedVariantId && selectedVariantId !== 'ALL'
                                            ? (allVariants.find(v => v.id === selectedVariantId)?.fullName ?? '选择规格')
                                            : (viewMode === 'table' ? '全部规格' : '选择规格')}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[300px] p-0">
                                <Command>
                                    <CommandInput placeholder="搜索规格..." />
                                    <CommandList className="max-h-[200px]">
                                        <CommandEmpty>未找到规格</CommandEmpty>
                                        <CommandGroup>
                                            {viewMode === 'table' && (
                                                <CommandItem value="ALL" onSelect={() => setSelectedVariantId('ALL')}>
                                                    <Check className={`mr-2 h-4 w-4 ${selectedVariantId === 'ALL' ? 'opacity-100' : 'opacity-0'}`} />
                                                    全部规格
                                                </CommandItem>
                                            )}
                                            {allVariants.map(v => {
                                                const specInfo = specLookup.byId.get(v.id) || specLookup.byName.get(`${v.productId}:${v.name}`)
                                                const hasBom = specInfo?.spec?.bomItems && specInfo.spec.bomItems.length > 0
                                                return (
                                                    <CommandItem key={v.id} value={v.fullName} onSelect={() => setSelectedVariantId(v.id)}>
                                                        <Check className={`mr-2 h-4 w-4 ${selectedVariantId === v.id ? 'opacity-100' : 'opacity-0'}`} />
                                                        <span className="truncate">{v.fullName}</span>
                                                        {!hasBom && (
                                                            <Badge variant="outline" className="ml-1 text-[10px] px-1 h-4 text-red-600 border-red-200 bg-red-50 shrink-0">
                                                                无BOM
                                                            </Badge>
                                                        )}
                                                    </CommandItem>
                                                )
                                            })}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    )}

                    {activeTab === "item" && todayAllItemsMovement && (
                        <div className="flex items-center gap-1">
                            <Badge variant="secondary" className="h-8 text-xs font-normal">
                                今日到货 {todayAllItemsMovement.inTotal}
                            </Badge>
                            <Badge variant="secondary" className="h-8 text-xs font-normal">
                                今日发货 {todayAllItemsMovement.outTotal}
                            </Badge>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* {canManage && (
                        <Button variant="outline" size="sm" onClick={handleBatchMatch} disabled={isBatchMatching} title="按规格名称自动匹配订单">
                            {isBatchMatching ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wand2 className="h-4 w-4 mr-1" />}
                            自动匹配
                        </Button>
                    )} */}
                    {canManage && (
                        <Popover open={isConfigOpen} onOpenChange={setIsConfigOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="icon">
                                    <Settings className="h-4 w-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[480px] max-h-[80vh] overflow-y-auto">
                                <div className="grid gap-4">
                                    <div className="space-y-1">
                                        <h4 className="font-medium leading-none">占用计算配置</h4>
                                        <p className="text-xs text-muted-foreground">按省份配置发货/归还缓冲天数，无匹配走默认</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs whitespace-nowrap">默认发货缓冲</Label>
                                            <Input type="number" className="h-7 w-16 text-xs" value={calendarConfig.defaultDeliveryBufferDays} onChange={e => setCalendarConfig(c => ({ ...c, defaultDeliveryBufferDays: Number(e.target.value) }))} />
                                            <span className="text-xs text-muted-foreground">天</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs whitespace-nowrap">默认归还缓冲</Label>
                                            <Input type="number" className="h-7 w-16 text-xs" value={calendarConfig.defaultReturnBufferDays} onChange={e => setCalendarConfig(c => ({ ...c, defaultReturnBufferDays: Number(e.target.value) }))} />
                                            <span className="text-xs text-muted-foreground">天</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium">地区缓冲配置</span>
                                            <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setCalendarConfig(c => ({ ...c, regionBuffers: [...c.regionBuffers, { id: Date.now().toString(), provinces: [], deliveryBufferDays: 2, returnBufferDays: 3 }] }))}>+ 添加</Button>
                                        </div>
                                        {calendarConfig.regionBuffers.map((rb, idx) => (
                                            <RegionBufferRow key={rb.id} rb={rb} onChange={updated => setCalendarConfig(c => ({ ...c, regionBuffers: c.regionBuffers.map((r, i) => i === idx ? updated : r) }))} onDelete={() => setCalendarConfig(c => ({ ...c, regionBuffers: c.regionBuffers.filter((_, i) => i !== idx) }))} />
                                        ))}
                                        {calendarConfig.regionBuffers.length === 0 && (
                                            <p className="text-xs text-muted-foreground text-center py-2">暂无地区配置，所有订单使用默认缓冲</p>
                                        )}
                                    </div>
                                    <div className="space-y-1 mt-2">
                                        <h4 className="font-medium leading-none text-xs">过滤配置</h4>
                                        <p className="text-xs text-muted-foreground">配置赞晨平台需要过滤的商家（不计入库存占用），多个商家用逗号分隔</p>
                                        <Input 
                                            placeholder="商家A,商家B" 
                                            className="text-xs h-8"
                                            defaultValue={calendarConfig.zanchenFilteredMerchants?.join(',') || ''}
                                            onBlur={e => {
                                                const val = e.target.value
                                                const merchants = val
                                                    .split(/[\n,，;；、|]+/g)
                                                    .map(s => s.trim())
                                                    .filter(Boolean)
                                                setCalendarConfig(c => ({ ...c, zanchenFilteredMerchants: merchants }))
                                            }}
                                        />
                                    </div>
                                    <Button onClick={handleSaveConfig} disabled={isSavingConfig} size="sm">
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
                            <span className="sm:hidden">{format(currentMonth, 'yyyy年MM月', { locale: zhCN })}</span>
                            <span className="hidden sm:inline">{format(currentMonth, 'yyyy年MM月', { locale: zhCN })} - {format(addMonths(currentMonth, 1), 'yyyy年MM月', { locale: zhCN })}</span>
                        </span>
                        <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-8 w-8">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span>库存日历 - {activeTab === "item" ? "物品视图" : "规格视图"}</span>
                            <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                总容量: {currentStock}
                            </span>
                            {activeTab === 'spec' && selectedVariantId && selectedVariantId !== 'ALL' && (() => {
                                const variant = allVariants.find(v => v.id === selectedVariantId)
                                if (!variant) return null
                                const specInfo = specLookup.byId.get(selectedVariantId) || specLookup.byName.get(`${variant.productId}:${variant.name}`)
                                const hasBom = specInfo?.spec?.bomItems && specInfo.spec.bomItems.length > 0
                                
                                if (!hasBom) {
                                    return (
                                        <Button 
                                            variant="destructive" 
                                            size="sm" 
                                            className="h-6 text-xs px-2" 
                                            onClick={() => window.open(`../products?edit=${encodeURIComponent(variant.productId)}`, '_blank')}
                                        >
                                            <Edit className="h-3 w-3 mr-1" />
                                            未配置规格资产 (点击配置)
                                        </Button>
                                    )
                                }
                                return null
                            })()}
                        </div>
                        <div className="grid grid-cols-2 sm:flex gap-x-4 gap-y-1 text-xs font-normal text-muted-foreground">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500"></span>充足</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500"></span>紧张</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500"></span>缺货</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-200 border border-gray-300"></span>过去</span>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3 px-1">
                        <span><span className="font-medium text-foreground">到</span>：当天归还到库数量</span>
                        <span><span className="font-medium text-foreground">发</span>：当天发货出库数量</span>
                        <span><span className="font-medium text-foreground">租</span>：当天在租订单数量</span>
                        <span><span className="font-medium text-foreground">库</span>：当天在库空闲数量（背景色：绿=充足 黄=紧张 红=缺货）</span>
                    </div>
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        viewMode === 'calendar' ? renderCalendarView() : renderTableView()
                    )}
                </CardContent>
            </Card>

            <DayDetailSheet
                key={`${selectedDate ? selectedDate.toISOString() : "none"}-${selectedDayType}-${activeTab}-${selectedDayOrders.length}-${inventoryItems.length}`}
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                selectedDate={selectedDate}
                selectedDayType={selectedDayType}
                selectedDayOrders={selectedDayOrders}
                selectedDayStats={selectedDayStats}
                inventoryItems={inventoryItems}
                loadingItems={loadingItems}
                activeTab={activeTab}
                openOrder={openOrder}
            />
        </div>
    )
}
