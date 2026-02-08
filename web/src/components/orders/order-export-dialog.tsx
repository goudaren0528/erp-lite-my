"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Download, Loader2 } from "lucide-react"
import { fetchOrdersForExport } from "@/app/actions"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { format } from "date-fns"
import { OrderStatus, OrderSource, OrderPlatform } from "@/types"

const statusMap: Record<string, string> = {
  PENDING_REVIEW: '待审核',
  PENDING_SHIPMENT: '待发货',
  SHIPPED_PENDING_CONFIRMATION: '已发货待确认',
  PENDING_RECEIPT: '待收货',
  RENTING: '待归还',
  OVERDUE: '已逾期',
  RETURNING: '归还中',
  COMPLETED: '已完成',
  BOUGHT_OUT: '已购买',
  CLOSED: '已关闭',
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

export function OrderExportDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [status, setStatus] = useState<string>("ALL")

  const handleExport = async () => {
    try {
      setLoading(true)
      const orders = await fetchOrdersForExport({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status: status === "ALL" ? undefined : status
      })

      if (!orders || orders.length === 0) {
        toast.error("没有找到符合条件的订单")
        return
      }

      // Transform data for export
      const exportData = orders.map(order => {
        const extensions = order.extensions || []
        const extensionInfo = extensions.length > 0 
          ? extensions.map(e => `+${e.days}天(¥${e.price})`).join(', ')
          : '无'

        return {
          '订单号': order.orderNo,
          '状态': statusMap[order.status] || order.status,
          '渠道': sourceMap[order.source as OrderSource] || order.source,
          '平台': platformMap[order.platform as string] || order.platform || '-',
          '客户闲鱼ID': order.customerXianyuId,
          '客户来源/推广员': order.sourceContact || '-',
          '产品名称': order.productName,
          '型号规格': order.variantName,
          'SN码': order.sn || '-',
          '租赁天数': order.duration,
          '租金': order.rentPrice,
          '押金': order.deposit,
          '保险费': order.insurancePrice,
          '逾期费': order.overdueFee || 0,
          '续租情况': extensionInfo,
          '总金额': order.totalAmount,
          '收件人': order.recipientName || '-',
          '电话': order.recipientPhone || '-',
          '地址': order.address,
          '发货物流': order.logisticsCompany ? `${order.logisticsCompany}: ${order.trackingNumber || ''}` : '-',
          '归还物流': order.returnLogisticsCompany ? `${order.returnLogisticsCompany}: ${order.returnTrackingNumber || ''}` : '-',
          '起租日期': order.rentStartDate ? format(new Date(order.rentStartDate), 'yyyy-MM-dd') : '-',
          '发货时间': order.deliveryTime ? format(new Date(order.deliveryTime), 'yyyy-MM-dd') : '-',
          '应还日期': order.returnDeadline ? format(new Date(order.returnDeadline), 'yyyy-MM-dd') : '-',
          '创建人': order.creatorName,
          '创建时间': format(new Date(order.createdAt), 'yyyy-MM-dd HH:mm:ss'),
          '备注': order.remark || '-'
        }
      })

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(exportData)

      // Auto-width columns (simple estimation)
      const colWidths = Object.keys(exportData[0]).map(key => ({
        wch: Math.max(key.length * 2, 15) // Min width 15
      }))
      ws['!cols'] = colWidths

      XLSX.utils.book_append_sheet(wb, ws, "订单导出")

      // Generate filename
      const timeStr = format(new Date(), 'yyyyMMddHHmm')
      const fileName = `订单导出_${timeStr}.xlsx`

      // Write file
      XLSX.writeFile(wb, fileName)

      toast.success(`成功导出 ${orders.length} 条订单`)
      setOpen(false)
    } catch (error) {
      console.error(error)
      toast.error("导出失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          导出订单
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>导出订单</DialogTitle>
          <DialogDescription>
            选择导出条件，生成 Excel 文件。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>订单状态</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="选择状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                {Object.entries(statusMap).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>开始日期</Label>
              <input 
                type="date"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>结束日期</Label>
              <input 
                type="date"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {!startDate && !endDate 
              ? "提示：未选择日期范围将导出所有历史订单" 
              : "提示：将导出指定日期范围内的订单"}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleExport} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            导出
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
