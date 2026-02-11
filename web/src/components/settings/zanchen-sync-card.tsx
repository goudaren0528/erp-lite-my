"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { RefreshCw, Clock } from "lucide-react"

type SchedulerStatus = {
  isRunning: boolean
  lastRunAt?: string
  nextRunAt?: string
  logs: { timestamp: string; message: string }[]
}

type Props = {
    config: {
        autoSyncEnabled?: boolean
        interval: number
        concurrencyLimit?: number
    }
    onConfigChange: (updates: Partial<{ autoSyncEnabled: boolean; interval: number; concurrencyLimit: number }>) => void
    status?: any
}

export function ZanchenSyncCard({ config, onConfigChange }: Props) {
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
        try {
            const res = await fetch("/api/online-orders/scheduler/status")
            if (res.ok) setSchedulerStatus(await res.json())
        } catch (e) {
            console.error(e)
        }
    }
    fetchStatus()
    const timer = setInterval(fetchStatus, 5000)
    return () => clearInterval(timer)
  }, [])

  const intervalMinutes = Math.floor((config.interval || 60) / 60) || 1

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5" />
          线上订单自动抓取
        </CardTitle>
        <CardDescription>
          定期自动运行赞晨爬虫，抓取最新订单数据并保存到数据库。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between space-x-4">
          <div className="space-y-1">
            <Label>启用自动抓取</Label>
            <p className="text-sm text-muted-foreground">
              开启后将定期扫描所有启用的站点
            </p>
          </div>
          <Switch
            checked={!!config.autoSyncEnabled}
            onCheckedChange={(checked) => onConfigChange({ autoSyncEnabled: checked })}
          />
        </div>

        {config.autoSyncEnabled && (
          <div className="space-y-4 pt-4 border-t">
            <div className="grid gap-2">
              <Label>抓取间隔（分钟）</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  value={intervalMinutes}
                  onChange={(e) => {
                      const mins = parseInt(e.target.value) || 1
                      onConfigChange({ interval: mins * 60 })
                  }}
                  className="max-w-[120px]"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                建议间隔不低于 10 分钟
              </p>
            </div>

            <div className="grid gap-2">
              <Label>并发详情页抓取（页）</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={config.concurrencyLimit || 3}
                  onChange={(e) => {
                      const val = parseInt(e.target.value) || 3
                      onConfigChange({ concurrencyLimit: val })
                  }}
                  className="max-w-[120px]"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                同时打开的详情页数量，建议 3-5，过高可能触发风控
              </p>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="border rounded p-3 bg-muted/50">
                <div className="flex items-center gap-2 text-sm font-medium mb-1">
                  <Clock className="w-4 h-4 text-blue-500" />
                  下次执行
                </div>
                <div className="text-sm">
                  {schedulerStatus?.nextRunAt ? new Date(schedulerStatus.nextRunAt).toLocaleTimeString() : "-"}
                </div>
              </div>
              <div className="border rounded p-3 bg-muted/50">
                <div className="flex items-center gap-2 text-sm font-medium mb-1">
                  <RefreshCw className="w-4 h-4 text-green-500" />
                  状态
                </div>
                <div className="text-sm">
                  {schedulerStatus?.isRunning ? "运行中" : "空闲"}
                </div>
              </div>
            </div>

            {schedulerStatus?.lastRunAt && (
               <div className="text-xs text-muted-foreground">
                 上次执行: {new Date(schedulerStatus.lastRunAt).toLocaleString()}
               </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
