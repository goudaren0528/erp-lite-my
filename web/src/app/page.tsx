
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getDb } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { OrderStatus } from "@/types"
import { subDays, isAfter, parseISO } from "date-fns"
import { CreditCard, FileText, Activity, ArrowRight, Plus } from "lucide-react"

const statusMap: Record<string, { label: string; color: string; order: number }> = {
  PENDING_REVIEW: { label: '待审核', color: 'text-orange-600 bg-orange-50 border-orange-200', order: 2 },
  PENDING_SHIPMENT: { label: '待发货', color: 'text-blue-600 bg-blue-50 border-blue-200', order: 5 },
  PENDING_RECEIPT: { label: '待收货', color: 'text-blue-700 bg-blue-100 border-blue-300', order: 6 },
  RENTING: { label: '待归还', color: 'text-green-600 bg-green-50 border-green-200', order: 7 },
  OVERDUE: { label: '已逾期', color: 'text-red-600 bg-red-50 border-red-200', order: 8 },
  RETURNING: { label: '归还中', color: 'text-purple-600 bg-purple-50 border-purple-200', order: 9 },
  COMPLETED: { label: '已完成', color: 'text-gray-600 bg-gray-50 border-gray-200', order: 10 },
  BOUGHT_OUT: { label: '已购买', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', order: 11 },
  CLOSED: { label: '已关闭', color: 'text-gray-400 bg-gray-100 border-gray-200', order: 12 },
}

export default async function Home() {
  const db = await getDb()
  const user = await getCurrentUser()
  
  const isAdmin = user?.role === 'ADMIN'
  const canViewAllOrders = isAdmin || user?.permissions?.includes('view_all_orders')

  // Filter orders based on permissions
  const ordersToDisplay = canViewAllOrders 
    ? db.orders 
    : db.orders.filter(o => o.creatorId === user?.id)
  
  // Calculate 7 Days Stats
  const sevenDaysAgo = subDays(new Date(), 7)
  const recentOrders = ordersToDisplay.filter(o => isAfter(parseISO(o.createdAt), sevenDaysAgo))
  
  const recentCount = recentOrders.length
  const recentAmount = recentOrders.reduce((sum, o) => sum + o.totalAmount, 0)
  
  // Calculate Cumulative Stats
  const totalCount = ordersToDisplay.length
  const totalAmount = ordersToDisplay.reduce((sum, o) => sum + o.totalAmount, 0)
  
  // Calculate Status Counts
  const statusCounts = ordersToDisplay.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Platform Stats Logic
  const platformMap: Record<string, string> = {
    XIAOHONGSHU: '小红书',
    XIANYU: '闲鱼',
    DOUYIN: '抖音',
    OTHER: '其他',
  };

  const statsByPlatform: Record<string, { name: string, count: number, totalRent: number }> = {};
  
  ordersToDisplay.forEach(order => {
      const platformKey = order.platform || 'OTHER';
      const platformName = platformMap[platformKey] || platformKey;
      
      if (!statsByPlatform[platformKey]) {
          statsByPlatform[platformKey] = {
              name: platformName,
              count: 0,
              totalRent: 0
          };
      }
      statsByPlatform[platformKey].count++;
      statsByPlatform[platformKey].totalRent += order.rentPrice;
  });
  const platformReport = Object.values(statsByPlatform).sort((a, b) => b.totalRent - a.totalRent);

  return (
    <div className="space-y-8 p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">欢迎回来, {user?.name || '用户'}</h1>
          <p className="text-muted-foreground mt-2">这里是您的订单概览</p>
        </div>
        <div className="flex gap-4">
            <Link href="/orders/create">
                <Button size="lg" className="shadow-lg hover:shadow-xl transition-all">
                    <Plus className="mr-2 h-5 w-5" /> 快速建单
                </Button>
            </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">近7天订单数</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentCount}</div>
            <p className="text-xs text-muted-foreground">过去7天内创建</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">近7天销售额</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{recentAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">过去7天总金额</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">累计订单数</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
            <p className="text-xs text-muted-foreground">历史总计</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">累计销售额</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{totalAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">历史总金额</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold mb-4">订单状态分布</h2>
            <div className="grid grid-cols-2 gap-4">
                {Object.entries(statusMap)
                    .sort(([, a], [, b]) => a.order - b.order)
                    .map(([key, config]) => {
                        const count = statusCounts[key] || 0
                        if (count === 0 && config.order > 20) return null // Hide unused legacy
                        
                        return (
                            <Card key={key} className={`${config.color} border shadow-sm`}>
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-sm font-medium flex justify-between">
                                        {config.label}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <div className="text-2xl font-bold">{count}</div>
                                </CardContent>
                            </Card>
                        )
                })}
            </div>
          </div>
          
          <div>
            <h2 className="text-xl font-semibold mb-4">客户来源统计</h2>
             <div className="rounded-md border bg-white shadow-sm">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-gray-50 text-left">
                            <th className="p-3 font-medium text-gray-500">来源平台</th>
                            <th className="p-3 font-medium text-gray-500">订单数</th>
                            <th className="p-3 font-medium text-gray-500">总租金</th>
                        </tr>
                    </thead>
                    <tbody>
                        {platformReport.map((row) => (
                            <tr key={row.name} className="border-b last:border-0">
                                <td className="p-3 font-medium">{row.name}</td>
                                <td className="p-3">{row.count}</td>
                                <td className="p-3">¥ {row.totalRent}</td>
                            </tr>
                        ))}
                         {platformReport.length === 0 && (
                            <tr>
                                <td colSpan={3} className="p-4 text-center text-gray-500">暂无数据</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
          </div>
      </div>
      
       <div className="flex justify-center mt-8">
            <Link href="/orders">
                <Button variant="outline" className="w-64">
                    查看完整订单列表 <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </Link>
       </div>
    </div>
  )
}
