"use client"

import { useState, useTransition } from "react"
import { InventoryItemType } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { createInventoryItemType, updateInventoryItemType, deleteInventoryItemType } from "@/app/actions"
import { Trash2, Edit2, Plus, Search } from "lucide-react"

interface ItemTypeManagerProps {
    itemTypes: InventoryItemType[]
}

const COMMON_UNITS = ["个", "台", "套", "把", "张", "箱", "米", "千克"]
const COMMON_CATEGORIES = ["电子产品", "办公用品", "家具", "耗材", "线材", "灯具", "音频设备", "视频设备"]

export function ItemTypeManager({ itemTypes }: ItemTypeManagerProps) {
    const [isPending, startTransition] = useTransition()
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [editingType, setEditingType] = useState<InventoryItemType | null>(null)
    const [search, setSearch] = useState("")

    // Form States
    const [name, setName] = useState("")
    const [isSerialized, setIsSerialized] = useState("true")
    const [unit, setUnit] = useState("")
    const [category, setCategory] = useState("")

    const resetForm = () => {
        setName("")
        setIsSerialized("true")
        setUnit("")
        setCategory("")
        setEditingType(null)
    }

    const handleCreate = async () => {
        if (!name.trim()) return
        startTransition(async () => {
            const res = await createInventoryItemType({
                name,
                isSerialized: isSerialized === "true",
                unit,
                category
            })
            if (res.success) {
                toast.success(res.message)
                setIsCreateOpen(false)
                resetForm()
            } else {
                toast.error(res.message)
            }
        })
    }

    const handleUpdate = async () => {
        if (!editingType || !name.trim()) return
        startTransition(async () => {
            const res = await updateInventoryItemType(editingType.id, {
                name,
                isSerialized: isSerialized === "true",
                unit,
                category
            })
            if (res.success) {
                toast.success(res.message)
                setEditingType(null)
                resetForm()
            } else {
                toast.error(res.message)
            }
        })
    }

    const handleDelete = async (id: string) => {
        if (!confirm("确定要删除这个物品类型吗？")) return
        startTransition(async () => {
            const res = await deleteInventoryItemType(id)
            if (res.success) toast.success(res.message)
            else toast.error(res.message)
        })
    }

    const openEdit = (type: InventoryItemType) => {
        setEditingType(type)
        setName(type.name)
        setIsSerialized(type.isSerialized ? "true" : "false")
        setUnit(type.unit || "")
        setCategory(type.category || "")
    }

    const filteredTypes = itemTypes.filter(t => 
        t.name.toLowerCase().includes(search.toLowerCase()) || 
        (t.category || "").toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-muted/50 p-2 rounded-lg">
                <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground ml-2" />
                    <Input 
                        placeholder="搜索物品定义..." 
                        value={search} 
                        onChange={e => setSearch(e.target.value)}
                        className="w-[300px] border-none shadow-none bg-transparent focus-visible:ring-0" 
                    />
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" onClick={resetForm}>
                            <Plus className="mr-2 h-4 w-4" /> 新增物品定义
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>新增物品定义</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>物品名称</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="例如: iPhone 15" />
                                <p className="text-xs text-muted-foreground">这将是库存中显示的物品名称</p>
                            </div>
                            <div className="space-y-2">
                                <Label>管理方式</Label>
                                <Select value={isSerialized} onValueChange={setIsSerialized}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="true">序列化 (一物一码, 追踪SN)</SelectItem>
                                        <SelectItem value="false">非序列化 (仅追踪数量)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>单位</Label>
                                    <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="例如: 台" />
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {COMMON_UNITS.map(u => (
                                            <Badge 
                                                key={u} 
                                                variant="outline" 
                                                className="cursor-pointer hover:bg-accent font-normal text-xs"
                                                onClick={() => setUnit(u)}
                                            >
                                                {u}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>分类</Label>
                                    <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="例如: 手机" />
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {COMMON_CATEGORIES.map(c => (
                                            <Badge 
                                                key={c} 
                                                variant="outline" 
                                                className="cursor-pointer hover:bg-accent font-normal text-xs"
                                                onClick={() => setCategory(c)}
                                            >
                                                {c}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreate} disabled={isPending}>保存</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>物品名称</TableHead>
                            <TableHead>管理方式</TableHead>
                            <TableHead>单位</TableHead>
                            <TableHead>分类</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredTypes.map(t => (
                            <TableRow key={t.id}>
                                <TableCell className="font-medium">{t.name}</TableCell>
                                <TableCell>
                                    {t.isSerialized ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                            序列化
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                            数量
                                        </span>
                                    )}
                                </TableCell>
                                <TableCell>{t.unit || "-"}</TableCell>
                                <TableCell>{t.category || "-"}</TableCell>
                                <TableCell className="text-right space-x-1">
                                    <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        onClick={() => openEdit(t)}
                                    >
                                        <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        className="text-red-500 hover:text-red-600"
                                        onClick={() => handleDelete(t.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredTypes.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">暂无物品定义数据</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Edit Dialog */}
            <Dialog open={!!editingType} onOpenChange={(open) => !open && setEditingType(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>编辑物品定义</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>物品名称</Label>
                            <Input value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>管理方式</Label>
                            <Select value={isSerialized} onValueChange={setIsSerialized}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="true">序列化 (一物一码)</SelectItem>
                                    <SelectItem value="false">非序列化 (按数量)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>单位</Label>
                                <Input value={unit} onChange={e => setUnit(e.target.value)} />
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {COMMON_UNITS.map(u => (
                                        <Badge 
                                            key={u} 
                                            variant="outline" 
                                            className="cursor-pointer hover:bg-accent font-normal text-xs"
                                            onClick={() => setUnit(u)}
                                        >
                                            {u}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>分类</Label>
                                <Input value={category} onChange={e => setCategory(e.target.value)} />
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {COMMON_CATEGORIES.map(c => (
                                        <Badge 
                                            key={c} 
                                            variant="outline" 
                                            className="cursor-pointer hover:bg-accent font-normal text-xs"
                                            onClick={() => setCategory(c)}
                                        >
                                            {c}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleUpdate} disabled={isPending}>更新</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
