"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface StatsClientProps {
  userStats: {
    userId: string
    userName: string
    orderCount: number
    totalRevenue: number
    refundedAmount: number
    promoters: {
      name: string
      count: number
      revenue: number
    }[]
  }[]
}

export function StatsClient({ userStats }: StatsClientProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6">
        <div className="rounded-md border bg-white">
          <div className="p-4 font-semibold border-b">账号业绩统计</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>账号名称</TableHead>
                <TableHead>总订单数</TableHead>
                <TableHead>总营收 (不含押金)</TableHead>
                <TableHead>已退款金额</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userStats.map((stat) => (
                <TableRow key={stat.userId}>
                  <TableCell className="font-medium">{stat.userName}</TableCell>
                  <TableCell>{stat.orderCount}</TableCell>
                  <TableCell>¥ {stat.totalRevenue.toLocaleString()}</TableCell>
                  <TableCell className="text-red-500">¥ {stat.refundedAmount.toLocaleString()}</TableCell>
                  <TableCell>
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm">查看明细</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{stat.userName} - 推广员/渠道明细</DialogTitle>
                            </DialogHeader>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>推广员/渠道</TableHead>
                                        <TableHead>订单数</TableHead>
                                        <TableHead>营收</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stat.promoters.map((p, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{p.name}</TableCell>
                                            <TableCell>{p.count}</TableCell>
                                            <TableCell>¥ {p.revenue.toLocaleString()}</TableCell>
                                        </TableRow>
                                    ))}
                                    {stat.promoters.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center">无推广数据</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
              {userStats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center h-24">暂无数据</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
