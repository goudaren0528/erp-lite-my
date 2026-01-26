"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Download, Upload, History, FileJson } from "lucide-react"
import { getBackupLogs, importData } from "./actions"
import { BackupLog } from "@/types"
import { toast } from "sonner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"

export default function BackupPage() {
    const [selected, setSelected] = useState<string[]>(["orders", "products", "promoters", "users", "accountGroups", "channelConfigs", "commissionRules"])
    const [logs, setLogs] = useState<BackupLog[]>([])
    const [isLoadingLogs, setIsLoadingLogs] = useState(true)
    const [isImporting, setIsImporting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const options = [
        { id: "orders", label: "订单数据 (orders.json)" },
        { id: "products", label: "商品数据 (products.json)" },
        { id: "promoters", label: "推广员数据 (promoters.json)" },
        { id: "users", label: "用户账号 (users.json)" },
        { id: "accountGroups", label: "账号组配置 (account-groups.json)" },
        { id: "channelConfigs", label: "推广渠道配置 (channel-configs.json)" },
        { id: "commissionRules", label: "提成规则 (commission-rules.json)" },
    ]

    useEffect(() => {
        loadLogs()
    }, [])

    const loadLogs = async () => {
        try {
            const data = await getBackupLogs()
            setLogs(data)
        } catch (error) {
            console.error("Failed to load logs", error)
        } finally {
            setIsLoadingLogs(false)
        }
    }

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
        // Refresh logs after a short delay to allow server to process
        setTimeout(loadLogs, 1000)
    }

    const handleImportClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsImporting(true)
        const formData = new FormData()
        formData.append('file', file)

        try {
            const result = await importData(formData)
            if (result.success) {
                toast.success(result.message)
                loadLogs()
            } else {
                toast.error(result.message)
            }
        } catch (error) {
            console.error(error)
            toast.error("导入发生错误")
        } finally {
            setIsImporting(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <h1 className="text-2xl font-bold mb-6">导出导入数据</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Export Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Download className="h-5 w-5" /> 数据导出
                        </CardTitle>
                        <CardDescription>勾选需要导出的数据文件</CardDescription>
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
                        
                        <Button onClick={handleExport} disabled={selected.length === 0} className="w-full">
                            <Download className="mr-2 h-4 w-4" />
                            导出选中数据
                        </Button>
                    </CardContent>
                </Card>

                {/* Import Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Upload className="h-5 w-5" /> 数据导入
                        </CardTitle>
                        <CardDescription>上传 JSON 文件以恢复或合并数据</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center space-y-4 flex flex-col items-center justify-center min-h-[200px]">
                            <div className="p-3 bg-blue-50 rounded-full">
                                <FileJson className="h-8 w-8 text-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium">点击上传 JSON 文件</p>
                                <p className="text-xs text-muted-foreground">支持从本系统导出的完整或部分数据文件</p>
                            </div>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={handleFileChange} 
                                className="hidden" 
                                accept=".json"
                            />
                            <Button variant="outline" onClick={handleImportClick} disabled={isImporting}>
                                {isImporting ? "导入中..." : "选择文件"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Logs Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" /> 操作记录
                    </CardTitle>
                    <CardDescription>最近的导出和导入操作记录</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>时间</TableHead>
                                <TableHead>类型</TableHead>
                                <TableHead>操作人</TableHead>
                                <TableHead>详情</TableHead>
                                <TableHead>状态</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoadingLogs ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-4">加载中...</TableCell>
                                </TableRow>
                            ) : logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">暂无记录</TableCell>
                                </TableRow>
                            ) : (
                                logs.map(log => (
                                    <TableRow key={log.id}>
                                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                            {format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={log.type === 'EXPORT' ? 'secondary' : 'default'}>
                                                {log.type === 'EXPORT' ? '导出' : '导入'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{log.operator}</TableCell>
                                        <TableCell className="max-w-[300px] truncate" title={log.details}>
                                            {log.details}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={log.status === 'SUCCESS' ? 'outline' : 'destructive'}>
                                                {log.status === 'SUCCESS' ? '成功' : '失败'}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
