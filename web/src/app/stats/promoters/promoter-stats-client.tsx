"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { format, getYear, getMonth } from "date-fns"
import * as XLSX from "xlsx"
import { Calendar as CalendarIcon, Download, ChevronLeft, ChevronRight } from "lucide-react"
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
import { HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { DateRange } from "react-day-picker"

interface Rule {
  minCount: number;
  maxCount: number | null;
  percentage: number;
}

interface PromoterStatsClientProps {
  period?: string
  start?: string
  end?: string
  promoterStats: {
    name: string
    channelName: string
    orderCount: number
    totalRevenue: number
    refundedAmount: number
    channelEffectivePercentage: number
    channelRules: Rule[]
    commission: number
    netIncome: number
    details: {
        userId: string
        userName: string
        accountGroupName: string
        orderCount: number
        revenue: number
        refundedAmount: number
        accountEffectivePercentage: number
        channelCostPercentage: number
        commission: number
        accountGroupRules: Rule[]
        channelRules: Rule[]
    }[]
    orders: {
        orderNo: string
        productName: string
        variantName: string
        rentPrice: number
        insurancePrice: number
        overdueFee: number | null
        extensionsTotal: number
        orderRevenue: number
        refundAmount: number
        status: string
        orderDate: string
        accountEffectivePercentage: number
        channelCostPercentage: number
        accountGroupRules: Rule[]
        channelRules: Rule[]
    }[]
  }[]
}

function RuleHoverCard({ details }: { details: PromoterStatsClientProps["promoterStats"][0]["details"] }) {
  // Group rules by Account Group
  const groupMap = new Map<string, Rule[]>();
  details.forEach(d => {
      if (!groupMap.has(d.accountGroupName)) {
           groupMap.set(d.accountGroupName, d.channelRules || []);
      }
  });

  if (groupMap.size === 0) return null;

  const hasAnyRules = Array.from(groupMap.values()).some(rules => rules.length > 0);
  if (!hasAnyRules) return null;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-pointer inline-block ml-1 align-middle" />
        </TooltipTrigger>
        <TooltipContent className="w-80 p-0" side="right">
          <div className="p-3 bg-white rounded-md border shadow-sm max-h-[400px] overflow-y-auto">
            <h4 className="font-medium text-sm mb-2 px-1">提成规则详情 <span className="text-xs font-normal text-muted-foreground ml-1">(单量越多提成越高)</span></h4>
            {Array.from(groupMap.entries()).map(([groupName, rules], idx) => {
                // Deduplicate rules
                const uniqueRules = rules.filter((r, i, self) => 
                   self.findIndex(t => t.minCount === r.minCount && t.maxCount === r.maxCount && t.percentage === r.percentage) === i
                ).filter(r => r.percentage > 0.001); // Filter out 0% rules (using 0.001 to avoid float issues)

                if (uniqueRules.length === 0) return null;

                return (
                    <div key={idx} className="mb-3 last:mb-0 border rounded-sm p-2 bg-slate-50">
                        <div className="text-xs font-semibold text-slate-700 mb-1 border-b pb-1">账号组: {groupName}</div>
                        <Table>
                            <TableHeader>
                                <TableRow className="h-6 hover:bg-transparent border-b-0">
                                    <TableHead className="h-6 text-xs py-0 pl-1">单量区间</TableHead>
                                    <TableHead className="h-6 text-xs py-0">提成点数</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {uniqueRules.map((rule, rIdx) => (
                                    <TableRow key={rIdx} className="h-6 hover:bg-muted/50 border-0">
                                        <TableCell className="py-0 text-xs pl-1">
                                            {rule.maxCount === null ? `> ${rule.minCount}` : `${rule.minCount} - ${rule.maxCount}`}
                                        </TableCell>
                                        <TableCell className="py-0 text-xs">{rule.percentage}%</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                );
            })}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function TruncatedList({ items }: { items: string[] }) {
    const uniqueItems = Array.from(new Set(items));
    const text = uniqueItems.join(', ') || '无';
    
    return (
        <TooltipProvider>
            <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                    <div className="max-w-[140px] truncate cursor-default">
                        {text}
                    </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-[300px] max-h-[300px] overflow-y-auto">
                    <p className="break-words text-xs">{text}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
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

function OrderDetailsTable({ orders }: { orders: PromoterStatsClientProps["promoterStats"][0]["orders"] }) {
  const [currentPage, setCurrentPage] = React.useState(1)
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(orders.length / pageSize))

  React.useEffect(() => {
    setCurrentPage(1)
  }, [orders])

  const paginatedOrders = orders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  return (
    <div className="mt-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>订单号</TableHead>
            <TableHead>订单日期</TableHead>
            <TableHead>订单商品</TableHead>
            <TableHead>租金</TableHead>
            <TableHead>保险</TableHead>
            <TableHead>续租</TableHead>
            <TableHead>逾期</TableHead>
            <TableHead>订单金额</TableHead>
            <TableHead>退款金额</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedOrders.map((orderItem, i) => (
            <TableRow key={`${orderItem.orderNo}-${i}`}>
              <TableCell className="font-medium">{orderItem.orderNo}</TableCell>
              <TableCell>{format(new Date(orderItem.orderDate), "yyyy-MM-dd")}</TableCell>
              <TableCell>
                <div className="font-medium">{orderItem.productName}</div>
                <div className="text-muted-foreground text-sm">{orderItem.variantName}</div>
              </TableCell>
              <TableCell>¥ {orderItem.rentPrice.toLocaleString()}</TableCell>
              <TableCell>¥ {orderItem.insurancePrice.toLocaleString()}</TableCell>
              <TableCell>¥ {orderItem.extensionsTotal.toLocaleString()}</TableCell>
              <TableCell>¥ {((orderItem.overdueFee || 0)).toLocaleString()}</TableCell>
              <TableCell>¥ {orderItem.orderRevenue.toLocaleString()}</TableCell>
              <TableCell className="text-red-500">¥ {orderItem.refundAmount.toLocaleString()}</TableCell>
            </TableRow>
          ))}
          {orders.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                暂无数据
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <div className="flex justify-end mt-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }).map((_, idx) => {
                const page = idx + 1
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
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                )
              })}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
}

export function PromoterStatsClient({ promoterStats, period = 'cumulative', start, end }: PromoterStatsClientProps) {
  const router = useRouter();
  
  const [selectedChannel, setSelectedChannel] = React.useState<string>("all");
  const [selectedGroup, setSelectedGroup] = React.useState<string>("all");
  const [selectedAccount, setSelectedAccount] = React.useState<string>("all");

  // Extract unique filter options
  const channels = React.useMemo(() => Array.from(new Set(promoterStats.map(p => p.channelName).filter(Boolean))), [promoterStats]);
  
  const groups = React.useMemo(() => {
      const s = new Set<string>();
      promoterStats.forEach(p => p.details.forEach(d => s.add(d.accountGroupName)));
      return Array.from(s).filter(Boolean);
  }, [promoterStats]);

  const accounts = React.useMemo(() => {
      const s = new Set<string>();
      promoterStats.forEach(p => p.details.forEach(d => s.add(d.userName)));
      return Array.from(s).filter(Boolean);
  }, [promoterStats]);

  // Filter and Sort Stats
  const filteredStats = React.useMemo(() => {
      let result = [...promoterStats];

      if (selectedChannel !== "all") {
          result = result.filter(p => p.channelName === selectedChannel);
      }

      if (selectedGroup !== "all") {
          result = result.filter(p => p.details.some(d => d.accountGroupName === selectedGroup));
      }

      if (selectedAccount !== "all") {
          result = result.filter(p => p.details.some(d => d.userName === selectedAccount));
      }

      // Default Sort: Commission Descending
      result.sort((a, b) => b.commission - a.commission);

      return result;
  }, [promoterStats, selectedChannel, selectedGroup, selectedAccount]);

  // Calculate Totals
  const totalOrdersCount = filteredStats.reduce((acc, curr) => acc + curr.orderCount, 0);
  const totalRevenue = filteredStats.reduce((acc, curr) => acc + curr.totalRevenue, 0);
  const totalRefunded = filteredStats.reduce((acc, curr) => acc + curr.refundedAmount, 0);
  const totalCommission = filteredStats.reduce((acc, curr) => acc + curr.commission, 0);
  const totalNetIncome = totalRevenue - totalCommission;

  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const totalPages = Math.max(1, Math.ceil(filteredStats.length / pageSize))
  const paginatedStats = filteredStats.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  React.useEffect(() => {
    setCurrentPage(1)
  }, [pageSize, selectedChannel, selectedGroup, selectedAccount, period]) // Reset page on filter change

  // Handle Period Change
  const handlePeriodChange = (value: string) => {
    const params = new URLSearchParams();
    params.set("period", value);
    if (value === 'monthly') {
        // Default to current month if switching to monthly
    }
    router.push(`?${params.toString()}`);
  };

  // Handle Date Range Change (Custom)
  const handleDateRangeSelect = (range: DateRange | undefined) => {
    if (!range?.from) return;
    
    const params = new URLSearchParams();
    params.set("period", "custom");
    params.set("start", format(range.from, "yyyy-MM-dd"));
    if (range.to) {
      params.set("end", format(range.to, "yyyy-MM-dd"));
    }
    router.push(`?${params.toString()}`);
  };

  // Handle Month Change
  const handleMonthSelect = (date: Date) => {
     const params = new URLSearchParams();
     params.set("period", "monthly");
     params.set("start", format(date, "yyyy-MM-dd"));
     router.push(`?${params.toString()}`);
  };

  // Export Promoter Stats (Summary)
  const handleExportPromoters = () => {
    const rows: any[] = [];
    promoterStats.forEach(p => {
        rows.push({
            "推广员": p.name,
            "所属渠道": p.channelName,
            "总订单数": p.orderCount,
            "总营收": p.totalRevenue,
            "已退款金额": p.refundedAmount,
            "预计提成": p.commission,
            "提成后收入": p.netIncome
        });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "推广员业绩");
    XLSX.writeFile(wb, `推广员业绩统计_${period}_${format(new Date(), 'yyyyMMddHHmm')}.xlsx`);
  };

  // Export Individual Promoter Details (breakdown by account)
  const handleExportPromoterDetails = (promoterName: string, orders: typeof promoterStats[0]['orders']) => {
    const rows = orders.map(orderItem => ({
        "订单号": orderItem.orderNo,
        "订单日期": format(new Date(orderItem.orderDate), "yyyy-MM-dd"),
        "商品": orderItem.productName,
        "规格": orderItem.variantName,
        "租金": orderItem.rentPrice,
        "保险": orderItem.insurancePrice,
        "续租": orderItem.extensionsTotal,
        "逾期": orderItem.overdueFee || 0,
        "订单金额": orderItem.orderRevenue,
        "退款金额": orderItem.refundAmount
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "业绩明细");
    XLSX.writeFile(wb, `${promoterName}_业绩明细_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const dateRange: DateRange | undefined = (start && end) ? { from: new Date(start), to: new Date(end) } : (start ? { from: new Date(start), to: undefined } : undefined);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <Tabs value={period} onValueChange={handlePeriodChange} className="w-[400px]">
                <TabsList>
                    <TabsTrigger value="cumulative">累计</TabsTrigger>
                    <TabsTrigger value="monthly">月度</TabsTrigger>
                    <TabsTrigger value="custom">自定义</TabsTrigger>
                </TabsList>
            </Tabs>

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

                <Button variant="outline" onClick={handleExportPromoters}>
                    <Download className="mr-2 h-4 w-4" />
                    导出报表
                </Button>
            </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
             <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="筛选渠道" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">所有渠道</SelectItem>
                    {channels.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
             </Select>

             <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="筛选账号组" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">所有账号组</SelectItem>
                    {groups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
             </Select>

             <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="筛选账号" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">所有账号</SelectItem>
                    {accounts.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
             </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
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
            <CardTitle className="text-sm font-medium">总营收 (不含押金)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥ {totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">不含已关闭/退款订单</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已退款金额</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">¥ {totalRefunded.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">已关闭订单总额</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">预计总提成</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">¥ {totalCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <p className="text-xs text-muted-foreground">根据当前配置估算</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">提成后收入</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">¥ {totalNetIncome.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <p className="text-xs text-muted-foreground">总营收 - 预计提成</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6">
        <div className="rounded-md border bg-white">
          <div className="p-4 font-semibold border-b">推广员业绩统计</div>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">推广员</TableHead>
                <TableHead className="w-[140px]">所属渠道</TableHead>
                <TableHead className="w-[140px]">所属账号组</TableHead>
                <TableHead className="w-[140px]">所属账号</TableHead>
                <TableHead>总订单数</TableHead>
                <TableHead>总营收</TableHead>
                <TableHead>已退款金额</TableHead>
                <TableHead>单量提成点数</TableHead>
                <TableHead>预计提成</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedStats.map((stat, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{stat.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{stat.channelName}</TableCell>
                  <TableCell>
                      <TruncatedList items={stat.details.map(d => d.accountGroupName)} />
                  </TableCell>
                  <TableCell>
                      <TruncatedList items={stat.details.map(d => d.userName)} />
                  </TableCell>
                  <TableCell>{stat.orderCount}</TableCell>
                  <TableCell>¥ {stat.totalRevenue.toLocaleString()}</TableCell>
                  <TableCell className="text-red-500">¥ {stat.refundedAmount.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <span>
                          {stat.commission > 0 && stat.channelEffectivePercentage < 0.01 
                              ? "< 0.01%" 
                              : `${stat.channelEffectivePercentage.toFixed(2)}%`}
                      </span>
                      <RuleHoverCard details={stat.details} />
                    </div>
                  </TableCell>
                  <TableCell className="text-green-600 font-medium">¥ {stat.commission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                  <TableCell>
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="outline" size="sm">查看明细</Button>
                        </SheetTrigger>
                        <SheetContent className="min-w-[1100px] overflow-y-auto px-6">
                            <SheetHeader className="flex flex-row justify-between items-center pr-8">
                                <div>
                                    <SheetTitle>{stat.name} - 业绩明细</SheetTitle>
                                    <SheetDescription>
                                        该推广员的订单维度业绩明细
                                    </SheetDescription>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => handleExportPromoterDetails(stat.name, stat.orders)}>
                                    <Download className="h-4 w-4 mr-1" />
                                    导出
                                </Button>
                            </SheetHeader>
                            <div className="mt-6 grid gap-4 md:grid-cols-4">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">订单数</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{stat.orderCount}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">营收</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">¥ {stat.totalRevenue.toLocaleString()}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">退款金额</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-red-500">¥ {stat.refundedAmount.toLocaleString()}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">预计提成</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-green-600">¥ {stat.commission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                                    </CardContent>
                                </Card>
                            </div>
                            <div className="mt-8">
                                <div className="font-medium mb-3">订单维度明细</div>
                                <OrderDetailsTable orders={stat.orders} />
                            </div>
                        </SheetContent>
                    </Sheet>
                  </TableCell>
                </TableRow>
              ))}
              {promoterStats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between mt-4 px-2">
          <div className="text-sm text-muted-foreground">
            共 {promoterStats.length} 条数据，本页显示 {paginatedStats.length} 条
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
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const page = idx + 1
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
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
