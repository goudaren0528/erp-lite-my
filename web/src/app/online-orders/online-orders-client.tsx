"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
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
import { SearchableSelect } from "@/components/ui/searchable-select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { setAppConfigValue } from "@/app/actions"
import { fetchOrders } from "@/app/actions"
import { fetchOnlineOrders, getOnlineOrderCounts, getMatchProducts, syncOnlineOrderMatchSpec, updateOnlineOrderMatchSpec, updateOnlineOrderManualSn, getPlatformSyncMeta } from "./actions"
import { ArrowUpDown, Plus, Settings2, Trash2, Truck, Play, Square, FileText, RefreshCw, Search, MonitorPlay, Pencil, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Product, ProductVariant } from "@/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { OfflineSyncCard, OfflineSyncConfig } from "@/components/settings/offline-sync-card"
import { ZanchenSyncCard } from "@/components/settings/zanchen-sync-card"
import { GenericOnlineSyncCard } from "@/components/settings/generic-online-sync-card"
import { SyncLogsDialog } from "@/components/orders/sync-logs-dialog"
import { defaultConfig } from "@/lib/online-orders/default-config"

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
  hidden?: boolean
  loginUrl: string
  username: string
  password: string
  maxPages: number
  selectors: SelectorMap
  autoSync?: {
    enabled: boolean
    interval?: number
    concurrencyLimit?: number
    scheduledTimes?: string[]
  }
}

type OnlineOrdersConfig = {
  autoSyncEnabled?: boolean
  interval?: number
  concurrencyLimit?: number
  scheduledTimes?: string[]
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
  logs?: string[]
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
}

type GenericSyncStatus = {
  status: "idle" | "running" | "awaiting_user" | "success" | "error" | string
  message?: string
  lastRunAt?: string
  needsAttention?: boolean
  logs?: string[]
}

type OnlineOrderRow = {
  id: string
  orderNo: string
  platform: string
  status: string
  createdAt: string
  updatedAt: string
  merchantName?: string | null
  promotionChannel?: string | null
  productName?: string | null
  variantName?: string | null
  itemTitle?: string | null
  itemSku?: string | null
  manualSn?: string | null
  totalAmount?: number | null
  rentStartDate?: string | null
  returnDeadline?: string | null
  logisticsCompany?: string | null
  trackingNumber?: string | null
  latestLogisticsInfo?: string | null
  returnLogisticsCompany?: string | null
  returnTrackingNumber?: string | null
  returnLatestLogisticsInfo?: string | null
  customerName?: string | null
  recipientName?: string | null
  recipientPhone?: string | null
  address?: string | null
  duration?: number | null
  rentPrice?: number | null
  deposit?: number | null
  insurancePrice?: number | null
  sn?: string | null
  productId?: string | null
  specId?: string | null
  remark?: string | null
}

type MatchProductBomItem = {
  itemTypeId: string
  quantity: number
  itemTypeName?: string | null
}

type MatchProductSpec = {
  id: string
  specId: string | null
  name: string
  bomItems?: MatchProductBomItem[]
}

type MatchProduct = {
  id: string
  name: string
  variants: unknown
  specs?: MatchProductSpec[]
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
  WAIT_PAY: { label: "待支付", color: "bg-orange-500", hex: "#f97316" },
  UNAUTHORIZED: { label: "未授权", color: "bg-red-500", hex: "#ef4444" },
  SHIPPED: { label: "已发货", color: "bg-blue-500", hex: "#3b82f6" },
  DUE_REPAYMENT: { label: "待结算", color: "bg-yellow-600", hex: "#ca8a04" },
  RENEWAL: { label: "续租订单", color: "bg-indigo-500", hex: "#6366f1" },
  RETURNING_SOON: { label: "即将归还", color: "bg-emerald-500", hex: "#10b981" },
  UNKNOWN: { label: "未知", color: "bg-gray-400", hex: "#9ca3af" },
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
  CHENGLIN: "诚赁",
  AOLZU: "奥租",
  YOUPIN: "优品租",
  LLXZU: "零零享",
  RRZ: "人人租",
  OTHER: "其他",
  OFFLINE: "线下"
}

