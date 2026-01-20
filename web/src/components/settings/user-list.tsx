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
} from "@/components/ui/dialog"
import { Plus, Pencil, Trash } from "lucide-react"
import { UserForm } from "./user-form"
import { deleteUser } from "@/app/actions"
import { Badge } from "@/components/ui/badge"

interface UserListProps {
    users: User[]
}

export function UserList({ users }: UserListProps) {
    const [open, setOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<User | null>(null)

    const handleDelete = async (id: string) => {
        if (confirm("确定要删除该用户吗？此操作不可撤销。")) {
            if (confirm("请再次确认：删除用户后，该用户创建的历史订单数据将保留，但无法再登录系统。确定要继续吗？")) {
                await deleteUser(id)
            }
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
                                    {user.permissions?.map(p => (
                                        <Badge key={p} variant="secondary" className="text-xs">
                                            {p}
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
                                        onClick={() => handleDelete(user.id)}
                                    >
                                        <Trash className="h-4 w-4" />
                                    </Button>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
