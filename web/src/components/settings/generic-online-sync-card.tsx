
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RefreshCw, Plus, X, Clock } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"

type AutoSyncConfig = {
  enabled: boolean
  interval?: number
  concurrencyLimit?: number
  scheduledTimes?: string[]
}

type Props = {
  config?: AutoSyncConfig
  status?: { status?: string; message?: string; lastRunAt?: string; needsAttention?: boolean }
  onConfigChange: (config: AutoSyncConfig) => void
}

export function GenericOnlineSyncCard({ config, status, onConfigChange }: Props) {
  const enabled = config?.enabled ?? false
  const scheduledTimes = config?.scheduledTimes ?? []
  const [newTime, setNewTime] = useState("08:00")
  const isRunning = status?.status === "running" || status?.status === "awaiting_user"

  const update = (partial: Partial<AutoSyncConfig>) =>
    onConfigChange({ enabled, interval: config?.interval, concurrencyLimit: config?.concurrencyLimit, scheduledTimes, ...config, ...partial })

  const addTime = () => {
    if (!newTime) return
    if (scheduledTimes.includes(newTime)) return
    
    const newTimes = [...scheduledTimes, newTime]
    if (newTimes.length > 1) {
      const minutes = newTimes.map(t => {
        const [h, m] = t.split(':').map(Number)
        return h * 60 + m
      })
      let valid = true
      for (let i = 0; i < minutes.length; i++) {
        for (let j = i + 1; j < minutes.length; j++) {
          let diff = Math.abs(minutes[i] - minutes[j])
          if (diff > 12 * 60) {
            diff = 24 * 60 - diff
          }
          if (diff < 8 * 60) {
            valid = false
            break
          }
        }
      }
      if (!valid) {
        alert("定时时间设置失败：多个定时之间必须至少间隔 8 小时！")
        return
      }
    }

    const sorted = newTimes.sort()
    update({ scheduledTimes: sorted })
  }

  const removeTime = (t: string) => {
    update({ scheduledTimes: scheduledTimes.filter(x => x !== t) })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              线上订单自动抓取
            </CardTitle>
            <CardDescription>
              设置每天定时自动抓取订单，需同时开启自动抓取开关才生效。
            </CardDescription>
          </div>
          {status && (
            <Badge variant={isRunning ? "default" : "outline"} className={isRunning ? "bg-blue-500 animate-pulse" : ""}>
              {isRunning ? "运行中" : "空闲"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between space-x-4">
          <div className="space-y-1">
            <Label>启用自动抓取</Label>
            <p className="text-sm text-muted-foreground">开启后将按设定时间自动抓取</p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => update({ enabled: checked })}
          />
        </div>

        {enabled && (
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-3">
              <Label className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                定时抓取时间点
              </Label>
              <p className="text-xs text-muted-foreground">每天到达以下时间时自动触发一次抓取</p>

              <div className="flex flex-wrap gap-2 min-h-[32px]">
                {scheduledTimes.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">暂无定时，请添加时间点</span>
                )}
                {scheduledTimes.map(t => (
                  <Badge key={t} variant="secondary" className="flex items-center gap-1 text-sm px-2 py-1">
                    {t}
                    <button onClick={() => removeTime(t)} className="ml-1 hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  className="w-[130px] h-8"
                />
                <Button size="sm" variant="outline" onClick={addTime} className="h-8">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  添加
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
