"use client"

import { useState } from "react"
import Image from "next/image"
import { Order, OrderStatus, Product, User, OrderSource, Promoter } from "@/types"
import { compressImage } from "@/lib/image-utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { updateOrderStatus, updateOrderRemark, extendOrder, updateMiniProgramOrderNo, updateXianyuOrderNo, deleteOrder, shipOrder, returnOrder, approveOrder, rejectOrder, addOverdueFee, updateOrderScreenshot } from "@/app/actions"
import { format, addDays } from "date-fns"
import { Edit2, Plus, Search, ArrowUpDown, Trash2, Calendar, CircleDollarSign, Truck, RotateCcw, Check, X, Ban, ScrollText, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Copy, Upload, Image as ImageIcon } from "lucide-react"
import { closeOrder } from "@/app/actions"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { OrderForm } from "./order-form"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { updateOrderSourceInfo } from "@/app/actions"


interface OrderTableProps {
  orders: Order[]
  products: Product[] // Passed down for edit form
  users?: User[]
  promoters?: Promoter[]
}

const statusMap: Record<string, { label: string; color: string; order: number }> = {
  // New Statuses
  PENDING_REVIEW: { label: '待审核', color: 'bg-orange-500', order: 2 },
  PENDING_SHIPMENT: { label: '待发货', color: 'bg-blue-400', order: 5 },
  PENDING_RECEIPT: { label: '待收货', color: 'bg-blue-600', order: 6 },
  RENTING: { label: '待归还', color: 'bg-green-600', order: 7 }, // "待归还" implies Renting
  OVERDUE: { label: '已逾期', color: 'bg-red-600', order: 8 },
  RETURNING: { label: '归还中', color: 'bg-purple-500', order: 9 },
  COMPLETED: { label: '已完成', color: 'bg-gray-500', order: 10 },
  BOUGHT_OUT: { label: '已购买', color: 'bg-emerald-700', order: 11 },
  CLOSED: { label: '已关闭', color: 'bg-gray-400', order: 12 },
}

const sourceMap: Record<OrderSource, string> = {
  AGENT: '代理',
  PEER: '同行',
  RETAIL: '零售',
  PART_TIME: '兼职',
  PART_TIME_AGENT: '兼职代理',
}

const platformMap: Record<string, string> = {
  XIAOHONGSHU: '小红书',
  XIANYU: '闲鱼',
  DOUYIN: '抖音',
  OTHER: '其他',
  OFFLINE: '线下',
}

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

import { toast } from "sonner"

import { useRouter } from "next/navigation"

