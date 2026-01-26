"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { User } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { saveUser } from "@/app/actions"
import { toast } from "sonner"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface UserFormProps {
    initialData?: User
    onSuccess: () => void
}

const PERMISSION_GROUPS = [
    {
        label: '订单管理',
        permissions: [
            { key: 'orders', label: '订单列表' },
            { key: 'view_all_orders', label: '查看所有订单(管理员)' },
        ]
    },
    {
        label: '推广管理',
        permissions: [
            { key: 'promoters', label: '推广人员' },
            { key: 'view_all_promoters', label: '查看所有推广人员(管理员)' },
            { key: 'commission', label: '推广渠道' },
        ]
    },
    {
        label: '结算统计',
        permissions: [
            { key: 'stats_accounts', label: '账号结算' },
            { key: 'stats_promoters', label: '推广员结算' },
        ]
    },
    {
        label: '商品管理',
        permissions: [
            { key: 'products', label: '商品库管理' },
        ]
    },
    {
        label: '系统管理',
        permissions: [
            { key: 'users', label: '账号权限管理' },
            { key: 'backup', label: '导出导入数据' },
        ]
    }
]

export function UserForm({ initialData, onSuccess }: UserFormProps) {
    const router = useRouter()
    const [formData, setFormData] = useState<Partial<User>>({
        name: initialData?.name || '',
        username: initialData?.username || '',
        password: initialData?.password || '',
        permissions: initialData?.permissions || [],
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const res = await saveUser({ ...formData, id: initialData?.id })
            
            if (res?.success) {
                toast.success(res.message)
                router.refresh()
                onSuccess()
            } else {
                toast.error(res?.message || "操作失败")
            }
        } catch (error) {
            console.error(error)
            toast.error("操作失败: 请刷新页面重试")
        }
    }

    const togglePermission = (key: string) => {
        const current = formData.permissions || []
        if (current.includes(key)) {
            setFormData({ ...formData, permissions: current.filter(k => k !== key) })
        } else {
            setFormData({ ...formData, permissions: [...current, key] })
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label>姓名</Label>
                <Input 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    required 
                />
            </div>
            <div className="space-y-2">
                <Label>用户名 (登录账号)</Label>
                <Input 
                    value={formData.username} 
                    onChange={e => setFormData({...formData, username: e.target.value})} 
                    required 
                />
            </div>
            <div className="space-y-2">
                <Label>密码</Label>
                <Input 
                    value={formData.password} 
                    onChange={e => setFormData({...formData, password: e.target.value})} 
                    placeholder="不填则使用默认密码"
                />
            </div>
            
            <div className="space-y-2">
                <Label>菜单权限</Label>
                <div className="border rounded-md divide-y">
                    {PERMISSION_GROUPS.map((group, idx) => (
                        <div key={idx} className="p-4">
                            <h4 className="font-medium mb-3 text-sm text-muted-foreground">{group.label}</h4>
                            <div className="grid grid-cols-2 gap-4">
                                {group.permissions.map(p => (
                                    <div key={p.key} className="flex items-center space-x-2">
                                        <Checkbox 
                                            id={`perm-${p.key}`} 
                                            checked={formData.permissions?.includes(p.key)}
                                            onCheckedChange={() => togglePermission(p.key)}
                                        />
                                        <label 
                                            htmlFor={`perm-${p.key}`}
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                        >
                                            {p.label}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <Button type="submit" className="w-full">保存</Button>
        </form>
    )
}
