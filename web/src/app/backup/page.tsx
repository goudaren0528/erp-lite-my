"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Download } from "lucide-react"

export default function BackupPage() {
    const [selected, setSelected] = useState<string[]>(["orders", "products", "promoters", "users", "commissionConfigs"])

    const options = [
        { id: "orders", label: "订单数据 (orders.json)" },
        { id: "products", label: "商品数据 (products.json)" },
        { id: "promoters", label: "推广员数据 (promoters.json)" },
        { id: "users", label: "用户账号 (users.json)" },
        { id: "commissionConfigs", label: "佣金配置 (commission-configs.json)" },
    ]

    const handleToggle = (id: string) => {
        setSelected(prev => 
            prev.includes(id) 
                ? prev.filter(x => x !== id)
                : [...prev, id]
        )
    }

    const handleExport = () => {
        if (selected.length === 0) return
        const params = new URLSearchParams()
        params.set("types", selected.join(","))
        window.location.href = `/api/backup/export?${params.toString()}`
    }

    return (
        <div className="p-8 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">数据导出</h1>
            <Card>
                <CardHeader>
                    <CardTitle>选择导出内容</CardTitle>
                    <CardDescription>请勾选需要导出的数据文件，导出格式为 JSON。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        {options.map(opt => (
                            <div key={opt.id} className="flex items-center space-x-2">
                                <Checkbox 
                                    id={opt.id} 
                                    checked={selected.includes(opt.id)}
                                    onCheckedChange={() => handleToggle(opt.id)}
                                />
                                <Label htmlFor={opt.id} className="cursor-pointer select-none">{opt.label}</Label>
                            </div>
                        ))}
                    </div>
                    
                    <div className="pt-4">
                        <Button onClick={handleExport} disabled={selected.length === 0} className="w-full">
                            <Download className="mr-2 h-4 w-4" />
                            导出选中数据
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
