"use client"

import { useState } from "react"
import { Promoter, OrderSource } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Label } from "@/components/ui/label"
import { savePromoter, deletePromoter } from "@/app/actions"
import { Plus, Trash2, Edit2 } from "lucide-react"

const CHANNEL_OPTIONS: { value: OrderSource; label: string }[] = [
    { value: 'RETAIL', label: '零售' },
    { value: 'AGENT', label: '代理' },
    { value: 'PEER', label: '同行' },
    { value: 'PART_TIME', label: '兼职' },
]

interface PromoterListProps {
    promoters: Promoter[]
}

export function PromoterList({ promoters }: PromoterListProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingPromoter, setEditingPromoter] = useState<Promoter | null>(null)
    const [formData, setFormData] = useState<Partial<Promoter>>({})

    const handleEdit = (promoter: Promoter) => {
        setEditingPromoter(promoter)
        setFormData({
            ...promoter,
            channels: promoter.channels || []
        })
        setIsDialogOpen(true)
    }

    const handleAdd = () => {
        setEditingPromoter(null)
        setFormData({ channels: [] })
        setIsDialogOpen(true)
    }

    const handleDelete = async (promoterId: string) => {
        if (confirm('确定要删除这个推广人员吗？')) {
            await deletePromoter(promoterId)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const promoterToSave: Partial<Promoter> = {
            id: editingPromoter?.id,
            name: formData.name || '',
            phone: formData.phone || '',
            channels: formData.channels || [],
        }
        await savePromoter(promoterToSave)
        setIsDialogOpen(false)
    }

    const toggleChannel = (value: OrderSource) => {
        const current = formData.channels || []
        if (current.includes(value)) {
            setFormData({ ...formData, channels: current.filter(c => c !== value) })
        } else {
            setFormData({ ...formData, channels: [...current, value] })
        }
    }

    const getChannelLabel = (value: string) => {
        return CHANNEL_OPTIONS.find(c => c.value === value)?.label || value
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">推广人员列表</h2>
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
                                <Label htmlFor="name">姓名</Label>
                                <Input 
                                    id="name" 
                                    value={formData.name || ''} 
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    required
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
                            <div className="space-y-2">
                                <Label>推广渠道 (可多选)</Label>
                                <div className="grid grid-cols-2 gap-2 border p-3 rounded-md">
                                    {CHANNEL_OPTIONS.map((option) => (
                                        <div key={option.value} className="flex items-center space-x-2">
                                            <Checkbox 
                                                id={`channel-${option.value}`} 
                                                checked={formData.channels?.includes(option.value)}
                                                onCheckedChange={() => toggleChannel(option.value)}
                                            />
                                            <Label htmlFor={`channel-${option.value}`} className="cursor-pointer font-normal">
                                                {option.label}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
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
                            <TableHead>推广渠道</TableHead>
                            <TableHead>创建时间</TableHead>
                            <TableHead className="w-[100px]">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {promoters.map((promoter) => (
                            <TableRow key={promoter.id}>
                                <TableCell className="font-medium">{promoter.name}</TableCell>
                                <TableCell>{promoter.phone || '-'}</TableCell>
                                <TableCell>
                                    {promoter.channels && promoter.channels.length > 0 
                                        ? promoter.channels.map(c => getChannelLabel(c)).join(', ') 
                                        : ((promoter as any).channel || '-') 
                                    }
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                    {promoter.createdAt ? promoter.createdAt.split('T')[0] : '-'}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center space-x-2">
                                        <Button variant="ghost" size="sm" onClick={() => handleEdit(promoter)}>
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDelete(promoter.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                        {promoters.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center h-24">暂无推广人员</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
