"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, RefreshCw, MousePointer2, Keyboard, MonitorPlay } from "lucide-react"
import { toast } from "sonner"

export default function RemoteAuthPage() {
  const [timestamp, setTimestamp] = useState(Date.now())
  const [loading, setLoading] = useState(true)
  const [inputText, setInputText] = useState("")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [isInteracting, setIsInteracting] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const lastMousePos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (autoRefresh && !isInteracting) {
      interval = setInterval(() => {
        setTimestamp(Date.now())
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [autoRefresh, isInteracting])

  const sendAction = async (payload: any) => {
    try {
      await fetch("/api/online-orders/remote/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      // Refresh shortly after action
      setTimeout(() => setTimestamp(Date.now()), 500)
    } catch (e) {
      console.error(e)
    }
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
    
    // For simple click, we can just send move & down
    // But to support drag, we need to track movement
    sendAction({ type: "mousemove", x, y })
    sendAction({ type: "mousedown" })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isInteracting) return
    const { x, y } = getCoords(e)
    // Throttle? For now just send
    sendAction({ type: "mousemove", x, y })
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isInteracting) return
    setIsInteracting(false)
    const { x, y } = getCoords(e)
    
    // Check for click (small movement, short time could be checked if we tracked time)
    // Here we just check distance
    const dist = lastMousePos.current 
        ? Math.sqrt(Math.pow(x - lastMousePos.current.x, 2) + Math.pow(y - lastMousePos.current.y, 2)) 
        : 0
        
    if (dist < 5) {
        // It's a click
        sendAction({ type: "click", x, y })
    } else {
        // It's a drag release
        sendAction({ type: "mouseup" })
    }
  }

  const handleType = () => {
    if (!inputText) return
    sendAction({ type: "type", text: inputText })
    setInputText("")
    toast.success("已发送文本")
  }

  const handlePressKey = (key: string) => {
    sendAction({ type: "press", key })
    toast.success(`已发送按键: ${key}`)
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? "bg-green-50 text-green-600 border-green-200" : ""}
            >
              {autoRefresh ? "自动刷新中" : "自动刷新已暂停"}
            </Button>
            <Button size="sm" onClick={() => setTimestamp(Date.now())}>
              <RefreshCw className="w-4 h-4 mr-1" />
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-100 rounded-lg overflow-hidden border relative flex justify-center">
             {/* 
                We use onDragStart false to prevent browser native image drag.
                Use pointer events? React Mouse events work fine usually.
             */}
            <img
              ref={imgRef}
              src={`/api/online-orders/remote/screenshot?t=${timestamp}`}
              alt="Remote Screen"
              className="max-w-full h-auto cursor-crosshair select-none active:cursor-grabbing"
              draggable={false}
              onLoad={() => setLoading(false)}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
            {loading && (
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
