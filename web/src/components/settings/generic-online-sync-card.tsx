
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { RefreshCw } from "lucide-react"

type Props = {
  config?: {
    enabled: boolean
    interval: number
    concurrencyLimit?: number
  }
  onConfigChange: (config: { enabled: boolean; interval: number; concurrencyLimit?: number }) => void
}

export function GenericOnlineSyncCard({ config, onConfigChange }: Props) {
  const enabled = config?.enabled ?? false
  const intervalMinutes = Math.floor((config?.interval || 60) / 60) || 1

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5" />
          线上订单自动抓取
        </CardTitle>
        <CardDescription>
          定期自动运行爬虫，抓取最新订单数据并保存到数据库。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between space-x-4">
          <div className="space-y-1">
            <Label>启用自动抓取</Label>
            <p className="text-sm text-muted-foreground">
              开启后将定期扫描该站点
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => onConfigChange({ 
              enabled: checked, 
              interval: (config?.interval || 3600) 
            })}
          />
        </div>

        {enabled && (
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
                      onConfigChange({ 
                        enabled: true, 
                        interval: mins * 60 
                      })
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
                  value={config?.concurrencyLimit || 3}
                  onChange={(e) => {
                      const val = parseInt(e.target.value) || 3
                      onConfigChange({ 
                        enabled: true, 
                        interval: (config?.interval || 3600),
                        concurrencyLimit: val
                      })
                  }}
                  className="max-w-[120px]"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                同时打开的详情页数量，建议 3-5
              </p>
            </div>

            <div className="rounded-md border p-4 bg-muted/50 text-sm text-muted-foreground">
              注意：该站点的自动抓取功能尚未部署或处于开发中。
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
