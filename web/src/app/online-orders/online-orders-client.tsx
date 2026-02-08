"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { setAppConfigValue } from "@/app/actions"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

const CONFIG_KEY = "zanchen_platform_enabled"

export function OnlineOrdersClient({ initialEnabled }: { initialEnabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [currentEnabled, setCurrentEnabled] = useState(initialEnabled)
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await setAppConfigValue(CONFIG_KEY, enabled ? "true" : "false")
      if (res?.success) {
        setCurrentEnabled(enabled)
        toast.success(res.message || "配置更新成功")
        setOpen(false)
      } else {
        toast.error(res?.message || "配置更新失败")
      }
    } catch (error) {
      console.error(error)
      toast.error("配置更新失败")
    } finally {
      setSaving(false)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      setEnabled(currentEnabled)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          同步
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>同步设置</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">赞晨平台</div>
              <div className="text-xs text-muted-foreground">用于线上订单同步</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
