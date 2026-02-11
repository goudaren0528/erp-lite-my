"use client"

import { useState, useEffect, useTransition } from "react"
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "@/components/ui/table"
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination"
import { Loader2 } from "lucide-react"
import { fetchAccountOrders } from "./actions"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"

interface ServerOrderListProps {
    userId: string
    period: string
    start?: string
    end?: string
}

export function ServerOrderList({ userId, period, start, end }: ServerOrderListProps) {
    const [page, setPage] = useState(1)
    const [pageSize] = useState(10)
    const [orders, setOrders] = useState<Array<{
        id: string;
        orderNo: string;
        createdAt: string | Date;
        productName: string;
        variantName: string;
        status: string;
        source: string;
        sourceContact?: string | null;
        rentPrice: number;
        insurancePrice: number;
        overdueFee?: number | null;
        extensions?: Array<{ price: number }>;
        revenue: number;
    }>>([])
    const [total, setTotal] = useState(0)
    const [isPending, startTransition] = useTransition()
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        setPage(1)
    }, [userId, period, start, end])

    useEffect(() => {
        setIsLoading(true)
        startTransition(async () => {
            try {
                const res = await fetchAccountOrders({
                    userId,
                    period,
                    start,
                    end,
                    page,
                    pageSize
                })
                setOrders(res.orders)
                setTotal(res.total)
            } catch (error) {
                console.error("Failed to fetch orders:", error)
            } finally {
                setIsLoading(false)
            }
        })
    }, [userId, period, start, end, page, pageSize])

    const totalPages = Math.ceil(total / pageSize)

    const statusMap: Record<string, string> = {
        'PENDING': '待处理',
        'PAID': '已支付',
        'SHIPPED': '已发货',
        'COMPLETED': '已完成',
        'CLOSED': '已关闭/退款',
        'CANCELED': '已取消'
    }

    const statusColorMap: Record<string, string> = {
        'PENDING': 'bg-yellow-100 text-yellow-800',
        'PAID': 'bg-blue-100 text-blue-800',
        'SHIPPED': 'bg-purple-100 text-purple-800',
        'COMPLETED': 'bg-green-100 text-green-800',
        'CLOSED': 'bg-red-100 text-red-800',
        'CANCELED': 'bg-gray-100 text-gray-800'
    }

    return (
        <div className="space-y-4">
            <div className="rounded-md border relative min-h-[200px]">
                {(isPending || isLoading) && (
                    <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                )}
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead>订单号</TableHead>
                            <TableHead>创建时间</TableHead>
                            <TableHead>商品</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>渠道/推广员</TableHead>
                            <TableHead>营收</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map((order) => (
                            <TableRow key={order.id}>
                                <TableCell className="font-mono text-xs">{order.orderNo}</TableCell>
                                <TableCell>{format(new Date(order.createdAt), "yyyy-MM-dd HH:mm")}</TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span>{order.productName}</span>
                                        <span className="text-xs text-muted-foreground">{order.variantName}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={`font-normal border-0 ${statusColorMap[order.status] || ''}`}>
                                        {statusMap[order.status] || order.status}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="text-xs">{order.source}</span>
                                        <span>{order.sourceContact || '-'}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {order.status === 'CLOSED' ? (
                                        <span className="text-muted-foreground line-through">
                                            ¥{((order.rentPrice + order.insurancePrice + (order.overdueFee || 0) + (order.extensions?.reduce((sum, ext) => sum + ext.price, 0) || 0))).toLocaleString()}
                                        </span>
                                    ) : (
                                        <span className="font-medium">
                                            ¥{order.revenue.toLocaleString()}
                                        </span>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && orders.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    暂无订单数据
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {totalPages > 1 && (
                <div className="flex justify-end">
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious 
                                    onClick={() => setPage(Math.max(1, page - 1))}
                                    className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                            </PaginationItem>
                            
                            {/* Simple Pagination Logic for Sheet */}
                            <PaginationItem>
                                <span className="flex items-center px-4 text-sm text-muted-foreground">
                                    Page {page} of {totalPages}
                                </span>
                            </PaginationItem>

                            <PaginationItem>
                                <PaginationNext 
                                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                                    className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
    )
}
