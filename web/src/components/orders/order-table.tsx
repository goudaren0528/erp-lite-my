"use client"

import { useEffect, useState, useTransition } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Order, OrderStatus, Product, OrderSource, Promoter } from "@/types"
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
import { updateOrderStatus, updateOrderRemark, extendOrder, updateMiniProgramOrderNo, updateXianyuOrderNo, deleteOrder, shipOrder, confirmShipment, returnOrder, approveOrder, rejectOrder, addOverdueFee, updateOrderScreenshot, fetchOrders } from "@/app/actions"
import { format, addDays, differenceInDays } from "date-fns"
import { Edit2, Plus, Search, ArrowUpDown, Trash2, Calendar, CircleDollarSign, Truck, RotateCcw, Check, X, Ban, ScrollText, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Copy, Upload, Image as ImageIcon, Loader2 } from "lucide-react"
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
import { cn, calculateOrderRevenue } from "@/lib/utils"
import { updateOrderSourceInfo } from "@/app/actions"


interface OrderTableProps {
  orders: Order[]
  products: Product[] // Passed down for edit form
  promoters?: Promoter[]
  initialTotal: number
  initialBaseTotal: number
  initialStatusCounts: Record<string, number>
  initialTodayCount: number
  initialTodayAmount: number
}

const statusMap: Record<string, { label: string; color: string; order: number }> = {
  // New Statuses
  PENDING_REVIEW: { label: '待审核', color: 'bg-orange-500', order: 2 },
  PENDING_SHIPMENT: { label: '待发货', color: 'bg-blue-400', order: 5 },
  SHIPPED_PENDING_CONFIRMATION: { label: '已发货待确认', color: 'bg-indigo-500', order: 5.5 },
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
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

import { toast } from "sonner"


export function OrderTable({ orders, products, promoters = [], initialTotal, initialBaseTotal, initialStatusCounts, initialTodayCount, initialTodayAmount }: OrderTableProps) {
  const [filterOrderNo, setFilterOrderNo] = useState('')
  const [filterXianyuOrderNo, setFilterXianyuOrderNo] = useState('')
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
  const [currentOrders, setCurrentOrders] = useState<Order[]>(orders)
  const [total, setTotal] = useState(initialTotal)
  const [baseTotal, setBaseTotal] = useState(initialBaseTotal)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>(initialStatusCounts)
  const [todayCount, setTodayCount] = useState(initialTodayCount)
  const [todayAmount, setTodayAmount] = useState(initialTodayAmount)
  const [isLoading, setIsLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isPending, startTransition] = useTransition()

  // Pre-process orders to calculate OVERDUE status dynamically
  const processedOrders = currentOrders.map(order => {
    let status = order.status;
    // Check if Overdue: Status is RENTING and today > returnDeadline
    if (status === 'RENTING' && order.returnDeadline) {
        const deadline = new Date(order.returnDeadline);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        deadline.setHours(0, 0, 0, 0);

        if (today > deadline) {
            status = 'OVERDUE';
        }
    }
    return { ...order, status };
  });

  const displayOrders = [...processedOrders].sort((a, b) => {
      if (sortBy === 'createdAt') {
          const dateA = new Date(a.createdAt).getTime()
          const dateB = new Date(b.createdAt).getTime()
          return sortDirection === 'asc' ? dateA - dateB : dateB - dateA
      }

      const orderA = statusMap[a.status]?.order || 99
      const orderB = statusMap[b.status]?.order || 99
      
      if (orderA !== orderB) {
          return orderA - orderB
      }

      const dateA = new Date(a.rentStartDate).getTime()
      const dateB = new Date(b.rentStartDate).getTime()
      return sortDirection === 'asc' ? dateA - dateB : dateB - dateA
  })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

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

  useEffect(() => {
    setCurrentPage(1)
  }, [filterOrderNo, filterXianyuOrderNo, filterCustomer, filterPromoter, filterProduct, filterCreator, filterDuration, filterRecipientName, filterRecipientPhone, filterStatus, filterSource, filterPlatform, startDate, endDate, pageSize])

  useEffect(() => {
    setIsLoading(true)
    startTransition(async () => {
      try {
        const res = await fetchOrders({
          page: currentPage,
          pageSize,
          sortBy,
          sortDirection,
          filterOrderNo: filterOrderNo || undefined,
          filterXianyuOrderNo: filterXianyuOrderNo || undefined,
          filterCustomer: filterCustomer || undefined,
          filterPromoter: filterPromoter || undefined,
          filterProduct: filterProduct || undefined,
          filterCreator: filterCreator || undefined,
          filterDuration: filterDuration || undefined,
          filterRecipientName: filterRecipientName || undefined,
          filterRecipientPhone: filterRecipientPhone || undefined,
          filterStatus,
          filterSource,
          filterPlatform,
          startDate: startDate || undefined,
          endDate: endDate || undefined
        })
        setCurrentOrders(res.orders as unknown as Order[])
        setTotal(res.total)
        setBaseTotal(res.baseTotal)
        setStatusCounts(res.statusCounts || {})
        setTodayCount(res.todayCount)
        setTodayAmount(res.todayAmount)
      } catch {
        toast.error("加载订单失败")
      } finally {
        setIsLoading(false)
      }
    })
  }, [currentPage, pageSize, sortBy, sortDirection, filterOrderNo, filterXianyuOrderNo, filterCustomer, filterPromoter, filterProduct, filterCreator, filterDuration, filterRecipientName, filterRecipientPhone, filterStatus, filterSource, filterPlatform, startDate, endDate, refreshKey])

  const resetFilters = () => {
    setFilterOrderNo('')
    setFilterXianyuOrderNo('')
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
    setRefreshKey(prev => prev + 1)
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
                <TabsTrigger value="ALL">全部 ({baseTotal})</TabsTrigger>
                {Object.entries(statusMap).sort((a, b) => a[1].order - b[1].order).map(([k, v]) => (
                    <TabsTrigger key={k} value={k}>
                        {v.label} ({statusCounts[k] || 0})
                    </TabsTrigger>
                ))}
            </TabsList>
        </div>
      </Tabs>

      <div className="flex flex-col gap-4 bg-white p-4 rounded-md border mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {/* Always Visible (First 2 Rows approx) */}
              <div className="flex items-center space-x-2">
                  <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <Input 
                      placeholder="订单号/小程序单号" 
                      value={filterOrderNo}
                      onChange={e => setFilterOrderNo(e.target.value)}
                      className="h-8 text-xs"
                  />
              </div>
              <Input 
                  placeholder="闲鱼订单号" 
                  value={filterXianyuOrderNo}
                  onChange={e => setFilterXianyuOrderNo(e.target.value)}
                  className="h-8 text-xs"
              />
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
              
              <Select value={filterPlatform} onValueChange={setFilterPlatform}>
                  <SelectTrigger className="w-full h-8 text-xs">
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
                  <SelectTrigger className="w-full h-8 text-xs">
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

              {/* Collapsible Section (Row 3+) */}
              {isFilterExpanded && (
                  <>
                      <Input 
                          type="number"
                          placeholder="租期 (天)" 
                          value={filterDuration}
                          onChange={e => setFilterDuration(e.target.value)}
                          className="h-8 text-xs"
                      />
                      
                      <div className="flex items-center space-x-1 col-span-2 md:col-span-2 lg:col-span-2 xl:col-span-2">
                          <Label className="whitespace-nowrap text-xs text-gray-500">创建时间:</Label>
                          <Input 
                              type="date" 
                              value={startDate} 
                              onChange={e => setStartDate(e.target.value)} 
                              className="h-8 w-full min-w-[110px] text-xs"
                          />
                          <span className="text-gray-400">-</span>
                          <Input 
                              type="date" 
                              value={endDate} 
                              onChange={e => setEndDate(e.target.value)} 
                              className="h-8 w-full min-w-[110px] text-xs"
                          />
                      </div>
                  </>
              )}
              
              {/* Action Buttons inside Grid to save space or aligned? 
                  Better to keep actions separate or at the end of the grid?
                  Let's put the toggle button at the end if it flows, or keep it in the footer.
              */}
          </div>
          
          <div className="flex flex-wrap gap-2 items-center justify-between border-t pt-4">
               <div className="flex items-center gap-2">
                   <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setIsFilterExpanded(!isFilterExpanded)} 
                      className="h-8 px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs"
                  >
                      {isFilterExpanded ? (
                          <><ChevronUp className="mr-1 h-3 w-3" /> 收起</>
                      ) : (
                          <><ChevronDown className="mr-1 h-3 w-3" /> 更多筛选</>
                      )}
                  </Button>
                  {(startDate || endDate) && (
                      <Button variant="ghost" size="sm" onClick={() => { setStartDate(''); setEndDate('') }} className="h-8 text-xs text-gray-500">
                          清除日期
                      </Button>
                  )}
               </div>

              <div className="flex gap-2 items-center">
                  <Button variant="outline" size="sm" onClick={resetFilters} className="h-8 px-3 text-gray-600 text-xs">
                      <RotateCcw className="mr-2 h-3 w-3" /> 重置
                  </Button>
                  <Button variant="outline" size="sm" onClick={refreshList} className="h-8 px-3 text-gray-600 text-xs">
                      <RefreshCw className="mr-2 h-3 w-3" /> 刷新
                  </Button>
              </div>
          </div>
      </div>

      <div className="rounded-md border bg-white relative min-h-[300px]">
          {(isLoading || isPending) && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">加载中...</span>
              </div>
            </div>
          )}
          <Table>
          <TableHeader>
              <TableRow>
              <TableHead className="w-[180px]">
                  <Button variant="ghost" size="sm" onClick={toggleSort} className="-ml-3 hover:bg-transparent flex items-center gap-1">
                      订单号/时间
                      <ArrowUpDown className={cn("ml-2 h-4 w-4 transition-opacity", sortBy === 'createdAt' ? "opacity-100" : "opacity-50")} />
                  </Button>
              </TableHead>
              <TableHead className="w-[120px]">用户昵称（闲鱼等）</TableHead>
              <TableHead className="w-[150px]">小程序单号</TableHead>
              <TableHead className="w-[150px]">闲鱼单号</TableHead>
              <TableHead className="w-[100px]">推广方式</TableHead>
              <TableHead className="w-[100px]">推广员</TableHead>
              <TableHead className="w-[150px]">物流信息</TableHead>
              <TableHead className="w-[200px]">设备信息</TableHead>
              <TableHead className="w-[150px]">
                  <Button variant="ghost" size="sm" onClick={toggleRentSort} className="-ml-3 hover:bg-transparent">
                      租期/时间
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
              </TableHead>
              <TableHead className="w-[120px]">金额详情</TableHead>
              <TableHead className="w-[100px]">状态</TableHead>
              <TableHead className="w-[100px]">截图凭证</TableHead>
              <TableHead className="min-w-[150px]">备注</TableHead>
              </TableRow>
          </TableHeader>
          <TableBody>
              {displayOrders.map((order) => (
              <OrderRow key={order.id} order={order} products={products} promoters={promoters} onOrderUpdated={refreshList} />
              ))}
              {displayOrders.length === 0 && (
              <TableRow>
                  <TableCell colSpan={11} className="text-center h-24">
                      {isLoading || isPending ? "加载中..." : "暂无符合条件的订单"}
                  </TableCell>
              </TableRow>
              )}
          </TableBody>
          </Table>
      </div>

      <div className="flex items-center justify-between mt-4 px-2">
          <div className="text-sm text-muted-foreground">
              共 {total} 条数据，本页显示 {displayOrders.length} 条
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

                  return generatePaginationItems(currentPage, totalPages).map((item) => (
                    <PaginationItem key={typeof item === 'string' ? item : item}>
                      {typeof item === 'number' ? (
                        <PaginationLink
                          isActive={currentPage === item}
                          onClick={() => setCurrentPage(item)}
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
  const [sn, setSn] = useState(order.sn || '')
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
            sn,
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
            <div className="space-y-2 col-span-2">
                <Label>设备SN码 (选填)</Label>
                <Input value={sn} onChange={e => setSn(e.target.value)} placeholder="请输入设备SN码" />
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

function SourceEditPopover({ order, promoters, onSave }: { order: Order, promoters: Promoter[], onSave: (s: string, c: string, pId?: string, cId?: string) => Promise<void> }) {
    const [open, setOpen] = useState(false)
    const [source, setSource] = useState(order.source)
    const [contact, setContact] = useState(order.sourceContact)
    const [promoterId, setPromoterId] = useState(order.promoterId || '')
    const [channelId, setChannelId] = useState(order.channelId || '')
    
    return (
        <Popover open={open} onOpenChange={(v) => {
            setOpen(v)
            if (v) {
                setSource(order.source)
                setContact(order.sourceContact)
                setPromoterId(order.promoterId || '')
                setChannelId(order.channelId || '')
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
                        setPromoterId('')
                        setChannelId('')
                    }}>
                        <SelectTrigger className="h-8">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                              <SelectItem value="PEER">同行</SelectItem>
                              <SelectItem value="PART_TIME_AGENT">兼职代理</SelectItem>
                              <SelectItem value="RETAIL">零售</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>推广员</Label>
                    <Select value={contact} onValueChange={(val) => {
                        setContact(val)
                        if (val === 'self') {
                            setPromoterId('')
                            setChannelId('')
                        } else {
                            const p = promoters.find(promoter => promoter.name === val)
                            if (p) {
                                setPromoterId(p.id)
                                setChannelId(p.channelConfigId || '')
                            }
                        }
                    }} disabled={source === 'RETAIL'}>
                        <SelectTrigger className="h-8">
                            <SelectValue placeholder={source === 'RETAIL' ? "零售无需填写" : "选择推广员"} />
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
                    await onSave(source, contact, promoterId, channelId)
                    setOpen(false)
                }}>保存</Button>
            </PopoverContent>
        </Popover>
    )
}

function OrderRow({ order, products, promoters, onOrderUpdated }: { order: Order, products: Product[], promoters: Promoter[], onOrderUpdated: () => void }) {
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
                    onOrderUpdated()
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

  const handleUpdateSourceInfo = async (newSource: string, newContact: string, newPlatform?: string, newPromoterId?: string, newChannelId?: string) => {
      try {
          const res = await updateOrderSourceInfo(order.id, newSource, newContact, newPlatform, newPromoterId, newChannelId)
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
              onOrderUpdated()
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
            onOrderUpdated()
        }
        else toast.error(res?.message || "操作失败")
    } catch (error) {
        console.error(error)
        toast.error("操作失败")
    }
  }

  const handleConfirmShipment = async () => {
    try {
        const res = await confirmShipment(order.id)
        if (res?.success) {
            toast.success(res.message)
            onOrderUpdated()
        } else {
            toast.error(res?.message || "操作失败")
        }
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
            onOrderUpdated()
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
            onOrderUpdated()
        } else {
            toast.error(res?.message || "操作失败")
        }
    } catch (error) {
        console.error(error)
        toast.error("操作失败")
    }
  }

  const totalAmountWithExtensions = calculateOrderRevenue(order)
  const totalExtensionDays = (order.extensions || []).reduce((acc, curr) => acc + curr.days, 0)

  // Calculate overdue days for display
  const isOrderActive = !['COMPLETED', 'BOUGHT_OUT', 'CLOSED', 'RETURNING'].includes(order.status)
  const returnDeadlineDate = order.returnDeadline ? new Date(order.returnDeadline) : null
  if (returnDeadlineDate) returnDeadlineDate.setHours(0, 0, 0, 0)
  const todayDate = new Date()
  todayDate.setHours(0, 0, 0, 0)
  
  const overdueDays = (isOrderActive && returnDeadlineDate && todayDate > returnDeadlineDate) 
    ? differenceInDays(todayDate, returnDeadlineDate) 
    : 0

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
      } catch {
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

  const copySnapshot = () => {
    const lines = [
        "收货信息",
        `${order.recipientName || '-'} | ${order.recipientPhone || '-'}`,
        order.address || '-',
        "",
        "设备信息",
        order.productName || '-',
        order.variantName || '-',
        "",
        "租期",
        `起: ${order.rentStartDate ? format(new Date(order.rentStartDate), 'yyyy-MM-dd') : '-'}`,
        `止: ${order.rentStartDate ? format(addDays(new Date(order.rentStartDate), order.duration + totalExtensionDays - 1), 'yyyy-MM-dd') : '-'}`,
        "",
        "快递单号",
        order.trackingNumber || '-'
    ];
    copyToClipboard(lines.join('\n'));
  }

  const getDeliveryTimeColor = () => {
    if (!order.deliveryTime) return "text-muted-foreground";
    const now = new Date();
    const deliveryTime = new Date(order.deliveryTime);
    const isNotShipped = ['PENDING_REVIEW', 'PENDING_SHIPMENT'].includes(order.status);

    if (isNotShipped) {
        if (now > deliveryTime) return "text-red-600 font-bold";
        return "text-muted-foreground";
    } else {
        if (order.actualDeliveryTime) {
            const actual = new Date(order.actualDeliveryTime);
            if (actual > deliveryTime) {
                const diff = differenceInDays(actual, deliveryTime);
                if (diff <= 3) return "text-green-600 font-bold";
                return "text-muted-foreground";
            }
        }
        return "text-muted-foreground";
    }
  }

  return (
    <>
    <TableRow className="border-b-0 group">
      <TableCell className="font-medium align-top">
        <div className="flex items-center gap-1">
            <div className="text-xs font-bold">{order.orderNo}</div>
            <Button variant="ghost" size="icon" className="h-4 w-4 text-gray-400 hover:text-blue-600" onClick={() => copyToClipboard(order.orderNo)}>
                <Copy className="h-3 w-3" />
            </Button>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">{format(new Date(order.createdAt), 'MM-dd HH:mm')}</div>
        <div className="text-[10px] text-blue-600 mt-1">创建人: {order.creatorName}</div>
      </TableCell>
      <TableCell className="align-top">
        <div className="font-bold text-xs">{order.customerXianyuId}</div>
      </TableCell>
      <TableCell className="align-top">
         <div className="flex items-center gap-1">
            <Popover open={isMpOpen} onOpenChange={setIsMpOpen}>
                <PopoverTrigger asChild>
                    <div className="text-xs cursor-pointer hover:underline decoration-dashed underline-offset-4 text-green-700 font-mono break-all">
                        {order.miniProgramOrderNo || <span className="text-gray-300 italic text-[10px]">点击填写</span>}
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
                    <div className="text-xs cursor-pointer hover:underline decoration-dashed underline-offset-4 text-gray-700 font-mono break-all">
                        {order.xianyuOrderNo || <span className="text-gray-300 italic text-[10px]">点击填写</span>}
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
         <SourceEditPopover order={order} promoters={promoters} onSave={(s, c, pId, cId) => handleUpdateSourceInfo(s, c, undefined, pId, cId)} />
      </TableCell>
      <TableCell className="align-top space-y-2">
        <div className="space-y-1">
            <div className="text-[10px] font-semibold text-gray-500">收货信息</div>
            <div className="text-[10px] text-muted-foreground max-w-[150px] truncate cursor-help" title={`收件人: ${order.recipientName || '无'}\n电话: ${order.recipientPhone || '无'}\n地址: ${order.address}`}>
                {(order.recipientName || order.recipientPhone) ? (
                    <div>
                        {order.recipientName || '-'} <span className="mx-1">|</span> {order.recipientPhone || '-'}
                    </div>
                ) : null}
                <div>{order.address}</div>
            </div>
        </div>

        {(order.logisticsCompany === '线下自提' || order.trackingNumber) && (
            <div className="space-y-1 pt-2 border-t border-dashed border-gray-200">
                <div className="text-[10px] font-semibold text-gray-500">发货物流</div>
                <div className="text-[10px]">
                    {order.logisticsCompany === '线下自提' ? (
                        <div className="flex items-center text-orange-600 font-medium">
                            <Truck className="w-3 h-3 mr-1" />
                            线下自提
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {order.trackingNumber && (
                                 <div className="font-mono text-gray-600 select-all" title="物流单号">
                                    {order.trackingNumber}
                                 </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        )}

        {(order.returnLogisticsCompany === '线下自提' || order.returnTrackingNumber) && (
            <div className="space-y-1 pt-2 border-t border-dashed border-gray-200">
                <div className="text-[10px] font-semibold text-gray-500">归还物流</div>
                <div className="text-[10px]">
                    {order.returnLogisticsCompany === '线下自提' ? (
                        <div className="flex items-center text-orange-600 font-medium">
                            <RotateCcw className="w-3 h-3 mr-1" />
                            线下自提
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {order.returnTrackingNumber && (
                                 <div className="font-mono text-gray-600 select-all" title="归还物流单号">
                                    {order.returnTrackingNumber}
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
        <div className={`text-xs mt-1 ${getDeliveryTimeColor()}`} title="预计发货">预发: {order.deliveryTime ? format(new Date(order.deliveryTime), 'yyyy-MM-dd') : '-'}</div>
        <div className="text-xs text-muted-foreground" title="实际发货">实发: {order.actualDeliveryTime ? format(new Date(order.actualDeliveryTime), 'yyyy-MM-dd') : '-'}</div>
        <div className="text-xs text-muted-foreground" title="起租日期">起租: {order.rentStartDate ? format(new Date(order.rentStartDate), 'yyyy-MM-dd') : '-'}</div>
        <div className="text-xs text-muted-foreground" title="租期结束">止租: {order.rentStartDate ? format(addDays(new Date(order.rentStartDate), order.duration + totalExtensionDays - 1), 'yyyy-MM-dd') : '-'}</div>
        <div className="text-xs text-muted-foreground" title="最晚归还">归还: {order.returnDeadline ? format(new Date(order.returnDeadline), 'yyyy-MM-dd') : '-'}</div>
        {overdueDays > 0 && (
             <div className="text-xs font-bold text-red-600 mt-0.5">逾期 {overdueDays} 天</div>
        )}
      </TableCell>
      <TableCell className="align-top">
        <div className="font-bold text-red-600">¥ {totalAmountWithExtensions}</div>
        <div className="text-xs text-gray-500 mt-1">
            基础: {(order.rentPrice || 0) + (order.insurancePrice || 0) + (order.overdueFee || 0)}
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
               (含 违约金 ¥{order.overdueFee})
            </div>
        ) : null}
      </TableCell>
      <TableCell className="align-top">
        <Select defaultValue={order.status} onValueChange={handleStatusChange}>
          <SelectTrigger className={cn("w-[100px] h-8 text-xs text-white border-0", statusMap[order.status]?.color || 'bg-gray-400')}>
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
                                unoptimized
                            />
                        </div>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl w-auto p-0 overflow-hidden bg-transparent border-none shadow-none">
                        <DialogTitle className="sr-only">订单截图预览</DialogTitle>
                        <Image 
                            src={url} 
                            alt="截图大图" 
                            width={1200}
                            height={900}
                            className="w-auto h-auto max-h-[90vh] rounded-md shadow-2xl" 
                            unoptimized
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
            className="w-[140px] min-h-[40px] text-[10px] resize-none"
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

                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-gray-600 hover:text-blue-600 border-dashed" title="订单快照">
                            <ScrollText className="h-3 w-3 mr-1" /> 快照
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>订单快照</DialogTitle>
                        </DialogHeader>
                        <div className="bg-gray-50 p-4 rounded text-sm space-y-3">
                            <div>
                                <div className="font-bold text-gray-900 mb-1">收货信息</div>
                                <div className="pl-3 border-l-2 border-blue-300 text-gray-700">
                                    <div>{order.recipientName || '-'} | {order.recipientPhone || '-'}</div>
                                    <div className="mt-0.5 text-gray-600 break-words">{order.address || '-'}</div>
                                </div>
                            </div>
                            
                            <div>
                                <div className="font-bold text-gray-900 mb-1">设备信息</div>
                                <div className="pl-3 border-l-2 border-green-300 text-gray-700">
                                    <div>{order.productName || '-'}</div>
                                    <div className="text-gray-600">{order.variantName || '-'}</div>
                                </div>
                            </div>
                            
                            <div>
                                <div className="font-bold text-gray-900 mb-1">租期</div>
                                <div className="pl-3 border-l-2 border-purple-300 text-gray-700 grid grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-gray-500 mr-1">起:</span>
                                        {order.rentStartDate ? format(new Date(order.rentStartDate), 'yyyy-MM-dd') : '-'}
                                    </div>
                                    <div>
                                        <span className="text-gray-500 mr-1">止:</span>
                                        {order.rentStartDate ? format(addDays(new Date(order.rentStartDate), order.duration + (order.extensions || []).reduce((acc, curr) => acc + curr.days, 0) - 1), 'yyyy-MM-dd') : '-'}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="font-bold text-gray-900 mb-1">快递单号</div>
                                <div className="pl-3 border-l-2 border-orange-300 text-gray-700 font-mono select-all">
                                    {order.trackingNumber || '-'}
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={copySnapshot} className="w-full">
                                <Copy className="w-4 h-4 mr-2" /> 复制内容
                            </Button>
                        </DialogFooter>
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

                {order.status === 'SHIPPED_PENDING_CONFIRMATION' && (
                    <Button size="sm" onClick={handleConfirmShipment} className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700">
                        <Check className="h-3 w-3 mr-1" /> 确认发货
                    </Button>
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
                                onOrderUpdated()
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