export function OnlineOrdersClient({ initialConfig, canClearOrders = false }: { initialConfig: OnlineOrdersConfig; canClearOrders?: boolean }) {
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get('q') || ''
  const initialSn = searchParams.get('sn') || ''
  const initialTab = searchParams.get('tab') || ''

  const zanchenSite = initialConfig.sites.find(s => s.id === "zanchen")

  // Resolve initialTab to an actual site id (exact match first, then fuzzy by name/id)
  const resolveTabToSiteId = (tab: string) => {
    if (!tab) return null
    const exact = initialConfig.sites.find(s => s.id === tab)
    if (exact) return exact.id
    const tabLower = tab.toLowerCase()
    const fuzzy = initialConfig.sites.find(s =>
      s.id.toLowerCase().includes(tabLower) ||
      tabLower.includes(s.id.toLowerCase()) ||
      s.name.includes(tab) ||
      (tabLower === "chenlin" && (s.name.includes("诚赁") || s.id.toLowerCase().includes("chenlin"))) ||
      (tabLower === "aolzu" && (s.name.includes("奥租") || s.id.toLowerCase().includes("aolzu"))) ||
      (tabLower === "zanchen" && (s.name.includes("赞晨") || s.id.toLowerCase().includes("zanchen"))) ||
      (tabLower === "llxzu" && (s.name.includes("零零享") || s.id.toLowerCase().includes("llxzu"))) ||
      (tabLower === "youpin" && (s.name.includes("优品") || s.id.toLowerCase().includes("youpin"))) ||
      (tabLower === "rrz" && (s.name.includes("人人租") || s.id.toLowerCase().includes("rrz")))
    )
    return fuzzy?.id || null
  }

  const defaultSiteId = initialTab
    ? (resolveTabToSiteId(initialTab) ?? initialTab)
    : (zanchenSite ? zanchenSite.id : (initialConfig.sites.find(s => !s.hidden)?.id || ""))

  const [activeSiteId, setActiveSiteId] = useState(defaultSiteId)

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<OnlineOrdersConfig>(initialConfig)
  const [draft, setDraft] = useState<OnlineOrdersConfig>(initialConfig)

  const [selectorMode, setSelectorMode] = useState<"form" | "json">("form")
  const [selectorsJson, setSelectorsJson] = useState("")
  const [activeTab, setActiveTab] = useState(defaultSiteId)
  const [settingsTab, setSettingsTab] = useState("global")
  const [zanchenStatus, setZanchenStatus] = useState<ZanchenStatus>({ status: "idle" })
  const [genericStatus, setGenericStatus] = useState<GenericSyncStatus>({ status: "idle" }) // For Chenglin/Aolzu
  const [zanchenLoading, setZanchenLoading] = useState(false)
  const [onlineOrderPage, setOnlineOrderPage] = useState(1)
  const [onlineOrderPageSize, setOnlineOrderPageSize] = useState(20)
  const [dbOrders, setDbOrders] = useState<OnlineOrderRow[]>([])
  const [dbTotal, setDbTotal] = useState(0)
  const [dbLoading, setDbLoading] = useState(false)
  const [dbRefreshKey, setDbRefreshKey] = useState(0)
  const [hoverSync, setHoverSync] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [products, setProducts] = useState<MatchProduct[]>([])
  const [matchOrderId, setMatchOrderId] = useState<string | null>(null)
  const [matchProductId, setMatchProductId] = useState("")
  const [matchSpecValue, setMatchSpecValue] = useState("")

  const [editSnOrderId, setEditSnOrderId] = useState<string | null>(null)
  const [editSnValue, setEditSnValue] = useState("")
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number } | null>(null)
  const [importErrorRows, setImportErrorRows] = useState<{ row: Record<string, string>; reason: string }[] | null>(null)
  const [importDataHeaders, setImportDataHeaders] = useState<string[]>([])
  const importInputRef = useRef<HTMLInputElement>(null)

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterOrderNo, setFilterOrderNo] = useState(initialQuery)
  const [filterRecipientName, setFilterRecipientName] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterSn, setFilterSn] = useState(initialSn)
  const [matchFilter, setMatchFilter] = useState<'ALL' | 'MATCHED' | 'UNMATCHED'>('ALL')
  const [filterPlatformSearch, setFilterPlatformSearch] = useState('')
  
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [statusTotal, setStatusTotal] = useState(0)
  const [syncMeta, setSyncMeta] = useState<Record<string, { lastSyncAt: string | null; lastSyncCount: number | null }>>({})
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

  useEffect(() => {
    getMatchProducts()
      .then(res => setProducts(res as unknown as Product[]))
      .catch(() => toast.error("加载商品失败"))
  }, [])

  const handleOfflineConfigChange = (siteId: string, config: OfflineSyncConfig) => {
    setOfflineConfigs(prev => ({ ...prev, [siteId]: config }))
  }

  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [zanchenStatus?.logs, genericStatus?.logs])

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

  const statusSiteId = activeTab || activeSiteId

  // Poll status based on active tab (the platform being synced)
  useEffect(() => {
    let isActive = true
    const poll = async () => {
        if (!statusSiteId) return
        try {
            const res = await fetch(`/api/online-orders/zanchen/status?siteId=${encodeURIComponent(statusSiteId)}`, { cache: "no-store" })
            if (res.ok && isActive) {
                const data = await res.json()
                if (statusSiteId === "zanchen") {
                    setZanchenStatus(data)
                } else {
                    setGenericStatus(data)
                }
            }
        } catch (e) {
            console.error(e)
        }
    }
    
    poll() // Initial fetch
    const timer = setInterval(poll, 2000) // Poll every 2s
    
    return () => {
        isActive = false
        clearInterval(timer)
    }
  }, [statusSiteId])

  // Computed status for current tab (start/stop controls)
  const currentStatus = statusSiteId === "zanchen" ? zanchenStatus : genericStatus

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

  // Derive platform filter: only apply when no search terms are active
  const hasSearchFilter = !!(filterOrderNo || filterRecipientName || filterProduct || filterSn || filterPlatformSearch)

  const normalizeLoginUrl = (raw?: string) => {
    const text = raw?.trim()
    if (!text) return null
    try {
      const withProtocol = /^https?:\/\//i.test(text) ? text : `http://${text}`
      const parsed = new URL(withProtocol)
      const origin = parsed.origin.toLowerCase()
      const pathname = (parsed.pathname || "/").replace(/\/+$/, "") || "/"
      return { exact: `${origin}${pathname.toLowerCase()}`, origin }
    } catch {
      return null
    }
  }

  const detectKnownPlatform = (siteId: string, siteName: string) => {
    const lower = siteId.toLowerCase()
    if (siteName.includes("零零享") || lower.includes("llxzu")) return "零零享"
    if (siteName.includes("人人租") || lower.includes("rrz")) return "人人租"
    if (siteName.includes("优品") || lower.includes("youpin")) return "优品租"
    if (siteName.includes("奥租") || lower.includes("aolzu") || lower.includes("aozu")) return "奥租"
    if (siteName.includes("诚赁") || lower.includes("chenglin") || lower.includes("chenlin")) return "诚赁"
    if (lower === "zanchen" || siteName.includes("赞晨")) return "ZANCHEN"
    return undefined
  }

  const getTabPlatform = (tabId: string) => {
    const site = draft.sites.find(s => s.id === tabId)
    const explicit = detectKnownPlatform(tabId, site?.name || "")
    if (explicit) return explicit
    const current = normalizeLoginUrl(site?.loginUrl)
    if (!current) return site?.name?.trim() || undefined

    let sameOriginPlatform: string | undefined
    for (const candidateSite of draft.sites) {
      if (candidateSite.id === tabId) continue
      const candidatePlatform = detectKnownPlatform(candidateSite.id, candidateSite.name || "")
      if (!candidatePlatform) continue
      const candidateUrl = normalizeLoginUrl(candidateSite.loginUrl)
      if (!candidateUrl) continue
      if (candidateUrl.exact === current.exact) return candidatePlatform
      if (!sameOriginPlatform && candidateUrl.origin === current.origin) {
        sameOriginPlatform = candidatePlatform
      }
    }
    return sameOriginPlatform ?? (site?.name?.trim() || undefined)
  }

  useEffect(() => {
    const platformFilter = filterPlatformSearch || (hasSearchFilter ? undefined : getTabPlatform(activeTab))
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
          searchSn: filterSn,
          filterPlatform: platformFilter,
          matchFilter
        })
        setDbOrders(res.orders as OnlineOrderRow[])
        setDbTotal(res.total)
      } catch (err) {
        console.error(err)
        toast.error("获取线上订单失败")
      } finally {
        setDbLoading(false)
      }
    })()
  }, [activeTab, onlineOrderPage, onlineOrderPageSize, dbRefreshKey, zanchenStatus?.lastRunAt, filterStatus, filterOrderNo, filterRecipientName, filterProduct, filterSn, matchFilter, genericStatus?.status, filterPlatformSearch])

  useEffect(() => {
    const platformFilter = filterPlatformSearch || (hasSearchFilter ? undefined : getTabPlatform(activeTab))
    getOnlineOrderCounts({
      searchOrderNo: filterOrderNo,
      searchRecipient: filterRecipientName,
      searchProduct: filterProduct,
      searchSn: filterSn,
      filterPlatform: platformFilter,
    }).then(res => {
      setStatusCounts(res.counts)
      setStatusTotal(res.total)
    }).catch(console.error)
  }, [activeTab, dbRefreshKey, zanchenStatus?.lastRunAt, filterOrderNo, filterRecipientName, filterProduct, filterSn, filterPlatformSearch])

  // Load sync meta (last sync time + total orders) for all platform tabs
  useEffect(() => {
    const allPlatforms = ["ZANCHEN", "诚赁", "奥租", "优品租", "零零享", "人人租"]
    getPlatformSyncMeta(allPlatforms).then(setSyncMeta).catch(console.error)
  }, [dbRefreshKey, zanchenStatus?.lastRunAt, genericStatus?.status])

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
      if (siteId === "zanchen") setZanchenStatus(data)
      else setGenericStatus(data as unknown as GenericSyncStatus)
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
      await fetch("/api/online-orders/zanchen/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: activeTab })
      })
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

    // Protect core platforms
    const corePlatforms = ["zanchen", "chenlin", "aolzu", "youpin", "llxzu", "rrz"]
    const isCore = corePlatforms.some(id => 
        activeSite.id === id || 
        activeSite.id.toLowerCase().includes(id) ||
        (id === "llxzu" && activeSite.name.includes("零零享")) ||
        (id === "rrz" && activeSite.name.includes("人人租")) ||
        (id === "youpin" && activeSite.name.includes("优品")) ||
        (id === "aolzu" && activeSite.name.includes("奥租")) ||
        (id === "chenlin" && activeSite.name.includes("诚赁")) ||
        (id === "zanchen" && activeSite.name.includes("赞晨"))
    )

    if (isCore) {
        toast.error("系统预置核心平台不可删除")
        return
    }

    const nextSites = draft.sites.filter(site => site.id !== activeSite.id)
    setDraft(prev => ({ ...prev, sites: nextSites }))
    setActiveSiteId(nextSites[0]?.id || "")
  }

  const handleResetConfig = () => {
    if (!activeSite) return
    if (!window.confirm(`确定要获取【${activeSite.name}】的初始配置吗？\n此操作将覆盖当前站点的登录URL和所有选择器配置。`)) return
    if (!window.confirm("【二次确认】当前站点的现有配置将被彻底覆盖且无法撤销，是否确认执行？")) return

    const defaultSite = defaultConfig.sites.find(s => s.id === activeSite.id)
    if (!defaultSite) {
      toast.error(`未找到【${activeSite.name}】的初始默认配置`)
      return
    }

    updateSite(activeSite.id, site => ({
      ...site,
      loginUrl: defaultSite.loginUrl,
      selectors: { ...defaultSite.selectors }
    }))
    
    // Ensure JSON editor gets updated if in JSON mode
    if (selectorMode === "json") {
      setSelectorsJson(JSON.stringify(defaultSite.selectors || {}, null, 2))
    }
    
    toast.success(`已应用【${activeSite.name}】的初始配置，请点击底部保存生效`)
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

  const resolveMatchProductId = (order: OnlineOrderRow) => {
    if (order.productId) return order.productId
    if (order.productName) {
      const p = products.find(p => p.name === order.productName)
      return p?.id || ""
    }
    return ""
  }

  const resolveMatchSpecValue = (order: OnlineOrderRow, productId: string) => {
    if (order.specId) return order.specId
    if (order.variantName && productId) {
      const p = products.find(p => p.id === productId)
      const spec = p?.specs?.find(s => s.name === order.variantName)
      if (spec) return spec.id
    }
    return ""
  }

  const getMatchSpecOptions = (productId: string) => {
    const product = products.find(p => p.id === productId)
    if (!product) return []
    // Only return specs that exist as ProductSpec records (have a real id)
    if (product.specs && product.specs.length > 0) {
      return product.specs.map(s => ({ id: s.id, name: s.name }))
    }
    // No specs configured — return empty, cannot match
    return []
  }

  const getMatchBomItems = (productId: string, specValue: string) => {
    if (!productId || !specValue) return []
    const product = products.find(p => p.id === productId)
    if (!product) return []
    const specMatch = product.specs?.find(s =>
      s.id === specValue || s.specId === specValue || s.name === specValue
    )
    if (specMatch) return specMatch.bomItems || []
    const vars = Array.isArray(product.variants) ? product.variants : []
    const variantMatch = vars.find(v => v.specId === specValue || v.name === specValue)
    return (variantMatch?.bomItems || []) as unknown as { itemTypeId: string; quantity: number; itemTypeName?: string }[]
  }

  const handleSaveMatchSpec = async (orderId: string) => {
    try {
      const res = await updateOnlineOrderMatchSpec(
        orderId,
        matchProductId || null,
        matchSpecValue || null
      )
      if (res?.success) {
        toast.success("匹配已保存")
        setMatchOrderId(null)
        setDbRefreshKey(key => key + 1)
      } else {
        toast.error("保存失败")
      }
    } catch (error) {
      console.error(error)
      toast.error("保存失败")
    }
  }

  const handleSaveManualSn = async (orderId: string) => {
    try {
        const res = await updateOnlineOrderManualSn(orderId, editSnValue)
        if (res?.success) {
          toast.success("SN 已保存")
          setEditSnOrderId(null)
          setDbRefreshKey(key => key + 1)
        } else {
          toast.error(res?.message || "保存失败")
        }
    } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败")
    }
  }

  const handleClearMatchSpec = async (orderId: string) => {
    try {
      const res = await updateOnlineOrderMatchSpec(orderId, null, null)
      if (res?.success) {
        toast.success("已清空匹配")
        setMatchOrderId(null)
        setMatchProductId("")
        setMatchSpecValue("")
        setDbRefreshKey(key => key + 1)
      } else {
        toast.error("清空失败")
      }
    } catch (error) {
      console.error(error)
      toast.error("清空失败")
    }
  }

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
                        {draft.sites.filter(s => !s.hidden).map(site => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name} ({site.id})
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetConfig}
                      disabled={!activeSite || !defaultConfig.sites.find(s => s.id === activeSite.id)}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      获取初始配置
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
                                 status={genericStatus}
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
                        {draft.sites.filter(s => !s.hidden).map(site => (
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
                      <div className="space-y-2">
                        <Label>全部订单Tab选择器</Label>
                        <Input
                          value={activeSite.selectors.all_orders_tab_selector || ""}
                          onChange={e =>
                            updateSite(activeSite.id, site => ({
                              ...site,
                              selectors: { ...site.selectors, all_orders_tab_selector: e.target.value }
                            }))
                          }
                          placeholder="例如: .nav-tabs > li:nth-child(2)"
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
        {activeTab === "zanchen" || config.sites.some(s => s.id === activeTab) ? (
          <>
            <Button
              size="sm"
              onClick={() => {
                if (activeTab === "zanchen") {
                    if (zanchenStatus?.status !== "running") {
                        handleZanchenSync("zanchen")
                    }
                } else {
                    // For other sites, use generic sync if possible
                    handleZanchenSync(activeTab)
                }
              }}
              // Check global running status for current tab
              disabled={currentStatus?.status === "running" || zanchenLoading}
            >
              <Play className="h-4 w-4 mr-1" />
              {zanchenLoading ? "启动中..." : (currentStatus?.status === "running" ? "同步中..." : "开始同步")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleStopSync}
              disabled={currentStatus?.status !== "running" && currentStatus?.status !== "awaiting_user" && currentStatus?.status !== "error"}
            >
              <Square className="h-4 w-4 mr-1" />
              停止同步
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await fetch("/api/online-orders/zanchen/restart-browser", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ siteId: activeTab })
                })
              }}
            >
              重启浏览器
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // Determine platform filter for current tab
                const platform = getTabPlatform(activeTab) || ""
                const url = `/api/online-orders/export${platform ? `?platform=${encodeURIComponent(platform)}` : ""}`
                window.open(url, "_blank")
              }}
            >
              导出 CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              {importing
                ? importProgress
                  ? `导入中 ${importProgress.processed}/${importProgress.total}...`
                  : "导入中..."
                : "导入 CSV"}
            </Button>
            {importing && importProgress && (
              <div className="flex items-center gap-1.5 min-w-[120px]">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.round((importProgress.processed / importProgress.total) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {Math.round((importProgress.processed / importProgress.total) * 100)}%
                </span>
              </div>
            )}
            {importErrorRows && importErrorRows.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/50"
                onClick={() => {
                  // Build CSV with errorReason inserted as 3rd column
                  const headers = [...importDataHeaders]
                  // Insert errorReason after 2nd column (index 2)
                  const insertAt = Math.min(2, headers.length)
                  const outHeaders = [...headers.slice(0, insertAt), "errorReason", ...headers.slice(insertAt)]
                  const escapeCell = (v: string) => v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v
                  const csvLines = [outHeaders.map(escapeCell).join(",")]
                  for (const { row, reason } of importErrorRows) {
                    const cells = headers.map(h => row[h] ?? "")
                    cells.splice(insertAt, 0, reason)
                    csvLines.push(cells.map(escapeCell).join(","))
                  }
                  const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8" })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement("a")
                  a.href = url
                  a.download = "import_errors.csv"
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                下载异常文件 ({importErrorRows.length})
              </Button>
            )}
            <input
              ref={importInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setImportErrorRows(null)
                setImporting(true)
                setImportProgress(null)
                try {
                  const fd = new FormData()
                  fd.append("file", file)
                  const res = await fetch("/api/online-orders/import", { method: "POST", body: fd })
                  if (!res.ok || !res.body) {
                    toast.error("导入失败")
                    return
                  }
                  const reader = res.body.getReader()
                  const decoder = new TextDecoder()
                  let buf = ""
                  let lastUpserted = 0, lastFailed = 0
                  while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    buf += decoder.decode(value, { stream: true })
                    const lines = buf.split("\n")
                    buf = lines.pop() ?? ""
                    for (const line of lines) {
                      if (!line.trim()) continue
                      try {
                        const msg = JSON.parse(line)
                        if (msg.type === "progress" || msg.type === "done") {
                          setImportProgress({ processed: msg.processed ?? msg.total, total: msg.total })
                          lastUpserted = msg.upserted
                          lastFailed = msg.failed
                        }
                        if (msg.type === "done") {
                          toast.success(`导入完成：${lastUpserted} 条成功${lastFailed ? `，${lastFailed} 条失败` : ""}`)
                          if (msg.errorRows?.length > 0) {
                            setImportErrorRows(msg.errorRows)
                            setImportDataHeaders(msg.dataHeaders ?? [])
                          } else {
                            setImportErrorRows(null)
                          }
                          setDbRefreshKey(k => k + 1)
                        }
                        if (msg.type === "start") {
                          setImportProgress({ processed: 0, total: msg.total })
                        }
                      } catch { /* ignore parse errors */ }
                    }
                  }
                } catch {
                  toast.error("导入失败")
                } finally {
                  setImporting(false)
                  setImportProgress(null)
                  e.target.value = ""
                }
              }}
            />
            {canClearOrders && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={async () => {
                const targetSite = config.sites.find(s => s.id === activeTab)
                const siteName = targetSite?.name || ""
                const platform = getTabPlatform(activeTab) || ""
                if (!platform) return
                if (!confirm(`确定要清空 ${siteName || platform} 的所有订单吗？此操作不可撤销。`)) return
                const res = await fetch("/api/online-orders/clear", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ platform })
                })
                const data = await res.json()
                if (data.success) {
                  toast.success(`已清空 ${data.deleted} 条订单`)
                  setDbRefreshKey(k => k + 1)
                } else {
                  toast.error(data.error || "清空失败")
                }
              }}
            >
              清空订单
            </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLogsOpen(true)}
            >
              <FileText className="h-4 w-4 mr-1" />
              查看日志 {currentStatus?.status === "running" && <span className="ml-1 animate-pulse">●</span>}
            </Button>
            
            <SyncLogsDialog 
              siteId={activeTab} 
              open={logsOpen} 
              onOpenChange={setLogsOpen} 
            />
          </>
        ) : null}
        </div>
      </div>

      {config.sites.length > 0 ? (
        <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setActiveSiteId(val) }} className="w-full">
          {/* Global filter area - above platform tabs */}
          <div className="space-y-3 mb-3">
            <Tabs value={filterStatus} onValueChange={(val) => { setFilterStatus(val); setOnlineOrderPage(1); }} className="w-full">
              <TabsList className="flex flex-wrap h-auto w-full justify-start">
                <TabsTrigger value="ALL">全部 ({statusTotal})</TabsTrigger>
                <TabsTrigger value="WAIT_PAY">待支付 ({statusCounts['WAIT_PAY'] || 0})</TabsTrigger>
                <TabsTrigger value="PENDING_REVIEW">待审核 ({statusCounts['PENDING_REVIEW'] || 0})</TabsTrigger>
                <TabsTrigger value="PENDING_SHIPMENT">待发货 ({statusCounts['PENDING_SHIPMENT'] || 0})</TabsTrigger>
                <TabsTrigger value="SHIPPED">已发货 ({statusCounts['SHIPPED'] || 0})</TabsTrigger>
                <TabsTrigger value="PENDING_RECEIPT">待收货 ({statusCounts['PENDING_RECEIPT'] || 0})</TabsTrigger>
                <TabsTrigger value="RENTING">待归还 ({statusCounts['RENTING'] || 0})</TabsTrigger>
                <TabsTrigger value="RETURNING">归还中 ({statusCounts['RETURNING'] || 0})</TabsTrigger>
                <TabsTrigger value="OVERDUE">已逾期 ({statusCounts['OVERDUE'] || 0})</TabsTrigger>
                <TabsTrigger value="DUE_REPAYMENT">待结算 ({statusCounts['DUE_REPAYMENT'] || 0})</TabsTrigger>
                <TabsTrigger value="BOUGHT_OUT">已买断 ({statusCounts['BOUGHT_OUT'] || 0})</TabsTrigger>
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
                <Input
                  placeholder="设备SN"
                  value={filterSn}
                  onChange={e => { setFilterSn(e.target.value); setOnlineOrderPage(1); }}
                  className="h-8 w-[120px]"
                />
                <Select value={matchFilter} onValueChange={(v) => { setMatchFilter(v as 'ALL' | 'MATCHED' | 'UNMATCHED'); setOnlineOrderPage(1); }}>
                  <SelectTrigger className="h-8 w-[140px]">
                    <SelectValue placeholder="匹配规格" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部</SelectItem>
                    <SelectItem value="MATCHED">已匹配规格</SelectItem>
                    <SelectItem value="UNMATCHED">未匹配规格</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterPlatformSearch || "ALL"} onValueChange={(v) => { setFilterPlatformSearch(v === "ALL" ? "" : v); setOnlineOrderPage(1); }}>
                  <SelectTrigger className="h-8 w-[120px]">
                    <SelectValue placeholder="平台" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部平台</SelectItem>
                    {config.sites.filter(s => !s.hidden).map(site => {
                      const platform = getTabPlatform(site.id)
                      if (!platform) return null
                      return <SelectItem key={site.id} value={platform}>{site.name}</SelectItem>
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const blob = new Blob(["\uFEFForderNo,manualSn\n"], { type: "text/csv;charset=utf-8" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = "sn_update_template.csv"
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  导出SN模板
                </Button>
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
          </div>
          <TabsList className="flex flex-wrap">
            {config.sites.filter(s => !s.hidden).map(site => (
              <TabsTrigger key={site.id} value={site.id}>
                {site.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {config.sites.filter(s => !s.hidden).map(site => (
            <TabsContent key={site.id} value={site.id}>
              {site.id === "zanchen" || site.id === "chenlin" || site.id === "aolzu" || site.id === "youpin" || site.id === "llxzu" || site.id === "rrz" || site.name.includes("诚赁") || site.name.includes("奥租") || site.name.includes("优品") || site.name.includes("零零享") || site.name.includes("人人租") ? (
                <div className="space-y-4">
                  {site.id === "zanchen" && !site.selectors.order_list_container?.trim() ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      需要填写订单列表容器选择器才能抓取订单
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {site.enabled ? (
                          (site.id === "zanchen" || site.id === "chenlin" || site.id === "aolzu" || site.id === "youpin" || site.id === "llxzu" || site.id === "rrz" || site.name.includes("诚赁") || site.name.includes("奥租") || site.name.includes("优品") || site.name.includes("零零享") || site.name.includes("人人租"))
                            ? (
                                <>
                                {currentStatus?.status === "running" ? "正在同步中..." : (() => {
                                  const siteIdToMetaKey: Record<string, string> = { zanchen: "ZANCHEN", chenlin: "诚赁", aolzu: "奥租", youpin: "优品租", llxzu: "零零享", rrz: "人人租" }
                                  const metaKey = siteIdToMetaKey[site.id] ?? site.name
                                  const lastAt = currentStatus?.lastRunAt || syncMeta[metaKey]?.lastSyncAt
                                  return lastAt ? `最近抓取: ${new Date(lastAt).toLocaleString()}` : "等待启动"
                                })()}
                                {currentStatus?.message && <span className="ml-2 text-blue-600">[{currentStatus.message}]</span>}
                                </>
                              )
                            : "自动同步已启用"
                      ) : "该平台未启用"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {currentStatus?.status === "awaiting_user" && (
                      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-blue-700 flex justify-between items-center gap-2">
                        <div>
                            <p className="font-medium">需要人工介入</p>
                            <p className="text-sm">请在弹出的浏览器完成验证码或短信验证后等待系统继续。</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            {(activeTab === "youpin" || config.sites.find(s => s.id === activeTab)?.name.includes("优品")) && (
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    className="bg-white border hover:bg-blue-100"
                                    onClick={async () => {
                                        await fetch("/api/online-orders/youpin/clear-session", { method: "POST" })
                                    }}
                                >
                                    清除登录状态
                                </Button>
                            )}
                            <Button 
                                size="sm" 
                                variant="secondary" 
                                className="bg-white border hover:bg-blue-100"
                                onClick={() => window.open(`/online-orders/remote-auth?siteId=${encodeURIComponent(activeTab)}`, "_blank")}
                            >
                                <MonitorPlay className="w-4 h-4 mr-2" />
                                打开远程操作
                            </Button>
                        </div>
                      </div>
                    )}
                    
                    <div className="rounded-md border bg-white relative min-h-[200px]">
                        {dbLoading ? (
                          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10">
                            <span className="text-sm text-muted-foreground">加载中...</span>
                          </div>
                        ) : null}
                        <Table className="table-fixed min-w-[1800px]">
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
                              <TableHead className="w-[300px]">物流信息</TableHead>
                              <TableHead className="w-[120px]">设备SN</TableHead>
                              <TableHead className="w-[200px]">设备信息</TableHead>
                              <TableHead className="w-[200px]">匹配规格</TableHead>
                              <TableHead className="w-[100px]">匹配状态</TableHead>
                              <TableHead className="w-[150px]">租期/时间</TableHead>
                              <TableHead className="w-[120px]">金额详情</TableHead>
                              <TableHead className="w-[100px]">状态</TableHead>
                              <TableHead className="w-[150px]">备注</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {onlineOrderDisplay.map((order, i) => {
                              const isMatchOpen = matchOrderId === order.id
                              const fallbackProductId = isMatchOpen ? matchProductId : resolveMatchProductId(order)
                              const matchOptions = getMatchSpecOptions(fallbackProductId)
                              const matchedSpecInfo = (() => {
                                if (!order.specId) return null
                                const directProduct = order.productId ? products.find(p => p.id === order.productId) : undefined
                                const directSpec = directProduct?.specs?.find(s => s.id === order.specId)
                                if (directProduct && directSpec) {
                                  return { productName: directProduct.name, specName: directSpec.name }
                                }
                                for (const p of products) {
                                  const s = p.specs?.find(s => s.id === order.specId)
                                  if (s) return { productName: p.name, specName: s.name }
                                }
                                return null
                              })()

                              const displayText = order.specId
                                ? (matchedSpecInfo
                                  ? `${matchedSpecInfo.productName}${matchedSpecInfo.specName ? ` - ${matchedSpecInfo.specName}` : ""}`
                                  : `${order.productName || ""}${order.variantName ? ` - ${order.variantName}` : ""}`)
                                : ""
                              const deviceProductName = order.productName
                              const deviceVariantName = order.variantName

                              return (
                              <TableRow key={`${order.orderNo}-${i}`}>
                                <TableCell>
                                  <div className="text-xs truncate" title={platformMap[order.platform || ""] || order.platform || "-"}>
                                    {platformMap[order.platform || ""] || order.platform || "-"}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs text-muted-foreground truncate" title={order.merchantName || "-"}>
                                    {order.merchantName || "-"}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs text-muted-foreground truncate" title={order.promotionChannel || "-"}>
                                    {order.promotionChannel || "-"}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs font-bold truncate" title={order.orderNo}>{order.orderNo}</div>
                                  <div className="text-[10px] text-muted-foreground mt-1 truncate" title={new Date(order.createdAt).toLocaleString()}>
                                    {new Date(order.createdAt).toLocaleString()}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs text-muted-foreground">
                                    {(order.customerName || order.recipientName || order.recipientPhone) && (
                                      <div className="truncate" title={`${order.customerName || order.recipientName || "-"} | ${order.recipientPhone || "-"}`}>
                                        {order.customerName || order.recipientName || "-"} <span className="mx-1">|</span>{" "}
                                        {order.recipientPhone || "-"}
                                      </div>
                                    )}
                                    <div className="truncate" title={order.address || ""}>{order.address}</div>
                                  </div>
                                  {(order.logisticsCompany || order.trackingNumber || order.latestLogisticsInfo) ? (
                                    <div className="space-y-1 pt-2 border-t border-dashed border-gray-200">
                                      <div className="text-[10px] font-semibold text-gray-500">发货物流</div>
                                      <div className="text-[10px]">
                                        {order.logisticsCompany && (
                                          <div className="flex items-center text-blue-600 font-medium truncate" title={order.logisticsCompany}>
                                            <Truck className="w-3 h-3 mr-1 flex-shrink-0" />
                                            {order.logisticsCompany}
                                          </div>
                                        )}
                                        {order.trackingNumber ? (
                                          <div className="font-mono text-gray-600 truncate" title={order.trackingNumber}>{order.trackingNumber}</div>
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
                                          <div className="flex items-center text-purple-600 font-medium truncate" title={order.returnLogisticsCompany}>
                                            {order.returnLogisticsCompany}
                                          </div>
                                        )}
                                        {order.returnTrackingNumber ? (
                                          <div className="font-mono text-gray-600 truncate" title={order.returnTrackingNumber}>
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
                                    <Popover
                                        open={editSnOrderId === order.id}
                                        onOpenChange={(open) => {
                                            if (open) {
                                                setEditSnOrderId(order.id)
                                                setEditSnValue(order.manualSn || "")
                                            } else {
                                                setEditSnOrderId(null)
                                            }
                                        }}
                                    >
                                        <PopoverTrigger asChild>
                                            <div className="flex items-center gap-1 cursor-pointer group">
                                                <div className={cn("text-xs truncate max-w-[100px]", !order.manualSn && "text-muted-foreground italic")}>
                                                    {order.manualSn || "点击输入"}
                                                </div>
                                                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50" />
                                            </div>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-60 p-3">
                                             <div className="space-y-2">
                                                 <h4 className="font-medium leading-none text-sm">设备 SN</h4>
                                                 <Input
                                                     value={editSnValue}
                                                     onChange={(e) => setEditSnValue(e.target.value)}
                                                     placeholder="输入设备 SN"
                                                     className="h-8 text-xs"
                                                 />
                                                <div className="flex justify-end gap-2 pt-1">
                                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditSnOrderId(null)}>取消</Button>
                                                    <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveManualSn(order.id)}>保存</Button>
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </TableCell>
                                <TableCell>
                                  <div className="font-semibold truncate" title={deviceProductName || ""}>{deviceProductName}</div>
                                  {order.itemTitle && !isSameDeviceText(order.itemTitle, deviceProductName) && !isSameDeviceText(order.itemTitle, deviceVariantName) ? (
                                    <div className="text-[10px] text-muted-foreground truncate" title={order.itemTitle}>{order.itemTitle}</div>
                                  ) : null}
                                  {deviceVariantName ? (
                                    <div className="text-xs text-muted-foreground truncate" title={deviceVariantName}>{deviceVariantName}</div>
                                  ) : null}
                                  {order.itemSku && !isSameDeviceText(order.itemSku, deviceVariantName) && !isSameDeviceText(order.itemSku, deviceProductName) && !isSameDeviceText(order.itemSku, order.itemTitle) ? (
                                    <div className="text-[10px] text-muted-foreground mt-1 truncate" title={order.itemSku}>{order.itemSku}</div>
                                  ) : null}
                                  {order.sn ? (
                                    <div className="text-xs text-blue-600 font-mono mt-1 truncate" title={`SN: ${order.sn}`}>SN: {order.sn}</div>
                                  ) : null}
                                </TableCell>
                                <TableCell>
                                  <Popover
                                    open={isMatchOpen}
                                    onOpenChange={open => {
                                      if (open) {
                                        const pid = resolveMatchProductId(order)
                                        setMatchOrderId(order.id)
                                        setMatchProductId(pid)
                                        setMatchSpecValue(resolveMatchSpecValue(order, pid))
                                      } else if (isMatchOpen) {
                                        setMatchOrderId(null)
                                      }
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <PopoverTrigger asChild>
                                        <div className="flex items-center gap-1 cursor-pointer group">
                                            <div className="text-xs hover:underline decoration-dashed underline-offset-4 text-gray-700 truncate max-w-[150px]">
                                            {displayText || <span className="text-gray-300 italic text-[10px]">点击选择</span>}
                                            </div>
                                            <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50" />
                                        </div>
                                      </PopoverTrigger>
                                      {order.specId ? (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 px-2 text-[10px]"
                                          onClick={async () => {
                                            if (!order.productName || !order.variantName) {
                                              toast.error("该订单缺少设备信息，无法同步")
                                              return
                                            }
                                            const ok = window.confirm("确认同步匹配规格到所有商品标题+SKU完全一致且未匹配的订单？")
                                            if (!ok) return
                                            try {
                                              const res = await syncOnlineOrderMatchSpec(order.id)
                                              if (res?.success) {
                                                toast.success(`已同步 ${res.updated} 条订单`)
                                                setDbRefreshKey(key => key + 1)
                                              } else {
                                                toast.error("同步失败")
                                              }
                                            } catch (err) {
                                              toast.error(err instanceof Error ? err.message : "同步失败")
                                            }
                                          }}
                                        >
                                          规格同步
                                        </Button>
                                      ) : null}
                                    </div>
                                    <PopoverContent className="w-72 p-3">
                                      <div className="space-y-3">
                                        <div className="space-y-1">
                                          <Label className="text-xs">商品</Label>
                                          <SearchableSelect
                                            options={products.map(p => ({ value: p.id, label: p.name }))}
                                            value={fallbackProductId || undefined}
                                            onValueChange={value => {
                                              setMatchProductId(value)
                                              setMatchSpecValue("")
                                            }}
                                            placeholder="选择商品"
                                            searchPlaceholder="搜索商品..."
                                            triggerClassName="h-8 text-xs"
                                            className="w-64"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">规格</Label>
                                          <SearchableSelect
                                            options={matchOptions.map(v => ({ value: v.id, label: v.name }))}
                                            value={matchSpecValue || undefined}
                                            onValueChange={setMatchSpecValue}
                                            placeholder={fallbackProductId ? "选择规格" : "先选择商品"}
                                            searchPlaceholder="搜索规格..."
                                            disabled={!fallbackProductId}
                                            triggerClassName="h-8 text-xs"
                                            className="w-64"
                                          />
                                        </div>
                                        {matchSpecValue ? (
                                          <div className="space-y-1">
                                            <Label className="text-xs">规格资产</Label>
                                            <div className="text-xs text-muted-foreground space-y-1">
                                              {getMatchBomItems(fallbackProductId, matchSpecValue).length > 0 ? (
                                                getMatchBomItems(fallbackProductId, matchSpecValue).map((b, idx) => (
                                                  <div key={`${b.itemTypeId}-${idx}`} className="flex items-center justify-between">
                                                    <span>{b.itemTypeName || b.itemTypeId}</span>
                                                    <span className="font-mono">x{b.quantity}</span>
                                                  </div>
                                                ))
                                              ) : (
                                                <div className="text-gray-400 italic text-[10px]">无规格资产</div>
                                              )}
                                            </div>
                                          </div>
                                        ) : null}
                                        <div className="flex justify-end gap-2 pt-1">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => handleClearMatchSpec(order.id)}
                                          >
                                            清空
                                          </Button>
                                          <Button
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => handleSaveMatchSpec(order.id)}
                                            disabled={!matchSpecValue}
                                          >
                                            保存
                                          </Button>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={
                                      order.specId
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : "bg-gray-50 text-gray-500 border-gray-200"
                                    }
                                  >
                                    {order.specId ? "已匹配" : "未匹配"}
                                  </Badge>
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
                                  <div className="text-xs truncate" title={order.remark || ""}>{order.remark || ""}</div>
                                </TableCell>
                              </TableRow>
                              )
                            })}
                            {onlineOrderDisplay.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={12} className="text-center h-20">
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