export function OrderTable({ orders, products, users = [], promoters = [] }: OrderTableProps) {
  const router = useRouter()
  const [filterOrderNo, setFilterOrderNo] = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterPromoter, setFilterPromoter] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterCreator, setFilterCreator] = useState('')
  const [filterDuration, setFilterDuration] = useState('')
  const [filterRecipientName, setFilterRecipientName] = useState('')
  const [filterRecipientPhone, setFilterRecipientPhone] = useState('')
  const [isFilterExpanded, setIsFilterExpanded] = useState(false)
  
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterSource, setFilterSource] = useState<string>('ALL')
  const [filterPlatform, setFilterPlatform] = useState<string>('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc') // Default asc for status order
  const [sortBy, setSortBy] = useState<'status' | 'createdAt'>('status') // Default sort by status

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const baseFilteredOrders = orders.filter(order => {
    const matchOrderNo = !filterOrderNo || 
        order.orderNo.toLowerCase().includes(filterOrderNo.toLowerCase()) || 
        (order.miniProgramOrderNo && order.miniProgramOrderNo.toLowerCase().includes(filterOrderNo.toLowerCase()))

    const matchCustomer = !filterCustomer || 
        order.customerXianyuId.toLowerCase().includes(filterCustomer.toLowerCase())

    const matchPromoter = !filterPromoter || 
        order.sourceContact.toLowerCase().includes(filterPromoter.toLowerCase()) ||
        (promoters.find(p => p.name === order.sourceContact)?.phone?.includes(filterPromoter))

    const matchProduct = !filterProduct || 
        order.productName.toLowerCase().includes(filterProduct.toLowerCase())

    const matchCreator = !filterCreator || 
        (users.find(u => u.id === order.creatorId)?.name || '').toLowerCase().includes(filterCreator.toLowerCase())

    const matchDuration = !filterDuration || order.duration?.toString() === filterDuration

    const matchRecipientName = !filterRecipientName || 
        (order.recipientName || '').toLowerCase().includes(filterRecipientName.toLowerCase())

    const matchRecipientPhone = !filterRecipientPhone || 
        (order.recipientPhone || '').includes(filterRecipientPhone)

    const matchSource = filterSource === 'ALL' || order.source === filterSource
    const matchPlatform = filterPlatform === 'ALL' || order.platform === filterPlatform

    let matchDate = true
    if (startDate) {
        matchDate = matchDate && order.createdAt >= startDate
    }
    if (endDate) {
        const nextDay = new Date(endDate)
        nextDay.setDate(nextDay.getDate() + 1)
        matchDate = matchDate && new Date(order.createdAt) < nextDay
    }

    return matchOrderNo && matchCustomer && matchPromoter && matchProduct && matchCreator && matchDuration && matchRecipientName && matchRecipientPhone && matchSource && matchPlatform && matchDate
  })

  const filteredOrders = baseFilteredOrders.filter(order => {
      return filterStatus === 'ALL' || order.status === filterStatus
  }).sort((a, b) => {
      if (sortBy === 'createdAt') {
          const dateA = new Date(a.createdAt).getTime()
          const dateB = new Date(b.createdAt).getTime()
          return sortDirection === 'asc' ? dateA - dateB : dateB - dateA
      }

      // Primary Sort: Status Order
      const orderA = statusMap[a.status]?.order || 99
      const orderB = statusMap[b.status]?.order || 99
      
      if (orderA !== orderB) {
          return orderA - orderB
      }

      // Secondary Sort: Date
      const dateA = new Date(a.rentStartDate).getTime()
      const dateB = new Date(b.rentStartDate).getTime()
      return sortDirection === 'asc' ? dateA - dateB : dateB - dateA
  })

  // Pagination Logic
  const totalPages = Math.ceil(filteredOrders.length / pageSize)
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Today Stats (from ALL orders, not just filtered page, but applying current filters if user wants? 
  // Requirement says "Order list... display today's order and amount". Usually implies the filtered view or global today?
  // Let's assume it implies "Today's stats of the current list view" OR "Global Today Stats". 
  // Given it's "above the filter component", it might be global for the current user/scope.
  // I will use `orders` prop which contains all orders accessible to this user.
  
  const today = new Date().toISOString().split('T')[0]
  const todayOrders = orders.filter(o => o.createdAt.startsWith(today))
  const todayCount = todayOrders.length
  const todayAmount = todayOrders.reduce((sum, o) => sum + o.totalAmount, 0)

  const toggleSort = () => {
      if (sortBy === 'status') {
        // Switch to createdAt sort
        setSortBy('createdAt')
        setSortDirection('desc') // Default to newest first
      } else {
        // Toggle direction
        setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
      }
  }

  const toggleRentSort = () => {
       if (sortBy === 'createdAt') {
           setSortBy('status')
           setSortDirection('asc')
       } else {
           setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
       }
  }

  const resetFilters = () => {
    setFilterOrderNo('')
    setFilterCustomer('')
    setFilterPromoter('')
    setFilterProduct('')
    setFilterCreator('')
    setFilterDuration('')
    setFilterRecipientName('')
    setFilterRecipientPhone('')
    setFilterStatus('ALL')
    setFilterSource('ALL')
    setFilterPlatform('ALL')
    setStartDate('')
    setEndDate('')
    setCurrentPage(1)
    toast.success("筛选已重置")
  }

  const refreshList = () => {
    router.refresh()
    toast.success("列表已刷新")
  }

  return (


    <div className="space-y-4">
      {/* Today Stats Banner */}
      <div className="flex gap-4 mb-2">
          <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-md border border-blue-100 text-sm font-medium flex items-center">
             <Calendar className="mr-2 h-4 w-4" />
             <span className="mr-2">今日订单:</span>
             <span className="text-lg font-bold mr-1">{todayCount}</span> 单
          </div>
          <div className="bg-green-50 text-green-700 px-4 py-2 rounded-md border border-green-100 text-sm font-medium flex items-center">
             <CircleDollarSign className="mr-2 h-4 w-4" />
             <span className="mr-2">今日金额:</span>
             <span className="text-lg font-bold mr-1">¥{todayAmount.toLocaleString()}</span>
          </div>
      </div>

      {/* Filters */}
      <Tabs defaultValue="ALL" value={filterStatus} onValueChange={setFilterStatus} className="w-full">
        <div className="overflow-x-auto pb-2">
            <TabsList>
                <TabsTrigger value="ALL">全部 ({baseFilteredOrders.length})</TabsTrigger>
                {Object.entries(statusMap).sort((a, b) => a[1].order - b[1].order).map(([k, v]) => (
                    <TabsTrigger key={k} value={k}>
                        {v.label} ({baseFilteredOrders.filter(o => o.status === k).length})
                    </TabsTrigger>
                ))}
            </TabsList>
        </div>
      </Tabs>

      <div className="flex flex-col gap-4 bg-white p-4 rounded-md border mb-4">
          <div className="flex flex-col gap-4">
              {/* Row 1: Primary Filters */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <div className="flex items-center space-x-2">
                      <Search className="w-4 h-4 text-gray-500" />
                      <Input 
                          placeholder="订单号/小程序单号" 
                          value={filterOrderNo}
                          onChange={e => setFilterOrderNo(e.target.value)}
                          className="h-8 text-xs"
                      />
                  </div>
                  <Input 
                      placeholder="客户ID/昵称" 
                      value={filterCustomer}
                      onChange={e => setFilterCustomer(e.target.value)}
                      className="h-8 text-xs"
                  />
                  <Input 
                      placeholder="收货人姓名" 
                      value={filterRecipientName}
                      onChange={e => setFilterRecipientName(e.target.value)}
                      className="h-8 text-xs"
                  />
                  <Input 
                      placeholder="收货人手机" 
                      value={filterRecipientPhone}
                      onChange={e => setFilterRecipientPhone(e.target.value)}
                      className="h-8 text-xs"
                  />
                   <Input 
                      placeholder="商品名称" 
                      value={filterProduct}
                      onChange={e => setFilterProduct(e.target.value)}
                      className="h-8 text-xs"
                  />
              </div>

              {/* Collapsible Filters */}
              {isFilterExpanded && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 border-t border-dashed">
                      <Input 
                          placeholder="推广员/电话" 
                          value={filterPromoter}
                          onChange={e => setFilterPromoter(e.target.value)}
                          className="h-8 text-xs"
                      />
                      <Input 
                          placeholder="创建人" 
                          value={filterCreator}
                          onChange={e => setFilterCreator(e.target.value)}
                          className="h-8 text-xs"
                      />
                      <Input 
                          type="number"
                          placeholder="租期 (天)" 
                          value={filterDuration}
                          onChange={e => setFilterDuration(e.target.value)}
                          className="h-8 text-xs"
                      />
                      
                      {/* Date Range Filter */}
                      <div className="flex items-center space-x-2 col-span-2">
                          <Label className="whitespace-nowrap text-sm text-gray-500">创建时间:</Label>
                          <Input 
                              type="date" 
                              value={startDate} 
                              onChange={e => setStartDate(e.target.value)} 
                              className="h-8 w-32 text-xs"
                          />
                          <span className="text-gray-400">-</span>
                          <Input 
                              type="date" 
                              value={endDate} 
                              onChange={e => setEndDate(e.target.value)} 
                              className="h-8 w-32 text-xs"
                          />
                          {(startDate || endDate) && (
                              <Button variant="ghost" size="sm" onClick={() => { setStartDate(''); setEndDate('') }} className="h-8">
                                  重置
                              </Button>
                          )}
                      </div>
                  </div>
              )}
          </div>
          
          <div className="flex flex-wrap gap-2 items-center justify-between border-t pt-4">
               <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setIsFilterExpanded(!isFilterExpanded)} 
                  className="h-9 px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              >
                  {isFilterExpanded ? (
                      <><ChevronUp className="mr-2 h-4 w-4" /> 收起筛选</>
                  ) : (
                      <><ChevronDown className="mr-2 h-4 w-4" /> 更多筛选</>
                  )}
              </Button>

              <div className="flex gap-2 items-center">
                  <Select value={filterPlatform} onValueChange={setFilterPlatform}>
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                          <SelectValue placeholder="推广方式" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="ALL">所有方式</SelectItem>
                          {Object.entries(platformMap).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>

                  <Select value={filterSource} onValueChange={setFilterSource}>
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                          <SelectValue placeholder="渠道筛选" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="ALL">推广渠道</SelectItem>
                          {Object.entries(sourceMap)
                              .filter(([k]) => k !== 'AGENT' && k !== 'PART_TIME')
                              .map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>

                  <Button variant="outline" size="sm" onClick={resetFilters} className="h-8 px-3 text-gray-600 text-xs">
                      <RotateCcw className="mr-2 h-3 w-3" /> 重置
                  </Button>
                  <Button variant="outline" size="sm" onClick={refreshList} className="h-8 px-3 text-gray-600 text-xs">
                      <RefreshCw className="mr-2 h-3 w-3" /> 刷新
                  </Button>
              </div>
          </div>
      </div>

      <div className="rounded-md border bg-white">
          <Table>
          <TableHeader>
              <TableRow>
              <TableHead className="w-[150px]">
                  <Button variant="ghost" size="sm" onClick={toggleSort} className="-ml-3 hover:bg-transparent flex items-center gap-1">
                      订单号/时间
                      <ArrowUpDown className={cn("ml-2 h-4 w-4 transition-opacity", sortBy === 'createdAt' ? "opacity-100" : "opacity-50")} />
                  </Button>
              </TableHead>
              <TableHead>用户昵称（闲鱼等）</TableHead>
              <TableHead>小程序单号</TableHead>
              <TableHead>闲鱼单号</TableHead>
              <TableHead>推广方式</TableHead>
              <TableHead>推广员</TableHead>
              <TableHead>物流信息</TableHead>
              <TableHead>设备信息</TableHead>
              <TableHead>
                  <Button variant="ghost" size="sm" onClick={toggleRentSort} className="-ml-3 hover:bg-transparent">
                      租期/时间
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
              </TableHead>
              <TableHead>金额详情</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>截图凭证</TableHead>
              <TableHead>备注</TableHead>
              </TableRow>
          </TableHeader>
          <TableBody>
              {paginatedOrders.map((order) => (
              <OrderRow key={order.id} order={order} products={products} promoters={promoters} />
              ))}
              {paginatedOrders.length === 0 && (
              <TableRow>
                  <TableCell colSpan={11} className="text-center h-24">
                  暂无匹配订单
                  </TableCell>
              </TableRow>
              )}
          </TableBody>
          </Table>
      </div>

      <div className="flex items-center justify-between mt-4 px-2">
          <div className="text-sm text-muted-foreground">
              共 {filteredOrders.length} 条数据，本页显示 {paginatedOrders.length} 条
          </div>

          <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <p className="text-sm font-medium text-gray-500">每页行数</p>
                <Select
              value={`${pageSize}`}
              onValueChange={(value) => {
                setPageSize(Number(value))
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {[20, 50, 100].map((size) => (
                  <SelectItem key={size} value={`${size}`}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {totalPages > 1 && (
              <Pagination className="justify-end w-auto mx-0">
                  <PaginationContent>
                      <PaginationItem>
                          <PaginationPrevious 
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                              className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                      </PaginationItem>
                      
                      {Array.from({ length: totalPages }).map((_, i) => (
                          <PaginationItem key={i}>
                              <PaginationLink 
                                  isActive={currentPage === i + 1}
                                  onClick={() => setCurrentPage(i + 1)}
                                  className="cursor-pointer"
                              >
                                  {i + 1}
                              </PaginationLink>
                          </PaginationItem>
                      ))}

                      <PaginationItem>
                          <PaginationNext 
                              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                      </PaginationItem>
                  </PaginationContent>
              </Pagination>
          )}
          </div>
      </div>
    </div>
  )
}

function ShipForm({ order, onSuccess }: { order: Order, onSuccess: () => void }) {
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || '')
  const [logisticsCompany, setLogisticsCompany] = useState(order.logisticsCompany || '顺丰速运')
  const isOffline = logisticsCompany === '线下自提'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isOffline && !trackingNumber) {
        toast.error("请输入物流单号")
        return
    }
    
    try {
        const res = await shipOrder(order.id, {
            trackingNumber,
            logisticsCompany,
        })
        
        if (res?.success) {
            toast.success(res.message)
            onSuccess()
        } else {
            toast.error(res?.message || "发货失败")
        }
    } catch (error) {
        console.error(error)
        toast.error("操作失败")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label>物流方式</Label>
                <Select value={logisticsCompany} onValueChange={setLogisticsCompany}>
                    <SelectTrigger>
                        <SelectValue placeholder="选择物流" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="顺丰速运">顺丰速运</SelectItem>
                        <SelectItem value="线下自提">线下自提</SelectItem>
                        <SelectItem value="其他">其他</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label>物流单号 (选填)</Label>
                <Input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} placeholder="请输入单号" />
            </div>
        </div>
        <Button type="submit" className="w-full">确认发货</Button>
    </form>
  )
}

function ReturnForm({ order, onSuccess }: { order: Order, onSuccess: () => void }) {
  const [returnTrackingNumber, setReturnTrackingNumber] = useState(order.returnTrackingNumber || '')
  const [returnLogisticsCompany, setReturnLogisticsCompany] = useState(order.returnLogisticsCompany || '顺丰速运')
  const isOffline = returnLogisticsCompany === '线下自提'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isOffline && !returnTrackingNumber) {
        toast.error("请输入归还物流单号")
        return
    }
    
    try {
        const res = await returnOrder(order.id, {
            returnTrackingNumber,
            returnLogisticsCompany,
        })
        
        if (res?.success) {
            toast.success(res.message)
            onSuccess()
        } else {
            toast.error(res?.message || "操作失败")
        }
    } catch (error) {
        console.error(error)
        toast.error("操作失败")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label>归还方式</Label>
                <Select value={returnLogisticsCompany} onValueChange={setReturnLogisticsCompany}>
                    <SelectTrigger>
                        <SelectValue placeholder="选择归还方式" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="顺丰速运">顺丰速运</SelectItem>
                        <SelectItem value="线下自提">线下自提</SelectItem>
                        <SelectItem value="其他">其他</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label>归还单号 (选填)</Label>
                <Input value={returnTrackingNumber} onChange={e => setReturnTrackingNumber(e.target.value)} placeholder="请输入归还单号" />
            </div>
        </div>
        <Button type="submit" className="w-full">确认归还</Button>
    </form>
  )
}

type LegacyPromoter = Promoter & { channels?: OrderSource[] }

function PlatformEditPopover({ order, onSave }: { order: Order, onSave: (p: string) => Promise<void> }) {
    const [open, setOpen] = useState(false)
    return (
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div className="cursor-pointer hover:opacity-80">
                    <Badge variant="secondary">{order.platform ? (platformMap[order.platform] || order.platform) : '点击选择'}</Badge>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-[150px] p-0">
                <Command>
                    <CommandInput placeholder="搜索..." />
                    <CommandList>
                        <CommandGroup>
                            {Object.entries(platformMap).map(([k, v]) => (
                                <CommandItem key={k} value={v} onSelect={async () => {
                                    await onSave(k)
                                    setOpen(false)
                                }}>
                                    <Check className={cn("mr-2 h-4 w-4", order.platform === k ? "opacity-100" : "opacity-0")} />
                                    {v}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
         </Popover>
    )
}

function SourceEditPopover({ order, promoters, onSave }: { order: Order, promoters: Promoter[], onSave: (s: string, c: string) => Promise<void> }) {
    const [open, setOpen] = useState(false)
    const [source, setSource] = useState(order.source)
    const [contact, setContact] = useState(order.sourceContact)
    
    return (
        <Popover open={open} onOpenChange={(v) => {
            setOpen(v)
            if (v) {
                setSource(order.source)
                setContact(order.sourceContact)
            }
        }}>
            <PopoverTrigger asChild>
                <div className="cursor-pointer group">
                    <Badge variant="outline" className="mb-1">{sourceMap[order.source] || order.source}</Badge>
                    <div className="text-xs text-gray-700 font-medium group-hover:text-blue-600 flex items-center gap-1">
                        {order.sourceContact || '-'}
                        <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                    </div>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-4 space-y-4">
                <div className="space-y-2">
                    <Label>渠道</Label>
                    <Select value={source} onValueChange={(v) => {
                        setSource(v as OrderSource)
                        setContact('') 
                    }}>
                        <SelectTrigger className="h-8">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                              <SelectItem value="PEER">同行</SelectItem>
                              <SelectItem value="PART_TIME_AGENT">兼职代理</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>推广员</Label>
                    <Select value={contact} onValueChange={setContact}>
                        <SelectTrigger className="h-8">
                            <SelectValue placeholder="选择推广员" />
                        </SelectTrigger>
                        <SelectContent>
                             {promoters.filter(p => {
                                if (p.channel === source) return true
                                const legacyChannels = (p as LegacyPromoter).channels
                                if (legacyChannels && legacyChannels.includes(source as OrderSource)) return true
                                return false
                             }).map(p => (
                                 <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                             ))}
                             <SelectItem value="self">自主开发</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <Button size="sm" className="w-full" onClick={async () => {
                    await onSave(source, contact)
                    setOpen(false)
                }}>保存</Button>
            </PopoverContent>
        </Popover>
    )
}

function OrderRow({ order, products, promoters }: { order: Order, products: Product[], promoters: Promoter[] }) {
  const router = useRouter()
  const [remark, setRemark] = useState(order.remark || '')
  const [isExtensionOpen, setIsExtensionOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isShipOpen, setIsShipOpen] = useState(false)
  const [isReturnOpen, setIsReturnOpen] = useState(false)
  const [isCloseOpen, setIsCloseOpen] = useState(false)
  const [isLogsOpen, setIsLogsOpen] = useState(false)
  const [isOverdueOpen, setIsOverdueOpen] = useState(false)
  const [closeRemark, setCloseRemark] = useState('')
  const [extDays, setExtDays] = useState(1)
  const [extPrice, setExtPrice] = useState(0)
  const [overdueFeeInput, setOverdueFeeInput] = useState(0)
  
  // MP No Edit
  const [mpNo, setMpNo] = useState(order.miniProgramOrderNo || '')
  const [isMpOpen, setIsMpOpen] = useState(false)

  // Xianyu No Edit
  const [xianyuNo, setXianyuNo] = useState(order.xianyuOrderNo || '')
  const [isXianyuOpen, setIsXianyuOpen] = useState(false)

  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleStatusChange = async (val: OrderStatus) => {
    try {
        const res = await updateOrderStatus(order.id, val)
        if (res?.success) {
            toast.success(res.message)
        } else {
            toast.error(res?.message || "操作失败")
        }
    } catch (error) {
        console.error(error)
        toast.error("操作失败: 请刷新页面重试")
    }
  }

  const handleRemarkBlur = async () => {
    if (remark !== order.remark) {
      try {
          const res = await updateOrderRemark(order.id, remark)
          if (res?.success) {
            toast.success(res.message)
          } else {
            toast.error(res?.message || "操作失败")
          }
      } catch (error) {
        console.error(error)
        toast.error("操作失败: 请刷新页面重试")
      }
    }
  }
  
  const handleSaveMpNo = async () => {
      try {
          const trimmedNo = mpNo.trim()
          if (trimmedNo && !/^SH\d{20}$/.test(trimmedNo)) {
              toast.error("小程序订单号格式错误，应为 SH + 20位数字")
              return
          }
          const res = await updateMiniProgramOrderNo(order.id, trimmedNo)
          if (res?.success) {
              setMpNo(trimmedNo)
              toast.success(res.message)
              setIsMpOpen(false)
          } else {
              toast.error(res?.message || "操作失败")
          }
      } catch (error) {
        console.error(error)
        toast.error("操作失败: 请刷新页面重试")
      }
  }

  const handleSaveXianyuNo = async () => {
      try {
          const res = await updateXianyuOrderNo(order.id, xianyuNo)
          if (res?.success) {
              toast.success(res.message)
              setIsXianyuOpen(false)
          } else {
              toast.error(res?.message || "操作失败")
          }
      } catch (error) {
        console.error(error)
        toast.error("操作失败: 请刷新页面重试")
      }
  }

  const handleScreenshotUpload = async (file: File) => {
      const currentScreenshots = order.screenshot ? order.screenshot.split(',').filter(Boolean) : []
      if (currentScreenshots.length >= 2) {
          toast.error("最多上传2张截图")
          return
      }

      try {
          const compressedFile = await compressImage(file)
          const formData = new FormData()
          formData.append('file', compressedFile)
          
          const toastId = toast.loading("正在压缩上传...")
          const res = await fetch('/api/upload', {
              method: 'POST',
              body: formData
          })
          const data = await res.json()
          
          if (data.success) {
              const newScreenshots = [...currentScreenshots, data.url].join(',')
              const updateRes = await updateOrderScreenshot(order.id, newScreenshots)
              if (updateRes.success) {
                  toast.success("截图上传更新成功", { id: toastId })
                  router.refresh()
              } else {
                  toast.error("截图上传成功但更新订单失败", { id: toastId })
              }
          } else {
              toast.error("上传失败", { id: toastId })
          }
      } catch (err) {
          console.error(err)
          toast.error("上传出错")
      }
  }

  const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      
      const files = e.dataTransfer.files
      if (files && files.length > 0) {
          const file = files[0]
          if (file.type === 'image/jpeg' || file.type === 'image/png') {
              await handleScreenshotUpload(file)
          } else {
              toast.error("仅支持 JPEG 或 PNG 格式")
          }
      }
  }

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
  }

  const handleUpdateSourceInfo = async (newSource: string, newContact: string, newPlatform?: string) => {
      try {
          const res = await updateOrderSourceInfo(order.id, newSource, newContact, newPlatform)
          if (res.success) {
              toast.success(res.message)
          } else {
              toast.error(res.message)
          }
      } catch (error) {
          console.error(error)
          toast.error("更新失败")
      }
  }

  const handleExtend = async () => {
    try {
        const res = await extendOrder(order.id, extDays, extPrice)
        if (res?.success) {
            toast.success(res.message)
            setIsExtensionOpen(false)
        } else {
            toast.error(res?.message || "操作失败")
        }
    } catch (error) {
        console.error(error)
        toast.error("操作失败: 请刷新页面重试")
    }
  }

  const handleDelete = async () => {
      try {
          const res = await deleteOrder(order.id)
          if (res?.success) {
              toast.success(res.message)
              setIsDeleteOpen(false)
          } else {
              toast.error(res?.message || "操作失败")
          }
      } catch (error) {
        console.error(error)
        toast.error("操作失败: 请刷新页面重试")
      }
  }

  const handleApprove = async () => {
    try {
        const res = await approveOrder(order.id)
        if (res?.success) toast.success(res.message)
        else toast.error(res?.message || "操作失败")
    } catch (error) {
        console.error(error)
        toast.error("操作失败")
    }
  }
  
  const handleReject = async () => {
     try {
        const res = await rejectOrder(order.id)
        if (res?.success) {
            toast.success(res.message)
            setIsRejectOpen(false)
            router.refresh()
        }
        else toast.error(res?.message || "操作失败")
    } catch (error) {
        console.error(error)
        toast.error("操作失败")
    }
  }

  const handleClose = async () => {
     try {
        const res = await closeOrder(order.id, closeRemark)
        if (res?.success) {
            toast.success(res.message)
            setIsCloseOpen(false)
            router.refresh()
        }
        else toast.error(res?.message || "操作失败")
    } catch (error) {
        console.error(error)
        toast.error("操作失败")
    }
  }

  const handleOverdueFee = async () => {
    try {
        const res = await addOverdueFee(order.id, overdueFeeInput)
        if (res?.success) {
            toast.success(res.message)
            setIsOverdueOpen(false)
        } else {
            toast.error(res?.message || "操作失败")
        }
    } catch (error) {
        console.error(error)
        toast.error("操作失败")
    }
  }

  const totalAmountWithExtensions = order.totalAmount + (order.extensions || []).reduce((acc, curr) => acc + curr.price, 0)
  const totalExtensionDays = (order.extensions || []).reduce((acc, curr) => acc + curr.days, 0)

  const copyToClipboard = (text: string) => {
    if (!text) return

    const fallbackCopy = (text: string) => {
      try {
        const textArea = document.createElement("textarea")
        textArea.value = text
        textArea.style.position = "fixed"
        textArea.style.left = "-9999px"
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        
        const successful = document.execCommand('copy')
        document.body.removeChild(textArea)
        
        if (successful) {
            toast.success("已复制")
        } else {
            toast.error("复制失败")
        }
      } catch (err) {
          toast.error("复制失败")
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => toast.success("已复制"))
            .catch(() => fallbackCopy(text))
    } else {
        fallbackCopy(text)
    }
  }

  return (
    <>
    <TableRow className="border-b-0 group">
      <TableCell className="font-medium align-top">
        <div className="flex items-center gap-1">
            <div className="text-sm font-bold">{order.orderNo}</div>
            <Button variant="ghost" size="icon" className="h-4 w-4 text-gray-400 hover:text-blue-600" onClick={() => copyToClipboard(order.orderNo)}>
                <Copy className="h-3 w-3" />
            </Button>
        </div>
        <div className="text-xs text-muted-foreground mt-1">{format(new Date(order.createdAt), 'MM-dd HH:mm')}</div>
        <div className="text-xs text-blue-600 mt-1">创建人: {order.creatorName}</div>
      </TableCell>
      <TableCell className="align-top">
        <div className="font-bold">{order.customerXianyuId}</div>
      </TableCell>
      <TableCell className="align-top">
         <div className="flex items-center gap-1">
            <Popover open={isMpOpen} onOpenChange={setIsMpOpen}>
                <PopoverTrigger asChild>
                    <div className="text-sm cursor-pointer hover:underline decoration-dashed underline-offset-4 text-green-700 font-mono break-all">
                        {order.miniProgramOrderNo || <span className="text-gray-300 italic text-xs">点击填写</span>}
                    </div>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3">
                    <div className="space-y-2">
                        <Label className="text-xs">小程序订单号</Label>
                        <div className="flex space-x-2">
                            <Input value={mpNo} onChange={e => setMpNo(e.target.value)} className="h-8 text-xs" />
                            <Button size="sm" className="h-8" onClick={handleSaveMpNo}>保存</Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
            {order.miniProgramOrderNo && (
                <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0 text-gray-400 hover:text-blue-600" onClick={() => copyToClipboard(order.miniProgramOrderNo!)}>
                    <Copy className="h-3 w-3" />
                </Button>
            )}
         </div>
      </TableCell>
      <TableCell className="align-top">
        <div className="flex items-center gap-1">
            <Popover open={isXianyuOpen} onOpenChange={setIsXianyuOpen}>
                <PopoverTrigger asChild>
                    <div className="text-sm cursor-pointer hover:underline decoration-dashed underline-offset-4 text-gray-700 font-mono break-all">
                        {order.xianyuOrderNo || <span className="text-gray-300 italic text-xs">点击填写</span>}
                    </div>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3">
                    <div className="space-y-2">
                        <Label className="text-xs">闲鱼订单号</Label>
                        <div className="flex space-x-2">
                            <Input value={xianyuNo} onChange={e => setXianyuNo(e.target.value)} className="h-8 text-xs" />
                            <Button size="sm" className="h-8" onClick={handleSaveXianyuNo}>保存</Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
            {order.xianyuOrderNo && (
                <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0 text-gray-400 hover:text-blue-600" onClick={() => copyToClipboard(order.xianyuOrderNo!)}>
                    <Copy className="h-3 w-3" />
                </Button>
            )}
        </div>
      </TableCell>
      <TableCell className="align-top">
         <PlatformEditPopover order={order} onSave={(p) => handleUpdateSourceInfo(order.source, p !== order.platform ? "" : order.sourceContact, p)} />
      </TableCell>
      <TableCell className="align-top">
         <SourceEditPopover order={order} promoters={promoters} onSave={(s, c) => handleUpdateSourceInfo(s, c)} />
      </TableCell>
      <TableCell className="align-top space-y-2">
        <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-500">收货信息</div>
            <div className="text-xs text-muted-foreground max-w-[150px] truncate cursor-help" title={`收件人: ${order.recipientName || '无'}\n电话: ${order.recipientPhone || '无'}\n地址: ${order.address}`}>
                {(order.recipientName || order.recipientPhone) ? (
                    <div>
                        {order.recipientName || '-'} <span className="mx-1">|</span> {order.recipientPhone || '-'}
                    </div>
                ) : null}
                <div>{order.address}</div>
            </div>
        </div>

        {order.logisticsCompany && (
            <div className="space-y-1 pt-2 border-t border-dashed border-gray-200">
                <div className="text-xs font-semibold text-gray-500">发货物流</div>
                <div className="text-xs">
                    {order.logisticsCompany === '线下自提' ? (
                        <div className="flex items-center text-orange-600 font-medium">
                            <Truck className="w-3 h-3 mr-1" />
                            线下自提
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <div className="flex items-center text-blue-600 font-medium">
                                <Truck className="w-3 h-3 mr-1" />
                                {order.logisticsCompany}
                            </div>
                            {order.trackingNumber && (
                                 <div className="font-mono text-gray-600 select-all" title="物流单号">
                                    {order.trackingNumber}
                                 </div>
                            )}
                            {order.latestLogisticsInfo && (
                                <div className="text-gray-500 scale-90 origin-left truncate max-w-[150px]" title={order.latestLogisticsInfo}>
                                    {order.latestLogisticsInfo}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        )}

        {order.returnLogisticsCompany && (
            <div className="space-y-1 pt-2 border-t border-dashed border-gray-200">
                <div className="text-xs font-semibold text-gray-500">归还物流</div>
                <div className="text-xs">
                    {order.returnLogisticsCompany === '线下自提' ? (
                        <div className="flex items-center text-orange-600 font-medium">
                            <RotateCcw className="w-3 h-3 mr-1" />
                            线下自提
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <div className="flex items-center text-purple-600 font-medium">
                                <RotateCcw className="w-3 h-3 mr-1" />
                                {order.returnLogisticsCompany}
                            </div>
                            {order.returnTrackingNumber && (
                                 <div className="font-mono text-gray-600 select-all" title="归还物流单号">
                                    {order.returnTrackingNumber}
                                 </div>
                            )}
                            {order.returnLatestLogisticsInfo && (
                                <div className="text-gray-500 scale-90 origin-left truncate max-w-[150px]" title={order.returnLatestLogisticsInfo}>
                                    {order.returnLatestLogisticsInfo}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        )}
      </TableCell>
      <TableCell className="align-top">
        <div className="font-semibold">{order.productName}</div>
        <div className="text-xs text-muted-foreground">{order.variantName}</div>
        {order.sn && (
             <div className="text-xs text-blue-600 font-mono mt-1">SN: {order.sn}</div>
        )}
        {(order.extensions || []).length > 0 && (
            <div className="mt-1">
                <Badge variant="secondary" className="text-xs">
                    + 续租 {(order.extensions || []).reduce((acc, curr) => acc + curr.days, 0)} 天
                </Badge>
            </div>
        )}
      </TableCell>
      <TableCell className="align-top">
        <div className="font-medium">{order.duration} 天</div>
        <div className="text-xs text-muted-foreground mt-1" title="预计发货">发: {order.deliveryTime ? format(new Date(order.deliveryTime), 'yyyy-MM-dd') : '-'}</div>
        <div className="text-xs text-muted-foreground" title="起租日期">起: {order.rentStartDate ? format(new Date(order.rentStartDate), 'yyyy-MM-dd') : '-'}</div>
        <div className="text-xs text-muted-foreground" title="租期结束">止: {order.rentStartDate ? format(addDays(new Date(order.rentStartDate), order.duration + totalExtensionDays - 1), 'yyyy-MM-dd') : '-'}</div>
        <div className="text-xs text-muted-foreground" title="最晚归还">归: {order.returnDeadline ? format(new Date(order.returnDeadline), 'yyyy-MM-dd') : '-'}</div>
      </TableCell>
      <TableCell className="align-top">
        <div className="font-bold text-red-600">¥ {totalAmountWithExtensions}</div>
        <div className="text-xs text-gray-500 mt-1">
            基础: {order.totalAmount}
        </div>
        <div className="text-xs text-gray-500 mt-1">
            租: {order.rentPrice} | 保: {order.insurancePrice}
        </div>
        <div className="text-xs text-gray-500">
            押: {order.deposit}
        </div>
        {(order.extensions || []).length > 0 && (
             <div className="text-xs text-red-400 mt-1">
                (+ 续租 ¥{(order.extensions || []).reduce((acc, curr) => acc + curr.price, 0)})
             </div>
        )}
        {order.overdueFee && order.overdueFee > 0 ? (
            <div className="text-xs text-red-600 mt-1 font-bold">
               (+ 违约金 ¥{order.overdueFee})
            </div>
        ) : null}
      </TableCell>
      <TableCell className="align-top">
        <Select defaultValue={order.status} onValueChange={handleStatusChange}>
          <SelectTrigger className={`w-[100px] h-8 text-xs text-white ${statusMap[order.status]?.color || 'bg-gray-400'}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(statusMap).map(([key, conf]) => (
              <SelectItem key={key} value={key}>{conf.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell 
        className={`align-top transition-colors min-w-[120px] ${isDragOver ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input 
            id={`screenshot-upload-${order.id}`}
            type="file" 
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleScreenshotUpload(file)
            }}
        />
        
        <div className="flex flex-wrap gap-2">
            {order.screenshot ? order.screenshot.split(',').filter(Boolean).map((url, i) => (
                <Dialog key={i}>
                    <DialogTrigger asChild>
                        <div className="cursor-pointer hover:opacity-80 transition-opacity relative group">
                            <Image 
                                src={url} 
                                alt={`截图 ${i+1}`}
                                width={48}
                                height={48}
                                className="w-12 h-12 object-cover rounded border border-gray-200" 
                            />
                        </div>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl w-auto p-0 overflow-hidden bg-transparent border-none shadow-none">
                        <Image 
                            src={url} 
                            alt="截图大图" 
                            width={1200}
                            height={900}
                            className="w-auto h-auto max-h-[90vh] rounded-md shadow-2xl" 
                        />
                    </DialogContent>
                </Dialog>
            )) : null}

            {(!order.screenshot || order.screenshot.split(',').filter(Boolean).length < 2) && (
                 <div 
                    className="w-12 h-12 rounded border border-dashed border-gray-300 flex items-center justify-center text-gray-300 hover:border-blue-400 hover:text-blue-400 transition-colors cursor-pointer" 
                    title="点击或拖入图片上传"
                    onClick={() => document.getElementById(`screenshot-upload-${order.id}`)?.click()}
                >
                    {isDragOver ? <Upload className="h-5 w-5 text-blue-500" /> : <ImageIcon className="h-5 w-5" />}
                </div>
            )}
        </div>
      </TableCell>
      <TableCell className="align-top">
        <Textarea 
            value={remark} 
            onChange={e => setRemark(e.target.value)} 
            onBlur={handleRemarkBlur}
            className="w-[150px] min-h-[50px] text-xs resize-none"
            placeholder="备注..."
        />
      </TableCell>
    </TableRow>
    <TableRow className="bg-gray-50/40 hover:bg-gray-50/60 border-b">
        <TableCell colSpan={11} className="p-2">
            <div className="flex items-center justify-start gap-2 flex-wrap">
                {/* Logs - Moved to start */}
                <Dialog open={isLogsOpen} onOpenChange={setIsLogsOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-gray-600 hover:text-blue-600 border-dashed" title="操作日志">
                            <ScrollText className="h-3 w-3 mr-1" /> 日志
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[600px] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>订单操作日志</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            {order.logs && order.logs.length > 0 ? (
                                <div className="space-y-4 relative pl-4 border-l border-gray-200 ml-2">
                                    {order.logs.map((log, i) => (
                                        <div key={i} className="relative">
                                            <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-blue-200 border-2 border-white"></div>
                                            <div className="text-sm font-semibold">{log.action}</div>
                                            <div className="text-xs text-gray-500 flex gap-2 mt-1">
                                                <span>{format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}</span>
                                                <span>·</span>
                                                <span>{log.operator}</span>
                                            </div>
                                            {log.details && (
                                                <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded mt-1">
                                                    {log.details}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-gray-500 py-4">暂无日志</div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Workflow Buttons */}
                {order.status === 'PENDING_REVIEW' && (
                    <>
                        <Button size="sm" onClick={handleApprove} className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700">
                            <Check className="h-3 w-3 mr-1" /> 审核通过
                        </Button>
                        <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" variant="destructive" className="h-7 px-2 text-xs">
                                    <X className="h-3 w-3 mr-1" /> 拒绝
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>确认拒绝审核</DialogTitle>
                                </DialogHeader>
                                <div className="py-4 text-sm text-gray-600">
                                    确定要拒绝该订单吗？拒绝后订单将直接关闭，无法恢复。
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsRejectOpen(false)}>取消</Button>
                                    <Button variant="destructive" onClick={handleReject}>确认拒绝</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </>
                )}

                {order.status === 'PENDING_SHIPMENT' && (
                    <Dialog open={isShipOpen} onOpenChange={setIsShipOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700">
                                <Truck className="h-3 w-3 mr-1" /> 发货
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>订单发货</DialogTitle>
                            </DialogHeader>
                            <ShipForm order={order} onSuccess={() => setIsShipOpen(false)} />
                        </DialogContent>
                    </Dialog>
                )}

                {/* Return for Renting/Overdue */}
                {['RENTING', 'OVERDUE'].includes(order.status) && (
                    <Dialog open={isReturnOpen} onOpenChange={setIsReturnOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="h-7 px-2 text-xs bg-purple-600 hover:bg-purple-700">
                                <RotateCcw className="h-3 w-3 mr-1" /> 归还
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>订单归还</DialogTitle>
                            </DialogHeader>
                            <ReturnForm order={order} onSuccess={() => setIsReturnOpen(false)} />
                        </DialogContent>
                    </Dialog>
                )}

                {/* Renew for Renting/Overdue/Returning/Pending_Receipt? "待归还：之后状态" */}
                {['PENDING_RECEIPT', 'RENTING', 'OVERDUE', 'RETURNING'].includes(order.status) && (
                        <Dialog open={isExtensionOpen} onOpenChange={setIsExtensionOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                                <Plus className="h-3 w-3 mr-1" /> 续租
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                            <DialogTitle>订单续租</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right">续租天数</Label>
                                <Input 
                                    type="number" 
                                    value={extDays} 
                                    onChange={e => setExtDays(Number(e.target.value))}
                                    className="col-span-3" 
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right">续租价格</Label>
                                <Input 
                                    type="number" 
                                    value={extPrice} 
                                    onChange={e => setExtPrice(Number(e.target.value))}
                                    className="col-span-3" 
                                />
                            </div>
                            </div>
                            <DialogFooter>
                            <Button onClick={handleExtend}>确认续租</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}

                {/* Overdue Penalty */}
                {['RENTING', 'OVERDUE', 'RETURNING'].includes(order.status) && (
                    <Dialog open={isOverdueOpen} onOpenChange={setIsOverdueOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-orange-600 border-orange-200 hover:bg-orange-50">
                                <AlertCircle className="h-3 w-3 mr-1" /> 逾期补价
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>添加逾期违约金</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right">违约金额</Label>
                                    <Input 
                                        type="number" 
                                        value={overdueFeeInput} 
                                        onChange={e => setOverdueFeeInput(Number(e.target.value))}
                                        className="col-span-3" 
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleOverdueFee}>确认添加</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}

                {/* Close Order (Replacing Cancel) */}
                {!['CLOSED', 'COMPLETED', 'BOUGHT_OUT'].includes(order.status) && (
                    <Dialog open={isCloseOpen} onOpenChange={setIsCloseOpen}>
                        <DialogTrigger asChild>
                            <Button variant="secondary" size="sm" className="h-7 px-2 text-xs hover:bg-red-100 hover:text-red-700">
                                <Ban className="h-3 w-3 mr-1" /> 关闭订单
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>关闭订单确认</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <p className="text-sm text-gray-500">确定要关闭此订单吗？此操作将终止订单流程。</p>
                                <div className="space-y-2">
                                    <Label>关闭备注 (必填)</Label>
                                    <Input 
                                        value={closeRemark}
                                        onChange={e => setCloseRemark(e.target.value)}
                                        placeholder="请输入关闭原因..."
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsCloseOpen(false)}>取消</Button>
                                <Button variant="destructive" onClick={handleClose} disabled={!closeRemark.trim()}>确认关闭</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}

                {/* Edit */}
                <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" title="修改">
                            <Edit2 className="h-3 w-3 mr-1" /> 修改
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>编辑订单</DialogTitle>
                        </DialogHeader>
                        <OrderForm 
                            products={products} 
                            promoters={promoters}
                            initialData={order} 
                            onSuccess={() => {
                                setIsEditOpen(false)
                                router.refresh()
                            }} 
                        />
                    </DialogContent>
                </Dialog>

                {/* Delete */}
                <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs hover:bg-red-50 hover:text-red-700" title="删除">
                            <Trash2 className="h-3 w-3 mr-1" /> 删除
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>确认删除订单?</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                            <p className="text-sm text-gray-500">
                                确定要删除订单 {order.orderNo} 吗？此操作无法撤销。
                            </p>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>取消</Button>
                            <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </TableCell>
    </TableRow>
    </>
  )
}
