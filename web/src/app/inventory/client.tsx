"use client"

import { useMemo, useState, useTransition, useCallback } from "react"
import { InventoryItemType, Warehouse, InventoryStock, InventoryItem } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { toast } from "sonner"
import { 
    createInventoryItem, 
    batchCreateInventoryItems,
    batchOutboundInventoryItems,
    adjustInventoryStock, 
    createInventoryItemType, 
    updateInventoryItemType, 
    deleteInventoryItemType,
    deleteInventoryItem,
    getOrdersByItemTypeId,
    getOrdersBySn
} from "@/app/actions"
import { WarehouseManager } from "@/components/inventory/warehouse-manager"
import { Search, Plus, ArrowLeftRight, Package, Box, Filter, Edit2, Trash2, Settings2, Upload, AlertTriangle, ArrowDown, ArrowUp, Check } from "lucide-react"

// Constants from ItemTypeManager
const COMMON_UNITS = ["个", "台", "套", "把", "张", "箱", "米", "千克"]
const COMMON_CATEGORIES = ["电子产品", "办公用品", "家具", "耗材", "线材", "灯具", "音频设备", "视频设备"]

// Types for the passed data
type StockRow = InventoryStock & {
    itemType: InventoryItemType
    warehouse: Warehouse
}

type ItemRow = InventoryItem & {
    itemType: InventoryItemType
    warehouse: Warehouse
}

interface InventoryClientProps {
    itemTypes: InventoryItemType[]
    warehouses: Warehouse[]
    stocks: StockRow[]
    items: ItemRow[]
}

type NonSerialOrder = {
    id: string
    orderNo: string
    status: string
    customerName: string | null
    platform?: string | null
    rentStartDate: Date | string | null
    returnDeadline: Date | string | null
    manualSn?: string | null
    spec: { name: string } | null
}

const ORDER_STATUS_LABELS: Record<string, string> = {
    WAIT_PAY: '待支付',
    PENDING_REVIEW: '待审核',
    PENDING_SHIPMENT: '待发货',
    PENDING_RECEIPT: '待收货',
    RENTING: '租用中',
    RETURNING: '归还中',
    RETURNED: '已归还',
    BOUGHT_OUT: '已买断',
    COMPLETED: '已完成',
    CLOSED: '已关闭',
    OVERDUE: '已逾期',
}
const statusLabel = (s: string) => ORDER_STATUS_LABELS[s] ?? s

// Map platform name to online-orders tab siteId
const PLATFORM_TO_SITE_ID: Record<string, string> = {
    '奥租': 'aolzu',
    '零零享': 'llxzu',
    '优品租': 'youpin',
    '诚赁': 'chenglin',
    '赞晨': 'zanchen',
    '人人租': 'rrz',
    'ZANCHEN': 'zanchen',
}

function onlineOrderUrl(orderNo: string, platform?: string | null) {
    const siteId = platform ? PLATFORM_TO_SITE_ID[platform] : undefined
    const params = new URLSearchParams({ q: orderNo })
    if (siteId) params.set('tab', siteId)
    return `/online-orders?${params.toString()}`
}

function offlineOrderUrl(orderNo: string, platform?: string | null) {
    const params = new URLSearchParams({ q: orderNo })
    if (platform) params.set('platform', platform)
    return `/orders?${params.toString()}`
}

