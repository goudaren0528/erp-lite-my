"use client"

import { useEffect, useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { FileText, XCircle, Filter } from "lucide-react"

type LogEntry = {
    timestamp: string
    message: string
    orderNos?: string[]
}

type OfflineStatus = {
    logs: LogEntry[]
}

type ZanchenStatus = {
    logs: string[]
}

type Props = {
    siteId: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function SyncLogsDialog({ siteId, open, onOpenChange }: Props) {
    const [activeTab, setActiveTab] = useState("online")
    const [onlineLogs, setOnlineLogs] = useState<string[]>([])
    const [offlineLogs, setOfflineLogs] = useState<LogEntry[]>([])
    const [showDebug, setShowDebug] = useState(false)
    const [dateFilter, setDateFilter] = useState("") // YYYY-MM-DD
    
    // Container refs
    const onlineContainerRef = useRef<HTMLDivElement>(null)
    const offlineContainerRef = useRef<HTMLDivElement>(null)

    // Helper to determine if a log is "Debug"
    const isDebugLog = (text: string) => {
        const lower = text.toLowerCase()
        if (lower.includes("[debug]") || lower.includes("parsing text") || lower.includes("modal found") || lower.includes("opening detail") || lower.includes("extracting")) return true
        // Keep progress logs (extracted, updated, saved, page x, etc.)
        if (text.includes("抓取") || text.includes("更新") || text.includes("保存") || text.includes("页") || text.includes("开始") || text.includes("结束") || text.includes("成功") || text.includes("失败") || text.includes("Error") || text.includes("Warning") || text.includes("System")) return false
        // Default to debug for unknown noisy logs
        return true
    }

    const filterLogs = (logs: string[]) => {
        return logs.filter(log => {
            // Debug filter
            if (!showDebug && isDebugLog(log)) return false
            
            // Date filter (simple string matching for now as format varies)
            // Online logs: "[HH:mm:ss] ..." - assumes today if no date, or we rely on user filtering just strictly by string presence?
            // Actually zanchen.ts adds [HH:mm:ss] but not date. So date filter might only work if the log itself contains the date or we assume today.
            // However, the requirement says "support filtering by date". 
            // Since Zanchen logs are transient (in-memory only for current run), they are likely all "Today". 
            // But if the process runs over midnight, it might be ambiguous. 
            // Given the current implementation in zanchen.ts only stores last 500 logs in memory, date filtering is likely trivial (all are recent).
            // But let's support it if the log string happens to contain it, or just ignore if it's not present.
            // Wait, offline logs have full timestamps usually? Let's check offline logs structure.
            return true 
        })
    }

    const filterOfflineLogs = (logs: LogEntry[]) => {
        return logs.filter(log => {
            // Date filtering is handled by the API fetch
            return true
        })
    }

    // Since Zanchen logs don't have date in them (only time), date filtering is tricky.
    // We will only apply date filter to Offline logs for now, or if the user explicitly typed a time part.
    // For online logs, we'll just show them as they are likely from "now".

    useEffect(() => {
        if (!open) return
        
        const fetchLogs = async () => {
            try {
                // Fetch Online Logs (Zanchen Scraper)
                if (activeTab === "online") {
                    if (dateFilter) {
                        // Fetch history from file
                        const res = await fetch(`/api/online-orders/logs?date=${dateFilter}`)
                        if (res.ok) {
                             const data = await res.json()
                             // File logs are oldest -> newest.
                             // We want newest -> oldest (top).
                             setOnlineLogs((data.logs || []).slice().reverse())
                        }
                    } else {
                        const res = await fetch("/api/online-orders/zanchen/status", { cache: "no-store" })
                        if (res.ok) {
                            const data = await res.json() as ZanchenStatus
                            // Backend returns logs in chronological order (oldest -> newest)
                            // We want to display newest first at the top
                            setOnlineLogs((data.logs || []).slice().reverse())
                        }
                    }
                }
                
                // Fetch Offline Logs
                if (activeTab === "offline") {
                    const url = dateFilter 
                        ? `/api/offline-sync/status?siteId=${siteId}&date=${dateFilter}`
                        : `/api/offline-sync/status?siteId=${siteId}`
                    
                    const res = await fetch(url, { cache: "no-store" })
                    if (res.ok) {
                        const data = await res.json() as OfflineStatus
                        // Same for offline logs
                        setOfflineLogs((data.logs || []).slice().reverse())
                    }
                }
            } catch (e) {
                console.error("Failed to fetch logs", e)
            }
        }

        fetchLogs()
        const timer = setInterval(fetchLogs, 2000)
        return () => clearInterval(timer)
    }, [open, activeTab, siteId, dateFilter])

    useEffect(() => {
        if (activeTab === "online" && onlineContainerRef.current) {
            onlineContainerRef.current.scrollTop = 0
        }
        if (activeTab === "offline" && offlineContainerRef.current) {
            offlineContainerRef.current.scrollTop = 0
        }
    }, [activeTab])

    const filteredOnlineLogs = filterLogs(onlineLogs)
    const filteredOfflineLogs = filterOfflineLogs(offlineLogs)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] h-[80vh] flex flex-col overflow-hidden p-0 gap-0">
                <DialogHeader className="p-4 border-b">
                    <DialogTitle className="flex flex-col gap-3 items-start">
                        <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            同步运行日志
                        </div>
                        <div className="flex items-center gap-4 text-sm font-normal w-full">
                             <div className="flex items-center gap-1">
                                <Label htmlFor="date-filter" className="cursor-pointer flex items-center gap-1 text-muted-foreground hover:text-foreground whitespace-nowrap">
                                    <Filter className="w-3 h-3" />
                                    日期
                                </Label>
                                <Input 
                                    id="date-filter"
                                    type="date" 
                                    className="h-8 w-32" 
                                    value={dateFilter} 
                                    onChange={e => setDateFilter(e.target.value)} 
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox 
                                    id="show-debug" 
                                    checked={showDebug} 
                                    onCheckedChange={(checked) => setShowDebug(!!checked)} 
                                />
                                <Label htmlFor="show-debug" className="cursor-pointer whitespace-nowrap">调试详情</Label>
                            </div>
                        </div>
                    </DialogTitle>
                </DialogHeader>
                
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <div className="px-4 pt-2">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="online">线上订单抓取日志</TabsTrigger>
                            <TabsTrigger value="offline">线下自动同步日志</TabsTrigger>
                        </TabsList>
                    </div>
                    
                    <TabsContent value="online" className="flex-1 min-h-0 mt-2 border-t bg-black/90 text-green-400 font-mono text-xs p-4 relative overflow-hidden flex flex-col data-[state=inactive]:hidden">
                        <div ref={onlineContainerRef} className="flex-1 min-h-0 overflow-y-auto pr-4 pb-6">
                            <div className="space-y-1">
                                {filteredOnlineLogs.length === 0 && (
                                    <div className="text-gray-500 italic">暂无日志...</div>
                                )}
                                {filteredOnlineLogs.map((log, i) => (
                                    <div key={i} className={`break-words whitespace-pre-wrap border-b border-white/10 pb-0.5 mb-0.5 last:border-0 ${isDebugLog(log) ? 'text-gray-500' : 'text-green-400'}`}>
                                        {log}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="absolute top-2 right-4 flex items-center gap-2">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-gray-500 hover:text-white"
                                onClick={() => setOnlineLogs([])}
                                title="清空显示"
                            >
                                <XCircle className="w-4 h-4" />
                            </Button>
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="offline" className="flex-1 min-h-0 mt-2 border-t bg-black/90 text-green-400 font-mono text-xs p-4 relative overflow-hidden flex flex-col data-[state=inactive]:hidden">
                         <div ref={offlineContainerRef} className="flex-1 min-h-0 overflow-y-auto pr-4 pb-6">
                            <div className="space-y-1">
                                {filteredOfflineLogs.length === 0 && (
                                    <div className="text-gray-500 italic">暂无日志...</div>
                                )}
                                {filteredOfflineLogs.map((log, i) => (
                                    <div key={i} className="break-words whitespace-pre-wrap border-b border-white/10 pb-0.5 mb-0.5 last:border-0">
                                        <span className="text-gray-500 mr-2">[{log.timestamp}]</span>
                                        <span className={log.message.includes("失败") || log.message.includes("Error") ? "text-red-400" : ""}>
                                            {log.message}
                                        </span>
                                        {log.orderNos && log.orderNos.length > 0 && (
                                            <div className="pl-4 mt-1 text-gray-400">
                                                <span>更新订单: </span>
                                                {log.orderNos.join(", ")}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                         <div className="absolute top-2 right-4 flex items-center gap-2">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-gray-500 hover:text-white"
                                onClick={() => setOfflineLogs([])}
                                title="清空显示"
                            >
                                <XCircle className="w-4 h-4" />
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
