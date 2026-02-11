"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { format, getYear, getMonth } from "date-fns"
import * as XLSX from "xlsx"
import { Calendar as CalendarIcon, Download, ChevronLeft, ChevronRight, Loader2, RefreshCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { DateRange } from "react-day-picker"
import { HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { fetchAccountOrders, syncAllOrdersStandardPrice } from "./actions";

type RetailOrder = {
  id: string
  orderNo: string
  productName: string
  variantName: string
  duration: number
  standardPrice?: number
  rentPrice?: number
  status: string
  createdAt: string | Date
  channel?: { name?: string } | null
  source?: string | null
  
  promoterName: string
  revenue: number
  extensionsTotal: number
  totalAmount: number
  insurancePrice: number
  overdueFee?: number | null
  refundAmount?: number
}

function RetailOrderList({ userId, period, start, end, highTicketRate }: { userId: string, period?: string, start?: string, end?: string, highTicketRate: number }) {
    const [orders, setOrders] = React.useState<RetailOrder[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [page, setPage] = React.useState(1);
    const [total, setTotal] = React.useState(0);
    const pageSize = 10;

    React.useEffect(() => {
        setLoading(true);
        fetchAccountOrders({ userId, period: period || 'cumulative', start, end, page, pageSize, isRetail: true })
            .then(res => {
                setOrders(res.orders);
                setTotal(res.total);
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [userId, period, start, end, page]);

    const totalPages = Math.ceil(total / pageSize);

    const getChannelName = (order: RetailOrder) => {
        const source = order.channel?.name || order.source || undefined;
        if (!source) return '-';
        
        // Map common sources to Chinese
        const map: Record<string, string> = {
            'MINI_PROGRAM': '小程序',
            'XIANYU': '闲鱼',
            'OFFLINE': '线下',
            'H5': 'H5',
            'WECHAT': '微信',
            'PEER': '同行',
            'PART_TIME_AGENT': '兼职代理',
            'Official': '官方',
            'RETAIL': '零售'
        };
        
        return map[source] || source;
    };

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    }

    if (total === 0) {
        return <div className="text-muted-foreground text-sm border rounded-md p-4 text-center">暂无零售订单数据</div>;
    }

    return (
        <div className="space-y-4">
             <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead>订单号</TableHead>
                            <TableHead>推广渠道</TableHead>
                            <TableHead>商品</TableHead>
                            <TableHead>租期</TableHead>
                            <TableHead>标准价</TableHead>
                            <TableHead>租金</TableHead>
                            <TableHead>高客单提成</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>创建时间</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map((order) => {
                            const standardPrice = order.standardPrice || 0;
                            const highTicketBase = Math.max(0, (order.rentPrice || 0) - standardPrice);
                            const commission = highTicketBase * (highTicketRate / 100);

                            return (
                            <TableRow key={order.id}>
                                <TableCell className="font-mono text-xs">{order.orderNo}</TableCell>
                                <TableCell className="text-sm">{getChannelName(order)}</TableCell>
                                <TableCell>
                                    <div className="text-sm">{order.productName}</div>
                                    <div className="text-xs text-muted-foreground">{order.variantName}</div>
                                </TableCell>
                                <TableCell>{order.duration}天</TableCell>
                                <TableCell className="text-muted-foreground">¥{standardPrice}</TableCell>
                                <TableCell>¥{order.rentPrice}</TableCell>
                                <TableCell className="font-medium text-green-600">¥{commission.toFixed(2)}</TableCell>
                                <TableCell>
                                    <span className={cn(
                                        "px-2 py-1 rounded-full text-xs font-medium",
                                        order.status === 'COMPLETED' ? "bg-green-100 text-green-700" :
                                        order.status === 'RENTING' ? "bg-blue-100 text-blue-700" :
                                        order.status === 'CLOSED' ? "bg-gray-100 text-gray-700" :
                                        "bg-yellow-100 text-yellow-700"
                                    )}>
                                        {order.status === 'COMPLETED' ? '已完成' :
                                         order.status === 'RENTING' ? '租赁中' :
                                         order.status === 'CLOSED' ? '已关闭' :
                                         order.status === 'PENDING_PAYMENT' ? '待支付' :
                                         order.status === 'PENDING_DELIVERY' || order.status === 'PENDING_SHIPMENT' ? '待发货' :
                                         order.status === 'PENDING_RECEIPT' ? '待收货' :
                                         order.status}
                                    </span>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                        {format(new Date(order.createdAt), 'yyyy-MM-dd HH:mm')}
                                </TableCell>
                            </TableRow>
                        )})}
                    </TableBody>
                </Table>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-end space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                    >
                        上一页
                    </Button>
                    <div className="text-sm text-muted-foreground">
                        {page} / {totalPages}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                    >
                        下一页
                    </Button>
                </div>
            )}
        </div>
    );
}

interface Rule {
  minCount: number;
  maxCount: number | null;
  percentage: number;
}

interface AccountStat {
    userId: string;
    userName: string;
    accountGroupId: string;
    accountGroupName: string;
    highTicketRate?: number;
    totalOrderCount: number;
    totalRevenue: number;
    refundedAmount: number;
    estimatedEmployeeCommission: number;
    volumeGradientCommission: number;
    channelCommission: number;
    peerCommission: number;
    agentCommission: number;
    highTicketCommission: number;
    estimatedPromoterCommission: number;
    effectiveBaseRate?: number;
    defaultUserRules?: Rule[];
    orders: RetailOrder[];
    channels: {
        channelId: string;
        channelName: string;
        orderCount: number;
        revenue: number;
        employeeRate: number;
        employeeCommission: number;
        subordinateCommission: number;
        highTicketCommission: number;
        promoters: {
            name: string;
            count: number;
            revenue: number;
            rate: number;
            commission: number;
            isPromoter: boolean;
            accountRate: number;
            accountCommission: number;
            highTicketCommission: number;
        }[]
    }[]
}


interface StatsClientProps {
  period?: string
  start?: string
  end?: string
  allStats: AccountStat[]
  accountGroups: { id: string; name: string }[]
}

function RuleHoverCard({ rules, label = "提成点数" }: { rules?: Rule[], label?: string }) {
  if (!rules || rules.length === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-pointer inline-block ml-1 align-middle" />
        </TooltipTrigger>
        <TooltipContent className="w-80 p-0" side="right">
          <div className="p-2 bg-white rounded-md border shadow-sm">
            <h4 className="font-medium text-sm mb-2 px-2">账号组梯度详情 <span className="text-xs font-normal text-muted-foreground ml-2">(单量越多提成越高)</span></h4>
            <Table>
              <TableHeader>
                <TableRow className="h-8 hover:bg-transparent">
                  <TableHead className="h-8 text-xs">单量区间</TableHead>
                  <TableHead className="h-8 text-xs">{label}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule, idx) => (
                  <TableRow key={idx} className="h-8 hover:bg-muted/50">
                    <TableCell className="py-1 text-xs">
                      {rule.maxCount === null ? `> ${rule.minCount}` : `${rule.minCount} - ${rule.maxCount}`}
                    </TableCell>
                    <TableCell className="py-1 text-xs">{rule.percentage}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function MonthPicker({ date, onSelect }: { date: Date, onSelect: (date: Date) => void }) {
  const [year, setYear] = React.useState(getYear(date));
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setYear(getYear(date));
  }, [date]);

  const months = [
    "一月", "二月", "三月", "四月", "五月", "六月",
    "七月", "八月", "九月", "十月", "十一月", "十二月"
  ];

  const handleYearChange = (increment: number) => {
    setYear(prev => prev + increment);
  };

  const handleMonthSelect = (monthIndex: number) => {
    const newDate = new Date(year, monthIndex, 1);
    onSelect(newDate);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-[200px] justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "yyyy年 MM月") : <span>选择月份</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="flex items-center justify-between p-2 border-b">
            <Button variant="ghost" size="icon" onClick={() => handleYearChange(-1)}>
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="font-semibold">{year}年</div>
            <Button variant="ghost" size="icon" onClick={() => handleYearChange(1)}>
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 p-2">
            {months.map((month, index) => (
                <Button
                    key={month}
                    variant={getMonth(date) === index && getYear(date) === year ? "default" : "ghost"}
                    className="h-9 text-sm"
                    onClick={() => handleMonthSelect(index)}
                >
                    {month}
                </Button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function StatsClient({ allStats, accountGroups, period = 'cumulative', start, end }: StatsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [selectedGroupId, setSelectedGroupId] = React.useState<string>("all");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  // Filter Stats
  const filteredStats = React.useMemo(() => {
    if (selectedGroupId === "all") return allStats;
    return allStats.filter(s => s.accountGroupId === selectedGroupId);
  }, [allStats, selectedGroupId]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredStats.length / pageSize));
  const paginatedStats = React.useMemo(() => {
    return filteredStats.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredStats, currentPage, pageSize]);

  // Reset page when filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedGroupId]);

  // Calculate Totals based on Filtered Stats
  const totalOrdersCount = filteredStats.reduce((acc, s) => acc + s.totalOrderCount, 0);
  const totalRevenue = filteredStats.reduce((acc, s) => acc + s.totalRevenue, 0);
  const totalEmployeeCommission = filteredStats.reduce((acc, s) => acc + s.estimatedEmployeeCommission, 0);
  const totalPromoterCommission = filteredStats.reduce((acc, s) => acc + s.estimatedPromoterCommission, 0);
  const totalNetIncome = totalRevenue - totalEmployeeCommission - totalPromoterCommission;
  
  const totalVolumeGradientCommission = filteredStats.reduce((acc, s) => acc + s.volumeGradientCommission, 0);
  const totalHighTicketCommission = filteredStats.reduce((acc, s) => acc + s.highTicketCommission, 0);
  const totalChannelCommission = filteredStats.reduce((acc, s) => acc + s.channelCommission, 0);

  // Handle Period Change
  const handlePeriodChange = (value: string) => {
    startTransition(() => {
      const params = new URLSearchParams();
      params.set("period", value);
      router.push(`?${params.toString()}`);
    });
  };

  // Handle Date Range Change (Custom)
  const handleDateRangeSelect = (range: DateRange | undefined) => {
    if (!range?.from) return;
    
    startTransition(() => {
      const params = new URLSearchParams();
      params.set("period", "custom");
      params.set("start", format(range.from!, "yyyy-MM-dd"));
      if (range.to) {
        params.set("end", format(range.to, "yyyy-MM-dd"));
      }
      router.push(`?${params.toString()}`);
    });
  };

  // Handle Month Change
  const handleMonthSelect = (date: Date) => {
     startTransition(() => {
       const params = new URLSearchParams();
       params.set("period", "monthly");
       params.set("start", format(date, "yyyy-MM-dd"));
       router.push(`?${params.toString()}`);
     });
  };

  // Handle Sync
  const [syncOpen, setSyncOpen] = React.useState(false);
  const [syncType, setSyncType] = React.useState<'all' | 'month' | 'custom'>('month');
  const [syncMonth, setSyncMonth] = React.useState<Date>(new Date());
  const [syncDateRange, setSyncDateRange] = React.useState<DateRange | undefined>(undefined);
  
  const handleSync = () => {
      startTransition(async () => {
          const params: { type: 'all' | 'month' | 'custom'; month?: string; start?: string; end?: string } = { type: syncType };
          
          if (syncType === 'month') {
              params.month = format(syncMonth, 'yyyy-MM');
          } else if (syncType === 'custom' && syncDateRange?.from) {
              params.start = format(syncDateRange.from, 'yyyy-MM-dd');
              if (syncDateRange.to) {
                  params.end = format(syncDateRange.to, 'yyyy-MM-dd');
              }
          }
          
          const res = await syncAllOrdersStandardPrice(params);
          if (res.success) {
              alert(res.message);
              setSyncOpen(false);
              router.refresh();
          } else {
              alert(res.message);
          }
      });
  };

  // Export Stats
  const handleExport = () => {
    const rows: Record<string, string | number>[] = [];
    filteredStats.forEach(stat => {
        stat.channels.forEach(c => {
            c.promoters.forEach(p => {
                 rows.push({
                    "账号组": stat.accountGroupName,
                    "账号": stat.userName,
                    "总订单数": stat.totalOrderCount,
                    "总营收": stat.totalRevenue,
                    "员工总提成": stat.estimatedEmployeeCommission,
                    "同行提成": stat.peerCommission,
                    "代理兼职提成": stat.agentCommission,
                    "单量阶梯提成": stat.volumeGradientCommission,
                    "高客单提成": stat.highTicketCommission,
                    "渠道": c.channelName,
                    "渠道单量": c.orderCount,
                    "渠道营收": c.revenue,
                    "员工提成点数": c.employeeRate + '%',
                    "员工渠道提成": c.employeeCommission,
                    "员工高客单提成": c.highTicketCommission,
                    "推广员": p.name,
                    "推广员单量": p.count,
                    "推广员营收": p.revenue,
                    "推广员点数": p.rate + '%',
                    "推广员提成": p.commission
                 });
            });
            if (c.promoters.length === 0) {
                 rows.push({
                    "账号组": stat.accountGroupName,
                    "账号": stat.userName,
                    "总订单数": stat.totalOrderCount,
                    "总营收": stat.totalRevenue,
                    "员工总提成": stat.estimatedEmployeeCommission,
                    "同行提成": stat.peerCommission,
                    "代理兼职提成": stat.agentCommission,
                    "单量阶梯提成": stat.volumeGradientCommission,
                    "高客单提成": stat.highTicketCommission,
                    "渠道": c.channelName,
                    "渠道单量": c.orderCount,
                    "渠道营收": c.revenue,
                    "员工提成点数": c.employeeRate + '%',
                    "员工渠道提成": c.employeeCommission,
                    "员工高客单提成": c.highTicketCommission,
                    "推广员": "无",
                    "推广员单量": 0,
                    "推广员营收": 0,
                    "推广员点数": "0%",
                    "推广员提成": 0
                 });
            }
        });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "业绩明细");
    XLSX.writeFile(wb, `业绩统计_${period}_${format(new Date(), 'yyyyMMddHHmm')}.xlsx`);
  };

  const handleExportOrders = async (userName: string, userId: string) => {
      try {
          // Fetch full list (unlimited)
          const res = await fetchAccountOrders({ 
             userId, 
             period: period || 'cumulative', 
             start, 
             end, 
             page: 1, 
             pageSize: -1 // Unlimited
          });
          
          const stat = allStats.find(s => s.userId === userId);
          const highTicketRate = stat?.highTicketRate || 0;

          const orders: RetailOrder[] = res.orders;
          const mapStatus = (status: string) => {
              const map: Record<string, string> = {
                'COMPLETED': '已完成',
                'RENTING': '租赁中',
                'CLOSED': '已关闭',
                'PENDING_PAYMENT': '待支付',
                'PENDING_DELIVERY': '待发货',
                'PENDING_SHIPMENT': '待发货',
                'PENDING_RECEIPT': '待收货'
              };
              return map[status] || status;
          };

          const formatOrderRow = (o: RetailOrder) => {
              const standardPrice = o.standardPrice || 0;
              const highTicketBase = Math.max(0, (o.rentPrice || 0) - standardPrice);
              const highTicketCommission = highTicketBase * (highTicketRate / 100);

              return {
                "订单号": o.orderNo,
                "商品": o.productName,
                "规格": o.variantName,
                "推广员": o.promoterName,
                "状态": mapStatus(o.status),
                "总金额": o.totalAmount,
                "营收": o.revenue,
                "退款": o.refundAmount || 0,
                "租金": o.rentPrice,
                "标准价": standardPrice,
                "高客单提成(估算)": highTicketCommission,
                "保险": o.insurancePrice,
                "延期": o.extensionsTotal || 0,
                "逾期": o.overdueFee || 0
            };
          };

          const rows = orders.map(formatOrderRow);

          // Fetch High Ticket Orders (Retail only)
          const resRetail = await fetchAccountOrders({ 
             userId, 
             period: period || 'cumulative', 
             start, 
             end, 
             page: 1, 
             pageSize: -1, // Unlimited
             isRetail: true
          });

          const highTicketRows = (resRetail.orders as RetailOrder[]).map(formatOrderRow);

          const wb = XLSX.utils.book_new();
          
          // Sheet 1: All Orders
          const ws = XLSX.utils.json_to_sheet(rows);
          XLSX.utils.book_append_sheet(wb, ws, "订单明细");
          
          // Sheet 2: High Ticket Orders
          if (highTicketRows.length > 0) {
            const wsHighTicket = XLSX.utils.json_to_sheet(highTicketRows);
            XLSX.utils.book_append_sheet(wb, wsHighTicket, "高客单提成明细");
          }

          XLSX.writeFile(wb, `${userName}_订单明细_${format(new Date(), 'yyyyMMddHHmm')}.xlsx`);
      } catch (error) {
          console.error("Export failed", error);
          alert("导出失败，请重试");
      }
  };

  const dateRange: DateRange | undefined = (start && end) ? { from: new Date(start), to: new Date(end) } : (start ? { from: new Date(start), to: undefined } : undefined);

  return (
    <div className="space-y-6 relative min-h-[500px]">
      {isPending && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-50 rounded-lg pointer-events-auto">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground font-medium">数据加载中...</span>
          </div>
        </div>
      )}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
            <Tabs value={period} onValueChange={handlePeriodChange} className="w-[400px]">
                <TabsList>
                    <TabsTrigger value="cumulative">累计</TabsTrigger>
                    <TabsTrigger value="monthly">月度</TabsTrigger>
                    <TabsTrigger value="custom">自定义</TabsTrigger>
                </TabsList>
            </Tabs>
            
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="筛选账号组" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">所有账号组</SelectItem>
                    {accountGroups.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>

        <div className="flex items-center gap-2">
            {period === 'monthly' && (
                <MonthPicker 
                    date={start ? new Date(start) : new Date()}
                    onSelect={handleMonthSelect}
                />
            )}

            {period === 'custom' && (
                <div className={cn("grid gap-2")}>
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button
                            id="date"
                            variant={"outline"}
                            className={cn(
                            "w-[260px] justify-start text-left font-normal",
                            !dateRange && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (
                            dateRange.to ? (
                                <>
                                {format(dateRange.from, "LLL dd, y")} -{" "}
                                {format(dateRange.to, "LLL dd, y")}
                                </>
                            ) : (
                                format(dateRange.from, "LLL dd, y")
                            )
                            ) : (
                                <span>Pick a date</span>
                            )}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={dateRange?.from}
                            selected={dateRange}
                            onSelect={handleDateRangeSelect}
                            numberOfMonths={2}
                        />
                        </PopoverContent>
                    </Popover>
                </div>
            )}

            <Popover open={syncOpen} onOpenChange={setSyncOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline">
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        同步标准价
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96">
                    <div className="grid gap-4">
                        <div className="space-y-2">
                            <h4 className="font-medium leading-none">同步标准价</h4>
                            <p className="text-sm text-muted-foreground">
                                选择要同步的订单范围（按创建时间）。
                            </p>
                        </div>
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">同步范围</label>
                                    <Tabs value={syncType} onValueChange={(v) => setSyncType(v as 'all' | 'month' | 'custom')} className="w-full">
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="month">按月份</TabsTrigger>
                                        <TabsTrigger value="custom">自定义</TabsTrigger>
                                        <TabsTrigger value="all">全部</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>
                            
                            {syncType === 'month' && (
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium w-16">选择月份</label>
                                    <MonthPicker 
                                        date={syncMonth}
                                        onSelect={setSyncMonth}
                                    />
                                </div>
                            )}

                            {syncType === 'custom' && (
                                <div className="grid gap-2">
                                    <label className="text-sm font-medium">选择日期范围</label>
                                    <div className={cn("grid gap-2")}>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    id="sync-date"
                                                    variant={"outline"}
                                                    className={cn(
                                                        "w-full justify-start text-left font-normal",
                                                        !syncDateRange && "text-muted-foreground"
                                                    )}
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {syncDateRange?.from ? (
                                                        syncDateRange.to ? (
                                                            <>
                                                                {format(syncDateRange.from, "yyyy-MM-dd")} -{" "}
                                                                {format(syncDateRange.to, "yyyy-MM-dd")}
                                                            </>
                                                        ) : (
                                                            format(syncDateRange.from, "yyyy-MM-dd")
                                                        )
                                                    ) : (
                                                        <span>选择日期范围</span>
                                                    )}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    initialFocus
                                                    mode="range"
                                                    defaultMonth={syncDateRange?.from}
                                                    selected={syncDateRange}
                                                    onSelect={setSyncDateRange}
                                                    numberOfMonths={2}
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                            )}

                            {syncType === 'all' && (
                                <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
                                    注意：同步全部订单可能需要较长时间，请耐心等待。
                                </div>
                            )}

                            <Button onClick={handleSync} disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                开始同步
                            </Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
            <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                导出明细
            </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总订单数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrdersCount}</div>
            <p className="text-xs text-muted-foreground">有效订单</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总营收</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥ {totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">不含已关闭/退款订单</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">渠道提成</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">¥ {totalChannelCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <p className="text-xs text-muted-foreground">含同行/代理兼职等</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">单量阶梯提成</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">¥ {totalVolumeGradientCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <p className="text-xs text-muted-foreground">基于单量阶梯规则</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">高客单提成</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">¥ {totalHighTicketCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <p className="text-xs text-muted-foreground">基于标准价溢价</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">员工总提成</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">¥ {totalEmployeeCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <p className="text-xs text-muted-foreground">预计发放给员工</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">推广员总提成</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">¥ {totalPromoterCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <p className="text-xs text-muted-foreground">预计发放给推广员</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平台净收</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">¥ {totalNetIncome.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <p className="text-xs text-muted-foreground">营收 - 员工提成 - 推广提成</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="rounded-md border bg-white">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[140px]">账号组</TableHead>
                        <TableHead className="w-[140px]">账号</TableHead>
                        <TableHead className="w-[100px]">总单量</TableHead>
                        <TableHead className="w-[160px]">总营收</TableHead>
                        <TableHead className="w-[120px]">同行提成</TableHead>
                        <TableHead className="w-[120px]">代理兼职提成</TableHead>
                        <TableHead className="w-[120px]">单量阶梯提成</TableHead>
                        <TableHead className="w-[120px]">高客单提成</TableHead>
                        <TableHead className="w-[140px]">员工总提成</TableHead>
                        <TableHead className="w-[140px]">推广员预计提成</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedStats.map(u => (
                        <TableRow key={u.userId}>
                            <TableCell className="font-medium text-muted-foreground">{u.accountGroupName}</TableCell>
                            <TableCell className="font-medium">{u.userName}</TableCell>
                            <TableCell>{u.totalOrderCount}</TableCell>
                            <TableCell>¥ {u.totalRevenue.toLocaleString()}</TableCell>
                            <TableCell className="font-medium">
                                ¥ {u.peerCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </TableCell>
                            <TableCell className="font-medium">
                                ¥ {u.agentCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </TableCell>
                            <TableCell className="font-medium">
                                <div>
                                    ¥ {u.volumeGradientCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </div>
                                {u.effectiveBaseRate !== undefined && (
                                    <div className="text-xs text-muted-foreground flex items-center mt-1">
                                        (生效点数: {u.effectiveBaseRate}% 
                                        <RuleHoverCard rules={u.defaultUserRules} />)
                                    </div>
                                )}
                            </TableCell>
                            <TableCell className="font-medium">
                                <div>
                                    ¥ {u.highTicketCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </div>
                                {u.highTicketRate !== undefined && u.highTicketRate > 0 && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                        (生效点数: {u.highTicketRate}%)
                                    </div>
                                )}
                            </TableCell>
                            <TableCell className="text-green-600 font-medium">
                                ¥ {u.estimatedEmployeeCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </TableCell>
                            <TableCell className="text-orange-600 font-medium">¥ {u.estimatedPromoterCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                            <TableCell>
                                <Sheet>
                                    <SheetTrigger asChild>
                                        <Button variant="outline" size="sm">详情</Button>
                                    </SheetTrigger>
                                    <SheetContent className="min-w-[1000px] sm:max-w-[1000px] overflow-y-auto">
                                        <SheetHeader>
                                            <div className="flex justify-between items-center pr-8">
                                                <SheetTitle>{u.userName} - 提成详情</SheetTitle>
                                                <Button variant="outline" size="sm" onClick={() => handleExportOrders(u.userName, u.userId)}>
                                                    <Download className="mr-2 h-4 w-4" />
                                                    导出详情
                                                </Button>
                                            </div>
                                            <SheetDescription>
                                                按渠道拆分的员工及推广员提成明细 (当前总单量级别: {u.totalOrderCount})
                                            </SheetDescription>
                                        </SheetHeader>
                                        
                                        <div className="grid gap-4 md:grid-cols-4 my-6">
                                            <Card>
                                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                                    <CardTitle className="text-sm font-medium">总订单数</CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="text-2xl font-bold">{u.totalOrderCount}</div>
                                                </CardContent>
                                            </Card>
                                            <Card>
                                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                                    <CardTitle className="text-sm font-medium">总营收</CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="text-2xl font-bold">¥ {u.totalRevenue.toLocaleString()}</div>
                                                </CardContent>
                                            </Card>
                                            <Card>
                                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                                    <CardTitle className="text-sm font-medium">员工总提成</CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="text-2xl font-bold text-green-600">¥ {u.estimatedEmployeeCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                                                </CardContent>
                                            </Card>
                                            <Card>
                                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                                    <CardTitle className="text-sm font-medium">推广员预计提成</CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="text-2xl font-bold text-orange-600">¥ {u.estimatedPromoterCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                                                </CardContent>
                                            </Card>
                                        </div>
                                        
                                        <div className="mt-6 space-y-8">
                                            {/* 1. Volume Gradient Commission Section */}
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="text-lg font-semibold">单量阶梯提成</h3>
                                                    <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                                        总计: ¥{u.volumeGradientCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-muted-foreground mb-3">包含所有推广渠道订单（零售、代理兼职、同行）</p>
                                                <div className="rounded-md border">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow className="bg-muted/50">
                                                                <TableHead>项目</TableHead>
                                                                <TableHead>单量</TableHead>
                                                                <TableHead>营收</TableHead>
                                                                <TableHead>账号点数</TableHead>
                                                                <TableHead>账号提成</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {(() => {
                                                                const items = u.channels.flatMap(c => c.promoters.filter(p => !p.isPromoter));
                                                                const totalCount = items.reduce((acc, cur) => acc + cur.count, 0);
                                                                const totalRevenue = items.reduce((acc, cur) => acc + cur.revenue, 0);
                                                                const rate = items.length > 0 ? items[0].accountRate : 0;
                                                                const totalCommission = items.reduce((acc, cur) => acc + cur.accountCommission, 0);

                                                                if (items.length === 0) {
                                                                    return (
                                                                        <TableRow>
                                                                            <TableCell colSpan={5} className="text-center text-muted-foreground py-4">无阶梯提成数据</TableCell>
                                                                        </TableRow>
                                                                    );
                                                                }

                                                                return (
                                                                    <TableRow>
                                                                        <TableCell>所有订单</TableCell>
                                                                        <TableCell>{totalCount}</TableCell>
                                                                        <TableCell>¥{totalRevenue.toLocaleString()}</TableCell>
                                                                        <TableCell>
                                                                            <div className="flex items-center gap-1">
                                                                                {rate}%
                                                                                <RuleHoverCard rules={u.defaultUserRules} />
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell>¥{totalCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                                                                    </TableRow>
                                                                );
                                                            })()}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>

                                            {/* 1.5 High Ticket Commission Section - REMOVED per user request */}

                                            {/* 2. Channel Promoter Commission Section */}
                                            <div>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <h3 className="text-lg font-semibold">渠道推广提成</h3>
                                                    <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                                        总计: ¥{u.channelCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                    </span>
                                                </div>
                                                {(() => {
                                                    const promoterChannels = u.channels.filter(c => c.promoters.some(p => p.isPromoter));
                                                    if (promoterChannels.length === 0) {
                                                        return <div className="text-muted-foreground text-sm border rounded-md p-4 text-center">暂无渠道推广员提成数据</div>;
                                                    }
                                                    return (
                                                        <Tabs defaultValue={promoterChannels[0].channelName} className="w-full">
                                                            <TabsList className="mb-2">
                                                                {promoterChannels.map(c => (
                                                                    <TabsTrigger key={c.channelName} value={c.channelName}>{c.channelName}</TabsTrigger>
                                                                ))}
                                                            </TabsList>
                                                            {promoterChannels.map(c => (
                                                                <TabsContent key={c.channelName} value={c.channelName}>
                                                                    <div className="rounded-md border">
                                                                        <Table>
                                                                            <TableHeader>
                                                                                <TableRow className="bg-muted/50">
                                                                                    <TableHead>推广员</TableHead>
                                                                                    <TableHead>单量</TableHead>
                                                                                    <TableHead>营收</TableHead>
                                                                                    <TableHead>账号点数</TableHead>
                                                                                    <TableHead>账号提成</TableHead>
                                                                                </TableRow>
                                                                            </TableHeader>
                                                                            <TableBody>
                                                                                {c.promoters.filter(p => p.isPromoter).map(p => (
                                                                                    <TableRow key={p.name}>
                                                                                        <TableCell>{p.name}</TableCell>
                                                                                        <TableCell>{p.count}</TableCell>
                                                                                        <TableCell>¥{p.revenue.toLocaleString()}</TableCell>
                                                                                        <TableCell>{p.accountRate}%</TableCell>
                                                                                        <TableCell>¥{p.accountCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                                                                                    </TableRow>
                                                                                ))}
                                                                            </TableBody>
                                                                        </Table>
                                                                    </div>
                                                                </TabsContent>
                                                            ))}
                                                        </Tabs>
                                                    );
                                                })()}
                                            </div>

                                            {/* 3. Retail High Ticket Orders Section */}
                                            {u.highTicketCommission > 0 && (
                                                <div>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <h3 className="text-lg font-semibold">高客单提成 - 零售订单明细</h3>
                                                        <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                                            总计: ¥{u.highTicketCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                        </span>
                                                        <span className="text-sm text-muted-foreground bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
                                                            生效点数: {u.highTicketRate || 0}%
                                                        </span>
                                                    </div>
                                                    <RetailOrderList 
                                                        userId={u.userId}
                                                        period={period}
                                                        start={start}
                                                        end={end}
                                                        highTicketRate={u.highTicketRate || 0}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </SheetContent>
                                </Sheet>
                            </TableCell>
                        </TableRow>
                    ))}
                    {paginatedStats.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                暂无数据
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
        
        {totalPages > 0 && (
            <div className="flex items-center justify-between mt-4 px-2">
                <div className="text-sm text-muted-foreground">
                    共 {filteredStats.length} 条数据，本页显示 {paginatedStats.length} 条
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
                                {[10, 20, 50, 100].map((size) => (
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
                                {Array.from({ length: totalPages }).map((_, idx) => {
                                    const page = idx + 1;
                                    const shouldShow = page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1
                                    if (!shouldShow) {
                                        if (page === 2 && currentPage > 3) {
                                            return (
                                                <PaginationItem key={`ellipsis-start-${page}`}>
                                                    <PaginationEllipsis />
                                                </PaginationItem>
                                            )
                                        }
                                        if (page === totalPages - 1 && currentPage < totalPages - 2) {
                                            return (
                                                <PaginationItem key={`ellipsis-end-${page}`}>
                                                    <PaginationEllipsis />
                                                </PaginationItem>
                                            )
                                        }
                                        return null
                                    }

                                    return (
                                        <PaginationItem key={page}>
                                            <PaginationLink
                                                isActive={page === currentPage}
                                                onClick={() => setCurrentPage(page)}
                                                className="cursor-pointer"
                                            >
                                                {page}
                                            </PaginationLink>
                                        </PaginationItem>
                                    )
                                })}
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
        )}
      </div>
    </div>
  );
}
