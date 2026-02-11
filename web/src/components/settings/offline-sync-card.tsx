"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RefreshCw, Clock, AlertCircle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

export type OfflineSyncConfig = {
  enabled: boolean
  intervalMinutes: number
}

type Props = {
  siteId: string
  config: OfflineSyncConfig
  onConfigChange: (config: OfflineSyncConfig) => void
}

type OfflineSyncStatus = {
  isRunning: boolean
  lastRunAt?: string
  nextRunAt?: string
  successCount: number
  failureCount: number
  lastError?: string
}

export function OfflineSyncCard({ siteId, config, onConfigChange }: Props) {
  const [status, setStatus] = useState<OfflineSyncStatus | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  const handleManualSync = async () => {
    setIsSyncing(true)
    try {
        const res = await fetch("/api/offline-sync/sync", {
            method: "POST",
            body: JSON.stringify({ siteId }),
            headers: { "Content-Type": "application/json" }
        })
        if (res.ok) {
            toast.success("手动同步已触发")
            const data = await res.json()
            setStatus(data)
        } else {
            const errorData = await res.json().catch(() => null)
            toast.error(errorData?.message || "触发失败")
        }
    } catch {
        toast.error("请求失败")
    } finally {
        setIsSyncing(false)
    }
  }

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/offline-sync/status?siteId=${siteId}`)
        if (res.ok) setStatus(await res.json())
      } catch (e) {
        console.error(e)
      }
    }
    fetchStatus()
    const timer = setInterval(fetchStatus, 5000)
    return () => clearInterval(timer)
  }, [siteId])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5" />
          线下订单自动同步
        </CardTitle>
        <CardDescription>
          将线上抓取到的订单状态和物流信息自动同步到关联的线下订单中（通过小程序单号匹配）。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between space-x-4">
          <div className="space-y-1">
            <Label>启用自动同步</Label>
            <p className="text-sm text-muted-foreground">
              开启后将定期扫描并更新线下订单
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => onConfigChange({ ...config, enabled: checked })}
          />
        </div>

        {config.enabled && (
          <div className="space-y-4 pt-4 border-t">
            <div className="grid gap-2">
              <Label>同步间隔（分钟）</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={5}
                  value={config.intervalMinutes}
                  onChange={(e) => onConfigChange({ ...config, intervalMinutes: parseInt(e.target.value) || 5 })}
                  className="max-w-[120px]"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                最低间隔为 5 分钟
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="border rounded p-3 bg-muted/50">
                <div className="flex items-center gap-2 text-sm font-medium mb-1">
                  <Clock className="w-4 h-4 text-blue-500" />
                  下次执行
                </div>
                <div className="text-sm">
                  {status?.nextRunAt ? new Date(status.nextRunAt).toLocaleTimeString() : "-"}
                </div>
              </div>
              <div className="border rounded p-3 bg-muted/50">
                <div className="flex items-center gap-2 text-sm font-medium mb-1">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  成功次数
                </div>
                <div className="text-sm">{status?.successCount || 0}</div>
              </div>
              <div className="border rounded p-3 bg-muted/50">
                <div className="flex items-center gap-2 text-sm font-medium mb-1">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  失败次数
                </div>
                <div className="text-sm text-red-600 font-bold">{status?.failureCount || 0}</div>
              </div>
            </div>

            <div className="flex justify-end">
               <Button variant="outline" size="sm" onClick={handleManualSync} disabled={isSyncing}>
                   <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
                   立即执行同步
               </Button>
            </div>

            {status?.lastRunAt && (
               <div className="text-xs text-muted-foreground">
                 上次执行: {new Date(status.lastRunAt).toLocaleString()}
                 {status.lastError && <span className="text-red-500 ml-2">({status.lastError})</span>}
               </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
