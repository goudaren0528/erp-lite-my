"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { format, getYear, getMonth } from "date-fns"
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
import { DateRange } from "react-day-picker"
import { HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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
    totalOrderCount: number;
    totalRevenue: number;
    refundedAmount: number;
    estimatedEmployeeCommission: number;
    volumeGradientCommission: number;
    channelCommission: number;
    estimatedPromoterCommission: number;
    effectiveBaseRate?: number;
    defaultUserRules?: Rule[];
    orders: any[];
    channels: {
        channelId: string;
        channelName: string;
        orderCount: number;
        revenue: number;
        employeeRate: number;
        employeeCommission: number;
        promoters: {
            name: string;
            count: number;
            revenue: number;
            rate: number;
            commission: number;
            isPromoter: boolean;
            accountRate: number;
            accountCommission: number;
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
  const totalRefunded = filteredStats.reduce((acc, s) => acc + s.refundedAmount, 0);
  const totalEmployeeCommission = filteredStats.reduce((acc, s) => acc + s.estimatedEmployeeCommission, 0);
  const totalPromoterCommission = filteredStats.reduce((acc, s) => acc + s.estimatedPromoterCommission, 0);
  const totalNetIncome = totalRevenue - totalEmployeeCommission - totalPromoterCommission;

  // Handle Period Change
  const handlePeriodChange = (value: string) => {
    const params = new URLSearchParams();
    params.set("period", value);
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

  // Export Stats
  const handleExport = () => {
    const rows: any[] = [];
    filteredStats.forEach(stat => {
        stat.channels.forEach(c => {
            c.promoters.forEach(p => {
                 rows.push({
                    "账号组": stat.accountGroupName,
                    "账号": stat.userName,
                    "总订单数": stat.totalOrderCount,
                    "总营收": stat.totalRevenue,
                    "员工总提成": stat.estimatedEmployeeCommission,
                    "渠道提成": stat.channelCommission,
                    "单量阶梯提成": stat.volumeGradientCommission,
                    "渠道": c.channelName,
                    "渠道单量": c.orderCount,
                    "渠道营收": c.revenue,
                    "员工提成点数": c.employeeRate + '%',
                    "员工渠道提成": c.employeeCommission,
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
                    "渠道提成": stat.channelCommission,
                    "单量阶梯提成": stat.volumeGradientCommission,
                    "渠道": c.channelName,
                    "渠道单量": c.orderCount,
                    "渠道营收": c.revenue,
                    "员工提成点数": c.employeeRate + '%',
                    "员工渠道提成": c.employeeCommission,
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

  const handleExportOrders = (userName: string, orders: any[]) => {
      const rows = orders.map(o => ({
          "订单号": o.orderNo,
          "创建时间": format(new Date(o.createdAt), 'yyyy-MM-dd HH:mm:ss'),
          "完结时间": o.completedAt ? format(new Date(o.completedAt), 'yyyy-MM-dd HH:mm:ss') : '-',
          "状态": o.status,
          "来源/推广员": o.promoterName,
          "营收": o.orderRevenue,
          "退款": o.refundAmount || 0,
          "租金": o.rentPrice,
          "保险": o.insurancePrice,
          "延期": o.extensions?.reduce((acc: number, e: any) => acc + e.price, 0) || 0,
          "逾期": o.overdueFee || 0
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "订单明细");
      XLSX.writeFile(wb, `${userName}_订单明细_${format(new Date(), 'yyyyMMddHHmm')}.xlsx`);
  };

  const dateRange: DateRange | undefined = (start && end) ? { from: new Date(start), to: new Date(end) } : (start ? { from: new Date(start), to: undefined } : undefined);

  return (
    <div className="space-y-6">
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

            <Button variant="outline" onClick={handleExport}>
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
            <CardTitle className="text-sm font-medium">总营收</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥ {totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">不含已关闭/退款订单</p>
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
                        <TableHead className="w-[120px]">渠道提成</TableHead>
                        <TableHead className="w-[120px]">单量阶梯提成</TableHead>
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
                                ¥ {u.channelCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
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
                            <TableCell className="text-green-600 font-medium">
                                ¥ {u.estimatedEmployeeCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </TableCell>
                            <TableCell className="text-orange-600 font-medium">¥ {u.estimatedPromoterCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                            <TableCell>
                                <Sheet>
                                    <SheetTrigger asChild>
                                        <Button variant="outline" size="sm">详情</Button>
                                    </SheetTrigger>
                                    <SheetContent className="min-w-[800px] overflow-y-auto">
                                        <SheetHeader>
                                            <div className="flex justify-between items-center pr-8">
                                                <SheetTitle>{u.userName} - 提成详情</SheetTitle>
                                                <Button variant="outline" size="sm" onClick={() => handleExportOrders(u.userName, u.orders)}>
                                                    <Download className="mr-2 h-4 w-4" />
                                                    导出详情
                                                </Button>
                                            </div>
                                            <SheetDescription>
                                                按渠道拆分的员工及推广员提成明细 (当前总单量级别: {u.totalOrderCount})
                                            </SheetDescription>
                                        </SheetHeader>
                                        
                                        <div className="mt-6 space-y-8">
                                            {/* 1. Volume Gradient Commission Section */}
                                            <div>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <h3 className="text-lg font-semibold">单量阶梯提成</h3>
                                                    <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                                        总计: ¥{u.volumeGradientCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                    </span>
                                                </div>
                                                <div className="rounded-md border">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow className="bg-muted/50">
                                                                <TableHead>来源</TableHead>
                                                                <TableHead>单量</TableHead>
                                                                <TableHead>营收</TableHead>
                                                                <TableHead>员工点数</TableHead>
                                                                <TableHead>员工提成</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {u.channels.flatMap(c => c.promoters.filter(p => !p.isPromoter).map(p => ({...p, channelName: c.channelName}))).map((item, idx) => (
                                                                <TableRow key={idx}>
                                                                    <TableCell>{item.name === 'self' || item.name === '未标记' ? item.channelName : item.name}</TableCell>
                                                                    <TableCell>{item.count}</TableCell>
                                                                    <TableCell>¥{item.revenue.toLocaleString()}</TableCell>
                                                                    <TableCell>{item.accountRate}%</TableCell>
                                                                    <TableCell>¥{item.accountCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                            {u.channels.flatMap(c => c.promoters.filter(p => !p.isPromoter)).length === 0 && (
                                                                <TableRow>
                                                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-4">无阶梯提成数据</TableCell>
                                                                </TableRow>
                                                            )}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>

                                            {/* 2. Channel Promoter Commission Section */}
                                            <div>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <h3 className="text-lg font-semibold">渠道推广员提成</h3>
                                                    <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                                        总计: ¥{u.channelCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                    </span>
                                                </div>
                                                <div className="rounded-md border">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow className="bg-muted/50">
                                                                <TableHead>渠道</TableHead>
                                                                <TableHead>推广员</TableHead>
                                                                <TableHead>单量</TableHead>
                                                                <TableHead>营收</TableHead>
                                                                <TableHead>员工点数</TableHead>
                                                                <TableHead>员工提成</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {u.channels.flatMap(c => c.promoters.filter(p => p.isPromoter).map(p => ({...p, channelName: c.channelName}))).map((item, idx) => (
                                                                <TableRow key={idx}>
                                                                    <TableCell>{item.channelName}</TableCell>
                                                                    <TableCell>{item.name}</TableCell>
                                                                    <TableCell>{item.count}</TableCell>
                                                                    <TableCell>¥{item.revenue.toLocaleString()}</TableCell>
                                                                    <TableCell>{item.accountRate}%</TableCell>
                                                                    <TableCell>¥{item.accountCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                            {u.channels.flatMap(c => c.promoters.filter(p => p.isPromoter)).length === 0 && (
                                                                <TableRow>
                                                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-4">无渠道推广员提成数据</TableCell>
                                                                </TableRow>
                                                            )}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>
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
        
        {totalPages > 1 && (
            <div className="flex justify-end mt-4">
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious 
                                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                        </PaginationItem>
                        {Array.from({length: totalPages}).map((_, idx) => {
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
                                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            </div>
        )}
      </div>
    </div>
  );
}
