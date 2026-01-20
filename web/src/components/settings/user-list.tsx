"use client"

import { useState } from "react"
import { User } from "@/types"
import { Button } from "@/components/ui/button"
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
import { Plus, Pencil, Trash } from "lucide-react"
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
    'stats': '结算统计',
    'products': '商品库管理',
    'users': '账号权限管理',
    'backup': '导出导入数据',
}

export function UserList({ users }: UserListProps) {
    const [open, setOpen] = useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<User | null>(null)
    const [userToDelete, setUserToDelete] = useState<User | null>(null)

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
            } else {
                toast.error(res?.message || "操作失败")
            }
        } catch (e: any) {
            console.error(e)
            toast.error("操作失败: 请刷新页面重试")
        }
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">账号管理</h3>
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

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>姓名</TableHead>
                        <TableHead>用户名</TableHead>
                        <TableHead>权限</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.map((user) => (
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
                </TableBody>
            </Table>

            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>确认删除账号?</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <p className="text-sm font-medium text-red-600">
                            确定要删除用户 "{userToDelete?.name}" 吗？此操作不可撤销。
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
