"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { OrderSource, Promoter, User, ChannelConfig } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination"
import { savePromoter, deletePromoter } from "@/app/actions"
import { Plus, Trash2, Edit2, Loader2, Copy } from "lucide-react"

import { toast } from "sonner"

interface PromoterListProps {
    promoters: Promoter[]
    users?: User[]
    channels?: ChannelConfig[]
}

type LegacyPromoter = Promoter & { channels?: OrderSource[] }

export function PromoterList({ promoters, users = [], channels = [] }: PromoterListProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [editingPromoter, setEditingPromoter] = useState<Promoter | null>(null)
    const [promoterToDelete, setPromoterToDelete] = useState<Promoter | null>(null)
    const [formData, setFormData] = useState<Partial<Promoter>>({})
    const [creatorFilter, setCreatorFilter] = useState<string>("all")
    const [channelFilter, setChannelFilter] = useState<string>("all")
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)

    const channelOptions = useMemo(() => channels.map(c => ({ value: c.id, label: c.name })), [channels])

    const legacyChannelLabels: Record<string, string> = {
        PEER: "同行",
        PART_TIME_AGENT: "兼职代理",
        AGENT: "代理",
        PART_TIME: "兼职"
    }

    const getSelectableChannelValue = (value?: string) => {
        if (!value) return undefined
        if (channelOptions.some(option => option.value === value)) return value
        const mapped = legacyChannelLabels[value]
        if (mapped && channelOptions.some(option => option.value === mapped)) return mapped
        return undefined
    }

    const filteredPromoters = promoters.filter(p => {
        const matchCreator = creatorFilter === "all" || p.creatorId === creatorFilter
        if (channelFilter === "all") return matchCreator
        
        // New ID-based check
        if (p.channelConfigId && p.channelConfigId === channelFilter) {
            return true
        }

        // Fallback for legacy data without channelConfigId
        const possibleChannels = new Set<string>()
        if (p.channel) {
            possibleChannels.add(p.channel)
            // Try to map name to ID if possible
            const matchedChannel = channels.find(c => c.name === p.channel || (p.channel && c.name === legacyChannelLabels[p.channel]))
            if (matchedChannel) {
                possibleChannels.add(matchedChannel.id)
            }
        }
        
        const legacyChannels = (p as LegacyPromoter).channels || []
        legacyChannels.forEach(c => {
             const matchedChannel = channels.find(ch => ch.name === c || ch.name === legacyChannelLabels[c])
             if (matchedChannel) {
                 possibleChannels.add(matchedChannel.id)
             }
        })

        return matchCreator && possibleChannels.has(channelFilter)
    })

    const totalPages = Math.ceil(filteredPromoters.length / pageSize)
    const paginatedPromoters = filteredPromoters.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    )

    // Reset page when filter changes
    // We can't use useEffect here easily without importing it, but we can just set it in the handlers or let it be.
    // Better to set page to 1 when filters change.
    const handleCreatorFilterChange = (val: string) => {
        setCreatorFilter(val)
        setCurrentPage(1)
    }

    const handleChannelFilterChange = (val: string) => {
        setChannelFilter(val)
        setCurrentPage(1)
    }

    const handleEdit = (promoter: Promoter) => {
        setEditingPromoter(promoter)
        const legacyChannels = (promoter as LegacyPromoter).channels
        let channelValue = promoter.channel || legacyChannels?.[0]

        // Try to map legacy value to new value if not found in options
        if (channelValue && !channelOptions.some(o => o.value === channelValue)) {
             const mapped = legacyChannelLabels[channelValue]
             if (mapped && channelOptions.some(o => o.value === mapped)) {
                 channelValue = mapped
             }
        }

        setFormData({
            ...promoter,
            channel: channelValue
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

    const getChannelLabel = (value: string) => {
        const option = channelOptions.find(c => c.value === value)
        if (option) return option.label
        if (legacyChannelLabels[value]) return legacyChannelLabels[value]
        return value
    }

    const getUserName = (userId?: string) => {
        if (!userId) return '-'
        return users.find(u => u.id === userId)?.name || '未知用户'
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
                                <Label>渠道类型</Label>
                                <Select 
                                    value={formData.channelConfigId || ''} 
                                    onValueChange={(val: string) => {
                                        const selectedChannel = channels.find(c => c.id === val);
                                        setFormData({
                                            ...formData, 
                                            channelConfigId: val,
                                            channel: selectedChannel ? selectedChannel.name : ''
                                        })
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择渠道类型" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {channelOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                        {channelOptions.length === 0 && (
                                            <SelectItem value="__empty" disabled>
                                                暂无渠道
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="name">姓名</Label>
                                <Input 
                                    id="name" 
                                    value={formData.name || ''} 
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    required
                                    placeholder="请输入姓名"
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

            <div className="bg-muted/30 p-4 rounded-lg flex flex-wrap gap-1 items-center">
                {users.length > 0 && (
                    <div className="w-[200px]">
                        <Select value={creatorFilter} onValueChange={handleCreatorFilterChange}>
                            <SelectTrigger className="bg-background">
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
                <div className="w-[200px]">
                    <Select value={channelFilter} onValueChange={handleChannelFilterChange}>
                        <SelectTrigger className="bg-background">
                            <SelectValue placeholder="筛选渠道" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">所有渠道</SelectItem>
                            {channelOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="rounded-md border relative min-h-[300px]">
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
                            <TableHead className="w-[80px]">ID</TableHead>
                            <TableHead className="w-[150px]">姓名</TableHead>
                            <TableHead className="w-[150px]">联系方式</TableHead>
                            <TableHead className="w-[150px]">渠道类型</TableHead>
                            <TableHead className="w-[120px]">创建人</TableHead>
                            <TableHead className="w-[150px]">创建时间</TableHead>
                            <TableHead className="w-[100px]">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedPromoters.map((promoter) => (
                            <TableRow key={promoter.id}>
                                <TableCell className="font-mono text-xs" title={promoter.id}>
                                    <div className="flex items-center gap-1">
                                        <span>{promoter.id.slice(0, 8)}</span>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-5 w-5" 
                                            onClick={() => {
                                                navigator.clipboard.writeText(promoter.id)
                                                toast.success("ID 已复制")
                                            }}
                                        >
                                            <Copy className="h-3 w-3 text-muted-foreground" />
                                        </Button>
                                    </div>
                                </TableCell>
                                <TableCell className="font-medium">{promoter.name}</TableCell>
                                <TableCell>{promoter.phone || '-'}</TableCell>
                                <TableCell>
                                    {promoter.channel ? getChannelLabel(promoter.channel) : 
                                     ((promoter as LegacyPromoter).channels && (promoter as LegacyPromoter).channels?.length 
                                        ? (promoter as LegacyPromoter).channels?.map(c => getChannelLabel(c)).join(', ') 
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
                                <TableCell colSpan={7} className="text-center h-24">暂无推广人员</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-between mt-4 px-2">
                <div className="text-sm text-muted-foreground">
                    共 {filteredPromoters.length} 条数据，本页显示 {paginatedPromoters.length} 条
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
