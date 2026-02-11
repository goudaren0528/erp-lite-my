"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { setAppConfigValue } from "@/app/actions"
import { fetchOrders } from "@/app/actions"
import { fetchOnlineOrders, getOnlineOrderCounts } from "./actions"
import { ArrowUpDown, Plus, Settings2, Trash2, Truck, Play, Square, FileText, RefreshCw, Search } from "lucide-react"
import { toast } from "sonner"
import { Order } from "@/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { OfflineSyncCard, OfflineSyncConfig } from "@/components/settings/offline-sync-card"
import { ZanchenSyncCard } from "@/components/settings/zanchen-sync-card"
import { GenericOnlineSyncCard } from "@/components/settings/generic-online-sync-card"
import { SyncLogsDialog } from "@/components/orders/sync-logs-dialog"

const CONFIG_KEY = "online_orders_sync_config"

type NightPeriod = {
  start: number
  end: number
}

type SelectorMap = Record<string, string>

type SiteConfig = {
  id: string
  name: string
  enabled: boolean
  loginUrl: string
  username: string
  password: string
  maxPages: number
  selectors: SelectorMap
  autoSync?: {
    enabled: boolean
    interval: number
  }
}

type OnlineOrdersConfig = {
  autoSyncEnabled?: boolean
  interval: number
  stopThreshold?: number
  headless: boolean
  nightMode: boolean
  nightPeriod: NightPeriod
  webhookUrls: string[]
  sites: SiteConfig[]
}

type ZanchenStatus = {
  status: "idle" | "running" | "awaiting_user" | "success" | "error"
  message?: string
  lastRunAt?: string
  needsAttention?: boolean
  heartbeatActive?: boolean
  lastResult?: {
    pendingCount?: number
    extractedCount?: number
    pagesVisited?: number
    pageUrl?: string
    title?: string
    rows?: string[]
    parsedOrders?: {
      orderNo: string
      customerName?: string
      recipientPhone?: string
      address?: string
      productName?: string
      variantName?: string
      duration?: number
      rentPrice?: number
      deposit?: number
      insurancePrice?: number
      totalAmount?: number
      status?: string
      platform?: string
      logisticsCompany?: string
      trackingNumber?: string
      latestLogisticsInfo?: string
      returnLogisticsCompany?: string
      returnTrackingNumber?: string
      returnLatestLogisticsInfo?: string
    }[]
  }
  snapshotSaved?: boolean
  logs?: string[]
}

const statusMap: Record<string, { label: string; color: string; hex: string }> = {
  PENDING_REVIEW: { label: "待审核", color: "bg-amber-500", hex: "#f59e0b" },
  PENDING_SHIPMENT: { label: "待发货", color: "bg-sky-500", hex: "#0ea5e9" },
  SHIPPED_PENDING_CONFIRMATION: { label: "已发货待确认", color: "bg-blue-600", hex: "#2563eb" },
  PENDING_RECEIPT: { label: "待收货", color: "bg-cyan-600", hex: "#0891b2" },
  RENTING: { label: "待归还", color: "bg-emerald-600", hex: "#059669" },
  OVERDUE: { label: "已逾期", color: "bg-rose-600", hex: "#e11d48" },
  RETURNING: { label: "归还中", color: "bg-violet-600", hex: "#7c3aed" },
  COMPLETED: { label: "已完成", color: "bg-slate-600", hex: "#475569" },
  BOUGHT_OUT: { label: "已购买", color: "bg-teal-700", hex: "#0f766e" },
  CLOSED: { label: "已关闭", color: "bg-gray-500", hex: "#6b7280" },
  待审核: { label: "待审核", color: "bg-amber-500", hex: "#f59e0b" },
  待发货: { label: "待发货", color: "bg-sky-500", hex: "#0ea5e9" },
  已发货待确认: { label: "已发货待确认", color: "bg-blue-600", hex: "#2563eb" },
  待收货: { label: "待收货", color: "bg-cyan-600", hex: "#0891b2" },
  待归还: { label: "待归还", color: "bg-emerald-600", hex: "#059669" },
  已逾期: { label: "已逾期", color: "bg-rose-600", hex: "#e11d48" },
  设备归还中: { label: "设备归还中", color: "bg-violet-600", hex: "#7c3aed" },
  已完成: { label: "已完成", color: "bg-slate-600", hex: "#475569" },
  已购买: { label: "已购买", color: "bg-teal-700", hex: "#0f766e" },
  已关闭: { label: "已关闭", color: "bg-gray-500", hex: "#6b7280" },
}

const platformMap: Record<string, string> = {
  XIAOHONGSHU: "小红书",
  XIANYU: "闲鱼",
  DOUYIN: "抖音",
  ZANCHEN: "赞晨",
  OTHER: "其他",
  OFFLINE: "线下"
}

