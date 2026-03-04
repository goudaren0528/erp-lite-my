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
  const lastMousePos = useRef<{ x: number; y: number } | null>(null)
  const lastMoveSentAt = useRef(0)
  const actionQueue = useRef(Promise.resolve())

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

  const sendAction = (payload: Record<string, unknown>) => {
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
      setTimeout(() => setTimestamp((t) => t + 1), 600)
    }

    actionQueue.current = actionQueue.current.then(run, run)
    return actionQueue.current
  }

  const getCoords = (e: React.MouseEvent) => {
    const img = imgRef.current
    if (!img) return { x: 0, y: 0 }
    
    const rect = img.getBoundingClientRect()
    const scaleX = img.naturalWidth / rect.width
    const scaleY = img.naturalHeight / rect.height
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsInteracting(true)
    const { x, y } = getCoords(e)
    lastMousePos.current = { x, y }
    lastMoveSentAt.current = Date.now()
    // Only move to position on mousedown, don't send mousedown yet
    // We'll decide click vs drag on mouseup
    sendAction({ type: "mousemove", x, y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isInteracting) return
    const now = Date.now()
    if (now - lastMoveSentAt.current < 50) return
    lastMoveSentAt.current = now
    const { x, y } = getCoords(e)
    sendAction({ type: "mousemove", x, y })
  }

  const handleMouseUp = async (e: React.MouseEvent) => {
    if (!isInteracting) return
    setIsInteracting(false)
    const { x, y } = getCoords(e)

    const dist = lastMousePos.current
      ? Math.sqrt(Math.pow(x - lastMousePos.current.x, 2) + Math.pow(y - lastMousePos.current.y, 2))
      : 0

    if (dist < 5) {
      // Clean single click — move then click (Playwright mouse.click handles down+up internally)
      await sendAction({ type: "mousemove", x, y })
      await sendAction({ type: "click", x, y })
    } else {
      // Drag: send mousedown at start, move, then mouseup at end
      if (lastMousePos.current) {
        await sendAction({ type: "mousedown" })
      }
      await sendAction({ type: "mousemove", x, y })
      await sendAction({ type: "mouseup" })
    }
  }

  const handleType = () => {
    if (!inputText) return
    sendAction({ type: "type", text: inputText })
      .then(() => toast.success("已发送文本"))
      .catch(() => toast.error("发送失败"))
    setInputText("")
  }

  const handlePressKey = (key: string) => {
    sendAction({ type: "press", key })
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
            <img
              key={activeSite}
              ref={imgRef}
              src={`/api/online-orders/remote/screenshot?siteId=${activeSite}&t=${timestamp}`}
              alt="Remote Screen"
              className="max-w-full h-auto cursor-crosshair select-none active:cursor-grabbing"
              draggable={false}
              onLoad={() => { setLoading(false); setSessionActive(true) }}
              onError={() => { setSessionActive(false); setLoading(false) }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
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
