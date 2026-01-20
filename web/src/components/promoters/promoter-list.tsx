"use client"

import { useState } from "react"
import { Promoter, OrderSource, User } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Label } from "@/components/ui/label"
import { savePromoter, deletePromoter } from "@/app/actions"
import { Plus, Trash2, Edit2 } from "lucide-react"

import { toast } from "sonner"

const CHANNEL_OPTIONS: { value: OrderSource; label: string }[] = [
    { value: 'RETAIL', label: '零售' },
    { value: 'PEER', label: '同行' },
    { value: 'PART_TIME_AGENT', label: '兼职代理' },
]

interface PromoterListProps {
    promoters: Promoter[]
    users?: User[]
}

export function PromoterList({ promoters, users = [] }: PromoterListProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [editingPromoter, setEditingPromoter] = useState<Promoter | null>(null)
    const [promoterToDelete, setPromoterToDelete] = useState<Promoter | null>(null)
    const [formData, setFormData] = useState<Partial<Promoter>>({})
    const [creatorFilter, setCreatorFilter] = useState<string>("all")

    const filteredPromoters = promoters.filter(p => {
        if (creatorFilter === "all") return true
        return p.creatorId === creatorFilter
    })

    const handleEdit = (promoter: Promoter) => {
        setEditingPromoter(promoter)
        setFormData({
            ...promoter,
            channel: promoter.channel || ((promoter as any).channels && (promoter as any).channels[0])
        })
        setIsDialogOpen(true)
    }

    const handleAdd = () => {
        setEditingPromoter(null)
        setFormData({})
        setIsDialogOpen(true)
    }

    const confirmDelete = (promoter: Promoter) => {
        setPromoterToDelete(promoter)
        setIsDeleteDialogOpen(true)
    }

    const handleDelete = async () => {
        if (!promoterToDelete) return

        try {
            const res = await deletePromoter(promoterToDelete.id)
            if (res?.success) {
                toast.success(res.message)
                setIsDeleteDialogOpen(false)
            } else {
                toast.error(res?.message || "操作失败")
            }
        } catch (e: any) {
            console.error(e)
            toast.error("操作失败: 请刷新页面重试")
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const promoterToSave: Partial<Promoter> = {
            id: editingPromoter?.id,
            name: formData.name || '',
            phone: formData.phone || '',
            channel: formData.channel,
        }
        
        try {
            const res = await savePromoter(promoterToSave)
            
            if (res?.success) {
                toast.success(res.message)
                setIsDialogOpen(false)
            } else {
                toast.error(res?.message || "操作失败")
            }
        } catch (e: any) {
            console.error(e)
            toast.error("操作失败: 请刷新页面重试")
        }
    }

    const getChannelLabel = (value: string) => {
        const option = CHANNEL_OPTIONS.find(c => c.value === value)
        if (option) return option.label
        if (value === 'AGENT') return '代理'
        if (value === 'PART_TIME') return '兼职'
        return value
    }

    const getUserName = (userId?: string) => {
        if (!userId) return '-'
        return users.find(u => u.id === userId)?.name || '未知用户'
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="flex items-center space-x-4">
                    <h2 className="text-xl font-bold">推广人员列表</h2>
                    {users.length > 0 && (
                        <div className="w-[200px]">
                            <Select value={creatorFilter} onValueChange={setCreatorFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="筛选创建人" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">所有创建人</SelectItem>
                                    {users.map(user => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={handleAdd}>
                            <Plus className="mr-2 h-4 w-4" /> 添加推广员
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingPromoter ? '编辑推广员' : '添加推广员'}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label>渠道类型</Label>
                                <Select 
                                    value={formData.channel} 
                                    onValueChange={(val: OrderSource) => {
                                        setFormData({
                                            ...formData, 
                                            channel: val,
                                            name: val === 'RETAIL' ? '' : formData.name
                                        })
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择渠道类型" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CHANNEL_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="name">姓名</Label>
                                <Input 
                                    id="name" 
                                    value={formData.channel === 'RETAIL' ? '' : (formData.name || '')} 
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    required={formData.channel !== 'RETAIL'}
                                    disabled={formData.channel === 'RETAIL'}
                                    placeholder={formData.channel === 'RETAIL' ? "零售无需填写" : "请输入姓名"}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">联系方式 (选填)</Label>
                                <Input 
                                    id="phone" 
                                    value={formData.phone || ''} 
                                    onChange={e => setFormData({...formData, phone: e.target.value})}
                                />
                            </div>
                            <div className="flex justify-end space-x-2 pt-4">
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
                                <Button type="submit">保存</Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>姓名</TableHead>
                            <TableHead>联系方式</TableHead>
                            <TableHead>渠道类型</TableHead>
                            <TableHead>创建人</TableHead>
                            <TableHead>创建时间</TableHead>
                            <TableHead className="w-[100px]">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredPromoters.map((promoter) => (
                            <TableRow key={promoter.id}>
                                <TableCell className="font-medium">{promoter.name}</TableCell>
                                <TableCell>{promoter.phone || '-'}</TableCell>
                                <TableCell>
                                    {promoter.channel ? getChannelLabel(promoter.channel) : 
                                     ((promoter as any).channels && (promoter as any).channels.length > 0 
                                        ? (promoter as any).channels.map((c: any) => getChannelLabel(c)).join(', ') 
                                        : '-')
                                    }
                                </TableCell>
                                <TableCell className="text-sm">
                                    {getUserName(promoter.creatorId)}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                    {promoter.createdAt ? promoter.createdAt.split('T')[0] : '-'}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center space-x-2">
                                        <Button variant="ghost" size="sm" onClick={() => handleEdit(promoter)}>
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => confirmDelete(promoter)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredPromoters.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center h-24">暂无推广人员</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>确认删除推广员?</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-gray-500">
                            确定要删除推广员 {promoterToDelete?.name} 吗？此操作无法撤销。
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>取消</Button>
                        <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
