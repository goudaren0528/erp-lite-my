"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, RefreshCw, MousePointer2, Keyboard, MonitorPlay } from "lucide-react"
import { toast } from "sonner"

export default function RemoteAuthPage() {
  const [timestamp, setTimestamp] = useState(1)
  const [loading, setLoading] = useState(false)
  const [inputText, setInputText] = useState("")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [isInteracting, setIsInteracting] = useState(false)
  const [activeSite, setActiveSite] = useState("zanchen")
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastDownPos = useRef<{ x: number; y: number } | null>(null)
  const lastSentPos = useRef<{ x: number; y: number } | null>(null)
  const lastFocusPos = useRef<{ x: number; y: number } | null>(null)
  const lastMoveSentAt = useRef(0)
  const actionQueue = useRef(Promise.resolve())
  const isInteractingRef = useRef(false)
  const pendingScreenshotRefreshRef = useRef(false)
  const trailPointsRef = useRef<Array<{ x: number; y: number }>>([])
  const trailClearTimerRef = useRef<number | null>(null)

  // Pre-defined sites list (could be fetched from API in future)
  const sites = [
    { id: "zanchen", name: "赞晨" },
    { id: "chenglin", name: "诚赁" },
    { id: "aolzu", name: "奥租" },
    { id: "youpin", name: "优品租" },
    { id: "llxzu", name: "零零享" },
    { id: "rrz", name: "人人租" }
  ]

  const [sessionActive, setSessionActive] = useState(true)

  const triggerSync = async () => {
    try {
      await fetch(`/api/online-orders/zanchen/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: activeSite }),
      })
      toast.success("已触发同步，浏览器启动中...")
    } catch {
      toast.error("触发失败")
    }
  }

  // Auto-refresh screenshot interval (single interval, 1s)
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (autoRefresh && !isInteracting) {
      interval = setInterval(() => setTimestamp((t) => t + 1), 1000)
    }
    return () => clearInterval(interval)
  }, [autoRefresh, isInteracting])

  useEffect(() => {
    isInteractingRef.current = isInteracting
    if (!isInteracting && pendingScreenshotRefreshRef.current) {
      pendingScreenshotRefreshRef.current = false
      setTimeout(() => setTimestamp((t) => t + 1), 200)
    }
  }, [isInteracting])

  const ensureCanvasSize = () => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return
    const rect = img.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
  }

  const clearTrail = () => {
    trailPointsRef.current = []
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const drawTrail = () => {
    ensureCanvasSize()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const pts = trailPointsRef.current
    if (pts.length < 2) return
    const dpr = window.devicePixelRatio || 1
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.strokeStyle = "rgba(59, 130, 246, 0.75)"
    ctx.lineWidth = 3 * dpr
    ctx.beginPath()
    ctx.moveTo(pts[0].x * dpr, pts[0].y * dpr)
    for (let i = 1; i < pts.length; i += 1) {
      ctx.lineTo(pts[i].x * dpr, pts[i].y * dpr)
    }
    ctx.stroke()
    const last = pts[pts.length - 1]
    ctx.fillStyle = "rgba(59, 130, 246, 0.9)"
    ctx.beginPath()
    ctx.arc(last.x * dpr, last.y * dpr, 4 * dpr, 0, Math.PI * 2)
    ctx.fill()
  }

  const sendAction = (payload: Record<string, unknown>, options?: { delayAfterMs?: number }) => {
    const run = async () => {
      const res = await fetch("/api/online-orders/remote/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, siteId: activeSite }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || `HTTP ${res.status}`)
      }
      if (isInteractingRef.current) {
        pendingScreenshotRefreshRef.current = true
      } else {
        setTimeout(() => setTimestamp((t) => t + 1), 600)
      }
      if (options?.delayAfterMs && options.delayAfterMs > 0) {
        await new Promise((r) => setTimeout(r, options.delayAfterMs))
      }
    }

    actionQueue.current = actionQueue.current.then(run, run)
    return actionQueue.current
  }

  const getCoords = (clientX: number, clientY: number) => {
    const img = imgRef.current
    if (!img) return { x: 0, y: 0 }
    
    const rect = img.getBoundingClientRect()
    const scaleX = img.naturalWidth / rect.width
    const scaleY = img.naturalHeight / rect.height
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    }
  }

  const getDisplayCoords = (clientX: number, clientY: number) => {
    const img = imgRef.current
    if (!img) return { x: 0, y: 0 }
    const rect = img.getBoundingClientRect()
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    imgRef.current?.setPointerCapture?.(e.pointerId)
    setIsInteracting(true)
    if (trailClearTimerRef.current) {
      window.clearTimeout(trailClearTimerRef.current)
      trailClearTimerRef.current = null
    }
    trailPointsRef.current = [getDisplayCoords(e.clientX, e.clientY)]
    drawTrail()
    const { x, y } = getCoords(e.clientX, e.clientY)
    lastDownPos.current = { x, y }
    lastSentPos.current = { x, y }
    lastMoveSentAt.current = Date.now()
    void sendAction({ type: "mousedown", x, y }, { delayAfterMs: 16 + Math.floor(Math.random() * 20) })
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isInteracting) return
    e.preventDefault()
    const now = Date.now()
    if (now - lastMoveSentAt.current < 30) return
    lastMoveSentAt.current = now
    const disp = getDisplayCoords(e.clientX, e.clientY)
    const pts = trailPointsRef.current
    const last = pts[pts.length - 1]
    const ddx = disp.x - (last?.x ?? disp.x)
    const ddy = disp.y - (last?.y ?? disp.y)
    const d = Math.sqrt(ddx * ddx + ddy * ddy)
    if (d >= 2) {
      pts.push(disp)
      if (pts.length > 240) pts.splice(0, pts.length - 240)
      drawTrail()
    }
    const { x, y } = getCoords(e.clientX, e.clientY)
    const prev = lastSentPos.current
    lastSentPos.current = { x, y }
    if (!prev) {
      void sendAction({ type: "mousemove", x, y }, { delayAfterMs: 10 + Math.floor(Math.random() * 18) })
      return
    }
    const dx = x - prev.x
    const dy = y - prev.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const steps = Math.max(1, Math.min(18, Math.ceil(dist / 12)))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const jitter = (Math.random() - 0.5) * 2.2
      const ix = prev.x + dx * ease
      const iy = prev.y + dy * ease + jitter
      void sendAction(
        { type: "mousemove", x: ix, y: iy },
        { delayAfterMs: 8 + Math.floor(Math.random() * 20) }
      )
    }
  }

  const handlePointerUp = async (e: React.PointerEvent) => {
    if (!isInteracting) return
    e.preventDefault()
    setIsInteracting(false)
    const { x, y } = getCoords(e.clientX, e.clientY)
    lastFocusPos.current = { x, y }
    try {
      imgRef.current?.releasePointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }
    const disp = getDisplayCoords(e.clientX, e.clientY)
    trailPointsRef.current.push(disp)
    drawTrail()
    trailClearTimerRef.current = window.setTimeout(() => {
      clearTrail()
      trailClearTimerRef.current = null
    }, 1200)
    await sendAction({ type: "mousemove", x, y }, { delayAfterMs: 12 + Math.floor(Math.random() * 24) })
    await sendAction({ type: "mouseup", x, y }, { delayAfterMs: 30 + Math.floor(Math.random() * 60) })
  }

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (!isInteracting) return
    e.preventDefault()
    setIsInteracting(false)
    trailClearTimerRef.current = window.setTimeout(() => {
      clearTrail()
      trailClearTimerRef.current = null
    }, 800)
    void sendAction({ type: "mouseup" })
  }

  const handleType = () => {
    if (!inputText) return
    const focus = lastFocusPos.current
    const run = async () => {
      if (focus) {
        await sendAction({ type: "click", x: focus.x, y: focus.y })
      }
      await sendAction({ type: "type", text: inputText })
    }
    run()
      .then(() => toast.success("已发送文本"))
      .catch(() => toast.error("发送失败"))
    setInputText("")
  }

  const handlePressKey = (key: string) => {
    const focus = lastFocusPos.current
    const run = async () => {
      if (focus) {
        await sendAction({ type: "click", x: focus.x, y: focus.y })
      }
      await sendAction({ type: "press", key })
    }
    run()
      .then(() => toast.success(`已发送按键: ${key}`))
      .catch(() => toast.error("发送失败"))
  }

  return (
    <div className="container mx-auto p-4 max-w-5xl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MonitorPlay className="w-5 h-5" />
            远程人工介入
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex border rounded-md overflow-hidden mr-2">
              {sites.map(site => (
                <button
                  key={site.id}
                  onClick={() => {
                      setSessionActive(true)
                      setActiveSite(site.id)
                      setLoading(true)
                      setTimestamp((t) => t + 1)
                  }}
                  className={`px-3 py-1 text-sm font-medium transition-colors ${
                    activeSite === site.id 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {site.name}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? "bg-green-50 text-green-600 border-green-200" : ""}
            >
              {autoRefresh ? "自动刷新中" : "自动刷新已暂停"}
            </Button>
            <Button 
                variant="secondary"
                size="sm"
                onClick={() => {
                    if(confirm("确定要刷新远程网页吗？这相当于在远程浏览器按F5。")) {
                        sendAction({ type: "reload" })
                        toast.success("刷新指令已发送")
                    }
                }}
                title="相当于在远程浏览器按F5"
            >
                <RefreshCw className="w-4 h-4 mr-1" />
                F5刷新页面
            </Button>
            <Button size="sm" onClick={() => setTimestamp((t) => t + 1)}>
              <MonitorPlay className="w-4 h-4 mr-1" />
              刷新截图
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-100 rounded-lg overflow-hidden border relative flex justify-center min-h-[400px] items-center">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 z-10 pointer-events-none"
            />
            <img
              key={activeSite}
              ref={imgRef}
              src={`/api/online-orders/remote/screenshot?siteId=${activeSite}&t=${timestamp}`}
              alt="Remote Screen"
              className="max-w-full h-auto cursor-crosshair select-none active:cursor-grabbing touch-none"
              draggable={false}
              onLoad={() => { setLoading(false); setSessionActive(true) }}
              onError={() => { setSessionActive(false); setLoading(false) }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            />
            {!sessionActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-gray-100">
                <p className="text-muted-foreground text-sm">浏览器未启动或会话不可用</p>
                <Button size="sm" onClick={triggerSync}>启动 {sites.find(s => s.id === activeSite)?.name} 浏览器</Button>
              </div>
            )}
            {loading && sessionActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[1px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Keyboard className="w-4 h-4" />
                文本输入
              </h3>
              <div className="flex gap-2">
                <Input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="输入验证码或文本..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        handleType()
                    } else if (e.key === "Backspace" && inputText === "") {
                        handlePressKey("Backspace")
                    }
                  }}
                />
                <Button onClick={handleType}>发送</Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => handlePressKey("Enter")}>Enter</Button>
                <Button variant="outline" size="sm" onClick={() => handlePressKey("Backspace")}>Backspace</Button>
                <Button variant="outline" size="sm" onClick={() => handlePressKey("Tab")}>Tab</Button>
                <Button variant="outline" size="sm" onClick={() => handlePressKey("Escape")}>Esc</Button>
                <Button variant="outline" size="sm" onClick={() => handlePressKey("ArrowDown")}>↓</Button>
                <Button variant="outline" size="sm" onClick={() => handlePressKey("ArrowUp")}>↑</Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <MousePointer2 className="w-4 h-4" />
                操作说明
              </h3>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>直接点击图片可模拟鼠标点击</li>
                <li>按住鼠标拖动可模拟滑块拖拽</li>
                <li>在左侧输入框输入文本后点击发送</li>
                <li>若画面卡顿，可尝试手动刷新</li>
                <li>操作后画面会有约1秒延迟</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
