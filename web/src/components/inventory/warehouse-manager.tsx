"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Warehouse } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { createWarehouse, setDefaultWarehouse, deleteWarehouse, updateWarehouse } from "@/app/actions"
import { Warehouse as WarehouseIcon, Trash2, CheckCircle2, Circle, Pencil } from "lucide-react"

interface WarehouseManagerProps {
    warehouses: Warehouse[]
}

export function WarehouseManager({ warehouses }: WarehouseManagerProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [newName, setNewName] = useState("")
    const [isDefault, setIsDefault] = useState(false)
    const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null)
    const [editName, setEditName] = useState("")

    const handleCreate = async () => {
        if (!newName.trim()) return
        startTransition(async () => {
            const res = await createWarehouse({
                name: newName,
                isDefault: isDefault
            })
            if (res.success) {
                toast.success(res.message)
                setNewName("")
                setIsDefault(false)
                router.refresh()
            } else {
                toast.error(res.message)
            }
        })
    }

    const handleSetDefault = async (id: string) => {
        startTransition(async () => {
            const res = await setDefaultWarehouse(id)
            if (res.success) toast.success(res.message)
            else toast.error(res.message)
        })
    }

    const handleDelete = async (id: string) => {
        if (!confirm("确定要删除这个仓库吗？")) return
        startTransition(async () => {
            const res = await deleteWarehouse(id)
            if (res.success) toast.success(res.message)
            else toast.error(res.message)
        })
    }

    const startEdit = (warehouse: Warehouse) => {
        setEditingWarehouse(warehouse)
        setEditName(warehouse.name)
    }

    const handleUpdate = async () => {
        if (!editingWarehouse || !editName.trim()) return
        startTransition(async () => {
            const res = await updateWarehouse(editingWarehouse.id, editName)
            if (res.success) {
                toast.success(res.message)
                setEditingWarehouse(null)
                router.refresh()
            } else {
                toast.error(res.message)
            }
        })
    }

    return (
        <>
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="outline" size="sm">
                        <WarehouseIcon className="mr-2 h-4 w-4" />
                        仓库管理
                    </Button>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px]">
                    <SheetHeader>
                        <SheetTitle>仓库管理</SheetTitle>
                    </SheetHeader>
                    <div className="py-6 space-y-6">
                        {/* Add New */}
                        <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                            <h4 className="text-sm font-medium">新增仓库</h4>
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <Label>仓库名称</Label>
                                    <Input 
                                        value={newName} 
                                        onChange={e => setNewName(e.target.value)} 
                                        placeholder="例如: 主仓库"
                                    />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Label>设为默认</Label>
                                    <Select 
                                        value={isDefault ? "true" : "false"} 
                                        onValueChange={(v) => setIsDefault(v === "true")}
                                    >
                                        <SelectTrigger className="w-[100px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="true">是</SelectItem>
                                            <SelectItem value="false">否</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button 
                                    onClick={handleCreate} 
                                    disabled={isPending || !newName.trim()} 
                                    className="w-full"
                                >
                                    添加
                                </Button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>名称</TableHead>
                                        <TableHead className="w-[80px] text-center">默认</TableHead>
                                        <TableHead className="text-right">操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {warehouses.map(w => (
                                        <TableRow key={w.id}>
                                            <TableCell className="font-medium">{w.name}</TableCell>
                                            <TableCell className="text-center">
                                                {w.isDefault ? (
                                                    <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                                                ) : (
                                                    <Circle className="h-4 w-4 text-muted-foreground mx-auto opacity-20" />
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    title="修改名称"
                                                    onClick={() => startEdit(w)}
                                                    disabled={isPending}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                {!w.isDefault && (
                                                    <Button 
                                                        size="icon" 
                                                        variant="ghost" 
                                                        title="设为默认"
                                                        onClick={() => handleSetDefault(w.id)}
                                                        disabled={isPending}
                                                    >
                                                        <CheckCircle2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                <Button 
                                                    size="icon" 
                                                    variant="ghost" 
                                                    className="text-red-500 hover:text-red-600"
                                                    title="删除"
                                                    onClick={() => handleDelete(w.id)}
                                                    disabled={isPending}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {warehouses.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                                                暂无仓库数据
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            <Dialog open={!!editingWarehouse} onOpenChange={(open) => !open && setEditingWarehouse(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>修改仓库名称</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>仓库名称</Label>
                            <Input 
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="输入新的仓库名称"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingWarehouse(null)}>取消</Button>
                        <Button onClick={handleUpdate} disabled={isPending || !editName.trim()}>
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