export function OnlineOrdersClient({ initialConfig }: { initialConfig: OnlineOrdersConfig }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<OnlineOrdersConfig>(initialConfig)
  const [draft, setDraft] = useState<OnlineOrdersConfig>(initialConfig)
  
  // Prioritize Zanchen for initial selection
  const zanchenSite = initialConfig.sites.find(s => s.id === "zanchen")
  const defaultSiteId = zanchenSite ? zanchenSite.id : (initialConfig.sites[0]?.id || "")
  
  const [activeSiteId, setActiveSiteId] = useState(defaultSiteId)
  const [selectorMode, setSelectorMode] = useState<"form" | "json">("form")
  const [selectorsJson, setSelectorsJson] = useState("")
  const [activeTab, setActiveTab] = useState(defaultSiteId)
  const [settingsTab, setSettingsTab] = useState("global")
  const [zanchenStatus, setZanchenStatus] = useState<ZanchenStatus | null>(null)
  const [zanchenLoading, setZanchenLoading] = useState(false)
  const [onlineOrderPage, setOnlineOrderPage] = useState(1)
  const [onlineOrderPageSize, setOnlineOrderPageSize] = useState(20)
  const [dbOrders, setDbOrders] = useState<Order[]>([])
  const [dbTotal, setDbTotal] = useState(0)
  const [dbLoading, setDbLoading] = useState(false)
  const [dbRefreshKey, setDbRefreshKey] = useState(0)
  const [hoverSync, setHoverSync] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterOrderNo, setFilterOrderNo] = useState('')
  const [filterRecipientName, setFilterRecipientName] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [statusTotal, setStatusTotal] = useState(0)
  
  const [offlineConfigs, setOfflineConfigs] = useState<Record<string, OfflineSyncConfig>>({})
  
  // Load offline config for active site when settings sheet is open
  useEffect(() => {
    if (open && activeSiteId && !offlineConfigs[activeSiteId]) {
      fetch(`/api/offline-sync/config?siteId=${activeSiteId}`)
        .then(res => res.ok ? res.json() : null)
        .then(config => {
          if (config) {
            setOfflineConfigs(prev => ({ ...prev, [activeSiteId]: config }))
          }
        })
        .catch(console.error)
    }
  }, [open, activeSiteId, offlineConfigs])

  const handleOfflineConfigChange = (siteId: string, config: OfflineSyncConfig) => {
    setOfflineConfigs(prev => ({ ...prev, [siteId]: config }))
  }

  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [zanchenStatus?.logs])

  const activeSite = useMemo(
    () => draft.sites.find(site => site.id === activeSiteId) || draft.sites[0],
    [draft.sites, activeSiteId]
  )

  useEffect(() => {
    if (!activeSite) {
      setSelectorsJson("")
      return
    }
    if (selectorMode === "form") {
      setSelectorsJson(JSON.stringify(activeSite.selectors || {}, null, 2))
    }
  }, [activeSite, selectorMode])

  useEffect(() => {
    if (activeTab !== "zanchen") return
    let stopped = false
    const loadStatus = async () => {
      try {
        const res = await fetch("/api/online-orders/zanchen/status", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as ZanchenStatus
        if (!stopped) setZanchenStatus(data)
      } catch {
        if (!stopped) setZanchenStatus(prev => prev || { status: "idle" })
      }
    }
    loadStatus()
    const timer = setInterval(loadStatus, 4000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [activeTab])

  const onlineOrderTotal = dbTotal
  const onlineOrderTotalPages = Math.max(1, Math.ceil(onlineOrderTotal / onlineOrderPageSize))
  const onlineOrderDisplay = useMemo(
    () => dbOrders,
    [dbOrders]
  )

  useEffect(() => {
    if (onlineOrderPage > onlineOrderTotalPages) {
      setOnlineOrderPage(1)
    }
  }, [onlineOrderPage, onlineOrderTotalPages])

  useEffect(() => {
    if (activeTab !== "zanchen") return
    setDbLoading(true)
    ;(async () => {
      try {
        const res = await fetchOnlineOrders({
          page: onlineOrderPage,
          pageSize: onlineOrderPageSize,
          sortBy: "createdAt",
          sortDirection: "desc",
          status: filterStatus,
          searchOrderNo: filterOrderNo,
          searchRecipient: filterRecipientName,
          searchProduct: filterProduct,
        })
        setDbOrders(res.orders as unknown as Order[])
        setDbTotal(res.total)
      } catch (err) {
        console.error(err)
        toast.error("获取线上订单失败")
      } finally {
        setDbLoading(false)
      }
    })()
  }, [activeTab, onlineOrderPage, onlineOrderPageSize, dbRefreshKey, zanchenStatus?.lastRunAt, filterStatus, filterOrderNo, filterRecipientName, filterProduct])

  useEffect(() => {
    if (activeTab !== "zanchen") return
    getOnlineOrderCounts({
      searchOrderNo: filterOrderNo,
      searchRecipient: filterRecipientName,
      searchProduct: filterProduct,
    }).then(res => {
      setStatusCounts(res.counts)
      setStatusTotal(res.total)
    }).catch(console.error)
  }, [activeTab, dbRefreshKey, zanchenStatus?.lastRunAt, filterOrderNo, filterRecipientName, filterProduct])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      setDraft(config)
      setOfflineConfigs({}) // Reset offline drafts
      const zanchen = config.sites.find(s => s.id === "zanchen")
      setActiveSiteId(zanchen ? zanchen.id : (config.sites[0]?.id || ""))
      setSelectorMode("form")
      setSettingsTab("global")
    }
  }

  const updateDraft = (partial: Partial<OnlineOrdersConfig>) => {
    setDraft(prev => ({ ...prev, ...partial }))
  }

  const updateSite = (siteId: string, updater: (site: SiteConfig) => SiteConfig) => {
    setDraft(prev => ({
      ...prev,
      sites: prev.sites.map(site => (site.id === siteId ? updater(site) : site))
    }))
  }

  const handleSave = async () => {
    const finalConfig = { ...draft }
    if (selectorMode === "json" && activeSite) {
      try {
        const parsed = JSON.parse(selectorsJson || "{}")
        if (typeof parsed !== "object" || Array.isArray(parsed)) {
          toast.error("选择器 JSON 格式无效")
          return
        }
        finalConfig.sites = finalConfig.sites.map(site =>
          site.id === activeSite.id ? { ...site, selectors: parsed as SelectorMap } : site
        )
      } catch {
        toast.error("选择器 JSON 格式无效")
        return
      }
    }

    setSaving(true)
    try {
      // Save global config
      const res = await setAppConfigValue(CONFIG_KEY, JSON.stringify(finalConfig))
      
      // Save offline sync configs
      const offlineSavePromises = Object.entries(offlineConfigs).map(([siteId, cfg]) => 
        fetch("/api/offline-sync/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...cfg, siteId })
        })
      )
      await Promise.all(offlineSavePromises)

      if (res?.success) {
        setConfig(finalConfig)
        setOpen(false)
        toast.success(res.message || "配置更新成功")
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

  const handleZanchenSync = async (siteId: string) => {
    setZanchenLoading(true)
    try {
      const res = await fetch("/api/online-orders/zanchen/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId })
      })
      const data = (await res.json()) as ZanchenStatus
      setZanchenStatus(data)
      if (!res.ok) {
        toast.error(data.message || "同步失败")
        return
      }
      if (data.status === "awaiting_user") {
        toast("需要人工完成验证码后继续")
        return
      }
      toast.success("已开始同步")
    } catch {
      toast.error("同步失败")
    } finally {
      setZanchenLoading(false)
    }
  }

  const handleStopSync = async () => {
    try {
      await fetch("/api/online-orders/zanchen/stop", { method: "POST" })
      toast.info("已发送停止指令")
    } catch {
      toast.error("停止失败")
    }
  }

  const handleAddSite = () => {
    const newId = `site_${Date.now()}`
    const newSite: SiteConfig = {
      id: newId,
      name: "新平台",
      enabled: true,
      loginUrl: "",
      username: "",
      password: "",
      maxPages: 0,
      selectors: {}
    }
    setDraft(prev => ({ ...prev, sites: [...prev.sites, newSite] }))
    setActiveSiteId(newId)
  }

  const handleRemoveSite = () => {
    if (!activeSite) return
    const nextSites = draft.sites.filter(site => site.id !== activeSite.id)
    setDraft(prev => ({ ...prev, sites: nextSites }))
    setActiveSiteId(nextSites[0]?.id || "")
  }

  const webhookText = draft.webhookUrls.join("\n")
  const normalizeDeviceText = (value?: string | null) => (value || "").trim()
  const isSameDeviceText = (a?: string | null, b?: string | null) => {
    const left = normalizeDeviceText(a)
    const right = normalizeDeviceText(b)
    return Boolean(left && right && left === right)
  }
  const formatDate = (value?: string | Date | null) =>
    value ? new Date(value).toLocaleDateString() : "-"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetTrigger asChild>
              <Button variant="outline">
                <Settings2 className="h-4 w-4 mr-2" />
                同步配置
              </Button>
            </SheetTrigger>
            <SheetContent
              className="p-0"
              style={{ width: 960, maxWidth: 960, minWidth: 960 }}
            >
            <Tabs value={settingsTab} onValueChange={setSettingsTab} className="flex h-full flex-col">
              <div className="sticky top-0 z-10 bg-background border-b px-6 pt-6 pb-3">
                <SheetHeader className="mb-4">
                  <SheetTitle>同步配置</SheetTitle>
                </SheetHeader>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="global" className="w-full">全局配置</TabsTrigger>
                  <TabsTrigger value="sites" className="w-full">站点配置</TabsTrigger>
                  <TabsTrigger value="selectors" className="w-full">选择器配置</TabsTrigger>
                </TabsList>
              </div>
              <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
                <TabsContent value="global" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>增量同步阈值（条）</Label>
                    <Input
                      type="number"
                      placeholder="默认20"
                      value={draft.stopThreshold ?? 20}
                      onChange={e => updateDraft({ stopThreshold: Number(e.target.value) || 0 })}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">连续发现N个已完成历史订单时停止抓取</p>
                  </div>
                  <div className="space-y-2">
                    <Label>无头模式</Label>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span className="text-sm text-muted-foreground">启用后将以无头方式运行</span>
                      <Switch checked={draft.headless} onCheckedChange={v => updateDraft({ headless: v })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>夜间模式</Label>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span className="text-sm text-muted-foreground">夜间时间段暂停同步</span>
                      <Switch checked={draft.nightMode} onCheckedChange={v => updateDraft({ nightMode: v })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>夜间开始（小时）</Label>
                      <Input
                        type="number"
                        value={draft.nightPeriod.start}
                        onChange={e =>
                          updateDraft({
                            nightPeriod: { ...draft.nightPeriod, start: Number(e.target.value) || 0 }
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>夜间结束（小时）</Label>
                      <Input
                        type="number"
                        value={draft.nightPeriod.end}
                        onChange={e =>
                          updateDraft({
                            nightPeriod: { ...draft.nightPeriod, end: Number(e.target.value) || 0 }
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Webhook 地址（每行一个）</Label>
                  <Textarea
                    value={webhookText}
                    onChange={e =>
                      updateDraft({
                        webhookUrls: e.target.value
                          .split("\n")
                          .map(line => line.trim())
                          .filter(Boolean)
                      })
                    }
                    className="min-h-24"
                    placeholder="https://example.com/webhook"
                  />
                </div>
                </TabsContent>
                <TabsContent value="sites" className="space-y-4 mt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="w-[220px]">
                    <Select value={activeSite?.id || ""} onValueChange={setActiveSiteId}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择站点" />
                      </SelectTrigger>
                      <SelectContent>
                        {draft.sites.map(site => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleAddSite}>
                      <Plus className="h-4 w-4 mr-1" />
                      新增平台
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveSite}
                      disabled={!activeSite}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      删除平台
                    </Button>
                  </div>
                </div>
                {activeSite ? (
                    <Tabs defaultValue="basic" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="basic">基础配置</TabsTrigger>
                        <TabsTrigger value="automation">自动化配置</TabsTrigger>
                      </TabsList>
                      <TabsContent value="basic" className="space-y-4 mt-4">
                        <div className="space-y-2">
                          <Label>平台名称</Label>
                          <Input
                            value={activeSite.name}
                            onChange={e =>
                              updateSite(activeSite.id, site => ({ ...site, name: e.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>登录地址</Label>
                          <Input
                            value={activeSite.loginUrl}
                            onChange={e =>
                              updateSite(activeSite.id, site => ({ ...site, loginUrl: e.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>账号</Label>
                          <Input
                            value={activeSite.username}
                            onChange={e =>
                              updateSite(activeSite.id, site => ({ ...site, username: e.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>密码</Label>
                          <Input
                            type="password"
                            value={activeSite.password}
                            onChange={e =>
                              updateSite(activeSite.id, site => ({ ...site, password: e.target.value }))
                            }
                          />
                        </div>
                      </TabsContent>
                      <TabsContent value="automation" className="mt-4">
                        <Tabs defaultValue="online" className="w-full">
                          <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="online">线上自动抓取</TabsTrigger>
                            <TabsTrigger value="offline">线下自动同步</TabsTrigger>
                          </TabsList>
                          <TabsContent value="online" className="space-y-4 mt-4">
                            <div className="space-y-2">
                              <Label>最大抓取页数（0=全部）</Label>
                              <Input
                                type="number"
                                value={activeSite.maxPages ?? 0}
                                onChange={e =>
                                  updateSite(activeSite.id, site => ({
                                    ...site,
                                    maxPages: Number(e.target.value) || 0
                                  }))
                                }
                              />
                            </div>
                            {activeSite.id === "zanchen" ? (
                              <ZanchenSyncCard 
                                config={draft} 
                                onConfigChange={updateDraft} 
                                status={zanchenStatus}
                              />
                            ) : (
                               <GenericOnlineSyncCard 
                                 config={activeSite.autoSync}
                                 onConfigChange={(newSync) => updateSite(activeSite.id, site => ({
                                    ...site,
                                    autoSync: newSync
                                 }))}
                               />
                            )}
                          </TabsContent>
                          <TabsContent value="offline" className="space-y-4 mt-4">
                            <OfflineSyncCard 
                              siteId={activeSite.id} 
                              config={offlineConfigs[activeSite.id] || { enabled: false, intervalMinutes: 60 }}
                              onConfigChange={(c) => handleOfflineConfigChange(activeSite.id, c)}
                            />
                          </TabsContent>
                        </Tabs>
                      </TabsContent>
                    </Tabs>
                ) : (
                  <div className="rounded-md border p-6 text-sm text-muted-foreground">暂无平台配置</div>
                )}
                </TabsContent>
                <TabsContent value="selectors" className="space-y-4 mt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="w-[220px]">
                    <Select value={activeSite?.id || ""} onValueChange={setActiveSiteId}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择站点" />
                      </SelectTrigger>
                      <SelectContent>
                        {draft.sites.map(site => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Tabs value={selectorMode} onValueChange={v => setSelectorMode(v as "form" | "json")}>
                    <TabsList className="grid w-[220px] grid-cols-2">
                      <TabsTrigger value="form" className="w-full">表单模式</TabsTrigger>
                      <TabsTrigger value="json" className="w-full">JSON 模式</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                {activeSite ? (
                  selectorMode === "form" ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>账号输入框</Label>
                        <Input
                          value={activeSite.selectors.username_input || ""}
                          onChange={e =>
                            updateSite(activeSite.id, site => ({
                              ...site,
                              selectors: { ...site.selectors, username_input: e.target.value }
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>密码输入框</Label>
                        <Input
                          value={activeSite.selectors.password_input || ""}
                          onChange={e =>
                            updateSite(activeSite.id, site => ({
                              ...site,
                              selectors: { ...site.selectors, password_input: e.target.value }
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>登录按钮</Label>
                        <Input
                          value={activeSite.selectors.login_button || ""}
                          onChange={e =>
                            updateSite(activeSite.id, site => ({
                              ...site,
                              selectors: { ...site.selectors, login_button: e.target.value }
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>订单列表地址</Label>
                        <Input
                          value={activeSite.selectors.order_menu_link || ""}
                          onChange={e =>
                            updateSite(activeSite.id, site => ({
                              ...site,
                              selectors: { ...site.selectors, order_menu_link: e.target.value }
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>待处理数量</Label>
                        <Input
                          value={activeSite.selectors.pending_count_element || ""}
                          onChange={e =>
                            updateSite(activeSite.id, site => ({
                              ...site,
                              selectors: { ...site.selectors, pending_count_element: e.target.value }
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label>订单列表容器</Label>
                        <Input
                          value={activeSite.selectors.order_list_container || ""}
                          onChange={e =>
                            updateSite(activeSite.id, site => ({
                              ...site,
                              selectors: { ...site.selectors, order_list_container: e.target.value }
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label>订单行选择器（每行一个）</Label>
                        <Textarea
                          value={activeSite.selectors.order_row_selectors || ""}
                          onChange={e =>
                            updateSite(activeSite.id, site => ({
                              ...site,
                              selectors: { ...site.selectors, order_row_selectors: e.target.value }
                            }))
                          }
                          className="min-h-[120px] font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label>订单行模板选择器（使用 {`{i}`} 作为序号）</Label>
                        <Input
                          value={activeSite.selectors.order_row_selector_template || ""}
                          onChange={e =>
                            updateSite(activeSite.id, site => ({
                              ...site,
                              selectors: {
                                ...site.selectors,
                                order_row_selector_template: e.target.value
                              }
                            }))
                          }
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 col-span-2">
                        <div className="space-y-2">
                          <Label>模板起始序号</Label>
                          <Input
                            type="number"
                            value={activeSite.selectors.order_row_index_start || ""}
                            onChange={e =>
                              updateSite(activeSite.id, site => ({
                                ...site,
                                selectors: {
                                  ...site.selectors,
                                  order_row_index_start: e.target.value
                                }
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>模板步长</Label>
                          <Input
                            type="number"
                            value={activeSite.selectors.order_row_index_step || ""}
                            onChange={e =>
                              updateSite(activeSite.id, site => ({
                                ...site,
                                selectors: {
                                  ...site.selectors,
                                  order_row_index_step: e.target.value
                                }
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>模板结束序号</Label>
                          <Input
                            type="number"
                            value={activeSite.selectors.order_row_index_end || ""}
                            onChange={e =>
                              updateSite(activeSite.id, site => ({
                                ...site,
                                selectors: {
                                  ...site.selectors,
                                  order_row_index_end: e.target.value
                                }
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label>翻页按钮选择器</Label>
                        <Input
                          value={activeSite.selectors.pagination_next_selector || ""}
                          onChange={e =>
                            updateSite(activeSite.id, site => ({
                              ...site,
                              selectors: { ...site.selectors, pagination_next_selector: e.target.value }
                            }))
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>选择器 JSON</Label>
                      <Textarea
                        value={selectorsJson}
                        onChange={e => setSelectorsJson(e.target.value)}
                        className="min-h-[240px] font-mono text-xs w-full"
                      />
                    </div>
                  )
                ) : (
                  <div className="rounded-md border p-6 text-sm text-muted-foreground">暂无平台配置</div>
                )}
                </TabsContent>
              </div>
              <SheetFooter className="border-t p-4 sm:justify-end sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                  取消
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "保存中..." : "保存"}
                </Button>
              </SheetFooter>
            </Tabs>
          </SheetContent>
        </Sheet>
        {activeTab === "zanchen" && (
          <>
            <Button
              size="sm"
              onClick={() => {
                if (zanchenStatus?.status !== "running") {
                  handleZanchenSync("zanchen")
                }
              }}
              disabled={zanchenStatus?.status === "running" || zanchenLoading}
            >
              <Play className="h-4 w-4 mr-1" />
              {zanchenLoading ? "启动中..." : "开始同步"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleStopSync}
              disabled={zanchenStatus?.status !== "running"}
            >
              <Square className="h-4 w-4 mr-1" />
              停止同步
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLogsOpen(true)}
            >
              <FileText className="h-4 w-4 mr-1" />
              查看日志
            </Button>
            
            <SyncLogsDialog 
              siteId="zanchen" 
              open={logsOpen} 
              onOpenChange={setLogsOpen} 
            />
          </>
        )}
        </div>
      </div>

      {config.sites.length > 0 ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex flex-wrap">
            {config.sites.map(site => (
              <TabsTrigger key={site.id} value={site.id}>
                {site.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {config.sites.map(site => (
            <TabsContent key={site.id} value={site.id}>
              {site.id === "zanchen" ? (
                <div className="space-y-4">
                  {!site.selectors.order_list_container?.trim() ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      需要填写订单列表容器选择器才能抓取订单
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {site.enabled ? (zanchenStatus?.lastRunAt ? `最近同步: ${new Date(zanchenStatus.lastRunAt).toLocaleString()}` : "将复用浏览器会话并保持心跳") : "该平台未启用"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {zanchenStatus?.status === "awaiting_user" && (
                      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-blue-700">
                        <p className="font-medium">需要人工介入</p>
                        <p className="text-sm">请在弹出的浏览器完成验证码或短信验证后等待系统继续。</p>
                      </div>
                    )}
                    
                    <div className="space-y-4">
                      <Tabs value={filterStatus} onValueChange={(val) => { setFilterStatus(val); setOnlineOrderPage(1); }} className="w-full">
                          <TabsList className="flex flex-wrap h-auto w-full justify-start">
                              <TabsTrigger value="ALL">全部 ({statusTotal})</TabsTrigger>
                              <TabsTrigger value="PENDING_REVIEW">待审核 ({statusCounts['PENDING_REVIEW'] || 0})</TabsTrigger>
                              <TabsTrigger value="PENDING_SHIPMENT">待发货 ({statusCounts['PENDING_SHIPMENT'] || 0})</TabsTrigger>
                              <TabsTrigger value="PENDING_RECEIPT">待收货 ({statusCounts['PENDING_RECEIPT'] || 0})</TabsTrigger>
                              <TabsTrigger value="RENTING">待归还 ({statusCounts['RENTING'] || 0})</TabsTrigger>
                              <TabsTrigger value="RETURNING">归还中 ({statusCounts['RETURNING'] || 0})</TabsTrigger>
                              <TabsTrigger value="OVERDUE">已逾期 ({statusCounts['OVERDUE'] || 0})</TabsTrigger>
                              <TabsTrigger value="COMPLETED">已完成 ({statusCounts['COMPLETED'] || 0})</TabsTrigger>
                              <TabsTrigger value="CLOSED">已关闭 ({statusCounts['CLOSED'] || 0})</TabsTrigger>
                          </TabsList>
                      </Tabs>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-3">
                               <div className="flex items-center space-x-2">
                                 <Search className="w-4 h-4 text-gray-500" />
                                 <Input 
                                    placeholder="订单号" 
                                    value={filterOrderNo} 
                                    onChange={e => { setFilterOrderNo(e.target.value); setOnlineOrderPage(1); }} 
                                    className="h-8 w-[180px]" 
                                 />
                               </div>
                               <Input 
                                  placeholder="收货人姓名" 
                                  value={filterRecipientName} 
                                  onChange={e => { setFilterRecipientName(e.target.value); setOnlineOrderPage(1); }} 
                                  className="h-8 w-[120px]" 
                               />
                               <Input 
                                  placeholder="商品名称" 
                                  value={filterProduct} 
                                  onChange={e => { setFilterProduct(e.target.value); setOnlineOrderPage(1); }} 
                                  className="h-8 w-[120px]" 
                               />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDbRefreshKey(key => key + 1)}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            刷新列表
                          </Button>
                      </div>
                    </div>
                    <div className="rounded-md border bg-white relative min-h-[200px]">
                        {dbLoading ? (
                          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10">
                            <span className="text-sm text-muted-foreground">加载中...</span>
                          </div>
                        ) : null}
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[80px]">订单平台</TableHead>
                              <TableHead className="w-[100px]">商家名称</TableHead>
                              <TableHead className="w-[100px]">推广渠道</TableHead>
                              <TableHead className="w-[180px]">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="-ml-3 hover:bg-transparent flex items-center gap-1"
                                >
                                  订单号/时间
                                  <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
                                </Button>
                              </TableHead>
                              <TableHead className="w-[150px]">物流信息</TableHead>
                              <TableHead className="w-[200px]">设备信息</TableHead>
                              <TableHead className="w-[150px]">租期/时间</TableHead>
                              <TableHead className="w-[120px]">金额详情</TableHead>
                              <TableHead className="w-[100px]">状态</TableHead>
                              <TableHead className="w-[100px]">截图凭证</TableHead>
                              <TableHead className="min-w-[150px]">备注</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {onlineOrderDisplay.map((order, i) => (
                              <TableRow key={`${order.orderNo}-${i}`}>
                                <TableCell>
                                  <div className="text-xs">{platformMap[order.platform || ""] || order.platform || "-"}</div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs text-muted-foreground">
                                    {order.merchantName || "-"}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs text-muted-foreground">
                                    {(order as any).promotionChannel || "-"}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs font-bold">{order.orderNo}</div>
                                  <div className="text-[10px] text-muted-foreground mt-1">
                                    {new Date(order.createdAt).toLocaleString()}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs text-muted-foreground">
                                    {((order as any).customerName || order.recipientName || order.recipientPhone) && (
                                      <div>
                                        {(order as any).customerName || order.recipientName || "-"} <span className="mx-1">|</span>{" "}
                                        {order.recipientPhone || "-"}
                                      </div>
                                    )}
                                    <div>{order.address}</div>
                                  </div>
                                  {(order.logisticsCompany || order.trackingNumber || order.latestLogisticsInfo) ? (
                                    <div className="space-y-1 pt-2 border-t border-dashed border-gray-200">
                                      <div className="text-[10px] font-semibold text-gray-500">发货物流</div>
                                      <div className="text-[10px]">
                                        {order.logisticsCompany && (
                                          <div className="flex items-center text-blue-600 font-medium">
                                            <Truck className="w-3 h-3 mr-1" />
                                            {order.logisticsCompany}
                                          </div>
                                        )}
                                        {order.trackingNumber ? (
                                          <div className="font-mono text-gray-600">{order.trackingNumber}</div>
                                        ) : null}
                                        {order.latestLogisticsInfo ? (
                                          <div
                                            className="text-gray-500 scale-90 origin-left truncate max-w-[150px]"
                                            title={order.latestLogisticsInfo}
                                          >
                                            {order.latestLogisticsInfo}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  ) : null}
                                  {(order.returnLogisticsCompany || order.returnTrackingNumber || order.returnLatestLogisticsInfo) ? (
                                    <div className="space-y-1 pt-2 border-t border-dashed border-gray-200">
                                      <div className="text-[10px] font-semibold text-gray-500">归还物流</div>
                                      <div className="text-[10px]">
                                        {order.returnLogisticsCompany && (
                                          <div className="flex items-center text-purple-600 font-medium">
                                            {order.returnLogisticsCompany}
                                          </div>
                                        )}
                                        {order.returnTrackingNumber ? (
                                          <div className="font-mono text-gray-600">
                                            {order.returnTrackingNumber}
                                          </div>
                                        ) : null}
                                        {order.returnLatestLogisticsInfo ? (
                                          <div
                                            className="text-gray-500 scale-90 origin-left truncate max-w-[150px]"
                                            title={order.returnLatestLogisticsInfo}
                                          >
                                            {order.returnLatestLogisticsInfo}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  ) : null}
                                </TableCell>
                                <TableCell>
                                  <div className="font-semibold">{order.productName}</div>
                                  {order.itemTitle && !isSameDeviceText(order.itemTitle, order.productName) && !isSameDeviceText(order.itemTitle, order.variantName) ? (
                                    <div className="text-[10px] text-muted-foreground">{order.itemTitle}</div>
                                  ) : null}
                                  {order.variantName ? (
                                    <div className="text-xs text-muted-foreground">{order.variantName}</div>
                                  ) : null}
                                  {order.itemSku && !isSameDeviceText(order.itemSku, order.variantName) && !isSameDeviceText(order.itemSku, order.productName) && !isSameDeviceText(order.itemSku, order.itemTitle) ? (
                                    <div className="text-[10px] text-muted-foreground mt-1">{order.itemSku}</div>
                                  ) : null}
                                  {order.sn ? (
                                    <div className="text-xs text-blue-600 font-mono mt-1">SN: {order.sn}</div>
                                  ) : null}
                                </TableCell>
                                <TableCell>
                                  {(() => {
                                    const rentStart = order.rentStartDate ? new Date(order.rentStartDate) : undefined
                                    const hasRentStart = rentStart && !Number.isNaN(rentStart.getTime())
                                    const durationDays = order.duration || 0
                                    const endDateFromDuration =
                                      hasRentStart && durationDays > 0
                                        ? new Date(rentStart.getFullYear(), rentStart.getMonth(), rentStart.getDate() + durationDays - 1)
                                        : undefined
                                    const endDate = endDateFromDuration || (order.returnDeadline ? new Date(order.returnDeadline) : undefined)
                                    const hasEndDate = endDate && !Number.isNaN(endDate.getTime())
                                    const returnDate =
                                      hasEndDate
                                        ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1)
                                        : undefined
                                    const shipDate =
                                      hasRentStart
                                        ? new Date(rentStart.getFullYear(), rentStart.getMonth(), rentStart.getDate() - 2)
                                        : undefined
                                    return (
                                      <div className="space-y-0.5">
                                        <div className="font-medium">{order.duration || 0} 天</div>
                                        <div className="text-xs text-muted-foreground" title="发货日期">
                                          发货: {formatDate(shipDate)}
                                        </div>
                                        <div className="text-xs text-muted-foreground" title="起租日期">
                                          起租: {formatDate(hasRentStart ? rentStart : undefined)}
                                        </div>
                                        <div className="text-xs text-muted-foreground" title="完租日期">
                                          完租: {formatDate(hasEndDate ? endDate : undefined)}
                                        </div>
                                        <div className="text-xs text-muted-foreground" title="归还日期">
                                          归还: {formatDate(returnDate)}
                                        </div>
                                      </div>
                                    )
                                  })()}
                                </TableCell>
                                <TableCell>
                                  <div className="font-bold text-red-600">¥ {order.totalAmount}</div>
                                  <div className="text-xs text-muted-foreground">
                                    租: {order.rentPrice} | 保: {order.insurancePrice}
                                  </div>
                                  <div className="text-xs text-muted-foreground">押: {order.deposit}</div>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-white text-[10px] px-2 py-1 rounded-full border-none pointer-events-none",
                                      statusMap[order.status]?.color || "bg-gray-400"
                                    )}
                                     style={{ backgroundColor: statusMap[order.status]?.hex || "#9ca3af" }}
                                  >
                                    {statusMap[order.status]?.label || order.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs">
                                    {order.screenshot ? `已上传 ${order.screenshot.split(",").filter(Boolean).length} 张` : "-"}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs line-clamp-2">{order.remark || ""}</div>
                                </TableCell>
                              </TableRow>
                            ))}
                            {onlineOrderDisplay.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={10} className="text-center h-20">
                                  暂无符合条件的订单
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="flex items-center justify-between px-2">
                        <div className="text-sm text-muted-foreground">
                          共 {onlineOrderTotal} 条数据，本页显示 {onlineOrderDisplay.length} 条
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <p className="text-sm font-medium text-gray-500">每页行数</p>
                            <Select
                              value={`${onlineOrderPageSize}`}
                              onValueChange={value => {
                                setOnlineOrderPageSize(Number(value))
                                setOnlineOrderPage(1)
                              }}
                            >
                              <SelectTrigger className="h-8 w-[70px]">
                                <SelectValue placeholder={onlineOrderPageSize} />
                              </SelectTrigger>
                              <SelectContent side="top">
                                {[20, 50, 100].map(size => (
                                  <SelectItem key={size} value={`${size}`}>
                                    {size}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {onlineOrderTotalPages > 1 ? (
                            <Pagination className="justify-end w-auto mx-0">
                              <PaginationContent>
                                <PaginationItem>
                                  <PaginationPrevious
                                    onClick={() => setOnlineOrderPage(p => Math.max(1, p - 1))}
                                    className={
                                      onlineOrderPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
                                    }
                                  />
                                </PaginationItem>
                                {(() => {
                                  const generatePaginationItems = (current: number, total: number) => {
                                    if (total <= 7) {
                                      return Array.from({ length: total }, (_, i) => i + 1)
                                    }
                                    const items: (number | "ellipsis-start" | "ellipsis-end")[] = [1]
                                    let start = Math.max(2, current - 2)
                                    let end = Math.min(total - 1, current + 2)
                                    if (current < 4) {
                                      end = Math.min(total - 1, 5)
                                    }
                                    if (current > total - 3) {
                                      start = Math.max(2, total - 4)
                                    }
                                    if (start > 2) {
                                      items.push("ellipsis-start")
                                    }
                                    for (let i = start; i <= end; i += 1) {
                                      items.push(i)
                                    }
                                    if (end < total - 1) {
                                      items.push("ellipsis-end")
                                    }
                                    if (total > 1) {
                                      items.push(total)
                                    }
                                    return items
                                  }
                                  return generatePaginationItems(
                                    onlineOrderPage,
                                    onlineOrderTotalPages
                                  ).map(item => (
                                    <PaginationItem key={typeof item === "string" ? item : item}>
                                      {typeof item === "number" ? (
                                        <PaginationLink
                                          isActive={onlineOrderPage === item}
                                          onClick={() => setOnlineOrderPage(item)}
                                          className="cursor-pointer"
                                        >
                                          {item}
                                        </PaginationLink>
                                      ) : (
                                        <PaginationEllipsis />
                                      )}
                                    </PaginationItem>
                                  ))
                                })()}
                                <PaginationItem>
                                  <PaginationNext
                                    onClick={() =>
                                      setOnlineOrderPage(p => Math.min(onlineOrderTotalPages, p + 1))
                                    }
                                    className={
                                      onlineOrderPage === onlineOrderTotalPages
                                        ? "pointer-events-none opacity-50"
                                        : "cursor-pointer"
                                    }
                                  />
                                </PaginationItem>
                              </PaginationContent>
                            </Pagination>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
              ) : (
                <div className="rounded-md border p-6 text-sm text-muted-foreground">
                  {site.enabled ? "暂无线上订单数据" : "该平台未启用"}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">暂无平台配置</div>
      )}
    </div>
  )
}
