"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { User } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog"
import { Plus, Pencil, Trash, Loader2 } from "lucide-react"
import { UserForm } from "./user-form"
import { deleteUser } from "@/app/actions"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

interface UserListProps {
    users: User[]
}

const PERMISSIONS_MAP: Record<string, string> = {
    'orders': '订单列表',
    'view_all_orders': '查看所有订单(管理员)',
    'promoters': '推广人员',
    'view_all_promoters': '查看所有推广人员(管理员)',
    'commission': '推广渠道',
    'stats_accounts': '账号结算',
    'stats_promoters': '推广员结算',
    'products': '商品库管理',
    'users': '账号权限管理',
    'backup': '导出导入数据',
}

export function UserList({ users }: UserListProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [open, setOpen] = useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<User | null>(null)
    const [userToDelete, setUserToDelete] = useState<User | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const filteredUsers = users.filter(user => {
        const q = searchQuery.trim().toLowerCase()
        const nameMatch = user.name.toLowerCase().includes(q)
        const usernameMatch = user.username.toLowerCase().includes(q)
        const permissionMatch = user.permissions?.some(p => 
            PERMISSIONS_MAP[p]?.toLowerCase().includes(q)
        )
        return nameMatch || usernameMatch || permissionMatch
    })

    const totalPages = Math.ceil(filteredUsers.length / pageSize)
    const paginatedUsers = filteredUsers.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    )

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value)
        setCurrentPage(1)
    }

    const confirmDelete = (user: User) => {
        setUserToDelete(user)
        setIsDeleteOpen(true)
    }

    const handleDelete = async () => {
        if (!userToDelete) return

        try {
            const res = await deleteUser(userToDelete.id)
            if (res?.success) {
                toast.success(res.message)
                setIsDeleteOpen(false)
                startTransition(() => {
                    router.refresh()
                })
            } else {
                toast.error(res?.message || "操作失败")
            }
        } catch (error) {
            console.error(error)
            toast.error("操作失败: 请刷新页面重试")
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">账号管理</h2>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => setEditingUser(null)}>
                            <Plus className="mr-2 h-4 w-4" /> 新增账号
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingUser ? '编辑账号' : '新增账号'}</DialogTitle>
                        </DialogHeader>
                        <UserForm 
                            initialData={editingUser || undefined} 
                            onSuccess={() => setOpen(false)} 
                        />
                    </DialogContent>
                </Dialog>
            </div>

            <div className="bg-muted/30 p-4 rounded-lg flex flex-wrap gap-1 items-center">
                <Input 
                    placeholder="搜索姓名、用户名、权限..." 
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="max-w-sm bg-background"
                />
            </div>

            <div className="rounded-md border relative min-h-[200px]">
                {isPending && (
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
                            <TableHead className="w-[150px]">姓名</TableHead>
                            <TableHead className="w-[150px]">用户名</TableHead>
                            <TableHead>权限</TableHead>
                            <TableHead className="text-right w-[100px]">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedUsers.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.name}</TableCell>
                                <TableCell>{user.username}</TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                        {user.permissions?.filter(p => PERMISSIONS_MAP[p]).map(p => (
                                            <Badge key={p} variant="secondary" className="text-xs">
                                                {PERMISSIONS_MAP[p]}
                                            </Badge>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button 
                                        variant="ghost" 
                                        size="icon"
                                        onClick={() => {
                                            setEditingUser(user)
                                            setOpen(true)
                                        }}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    {user.username !== 'admin' && (
                                        <Button 
                                            variant="ghost" 
                                            size="icon"
                                            className="text-red-500 hover:text-red-600"
                                            onClick={() => confirmDelete(user)}
                                        >
                                            <Trash className="h-4 w-4" />
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                        {paginatedUsers.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center h-24">暂无用户</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-between mt-4 px-2">
                <div className="text-sm text-muted-foreground">
                    共 {filteredUsers.length} 条数据，本页显示 {paginatedUsers.length} 条
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
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            setCurrentPage(p => Math.max(1, p - 1))
                                        }}
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

                                    return generatePaginationItems(currentPage, totalPages).map((item, index) => (
                                        <PaginationItem key={`${item}-${index}`}>
                                            {typeof item === 'number' ? (
                                                <PaginationLink
                                                    href="#"
                                                    isActive={currentPage === item}
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        setCurrentPage(item)
                                                    }}
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
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            setCurrentPage(p => Math.min(totalPages, p + 1))
                                        }}
                                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    )}
                </div>
            </div>

            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>确认删除账号?</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <p className="text-sm font-medium text-red-600">
                            确定要删除用户 &quot;{userToDelete?.name}&quot; 吗？此操作不可撤销。
                        </p>
                        <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded border">
                            注意：删除用户后，该用户创建的历史订单数据将保留，但该账号将无法再登录系统。
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>取消</Button>
                        <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