export function InventoryClient({ itemTypes, warehouses, stocks, items }: InventoryClientProps) {
    const [isPending, startTransition] = useTransition()
    
    // -- Tabs & Filters --
    const [activeTab, setActiveTab] = useState("overview")
    const [overviewSearch, setOverviewSearch] = useState("")
    const [overviewCategoryFilter, setOverviewCategoryFilter] = useState("ALL")
    
    const [itemSearch, setItemSearch] = useState("")
    const [itemWarehouseFilter, setItemWarehouseFilter] = useState("ALL")
    const [itemStatusFilter, setItemStatusFilter] = useState("ALL")

    // -- Pagination --
    const [overviewPage, setOverviewPage] = useState(1)
    const [overviewPageSize, setOverviewPageSize] = useState(10)
    const [itemPage, setItemPage] = useState(1)
    const [itemPageSize, setItemPageSize] = useState(10)
    const [sheetPage, setSheetPage] = useState(1)
    const [sheetPageSize, setSheetPageSize] = useState(10)

    // -- Dialog States --
    
    // Item Definition (Create/Edit)
    const [defDialogOpen, setDefDialogOpen] = useState(false)
    const [editingDef, setEditingDef] = useState<InventoryItemType | null>(null)
    const [defName, setDefName] = useState("")
    const [defIsSerialized, setDefIsSerialized] = useState("true")
    const [defUnit, setDefUnit] = useState("")
    const [defCategory, setDefCategory] = useState("")
    const [defPurchasePrice, setDefPurchasePrice] = useState("")
    const [isCustomCategory, setIsCustomCategory] = useState(false)

    // Stock Management (Adjust non-serialized)
    const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
    const [adjustItemTypeId, setAdjustItemTypeId] = useState("")
    const [adjustWarehouseId, setAdjustWarehouseId] = useState("")
    const [adjustQuantity, setAdjustQuantity] = useState("0")
    const [adjustType, setAdjustType] = useState<"IN" | "OUT">("IN")

    // Batch Inbound (Serialized)
    const [batchInboundOpen, setBatchInboundOpen] = useState(false)
    const [batchDialogTab, setBatchDialogTab] = useState<"IN" | "OUT">("IN")
    const [batchItemTypeId, setBatchItemTypeId] = useState("")
    const [batchWarehouseId, setBatchWarehouseId] = useState("")
    const [batchSns, setBatchSns] = useState("")
    const [batchOutboundSns, setBatchOutboundSns] = useState("")

    // Delete Confirmation (Serialized Item)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

    // Serialized Item Details Sheet
    const [detailsSheetOpen, setDetailsSheetOpen] = useState(false)
    const [detailsItemTypeId, setDetailsItemTypeId] = useState<string | null>(null)

    // Non-serialized item orders sheet
    const [nonSerialOrdersSheetOpen, setNonSerialOrdersSheetOpen] = useState(false)
    const [nonSerialOrdersItemTypeId, setNonSerialOrdersItemTypeId] = useState<string | null>(null)
    const [nonSerialOrders, setNonSerialOrders] = useState<{ orders: NonSerialOrder[], onlineOrders: NonSerialOrder[] } | null>(null)
    const [nonSerialOfflinePage, setNonSerialOfflinePage] = useState(1)
    const [nonSerialOnlinePage, setNonSerialOnlinePage] = useState(1)
    const nonSerialOrdersPageSize = 20

    // SN detail dialog (for serialized items)
    const [snDetailOpen, setSnDetailOpen] = useState(false)
    const [snDetailSn, setSnDetailSn] = useState<string | null>(null)
    const [snDetailData, setSnDetailData] = useState<{ orders: NonSerialOrder[], onlineOrders: NonSerialOrder[] } | null>(null)
    const [snDetailPage, setSnDetailPage] = useState(1)
    const snDetailPageSize = 10

    // Delete Confirmation (Item Type)
    const [deleteTypeConfirmOpen, setDeleteTypeConfirmOpen] = useState(false)
    const [deleteTypeTargetId, setDeleteTypeTargetId] = useState<string | null>(null)

    // -- Derived Data (Overview) --
    const inventorySummary = useMemo(() => {
        return itemTypes.map(type => {
            let total = 0;
            // Map warehouseId -> quantity/count
            const breakdown: Record<string, number> = {};
            
            if (type.isSerialized) {
                const typeItems = items.filter(i => i.itemTypeId === type.id && i.status !== "DELETED");
                total = typeItems.length;
                typeItems.forEach(i => {
                    breakdown[i.warehouseId] = (breakdown[i.warehouseId] || 0) + 1;
                });
            } else {
                const typeStocks = stocks.filter(s => s.itemTypeId === type.id);
                total = typeStocks.reduce((sum, s) => sum + s.quantity, 0);
                typeStocks.forEach(s => {
                    breakdown[s.warehouseId] = s.quantity;
                });
            }
            
            return {
                ...type,
                totalStock: total,
                stockBreakdown: breakdown
            };
        });
    }, [itemTypes, stocks, items]);

    const totalInventoryValue = useMemo(() => {
        return inventorySummary.reduce((sum, item) => {
            const price = item.purchasePrice || 0
            return sum + (price * item.totalStock)
        }, 0)
    }, [inventorySummary])

    const availableCategories = useMemo(() => {
        const usedCategories = inventorySummary.map(i => i.category).filter(Boolean) as string[]
        return Array.from(new Set([...COMMON_CATEGORIES, ...usedCategories]))
    }, [inventorySummary])

    const filteredOverview = useMemo(() => {
        const q = overviewSearch.trim().toLowerCase()
        return inventorySummary.filter(i => {
            if (overviewCategoryFilter !== "ALL" && i.category !== overviewCategoryFilter) return false
            if (!q) return true
            return (
                i.name.toLowerCase().includes(q) ||
                (i.category || "").toLowerCase().includes(q)
            )
        })
    }, [inventorySummary, overviewSearch, overviewCategoryFilter])

    const overviewTotalPages = Math.ceil(filteredOverview.length / overviewPageSize)
    const paginatedOverview = filteredOverview.slice((overviewPage - 1) * overviewPageSize, overviewPage * overviewPageSize)

    // -- Derived Data (Items - Serialized) --
    const filteredItems = useMemo(() => {
        const q = itemSearch.trim().toLowerCase()
        return items.filter(i => {
            if (i.status === "DELETED") return false // Hide deleted items
            if (itemWarehouseFilter !== "ALL" && i.warehouseId !== itemWarehouseFilter) return false
            if (itemStatusFilter !== "ALL" && i.status !== itemStatusFilter) return false
            if (!q) return true
            return (
                i.itemType.name.toLowerCase().includes(q) ||
                i.warehouse.name.toLowerCase().includes(q) ||
                (i.sn || "").toLowerCase().includes(q)
            )
        })
    }, [items, itemSearch, itemWarehouseFilter, itemStatusFilter])

    const itemTotalPages = Math.ceil(filteredItems.length / itemPageSize)
    const paginatedItems = filteredItems.slice((itemPage - 1) * itemPageSize, itemPage * itemPageSize)

    // -- Derived Data (Details Sheet) --
    const sheetItems = useMemo(() => {
        if (!detailsItemTypeId) return []
        return items.filter(i => 
            i.itemTypeId === detailsItemTypeId && 
            i.status !== "DELETED"
        )
    }, [items, detailsItemTypeId])

    const sheetTotalPages = Math.ceil(sheetItems.length / sheetPageSize)
    const paginatedSheetItems = sheetItems.slice((sheetPage - 1) * sheetPageSize, sheetPage * sheetPageSize)

    // -- Handlers: Item Definition --

    const openCreateDef = () => {
        setEditingDef(null)
        setDefName("")
        setDefIsSerialized("true")
        setDefUnit("")
        setDefCategory("")
        setDefPurchasePrice("")
        setIsCustomCategory(false)
        setDefDialogOpen(true)
    }

    const openEditDef = (type: InventoryItemType) => {
        setEditingDef(type)
        setDefName(type.name)
        setDefIsSerialized(type.isSerialized ? "true" : "false")
        setDefUnit(type.unit || "")
        setDefCategory(type.category || "")
        setDefPurchasePrice(type.purchasePrice?.toString() || "")
        setIsCustomCategory(!availableCategories.includes(type.category || "") && !!type.category)
        setDefDialogOpen(true)
    }

    const handleSaveDef = async () => {
        if (!defName.trim()) return
        startTransition(async () => {
            let res;
            const purchasePrice = defPurchasePrice ? parseFloat(defPurchasePrice) : undefined
            if (editingDef) {
                res = await updateInventoryItemType(editingDef.id, {
                    name: defName,
                    isSerialized: defIsSerialized === "true",
                    unit: defUnit,
                    category: defCategory,
                    purchasePrice
                })
            } else {
                res = await createInventoryItemType({
                    name: defName,
                    isSerialized: defIsSerialized === "true",
                    unit: defUnit,
                    category: defCategory,
                    purchasePrice
                })
            }

            if (res.success) {
                toast.success(res.message)
                setDefDialogOpen(false)
            } else {
                toast.error(res.message)
            }
        })
    }

    const handleDeleteDef = (id: string) => {
        setDeleteTypeTargetId(id)
        setDeleteTypeConfirmOpen(true)
    }

    const handleConfirmDeleteType = async () => {
        if (!deleteTypeTargetId) return
        startTransition(async () => {
            const res = await deleteInventoryItemType(deleteTypeTargetId)
            if (res.success) {
                toast.success(res.message)
                setDeleteTypeConfirmOpen(false)
            }
            else toast.error(res.message)
        })
    }

    // -- Handlers: Stock Adjustment (Non-serialized) --

    const openAdjustDialog = (itemTypeId: string, warehouseId: string) => {
        setAdjustItemTypeId(itemTypeId)
        setAdjustWarehouseId(warehouseId)
        setAdjustQuantity("0")
        setAdjustType("IN")
        setAdjustDialogOpen(true)
    }

    const handleAdjustStock = async () => {
        const qty = Number(adjustQuantity)
        if (qty <= 0) {
            toast.error("请输入有效的正整数")
            return
        }
        
        const finalQty = adjustType === "IN" ? qty : -qty

        startTransition(async () => {
            const res = await adjustInventoryStock({
                itemTypeId: adjustItemTypeId,
                warehouseId: adjustWarehouseId,
                quantity: finalQty
            })
            if (res.success) {
                toast.success(res.message)
                setAdjustDialogOpen(false)
            } else {
                toast.error(res.message)
            }
        })
    }

    // -- Handlers: Batch Inbound (Serialized) --
    
    const openBatchInbound = (itemTypeId?: string) => {
        setBatchItemTypeId(itemTypeId || "")
        setBatchWarehouseId(warehouses[0]?.id || "")
        setBatchSns("")
        setBatchOutboundSns("")
        setBatchDialogTab("IN")
        setBatchInboundOpen(true)
    }

    const handleBatchInbound = async () => {
        if (!batchItemTypeId || !batchWarehouseId) {
            toast.error("请选择物品和仓库")
            return
        }
        
        const sns = batchSns.split('\n').map(s => s.trim()).filter(s => s.length > 0)
        if (sns.length === 0) {
            toast.error("请输入至少一个序列号")
            return
        }

        startTransition(async () => {
            const res = await batchCreateInventoryItems({
                itemTypeId: batchItemTypeId,
                warehouseId: batchWarehouseId,
                sns: sns
            })
            if (res.success) {
                toast.success(res.message)
                setBatchInboundOpen(false)
            } else {
                toast.error(res.message)
            }
        })
    }

    const handleBatchOutbound = async () => {
        if (!batchItemTypeId || !batchWarehouseId) {
            toast.error("请选择物品和仓库")
            return
        }
        const sns = batchOutboundSns.split('\n').map(s => s.trim()).filter(s => s.length > 0)
        if (sns.length === 0) {
            toast.error("请输入至少一个序列号")
            return
        }
        startTransition(async () => {
            const res = await batchOutboundInventoryItems({ itemTypeId: batchItemTypeId, warehouseId: batchWarehouseId, sns })
            if (res.success) {
                toast.success(res.message)
                setBatchInboundOpen(false)
            } else {
                toast.error(res.message)
            }
        })
    }

    // -- Handlers: Delete Item --
    const handleDeleteClick = (id: string) => {
        setDeleteTargetId(id)
        setDeleteConfirmOpen(true)
    }

    const handleConfirmDelete = async () => {
        if (!deleteTargetId) return
        startTransition(async () => {
            const res = await deleteInventoryItem(deleteTargetId)
            if (res.success) {
                toast.success(res.message)
                setDeleteConfirmOpen(false)
            } else {
                toast.error(res.message)
            }
        })
    }

    // -- Handlers: Serialized Details Sheet --
    const openDetailsSheet = (itemTypeId: string) => {
        setDetailsItemTypeId(itemTypeId)
        setSheetPage(1)
        setDetailsSheetOpen(true)
    }

    // -- Handlers: Non-serialized Orders Sheet --
    const openNonSerialOrdersSheet = useCallback(async (itemTypeId: string) => {
        setNonSerialOrdersItemTypeId(itemTypeId)
        setNonSerialOrders(null)
        setNonSerialOfflinePage(1)
        setNonSerialOnlinePage(1)
        setNonSerialOrdersSheetOpen(true)
        const result = await getOrdersByItemTypeId(itemTypeId)
        setNonSerialOrders(result)
    }, [])

    // -- Handlers: SN Detail Dialog --
    const openSnDetail = useCallback(async (sn: string) => {
        setSnDetailSn(sn)
        setSnDetailData(null)
        setSnDetailPage(1)
        setSnDetailOpen(true)
        const result = await getOrdersBySn(sn)
        setSnDetailData(result)
    }, [])


    // -- Render --

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">总库存价值 (估)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">¥{totalInventoryValue.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">基于现有库存及采购价</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">序列化物品</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{items.filter(i => i.status !== "DELETED").length}</div>
                        <p className="text-xs text-muted-foreground">
                            {items.filter(i => i.status === "AVAILABLE").length} 可用 / {items.filter(i => i.status === "RENTING").length} 在租
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">非序列化物品</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stocks.reduce((sum, s) => sum + s.quantity, 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                             涉及 {warehouses.length} 个仓库
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content */}
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <div className="flex gap-2">
                        <WarehouseManager warehouses={warehouses} />
                    </div>
                    <div className="flex gap-2">
                        {/* Create Item Definition */}
                        <Button variant="outline" onClick={openCreateDef}>
                            <Plus className="mr-2 h-4 w-4" /> 新增物品定义
                        </Button>
                        
                        {/* Global Inbound Shortcut */}
                        <Button onClick={() => openBatchInbound()}>
                            <Plus className="mr-2 h-4 w-4" /> 快速入库
                        </Button>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="overview">库存总览 (合并视图)</TabsTrigger>
                        <TabsTrigger value="items">序列物品明细</TabsTrigger>
                    </TabsList>

                    {/* Overview Tab (Merged) */}
                    <TabsContent value="overview" className="space-y-4">
                        <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg">
                            <Search className="h-4 w-4 text-muted-foreground ml-2" />
                            <Input 
                                placeholder="搜索物品名称或分类..." 
                                value={overviewSearch} 
                                onChange={e => { setOverviewSearch(e.target.value); setOverviewPage(1); }}
                                className="w-[300px] border-none shadow-none bg-transparent focus-visible:ring-0" 
                            />
                            <div className="h-4 w-[1px] bg-border mx-2" />
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <Select value={overviewCategoryFilter} onValueChange={setOverviewCategoryFilter}>
                                <SelectTrigger className="w-[150px] border-none shadow-none bg-transparent focus:ring-0">
                                    <SelectValue placeholder="所有分类" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">所有分类</SelectItem>
                                    {availableCategories.map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="rounded-md border bg-card">
                            <Table className="text-sm">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="h-10 py-1">物品名称</TableHead>
                                        <TableHead className="h-10 py-1">类型</TableHead>
                                        <TableHead className="h-10 py-1">分类</TableHead>
                                        <TableHead className="h-10 py-1">单位</TableHead>
                                        <TableHead className="h-10 py-1">采购价</TableHead>
                                        <TableHead className="h-10 py-1">总库存</TableHead>
                                        <TableHead className="h-10 py-1">仓库分布</TableHead>
                                        <TableHead className="h-10 py-1 text-right">操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedOverview.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="py-2 font-medium">{item.name}</TableCell>
                                            <TableCell className="py-2">
                                                {item.isSerialized ? (
                                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs px-1.5 py-0">序列化</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 text-xs px-1.5 py-0">数量</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-2">{item.category || "-"}</TableCell>
                                            <TableCell className="py-2">{item.unit || "-"}</TableCell>
                                            <TableCell className="py-2">
                                                {item.purchasePrice ? `¥${item.purchasePrice.toFixed(2)}` : "-"}
                                            </TableCell>
                                            <TableCell className="py-2 font-bold text-base">
                                                {item.isSerialized ? (
                                                    <div 
                                                        className="cursor-pointer text-primary hover:underline decoration-dashed underline-offset-4 flex items-center gap-1 w-fit"
                                                        onClick={() => openDetailsSheet(item.id)}
                                                        title="点击查看明细"
                                                    >
                                                        {item.totalStock}
                                                        <span className="text-xs font-normal text-muted-foreground ml-1">(查看)</span>
                                                    </div>
                                                ) : (
                                                    <div
                                                        className="cursor-pointer text-primary hover:underline decoration-dashed underline-offset-4 flex items-center gap-1 w-fit"
                                                        onClick={() => openNonSerialOrdersSheet(item.id)}
                                                        title="点击查看占用订单"
                                                    >
                                                        {item.totalStock}
                                                        <span className="text-xs font-normal text-muted-foreground ml-1">(查看)</span>
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-2 text-xs text-muted-foreground max-w-[200px]">
                                                {Object.entries(item.stockBreakdown).length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {Object.entries(item.stockBreakdown).map(([whId, qty]) => {
                                                            const wh = warehouses.find(w => w.id === whId)
                                                            return (
                                                                <span key={whId} className="bg-muted px-1.5 py-0.5 rounded">
                                                                    {wh?.name}: {qty}
                                                                </span>
                                                            )
                                                        })}
                                                    </div>
                                                ) : "无库存"}
                                            </TableCell>
                                            <TableCell className="py-2 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button 
                                                        size="icon" 
                                                        variant="ghost" 
                                                        className="h-8 w-8"
                                                        title="库存操作"
                                                        onClick={() => {
                                                            const whId = warehouses[0]?.id
                                                            if (!whId) {
                                                                toast.error("请先创建仓库")
                                                                return
                                                            }
                                                            if (item.isSerialized) {
                                                                openBatchInbound(item.id)
                                                            } else {
                                                                openAdjustDialog(item.id, whId)
                                                            }
                                                        }}
                                                    >
                                                        <Settings2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" onClick={() => openEditDef(item)} title="编辑定义">
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => handleDeleteDef(item.id)} title="删除定义">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {paginatedOverview.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">暂无物品定义</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        
                        {/* Pagination */}
                        <div className="flex items-center justify-between mt-4 px-2">
                            <div className="text-sm text-muted-foreground">
                                共 {filteredOverview.length} 条数据，本页显示 {paginatedOverview.length} 条
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-2">
                                    <p className="text-sm font-medium text-gray-500">每页行数</p>
                                    <Select
                                        value={`${overviewPageSize}`}
                                        onValueChange={(value) => {
                                            setOverviewPageSize(Number(value))
                                            setOverviewPage(1)
                                        }}
                                    >
                                        <SelectTrigger className="h-8 w-[70px]">
                                            <SelectValue placeholder={overviewPageSize} />
                                        </SelectTrigger>
                                        <SelectContent side="top">
                                            {[10, 20, 50, 100].map((size) => (
                                                <SelectItem key={size} value={`${size}`}>
                                                    {size}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {overviewTotalPages > 1 && (
                                    <Pagination className="justify-end w-auto mx-0">
                                        <PaginationContent>
                                            <PaginationItem>
                                                <PaginationPrevious
                                                    onClick={() => setOverviewPage(p => Math.max(1, p - 1))}
                                                    className={overviewPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                                />
                                            </PaginationItem>
                                            {(() => {
                                                const generatePaginationItems = (current: number, total: number) => {
                                                    if (total <= 7) {
                                                        return Array.from({ length: total }, (_, i) => i + 1);
                                                    }
                                                    const items: (number | 'ellipsis-start' | 'ellipsis-end')[] = [1];
                                                    let start = Math.max(2, current - 2);
                                                    let end = Math.min(total - 1, current + 2);
                                                    if (current < 4) {
                                                        end = Math.min(total - 1, 5);
                                                    }
                                                    if (current > total - 3) {
                                                        start = Math.max(2, total - 4);
                                                    }
                                                    if (start > 2) {
                                                        items.push('ellipsis-start');
                                                    }
                                                    for (let i = start; i <= end; i++) {
                                                        items.push(i);
                                                    }
                                                    if (end < total - 1) {
                                                        items.push('ellipsis-end');
                                                    }
                                                    if (total > 1) {
                                                        items.push(total);
                                                    }
                                                    return items;
                                                };
                                                return generatePaginationItems(overviewPage, overviewTotalPages).map((item) => (
                                                    <PaginationItem key={typeof item === 'string' ? item : item}>
                                                        {typeof item === 'number' ? (
                                                            <PaginationLink
                                                                isActive={overviewPage === item}
                                                                onClick={() => setOverviewPage(item)}
                                                                className="cursor-pointer"
                                                            >
                                                                {item}
                                                            </PaginationLink>
                                                        ) : (
                                                            <PaginationEllipsis />
                                                        )}
                                                    </PaginationItem>
                                                ));
                                            })()}
                                            <PaginationItem>
                                                <PaginationNext
                                                    onClick={() => setOverviewPage(p => Math.min(overviewTotalPages, p + 1))}
                                                    className={overviewPage === overviewTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                                />
                                            </PaginationItem>
                                        </PaginationContent>
                                    </Pagination>
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    {/* Items Tab (Serialized Details) */}
                    <TabsContent value="items" className="space-y-4">
                         <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg">
                            <Search className="h-4 w-4 text-muted-foreground ml-2" />
                            <Input 
                                placeholder="搜索名称或SN..." 
                                value={itemSearch} 
                                onChange={e => { setItemSearch(e.target.value); setItemPage(1); }}
                                className="w-[300px] border-none shadow-none bg-transparent focus-visible:ring-0" 
                            />
                            <div className="h-4 w-[1px] bg-border mx-2" />
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <Select value={itemWarehouseFilter} onValueChange={setItemWarehouseFilter}>
                                <SelectTrigger className="w-[150px] border-none shadow-none bg-transparent focus:ring-0">
                                    <SelectValue placeholder="所有仓库" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">所有仓库</SelectItem>
                                    {warehouses.map(w => (
                                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={itemStatusFilter} onValueChange={setItemStatusFilter}>
                                <SelectTrigger className="w-[150px] border-none shadow-none bg-transparent focus:ring-0">
                                    <SelectValue placeholder="所有状态" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">所有状态</SelectItem>
                                    <SelectItem value="AVAILABLE">可用</SelectItem>
                                    <SelectItem value="RENTING">在租</SelectItem>
                                    <SelectItem value="MAINTENANCE">维修中</SelectItem>
                                    <SelectItem value="LOST">丢失</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="rounded-md border bg-card">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>SN</TableHead>
                                        <TableHead>物品名称</TableHead>
                                        <TableHead>仓库</TableHead>
                                        <TableHead>状态</TableHead>
                                        <TableHead>入库时间</TableHead>
                                        <TableHead className="text-right">操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedItems.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-mono">{item.sn || "-"}</TableCell>
                                            <TableCell className="font-medium">{item.itemType.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{item.warehouse.name}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={
                                                    item.status === "AVAILABLE" ? "default" : 
                                                    item.status === "RENTING" ? "secondary" : "destructive"
                                                }>
                                                    {item.status === "AVAILABLE" ? "可用" :
                                                     item.status === "RENTING" ? "在租" : item.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {new Date(item.createdAt).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button 
                                                    size="icon" 
                                                    variant="ghost" 
                                                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                    onClick={() => handleDeleteClick(item.id)}
                                                    title="删除物品"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {paginatedItems.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">暂无物品数据</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-between mt-4 px-2">
                            <div className="text-sm text-muted-foreground">
                                共 {filteredItems.length} 条数据，本页显示 {paginatedItems.length} 条
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-2">
                                    <p className="text-sm font-medium text-gray-500">每页行数</p>
                                    <Select
                                        value={`${itemPageSize}`}
                                        onValueChange={(value) => {
                                            setItemPageSize(Number(value))
                                            setItemPage(1)
                                        }}
                                    >
                                        <SelectTrigger className="h-8 w-[70px]">
                                            <SelectValue placeholder={itemPageSize} />
                                        </SelectTrigger>
                                        <SelectContent side="top">
                                            {[10, 20, 50, 100].map((size) => (
                                                <SelectItem key={size} value={`${size}`}>
                                                    {size}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {itemTotalPages > 1 && (
                                    <Pagination className="justify-end w-auto mx-0">
                                        <PaginationContent>
                                            <PaginationItem>
                                                <PaginationPrevious
                                                    onClick={() => setItemPage(p => Math.max(1, p - 1))}
                                                    className={itemPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                                />
                                            </PaginationItem>
                                            {(() => {
                                                const generatePaginationItems = (current: number, total: number) => {
                                                    if (total <= 7) {
                                                        return Array.from({ length: total }, (_, i) => i + 1);
                                                    }
                                                    const items: (number | 'ellipsis-start' | 'ellipsis-end')[] = [1];
                                                    let start = Math.max(2, current - 2);
                                                    let end = Math.min(total - 1, current + 2);
                                                    if (current < 4) {
                                                        end = Math.min(total - 1, 5);
                                                    }
                                                    if (current > total - 3) {
                                                        start = Math.max(2, total - 4);
                                                    }
                                                    if (start > 2) {
                                                        items.push('ellipsis-start');
                                                    }
                                                    for (let i = start; i <= end; i++) {
                                                        items.push(i);
                                                    }
                                                    if (end < total - 1) {
                                                        items.push('ellipsis-end');
                                                    }
                                                    if (total > 1) {
                                                        items.push(total);
                                                    }
                                                    return items;
                                                };
                                                return generatePaginationItems(itemPage, itemTotalPages).map((item) => (
                                                    <PaginationItem key={typeof item === 'string' ? item : item}>
                                                        {typeof item === 'number' ? (
                                                            <PaginationLink
                                                                isActive={itemPage === item}
                                                                onClick={() => setItemPage(item)}
                                                                className="cursor-pointer"
                                                            >
                                                                {item}
                                                            </PaginationLink>
                                                        ) : (
                                                            <PaginationEllipsis />
                                                        )}
                                                    </PaginationItem>
                                                ));
                                            })()}
                                            <PaginationItem>
                                                <PaginationNext
                                                    onClick={() => setItemPage(p => Math.min(itemTotalPages, p + 1))}
                                                    className={itemPage === itemTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                                />
                                            </PaginationItem>
                                        </PaginationContent>
                                    </Pagination>
                                )}
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Dialog: Create/Edit Item Definition */}
            <Dialog open={defDialogOpen} onOpenChange={setDefDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{editingDef ? "编辑物品定义" : "新增物品定义"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <Label className="text-xs">物品名称</Label>
                            <Input className="h-8" value={defName} onChange={e => setDefName(e.target.value)} placeholder="例如: iPhone 15" />
                            <p className="text-[10px] text-muted-foreground">这将是库存中显示的物品名称</p>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">管理方式</Label>
                            <Select value={defIsSerialized} onValueChange={setDefIsSerialized}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="true">序列化 (一物一码, 追踪SN)</SelectItem>
                                    <SelectItem value="false">非序列化 (仅追踪数量)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs">单位</Label>
                                <Input className="h-8" value={defUnit} onChange={e => setDefUnit(e.target.value)} placeholder="例如: 台" />
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {COMMON_UNITS.map(u => (
                                        <Badge 
                                            key={u} 
                                            variant="outline" 
                                            className="cursor-pointer hover:bg-accent font-normal text-[10px] px-1 py-0"
                                            onClick={() => setDefUnit(u)}
                                        >
                                            {u}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">分类</Label>
                                <Select 
                                    value={isCustomCategory ? "custom" : defCategory} 
                                    onValueChange={(val) => {
                                        if (val === "custom") {
                                            setIsCustomCategory(true)
                                            setDefCategory("")
                                        } else {
                                            setIsCustomCategory(false)
                                            setDefCategory(val)
                                        }
                                    }}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="选择或输入分类" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableCategories.map(c => (
                                            <SelectItem key={c} value={c}>{c}</SelectItem>
                                        ))}
                                        <SelectItem value="custom">自定义 / 其他</SelectItem>
                                    </SelectContent>
                                </Select>
                                {isCustomCategory && (
                                    <Input 
                                        value={defCategory} 
                                        onChange={e => setDefCategory(e.target.value)} 
                                        placeholder="输入新分类名称"
                                        className="mt-2 h-8"
                                    />
                                )}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">采购价 (选填)</Label>
                            <Input 
                                type="number" 
                                className="h-8"
                                value={defPurchasePrice} 
                                onChange={e => setDefPurchasePrice(e.target.value)} 
                                placeholder="0.00" 
                                min="0"
                                step="0.01"
                            />
                        </div>
                        </div>
                    <DialogFooter>
                        <Button onClick={handleSaveDef} disabled={isPending} size="sm">保存</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog: Adjust Stock (Non-serialized) */}
            <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>库存数量调整</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>仓库</Label>
                             <Select value={adjustWarehouseId} onValueChange={setAdjustWarehouseId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="选择仓库..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {warehouses.map(w => (
                                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-3">
                            <Label>调整类型</Label>
                            <div className="flex gap-4">
                                <div 
                                    className={`flex-1 flex items-center gap-2 border rounded-md p-3 cursor-pointer transition-all ${adjustType === "IN" ? "bg-green-50 border-green-500 ring-1 ring-green-500" : "hover:bg-accent border-muted"}`}
                                    onClick={() => setAdjustType("IN")}
                                >
                                    <div className={`p-1 rounded-full ${adjustType === "IN" ? "bg-green-100" : "bg-muted"}`}>
                                        <ArrowDown className={`h-4 w-4 ${adjustType === "IN" ? "text-green-600" : "text-muted-foreground"}`} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className={`font-medium text-sm ${adjustType === "IN" ? "text-green-900" : ""}`}>入库/增加</span>
                                        <span className="text-xs text-muted-foreground">增加库存数量</span>
                                    </div>
                                    {adjustType === "IN" && <Check className="ml-auto h-4 w-4 text-green-600" />}
                                </div>
                                <div 
                                    className={`flex-1 flex items-center gap-2 border rounded-md p-3 cursor-pointer transition-all ${adjustType === "OUT" ? "bg-orange-50 border-orange-500 ring-1 ring-orange-500" : "hover:bg-accent border-muted"}`}
                                    onClick={() => setAdjustType("OUT")}
                                >
                                    <div className={`p-1 rounded-full ${adjustType === "OUT" ? "bg-orange-100" : "bg-muted"}`}>
                                        <ArrowUp className={`h-4 w-4 ${adjustType === "OUT" ? "text-orange-600" : "text-muted-foreground"}`} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className={`font-medium text-sm ${adjustType === "OUT" ? "text-orange-900" : ""}`}>出库/减少</span>
                                        <span className="text-xs text-muted-foreground">减少库存数量</span>
                                    </div>
                                    {adjustType === "OUT" && <Check className="ml-auto h-4 w-4 text-orange-600" />}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>调整数量</Label>
                            <Input 
                                type="number" 
                                value={adjustQuantity} 
                                onChange={e => setAdjustQuantity(e.target.value)} 
                                placeholder="0"
                                min="0"
                            />
                            <p className="text-xs text-muted-foreground">
                                当前调整针对: {itemTypes.find(t => t.id === adjustItemTypeId)?.name}
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleAdjustStock} disabled={isPending}>确认调整</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

             {/* Dialog: Batch Inbound/Outbound (Serialized) */}
             <Dialog open={batchInboundOpen} onOpenChange={setBatchInboundOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>序列化物品操作</DialogTitle>
                    </DialogHeader>
                    <div className="flex gap-2 border-b pb-2">
                        <Button
                            variant={batchDialogTab === "IN" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setBatchDialogTab("IN")}
                        >批量入库</Button>
                        <Button
                            variant={batchDialogTab === "OUT" ? "destructive" : "outline"}
                            size="sm"
                            onClick={() => setBatchDialogTab("OUT")}
                        >批量出库</Button>
                    </div>
                    <div className="py-4 space-y-4">
                        {!batchItemTypeId && (
                            <div className="space-y-2">
                                <Label>选择物品</Label>
                                <Select value={batchItemTypeId} onValueChange={setBatchItemTypeId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择物品..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {itemTypes.filter(t => t.isSerialized).map(t => (
                                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {batchDialogTab === "IN" ? (
                            <>
                                <div className="space-y-2">
                                    <Label>入库仓库</Label>
                                    <Select value={batchWarehouseId} onValueChange={setBatchWarehouseId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="选择仓库..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {warehouses.map(w => (
                                                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>序列号 (一行一个)</Label>
                                    <Textarea
                                        value={batchSns}
                                        onChange={e => setBatchSns(e.target.value)}
                                        placeholder={"SN001\nSN002\nSN003"}
                                        className="h-32 font-mono"
                                    />
                                    <p className="text-xs text-muted-foreground">每行一个序列号，系统将自动批量创建。</p>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-2">
                                <Label>出库仓库</Label>
                                <Select value={batchWarehouseId} onValueChange={setBatchWarehouseId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择仓库..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {warehouses.map(w => (
                                            <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {batchDialogTab === "OUT" && (
                            <div className="space-y-2">
                                <Label>序列号 (一行一个)</Label>
                                <Textarea
                                    value={batchOutboundSns}
                                    onChange={e => setBatchOutboundSns(e.target.value)}
                                    placeholder={"SN001\nSN002\nSN003"}
                                    className="h-32 font-mono"
                                />
                                <p className="text-xs text-muted-foreground">输入要出库的序列号，每行一个，未找到的序列号会在结果中提示。</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        {batchDialogTab === "IN"
                            ? <Button onClick={handleBatchInbound} disabled={isPending}>确认入库</Button>
                            : <Button variant="destructive" onClick={handleBatchOutbound} disabled={isPending}>确认出库</Button>
                        }
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog: Delete Confirmation (Item) */}
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                            确认删除
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground">
                            确定要删除这个物品吗？此操作将把物品标记为&quot;已删除&quot;状态。
                            <br/><br/>
                            注意：这不会影响历史订单记录，但该物品将无法再被分配或出租。
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>取消</Button>
                        <Button variant="destructive" onClick={handleConfirmDelete} disabled={isPending}>确认删除</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog: Delete Confirmation (Item Type) */}
            <Dialog open={deleteTypeConfirmOpen} onOpenChange={setDeleteTypeConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                            确认删除物品定义
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground">
                            确定要删除这个物品定义吗？
                            <br/><br/>
                            <span className="font-semibold text-destructive">警告：</span> 与之关联的库存数据可能也会受到影响或变得不可用。请确保已处理完相关库存。
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTypeConfirmOpen(false)}>取消</Button>
                        <Button variant="destructive" onClick={handleConfirmDeleteType} disabled={isPending}>确认删除</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Sheet: Serialized Item Details */}
            <Sheet open={detailsSheetOpen} onOpenChange={setDetailsSheetOpen}>
                <SheetContent className="overflow-y-auto" style={{ width: 960, maxWidth: 960, minWidth: 960 }}>
                    <SheetHeader>
                        <SheetTitle>物品明细: {itemTypes.find(t => t.id === detailsItemTypeId)?.name}</SheetTitle>
                    </SheetHeader>
                    <div className="mt-6 space-y-4">
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>SN</TableHead>
                                        <TableHead>仓库</TableHead>
                                        <TableHead>状态</TableHead>
                                        <TableHead className="text-right">操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedSheetItems.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-mono text-sm">
                                                {item.sn || "-"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{item.warehouse.name}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                 <Badge variant={
                                                    item.status === "AVAILABLE" ? "default" : 
                                                    item.status === "RENTING" ? "secondary" : "destructive"
                                                }>
                                                    {item.status === "AVAILABLE" ? "可用" :
                                                     item.status === "RENTING" ? "在租" : item.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    {item.sn && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-xs px-2"
                                                            onClick={() => openSnDetail(item.sn!)}
                                                            title="查看订单占用"
                                                        >
                                                            查看占用
                                                        </Button>
                                                    )}
                                                    <Button 
                                                        size="icon" 
                                                        variant="ghost" 
                                                        className="text-red-500 hover:text-red-600 h-8 w-8"
                                                        onClick={() => handleDeleteClick(item.id)}
                                                        title="删除"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {paginatedSheetItems.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                                                暂无物品
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Pagination for Sheet */}
                        <div className="flex items-center justify-between mt-4 px-2">
                            <div className="text-sm text-muted-foreground">
                                共 {sheetItems.length} 条数据，本页显示 {paginatedSheetItems.length} 条
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-2">
                                    <p className="text-sm font-medium text-gray-500">每页行数</p>
                                    <Select
                                        value={`${sheetPageSize}`}
                                        onValueChange={(value) => {
                                            setSheetPageSize(Number(value))
                                            setSheetPage(1)
                                        }}
                                    >
                                        <SelectTrigger className="h-8 w-[70px]">
                                            <SelectValue placeholder={sheetPageSize} />
                                        </SelectTrigger>
                                        <SelectContent side="top">
                                            {[10, 20, 50, 100].map((size) => (
                                                <SelectItem key={size} value={`${size}`}>
                                                    {size}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {sheetTotalPages > 1 && (
                                    <Pagination className="justify-end w-auto mx-0">
                                        <PaginationContent>
                                            <PaginationItem>
                                                <PaginationPrevious
                                                    onClick={() => setSheetPage(p => Math.max(1, p - 1))}
                                                    className={sheetPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                                />
                                            </PaginationItem>
                                            {(() => {
                                                const generatePaginationItems = (current: number, total: number) => {
                                                    if (total <= 7) {
                                                        return Array.from({ length: total }, (_, i) => i + 1);
                                                    }
                                                    const items: (number | 'ellipsis-start' | 'ellipsis-end')[] = [1];
                                                    let start = Math.max(2, current - 2);
                                                    let end = Math.min(total - 1, current + 2);
                                                    if (current < 4) {
                                                        end = Math.min(total - 1, 5);
                                                    }
                                                    if (current > total - 3) {
                                                        start = Math.max(2, total - 4);
                                                    }
                                                    if (start > 2) {
                                                        items.push('ellipsis-start');
                                                    }
                                                    for (let i = start; i <= end; i++) {
                                                        items.push(i);
                                                    }
                                                    if (end < total - 1) {
                                                        items.push('ellipsis-end');
                                                    }
                                                    if (total > 1) {
                                                        items.push(total);
                                                    }
                                                    return items;
                                                };
                                                return generatePaginationItems(sheetPage, sheetTotalPages).map((item) => (
                                                    <PaginationItem key={typeof item === 'string' ? item : item}>
                                                        {typeof item === 'number' ? (
                                                            <PaginationLink
                                                                isActive={sheetPage === item}
                                                                onClick={() => setSheetPage(item)}
                                                                className="cursor-pointer"
                                                            >
                                                                {item}
                                                            </PaginationLink>
                                                        ) : (
                                                            <PaginationEllipsis />
                                                        )}
                                                    </PaginationItem>
                                                ));
                                            })()}
                                            <PaginationItem>
                                                <PaginationNext
                                                    onClick={() => setSheetPage(p => Math.min(sheetTotalPages, p + 1))}
                                                    className={sheetPage === sheetTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                                />
                                            </PaginationItem>
                                        </PaginationContent>
                                    </Pagination>
                                )}
                            </div>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            {/* Sheet: Non-serialized item orders */}
            <Sheet open={nonSerialOrdersSheetOpen} onOpenChange={setNonSerialOrdersSheetOpen}>
                <SheetContent className="overflow-y-auto" style={{ width: 960, maxWidth: 960, minWidth: 960 }}>
                    <SheetHeader>
                        <SheetTitle>占用订单: {itemTypes.find(t => t.id === nonSerialOrdersItemTypeId)?.name}</SheetTitle>
                    </SheetHeader>
                    <div className="mt-6 space-y-4">
                        {nonSerialOrders === null ? (
                            <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
                        ) : (
                            <Tabs defaultValue="offline">
                                <TabsList>
                                    <TabsTrigger value="offline">线下订单 ({nonSerialOrders.orders.length})</TabsTrigger>
                                    <TabsTrigger value="online">线上订单 ({nonSerialOrders.onlineOrders.length})</TabsTrigger>
                                </TabsList>

                                <TabsContent value="offline" className="space-y-3 mt-3">
                                    <div className="rounded-md border">
                                        <Table className="text-sm">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>订单号</TableHead>
                                                    <TableHead>平台</TableHead>
                                                    <TableHead>规格</TableHead>
                                                    <TableHead>客户</TableHead>
                                                    <TableHead>状态</TableHead>
                                                    <TableHead>租期</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {nonSerialOrders.orders.slice((nonSerialOfflinePage - 1) * nonSerialOrdersPageSize, nonSerialOfflinePage * nonSerialOrdersPageSize).map(o => (
                                                    <TableRow key={o.id}>
                                                        <TableCell className="font-mono text-xs">
                                                            <a href={offlineOrderUrl(o.orderNo, o.platform)} target="_blank" rel="noreferrer" className="text-blue-600 underline underline-offset-2 hover:text-blue-800">{o.orderNo}</a>
                                                        </TableCell>
                                                        <TableCell className="text-xs">{o.platform || "-"}</TableCell>
                                                        <TableCell className="text-xs">{o.spec?.name || "-"}</TableCell>
                                                        <TableCell className="text-xs">{o.customerName || "-"}</TableCell>
                                                        <TableCell><Badge variant="outline" className="text-xs">{statusLabel(o.status)}</Badge></TableCell>
                                                        <TableCell className="text-xs text-muted-foreground">
                                                            {o.rentStartDate ? new Date(o.rentStartDate).toLocaleDateString() : "-"}
                                                            {o.returnDeadline ? ` ~ ${new Date(o.returnDeadline).toLocaleDateString()}` : ""}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                                {nonSerialOrders.orders.length === 0 && (
                                                    <TableRow><TableCell colSpan={6} className="text-center h-16 text-muted-foreground text-xs">暂无线下订单</TableCell></TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    {Math.ceil(nonSerialOrders.orders.length / nonSerialOrdersPageSize) > 1 && (
                                        <div className="flex items-center justify-between px-1">
                                            <span className="text-xs text-muted-foreground">共 {nonSerialOrders.orders.length} 条</span>
                                            <Pagination className="justify-end w-auto mx-0">
                                                <PaginationContent>
                                                    <PaginationItem>
                                                        <PaginationPrevious onClick={() => setNonSerialOfflinePage(p => Math.max(1, p - 1))} className={nonSerialOfflinePage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                                                    </PaginationItem>
                                                    {Array.from({ length: Math.ceil(nonSerialOrders.orders.length / nonSerialOrdersPageSize) }, (_, i) => i + 1).map(p => (
                                                        <PaginationItem key={p}>
                                                            <PaginationLink isActive={nonSerialOfflinePage === p} onClick={() => setNonSerialOfflinePage(p)} className="cursor-pointer">{p}</PaginationLink>
                                                        </PaginationItem>
                                                    ))}
                                                    <PaginationItem>
                                                        <PaginationNext onClick={() => setNonSerialOfflinePage(p => Math.min(Math.ceil(nonSerialOrders.orders.length / nonSerialOrdersPageSize), p + 1))} className={nonSerialOfflinePage === Math.ceil(nonSerialOrders.orders.length / nonSerialOrdersPageSize) ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                                                    </PaginationItem>
                                                </PaginationContent>
                                            </Pagination>
                                        </div>
                                    )}
                                </TabsContent>

                                <TabsContent value="online" className="space-y-3 mt-3">
                                    <div className="rounded-md border">
                                        <Table className="text-sm">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>订单号</TableHead>
                                                    <TableHead>平台</TableHead>
                                                    <TableHead>规格</TableHead>
                                                    <TableHead>客户</TableHead>
                                                    <TableHead>状态</TableHead>
                                                    <TableHead>租期</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {nonSerialOrders.onlineOrders.slice((nonSerialOnlinePage - 1) * nonSerialOrdersPageSize, nonSerialOnlinePage * nonSerialOrdersPageSize).map(o => (
                                                    <TableRow key={o.id}>
                                                        <TableCell className="font-mono text-xs">
                                                            <a href={onlineOrderUrl(o.orderNo, o.platform)} target="_blank" rel="noreferrer" className="text-blue-600 underline underline-offset-2 hover:text-blue-800">{o.orderNo}</a>
                                                        </TableCell>
                                                        <TableCell className="text-xs">{o.platform || "-"}</TableCell>
                                                        <TableCell className="text-xs">{o.spec?.name || "-"}</TableCell>
                                                        <TableCell className="text-xs">{o.customerName || "-"}</TableCell>
                                                        <TableCell><Badge variant="outline" className="text-xs">{statusLabel(o.status)}</Badge></TableCell>
                                                        <TableCell className="text-xs text-muted-foreground">
                                                            {o.rentStartDate ? new Date(o.rentStartDate).toLocaleDateString() : "-"}
                                                            {o.returnDeadline ? ` ~ ${new Date(o.returnDeadline).toLocaleDateString()}` : ""}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                                {nonSerialOrders.onlineOrders.length === 0 && (
                                                    <TableRow><TableCell colSpan={6} className="text-center h-16 text-muted-foreground text-xs">暂无线上订单</TableCell></TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    {Math.ceil(nonSerialOrders.onlineOrders.length / nonSerialOrdersPageSize) > 1 && (
                                        <div className="flex items-center justify-between px-1">
                                            <span className="text-xs text-muted-foreground">共 {nonSerialOrders.onlineOrders.length} 条</span>
                                            <Pagination className="justify-end w-auto mx-0">
                                                <PaginationContent>
                                                    <PaginationItem>
                                                        <PaginationPrevious onClick={() => setNonSerialOnlinePage(p => Math.max(1, p - 1))} className={nonSerialOnlinePage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                                                    </PaginationItem>
                                                    {Array.from({ length: Math.ceil(nonSerialOrders.onlineOrders.length / nonSerialOrdersPageSize) }, (_, i) => i + 1).map(p => (
                                                        <PaginationItem key={p}>
                                                            <PaginationLink isActive={nonSerialOnlinePage === p} onClick={() => setNonSerialOnlinePage(p)} className="cursor-pointer">{p}</PaginationLink>
                                                        </PaginationItem>
                                                    ))}
                                                    <PaginationItem>
                                                        <PaginationNext onClick={() => setNonSerialOnlinePage(p => Math.min(Math.ceil(nonSerialOrders.onlineOrders.length / nonSerialOrdersPageSize), p + 1))} className={nonSerialOnlinePage === Math.ceil(nonSerialOrders.onlineOrders.length / nonSerialOrdersPageSize) ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                                                    </PaginationItem>
                                                </PaginationContent>
                                            </Pagination>
                                        </div>
                                    )}
                                </TabsContent>
                            </Tabs>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            {/* Dialog: SN order detail */}
            <Dialog open={snDetailOpen} onOpenChange={setSnDetailOpen}>
                <DialogContent style={{ maxWidth: 640 }}>
                    <DialogHeader>
                        <DialogTitle>SN 占用详情: {snDetailSn}</DialogTitle>
                    </DialogHeader>
                    <div className="py-2 space-y-4">
                        {snDetailData === null ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">加载中...</div>
                        ) : (
                            <>
                                <div className="flex gap-6">
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="text-xs text-muted-foreground">线下订单占用</span>
                                        {snDetailData.orders.length > 0 ? (
                                            <a href={`/orders?sn=${encodeURIComponent(snDetailSn || '')}`} target="_blank" rel="noreferrer" className="text-2xl font-bold text-primary underline underline-offset-2">
                                                {snDetailData.orders.length}
                                            </a>
                                        ) : (
                                            <span className="text-2xl font-bold text-muted-foreground">0</span>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="text-xs text-muted-foreground">线上订单占用</span>
                                        {snDetailData.onlineOrders.length > 0 ? (
                                            <a href={`/online-orders?sn=${encodeURIComponent(snDetailSn || '')}`} target="_blank" rel="noreferrer" className="text-2xl font-bold text-primary underline underline-offset-2">
                                                {snDetailData.onlineOrders.length}
                                            </a>
                                        ) : (
                                            <span className="text-2xl font-bold text-muted-foreground">0</span>
                                        )}
                                    </div>
                                </div>
                                {(snDetailData.orders.length > 0 || snDetailData.onlineOrders.length > 0) && (() => {
                                    const allRows = [
                                        ...snDetailData.orders.map(o => ({ ...o, _src: 'offline' as const })),
                                        ...snDetailData.onlineOrders.map(o => ({ ...o, _src: 'online' as const })),
                                    ]
                                    const totalPages = Math.ceil(allRows.length / snDetailPageSize)
                                    const paged = allRows.slice((snDetailPage - 1) * snDetailPageSize, snDetailPage * snDetailPageSize)
                                    return (
                                        <div className="space-y-2">
                                            <div className="rounded-md border">
                                                <Table className="text-sm">
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>来源</TableHead>
                                                            <TableHead>订单号</TableHead>
                                                            <TableHead>平台</TableHead>
                                                            <TableHead>客户</TableHead>
                                                            <TableHead>状态</TableHead>
                                                            <TableHead>租期</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {paged.map(o => (
                                                            <TableRow key={o.id}>
                                                                <TableCell>
                                                                    {o._src === 'offline'
                                                                        ? <Badge variant="outline" className="text-xs">线下</Badge>
                                                                        : <Badge variant="secondary" className="text-xs">线上</Badge>}
                                                                </TableCell>
                                                                <TableCell className="font-mono text-xs">
                                                                    <a
                                                                        href={o._src === 'offline' ? offlineOrderUrl(o.orderNo, o.platform) : onlineOrderUrl(o.orderNo, o.platform)}
                                                                        target="_blank" rel="noreferrer"
                                                                        className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
                                                                    >{o.orderNo}</a>
                                                                </TableCell>
                                                                <TableCell className="text-xs">{o.platform || "-"}</TableCell>
                                                                <TableCell className="text-xs">{o.customerName || "-"}</TableCell>
                                                                <TableCell><Badge variant="outline" className="text-xs">{statusLabel(o.status)}</Badge></TableCell>
                                                                <TableCell className="text-xs text-muted-foreground">
                                                                    {o.rentStartDate ? new Date(o.rentStartDate).toLocaleDateString() : "-"}
                                                                    {o.returnDeadline ? ` ~ ${new Date(o.returnDeadline).toLocaleDateString()}` : ""}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                            {totalPages > 1 && (
                                                <div className="flex items-center justify-between px-1">
                                                    <span className="text-xs text-muted-foreground">共 {allRows.length} 条</span>
                                                    <Pagination className="justify-end w-auto mx-0">
                                                        <PaginationContent>
                                                            <PaginationItem>
                                                                <PaginationPrevious onClick={() => setSnDetailPage(p => Math.max(1, p - 1))} className={snDetailPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                                                            </PaginationItem>
                                                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                                                <PaginationItem key={p}>
                                                                    <PaginationLink isActive={snDetailPage === p} onClick={() => setSnDetailPage(p)} className="cursor-pointer">{p}</PaginationLink>
                                                                </PaginationItem>
                                                            ))}
                                                            <PaginationItem>
                                                                <PaginationNext onClick={() => setSnDetailPage(p => Math.min(totalPages, p + 1))} className={snDetailPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                                                            </PaginationItem>
                                                        </PaginationContent>
                                                    </Pagination>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })()}
                                {snDetailData.orders.length === 0 && snDetailData.onlineOrders.length === 0 && (
                                    <p className="text-center text-sm text-muted-foreground py-4">该 SN 暂无活跃订单占用</p>
                                )}
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
