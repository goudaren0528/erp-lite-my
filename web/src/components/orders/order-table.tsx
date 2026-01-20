"use client"

import { useState } from "react"
import { Order, OrderStatus, Product, User, OrderSource } from "@/types"
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
import { Label } from "@/components/ui/label"
import { updateOrderStatus, updateOrderRemark, extendOrder, updateMiniProgramOrderNo, deleteOrder } from "@/app/actions"
import { format, addDays } from "date-fns"
import { Edit2, MoreHorizontal, Plus, Search, ArrowUpDown, Info, Trash2 } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { OrderForm } from "./order-form"

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
}

const platformMap: Record<string, string> = {
  XIAOHONGSHU: '小红书',
  XIANYU: '闲鱼',
  DOUYIN: '抖音',
  OTHER: '其他',
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

export function OrderTable({ orders, products, users = [], promoters = [] }: OrderTableProps) {
  const [filterText, setFilterText] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterSource, setFilterSource] = useState<string>('ALL')
  const [filterCreator, setFilterCreator] = useState<string>('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc') // Default asc for status order

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const filteredOrders = orders.filter(order => {
    const matchText = 
        order.orderNo.toLowerCase().includes(filterText.toLowerCase()) ||
        order.customerXianyuId.toLowerCase().includes(filterText.toLowerCase()) ||
        order.sourceContact.toLowerCase().includes(filterText.toLowerCase()) ||
        (promoters.find(p => p.name === order.sourceContact)?.phone?.includes(filterText)) ||
        order.productName.toLowerCase().includes(filterText.toLowerCase()) ||
        (order.creatorName && order.creatorName.toLowerCase().includes(filterText.toLowerCase()))

    const matchStatus = filterStatus === 'ALL' || order.status === filterStatus
    const matchSource = filterSource === 'ALL' || order.source === filterSource
    const matchCreator = filterCreator === 'ALL' || order.creatorId === filterCreator

    let matchDate = true
    if (startDate) {
        matchDate = matchDate && order.createdAt >= startDate
    }
    if (endDate) {
        // Add 1 day to include the end date fully (or handle string comparison carefully)
        // Since createdAt is ISO string "YYYY-MM-DDTHH:mm:ss...", and endDate is "YYYY-MM-DD"
        // "2023-01-01T10:00" > "2023-01-01", so strictly > endDate is not enough if we want inclusive.
        // Actually, string comparison "2023-01-01..." > "2023-01-01" is true.
        // If endDate is "2023-01-01", we want to include everything on that day.
        // So we can compare against the next day or check if startsWith or just string compare.
        // Simplest is just string comparison but usually users expect inclusive end date.
        // "2023-01-01T..." <= "2023-01-01" is false.
        // Let's use string slicing for simple day comparison or just add 1 day.
        const nextDay = new Date(endDate)
        nextDay.setDate(nextDay.getDate() + 1)
        matchDate = matchDate && new Date(order.createdAt) < nextDay
    }

    return matchText && matchStatus && matchSource && matchCreator && matchDate
  }).sort((a, b) => {
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
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
  }

  return (
    <div className="space-y-4">
      {/* Today Stats Banner */}
      <div className="flex gap-4 mb-2">
          <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-md border border-blue-100 text-sm font-medium flex items-center">
             <span className="mr-2">📅 今日订单:</span>
             <span className="text-lg font-bold mr-1">{todayCount}</span> 单
          </div>
          <div className="bg-green-50 text-green-700 px-4 py-2 rounded-md border border-green-100 text-sm font-medium flex items-center">
             <span className="mr-2">💰 今日金额:</span>
             <span className="text-lg font-bold mr-1">¥{todayAmount.toLocaleString()}</span>
          </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 bg-white p-4 rounded-md border">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex flex-1 items-center space-x-2">
                <Search className="w-4 h-4 text-gray-500" />
                <Input 
                    placeholder="搜索订单号/客户/推广员/设备/创建人..." 
                    value={filterText}
                    onChange={e => setFilterText(e.target.value)}
                    className="max-w-sm"
                />
            </div>
            
            {/* Date Range Filter */}
            <div className="flex items-center space-x-2">
                <Label className="whitespace-nowrap text-sm text-gray-500">创建时间:</Label>
                <Input 
                    type="date" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)} 
                    className="w-36"
                />
                <span className="text-gray-400">-</span>
                <Input 
                    type="date" 
                    value={endDate} 
                    onChange={e => setEndDate(e.target.value)} 
                    className="w-36"
                />
                {(startDate || endDate) && (
                    <Button variant="ghost" size="sm" onClick={() => { setStartDate(''); setEndDate('') }}>
                        重置
                    </Button>
                )}
            </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
            <Select value={filterCreator} onValueChange={setFilterCreator}>
                <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="创建人" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">所有创建人</SelectItem>
                    {users.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="状态筛选" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">所有状态</SelectItem>
                    {Object.entries(statusMap).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={filterSource} onValueChange={setFilterSource}>
                <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="渠道筛选" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">所有渠道</SelectItem>
                    {Object.entries(sourceMap).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
      </div>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">订单号/时间</TableHead>
              <TableHead>小程序单号</TableHead>
              <TableHead>推广员</TableHead>
              <TableHead>客户信息</TableHead>
              <TableHead>设备信息</TableHead>
              <TableHead>
                  <Button variant="ghost" size="sm" onClick={toggleSort} className="-ml-3 hover:bg-transparent">
                    租期/时间
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
              </TableHead>
              <TableHead>金额详情</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedOrders.map((order) => (
              <OrderRow key={order.id} order={order} products={products} users={users} promoters={promoters} />
            ))}
            {paginatedOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center h-24">
                  暂无匹配订单
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination className="justify-end">
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
  )
}

function OrderRow({ order, products, users, promoters }: { order: Order, products: Product[], users: User[], promoters: Promoter[] }) {
  const [remark, setRemark] = useState(order.remark)
  const [isExtensionOpen, setIsExtensionOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [extDays, setExtDays] = useState(1)
  const [extPrice, setExtPrice] = useState(0)
  
  // MP No Edit
  const [mpNo, setMpNo] = useState(order.miniProgramOrderNo || '')
  const [isMpOpen, setIsMpOpen] = useState(false)

  const handleStatusChange = (val: OrderStatus) => {
    updateOrderStatus(order.id, val)
  }

  const handleRemarkBlur = () => {
    if (remark !== order.remark) {
      updateOrderRemark(order.id, remark)
    }
  }
  
  const handleSaveMpNo = async () => {
      await updateMiniProgramOrderNo(order.id, mpNo)
      setIsMpOpen(false)
  }

  const handleExtend = async () => {
    await extendOrder(order.id, extDays, extPrice)
    setIsExtensionOpen(false)
  }

  const handleDelete = async () => {
      await deleteOrder(order.id)
      setIsDeleteOpen(false)
  }

  const totalAmountWithExtensions = order.totalAmount + (order.extensions || []).reduce((acc, curr) => acc + curr.price, 0)
  const promoter = promoters.find(p => p.name === order.sourceContact)

  return (
    <TableRow>
      <TableCell className="font-medium align-top">
        <div className="text-sm font-bold">{order.orderNo}</div>
        <div className="text-xs text-muted-foreground mt-1">{format(new Date(order.createdAt), 'MM-dd HH:mm')}</div>
        <div className="text-xs text-blue-600 mt-1">创建人: {order.creatorName}</div>
      </TableCell>
      <TableCell className="align-top">
         <Popover open={isMpOpen} onOpenChange={setIsMpOpen}>
            <PopoverTrigger asChild>
                <div className="text-sm cursor-pointer hover:underline decoration-dashed underline-offset-4 text-green-700 font-mono">
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
      </TableCell>
      <TableCell className="align-top">
        <Popover>
            <PopoverTrigger asChild>
                <div className="cursor-pointer group">
                    <Badge variant="outline" className="mb-1">{sourceMap[order.source] || order.source}</Badge>
                    {order.platform && <Badge variant="secondary" className="mb-1 ml-1 text-[10px]">{platformMap[order.platform] || order.platform}</Badge>}
                    <div className="text-xs text-gray-700 font-medium group-hover:text-blue-600 flex items-center gap-1">
                        {order.sourceContact}
                        <Info className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                    </div>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3">
                <div className="text-sm space-y-1">
                    <div className="font-bold">{promoter?.name || order.sourceContact}</div>
                    <div>电话: {promoter?.phone || '未知'}</div>
                    <div>渠道: {promoter?.channels?.map(c => sourceMap[c] || c).join(', ') || (promoter as any)?.channel || '未知'}</div>
                </div>
            </PopoverContent>
        </Popover>
      </TableCell>
      <TableCell className="align-top">
        <div className="font-semibold">{order.customerXianyuId}</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-[150px] truncate" title={order.address}>
            {order.address}
        </div>
      </TableCell>
      <TableCell className="align-top">
        <div className="font-semibold">{order.productName}</div>
        <div className="text-xs text-muted-foreground">{order.variantName}</div>
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
        <div className="text-xs text-muted-foreground mt-1" title="预计发货">发: {order.deliveryTime || '-'}</div>
        <div className="text-xs text-muted-foreground" title="起租日期">起: {order.rentStartDate || '-'}</div>
        <div className="text-xs text-muted-foreground" title="租期结束">止: {order.rentStartDate ? format(addDays(new Date(order.rentStartDate), order.duration - 1), 'yyyy-MM-dd') : '-'}</div>
        <div className="text-xs text-muted-foreground" title="最晚归还">归: {order.returnDeadline || '-'}</div>
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
      <TableCell className="align-top">
        <Input 
            value={remark} 
            onChange={e => setRemark(e.target.value)} 
            onBlur={handleRemarkBlur}
            className="w-[120px] h-8 text-xs"
            placeholder="备注..."
        />
      </TableCell>
      <TableCell className="align-top">
        <div className="flex space-x-2">
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Edit2 className="h-4 w-4" />
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>编辑订单</DialogTitle>
                    </DialogHeader>
                    <OrderForm 
                        products={products} 
                        promoters={promoters}
                        initialData={order} 
                        onSuccess={() => setIsEditOpen(false)} 
                    />
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
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

            <Dialog open={isExtensionOpen} onOpenChange={setIsExtensionOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-2 text-xs">
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
        </div>
      </TableCell>
    </TableRow>
  )
}
