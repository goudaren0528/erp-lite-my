"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { format, addYears, subYears, setMonth, getYear, getMonth } from "date-fns"
import * as XLSX from "xlsx"
import { Calendar as CalendarIcon, Download, ChevronLeft, ChevronRight, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
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

interface StatsClientProps {
  period?: string
  start?: string
  end?: string
  userStats: {
    userId: string
    userName: string
    accountGroupName: string
    orderCount: number
    totalRevenue: number
    refundedAmount: number
    accountEffectivePercentage: number
    estimatedCommission: number
    accountGroupRules: Rule[]
    promoters: {
      name: string
      count: number
      revenue: number
      channelName: string
      channelCostPercentage: number
      commission: number
      rules: Rule[]
    }[]
  }[]
}

function RuleHoverCard({ rules, label = "提成点数" }: { rules: Rule[], label?: string }) {
  if (!rules || rules.length === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-pointer inline-block ml-1 align-middle" />
        </TooltipTrigger>
        <TooltipContent className="w-80 p-0" side="right">
          <div className="p-2 bg-white rounded-md border shadow-sm">
            <h4 className="font-medium text-sm mb-2 px-2">阶梯规则详情 <span className="text-xs font-normal text-muted-foreground ml-2">(单量越多提成越高)</span></h4>
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

  // Sync internal year state when date prop changes
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

export function StatsClient({ userStats, period = 'cumulative', start, end }: StatsClientProps) {
  const router = useRouter();

  // Calculate Totals
  const totalOrdersCount = userStats.reduce((acc, curr) => acc + curr.orderCount, 0);
  const totalRevenue = userStats.reduce((acc, curr) => acc + curr.totalRevenue, 0);
  const totalRefunded = userStats.reduce((acc, curr) => acc + curr.refundedAmount, 0);
  const totalCommission = userStats.reduce((acc, curr) => acc + curr.estimatedCommission, 0);
  const totalNetIncome = totalRevenue - totalCommission;
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const totalPages = Math.max(1, Math.ceil(userStats.length / pageSize))
  const paginatedStats = userStats.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  React.useEffect(() => {
    setCurrentPage(1)
  }, [pageSize, userStats])

  // Handle Period Change
  const handlePeriodChange = (value: string) => {
    const params = new URLSearchParams();
    params.set("period", value);
    if (value === 'monthly') {
        // Default to current month if switching to monthly
        // Or leave empty and let server handle default? 
        // Better let server handle default, but if we want to show it in UI, we might need to set it.
        // Let's not set start/end here, let server/default handle it.
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

  // Export Account Stats
  const handleExportAccounts = () => {
    const rows: any[] = [];
    userStats.forEach(u => {
      if (u.promoters.length > 0) {
        u.promoters.forEach(p => {
          rows.push({
            "账号": u.userName,
            "账号组": u.accountGroupName,
            "总订单数": u.orderCount,
            "总营收": u.totalRevenue,
            "账号生效点数": u.accountEffectivePercentage + '%',
            "预计总提成": u.estimatedCommission,
            "推广员": p.name,
            "所属渠道": p.channelName,
            "推广员订单数": p.count,
            "推广员营收": p.revenue,
            "渠道成本点数": p.channelCostPercentage + '%',
            "推广员预计提成": p.commission
          });
        });
      } else {
        rows.push({
            "账号": u.userName,
            "账号组": u.accountGroupName,
            "总订单数": u.orderCount,
            "总营收": u.totalRevenue,
            "账号生效点数": u.accountEffectivePercentage + '%',
            "预计总提成": u.estimatedCommission,
            "推广员": "无",
            "所属渠道": "-",
            "推广员订单数": 0,
            "推广员营收": 0,
            "渠道成本点数": "-",
            "推广员预计提成": 0
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "业绩明细");
    XLSX.writeFile(wb, `业绩统计_${period}_${format(new Date(), 'yyyyMMddHHmm')}.xlsx`);
  };

  // Export Individual Promoter Stats
  const handleExportPromoters = (userName: string, promoters: typeof userStats[0]['promoters']) => {
    const rows = promoters.map(p => ({
        "推广员": p.name,
        "所属渠道": p.channelName,
        "订单数": p.count,
        "营收": p.revenue,
        "渠道成本点数": p.channelCostPercentage + '%',
        "预计提成": p.commission
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "推广员明细");
    XLSX.writeFile(wb, `${userName}_推广员明细_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const dateRange: DateRange | undefined = (start && end) ? { from: new Date(start), to: new Date(end) } : (start ? { from: new Date(start), to: undefined } : undefined);

  return (
    <div className="space-y-6">
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

            <Button variant="outline" onClick={handleExportAccounts}>
                <Download className="mr-2 h-4 w-4" />
                导出明细
            </Button>
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
          <div className="p-4 font-semibold border-b">账号业绩统计</div>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">账号名称</TableHead>
                <TableHead className="w-[160px]">所属账号组</TableHead>
                <TableHead className="w-[100px]">总订单数</TableHead>
                <TableHead className="w-[160px]">总营收 (不含押金)</TableHead>
                <TableHead className="w-[140px]">已退款金额</TableHead>
                <TableHead className="w-[160px]">
                  单量提成点数
                  <span className="text-xs font-normal text-muted-foreground ml-1">(基于总单量)</span>
                </TableHead>
                <TableHead className="w-[140px]">预计提成</TableHead>
                <TableHead className="w-[110px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedStats.map((stat) => (
                <TableRow key={stat.userId}>
                  <TableCell className="font-medium">{stat.userName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{stat.accountGroupName}</TableCell>
                  <TableCell>{stat.orderCount}</TableCell>
                  <TableCell>¥ {stat.totalRevenue.toLocaleString()}</TableCell>
                  <TableCell className="text-red-500">¥ {stat.refundedAmount.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <span className="font-medium">{stat.accountEffectivePercentage}%</span>
                      <RuleHoverCard rules={stat.accountGroupRules} label="提成点数" />
                    </div>
                  </TableCell>
                  <TableCell className="text-green-600 font-medium">¥ {stat.estimatedCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                  <TableCell>
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="outline" size="sm">查看明细</Button>
                        </SheetTrigger>
                        <SheetContent className="min-w-[800px] overflow-y-auto">
                            <SheetHeader className="flex flex-row justify-between items-center pr-8">
                                <div>
                                    <SheetTitle>{stat.userName} - 推广员/渠道明细</SheetTitle>
                                    <SheetDescription>
                                        该账号下所有推广员的业绩及提成计算详情
                                    </SheetDescription>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => handleExportPromoters(stat.userName, stat.promoters)}>
                                    <Download className="h-4 w-4 mr-1" />
                                    导出
                                </Button>
                            </SheetHeader>
                            <div className="mt-6">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>推广员</TableHead>
                                            <TableHead>所属渠道</TableHead>
                                            <TableHead>订单数</TableHead>
                                            <TableHead>营收</TableHead>
                                            <TableHead>渠道成本</TableHead>
                                            <TableHead>预计提成</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {stat.promoters.map((p, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell>{p.name}</TableCell>
                                                <TableCell className="text-muted-foreground">{p.channelName}</TableCell>
                                                <TableCell>{p.count}</TableCell>
                                                <TableCell>¥ {p.revenue.toLocaleString()}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center">
                                                        <span>{p.channelCostPercentage}%</span>
                                                        <RuleHoverCard rules={p.rules} label="成本点数" />
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-medium text-green-600">¥ {p.commission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                                            </TableRow>
                                        ))}
                                        {stat.promoters.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">无推广数据</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </SheetContent>
                    </Sheet>
                  </TableCell>
                </TableRow>
              ))}
              {userStats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center h-24">
                    {period === 'custom' && !start ? "请选择日期范围" : "暂无数据"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between mt-4 px-2">
          <div className="text-sm text-muted-foreground">
            共 {userStats.length} 条数据，本页显示 {paginatedStats.length} 条
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
