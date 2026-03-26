'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Copy, RefreshCw, Eye, EyeOff, Save } from "lucide-react"
import { getApiTokenAction, generateApiTokenAction, getSystemNameAction, updateSystemNameAction } from "@/app/actions"

export default function SystemSettingsPage() {
  const [token, setToken] = useState<string | null>(null)
  const [systemName, setSystemName] = useState("米奇租赁erp")
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [savingName, setSavingName] = useState(false)

  useEffect(() => {
    Promise.all([
      getApiTokenAction(),
      getSystemNameAction()
    ]).then(([tokenRes, nameRes]) => {
      if (tokenRes.success) setToken(tokenRes.token)
      if (nameRes.success) setSystemName(nameRes.name)
      setLoading(false)
    })
  }, [])

  const handleSaveSystemName = async () => {
    if (!systemName.trim()) {
      toast.error("系统名称不能为空")
      return
    }
    setSavingName(true)
    const res = await updateSystemNameAction(systemName.trim())
    if (res.success) {
      toast.success("系统名称已更新")
    } else {
      toast.error(res.message || "更新失败")
    }
    setSavingName(false)
  }

  const handleGenerate = async () => {
    if (!confirm("重新生成后旧 Token 立即失效，桌面工具需要重新填写新 Token，确认继续？")) return
    setGenerating(true)
    const res = await generateApiTokenAction()
    if (res.success) {
      setToken(res.token)
      toast.success("Token 已重新生成")
    } else {
      toast.error(res.message || "生成失败")
    }
    setGenerating(false)
  }

  const handleCopy = () => {
    if (!token) return
    navigator.clipboard.writeText(token)
    toast.success("已复制到剪贴板")
  }

  const displayToken = token
    ? (visible ? token : token.slice(0, 8) + "••••••••••••••••••••••••" + token.slice(-4))
    : ""

  return (
    <div className="space-y-6 p-8 max-w-2xl">
      <h2 className="text-2xl font-bold">系统设置</h2>

      <div className="border rounded-lg p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-base mb-1">基本设置</h3>
          <p className="text-sm text-muted-foreground">
            配置系统的基本信息。
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium">系统名称</label>
          <div className="flex items-center gap-2">
            <Input
              value={systemName}
              onChange={(e) => setSystemName(e.target.value)}
              placeholder="例如：米奇租赁erp"
              className="max-w-md"
            />
            <Button onClick={handleSaveSystemName} disabled={savingName || loading}>
              {savingName ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              保存
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            显示在左上角导航栏的系统名称，默认：米奇租赁erp
          </p>
        </div>
      </div>

      <div className="border rounded-lg p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-base mb-1">API Token</h3>
          <p className="text-sm text-muted-foreground">
            用于桌面抓取工具连接本 ERP 实例。Token 拥有读取配置和导入订单的权限，请妥善保管。
          </p>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">加载中...</div>
        ) : token ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={displayToken}
                className="font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={() => setVisible(v => !v)}>
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={handleCopy}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>配置接口：<code className="bg-muted px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : ''}/api/online-orders/config</code></div>
              <div>导入接口：<code className="bg-muted px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : ''}/api/online-orders/import</code></div>
              <div>线下订单查询：<code className="bg-muted px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : ''}/api/orders</code></div>
              <div>线上订单查询：<code className="bg-muted px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : ''}/api/online-orders</code></div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">尚未生成 Token，点击下方按钮生成。</div>
        )}

        <Button onClick={handleGenerate} disabled={generating} variant={token ? "outline" : "default"} size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${generating ? "animate-spin" : ""}`} />
          {token ? "重新生成 Token" : "生成 Token"}
        </Button>
      </div>
    </div>
  )
}
