"use client"

import { useMemo, useState, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { BookOpen, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import ReactMarkdown from 'react-markdown'
import { getEnabledManualChapters } from "@/app/system/manual/actions"

type ManualChapter = { id: string; title: string; content: string }

type ManualHeading = {
    level: number
    text: string
    id: string
}

function stripCodeFences(markdown: string) {
    let result = ""
    const lines = markdown.split(/\r?\n/)
    let inFence = false

    for (const line of lines) {
        if (/^\s*```/.test(line)) {
            inFence = !inFence
            continue
        }
        if (!inFence) result += `${line}\n`
    }

    return result
}

function slugifyHeading(text: string) {
    const cleaned = text
        .trim()
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff]+/g, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "")

    return cleaned || "section"
}

function extractHeadings(markdown: string): ManualHeading[] {
    const lines = stripCodeFences(markdown).split(/\r?\n/)
    const raw: Array<{ level: number; text: string }> = []

    for (const line of lines) {
        const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
        if (!match) continue
        const level = match[1].length
        const text = match[2].trim()
        if (!text) continue
        raw.push({ level, text })
    }

    const minLevel = raw.reduce((acc, h) => Math.min(acc, h.level), Infinity)
    const preferredMin = raw.some((h) => h.level >= 2) ? 2 : minLevel
    const preferredMax = preferredMin + 2

    const filtered = raw.filter((h) => h.level >= preferredMin && h.level <= preferredMax)

    const used: Record<string, number> = {}
    return filtered.map((h, index) => {
        const base = slugifyHeading(h.text)
        const count = (used[base] ?? 0) + 1
        used[base] = count
        const id = count === 1 ? base : `${base}-${count}`
        return { ...h, id: id || `section-${index + 1}` }
    })
}

function extractPlainText(value: unknown): string {
    if (typeof value === "string") return value
    if (typeof value === "number") return String(value)
    if (value == null) return ""
    if (Array.isArray(value)) return value.map(extractPlainText).join("")
    if (typeof value === "object" && "props" in (value as { props?: unknown })) {
        const props = (value as { props?: { children?: unknown } }).props
        return extractPlainText(props?.children)
    }
    return ""
}

export function UserManual({ collapsed }: { collapsed?: boolean }) {
    const [chapters, setChapters] = useState<ManualChapter[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
    const [open, setOpen] = useState(false)

    useEffect(() => {
        if (open) {
            const loadChapters = async () => {
                setIsLoading(true)
                try {
                    const data = await getEnabledManualChapters()
                    setChapters(data)
                    setActiveChapterId((prev) => prev ?? data[0]?.id ?? null)
                } catch (error) {
                    console.error("Failed to load manual chapters", error)
                } finally {
                    setIsLoading(false)
                }
            }
            loadChapters()
        }
    }, [open])

    const activeChapter = chapters.find(c => c.id === activeChapterId) || (chapters.length > 0 ? chapters[0] : null)
    const toc = useMemo(() => extractHeadings(activeChapter?.content ?? ""), [activeChapter?.content])

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                        "w-full text-muted-foreground hover:text-foreground mb-1 h-9",
                        collapsed ? "justify-center px-0" : "justify-start gap-2 px-2 font-normal"
                    )}
                    title="操作指南"
                >
                    <BookOpen className="h-4 w-4" />
                    {!collapsed && <span>操作指南</span>}
                </Button>
            </SheetTrigger>
            <SheetContent className="min-w-[960px] sm:max-w-[960px] flex flex-col p-0 h-full">
                <SheetHeader className="px-6 py-4 border-b shrink-0">
                    <SheetTitle className="flex items-center gap-2 text-xl">
                        <BookOpen className="h-6 w-6 text-primary" />
                        ERP-Lite 核心操作指南
                    </SheetTitle>
                </SheetHeader>
                
                <div className="flex flex-1 overflow-hidden h-full">
                    {/* Sidebar */}
                    <div className="w-64 border-r bg-muted/10 flex flex-col shrink-0">
                        <div className="flex-1 overflow-y-auto py-4">
                            <div className="space-y-1 px-2">
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        加载中...
                                    </div>
                                ) : chapters.map((chapter) => (
                                    <Button
                                        key={chapter.id}
                                        variant={(activeChapter?.id === chapter.id) ? "secondary" : "ghost"}
                                        className="w-full justify-start text-sm font-normal h-auto py-2 whitespace-normal text-left"
                                        onClick={() => setActiveChapterId(chapter.id)}
                                    >
                                        <ChevronRight className={cn("h-3 w-3 mr-2 shrink-0", activeChapter?.id === chapter.id ? "opacity-100" : "opacity-0")} />
                                        <span className="line-clamp-2">{chapter.title}</span>
                                    </Button>
                                ))}
                                {!isLoading && chapters.length === 0 && (
                                    <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                                        暂无内容
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-8 bg-background">
                        {activeChapter ? (
                            <div className="flex gap-8">
                                <div className="min-w-0 flex-1 max-w-none prose prose-sm dark:prose-invert break-words prose-p:my-1 prose-ul:my-2 prose-li:my-0 prose-headings:mt-4 prose-headings:mb-2">
                                    <h2 className="mb-4 text-2xl font-bold">{activeChapter.title}</h2>
                                    {(() => {
                                        const queues = new Map<string, string[]>()
                                        for (const h of toc) {
                                            const key = `${h.level}:${h.text}`
                                            const existing = queues.get(key) ?? []
                                            existing.push(h.id)
                                            queues.set(key, existing)
                                        }

                                        const fallbackUsed: Record<string, number> = {}

                                        const getId = (level: number, text: string) => {
                                            const key = `${level}:${text}`
                                            const queue = queues.get(key)
                                            const next = queue?.shift()
                                            if (next) return next
                                            const base = slugifyHeading(text)
                                            const count = (fallbackUsed[base] ?? 0) + 1
                                            fallbackUsed[base] = count
                                            return count === 1 ? base : `${base}-${count}`
                                        }

                                        return (
                                            <ReactMarkdown
                                                components={{
                                                    h1: ({ children, ...props }) => {
                                                        const text = extractPlainText(children).trim()
                                                        const id = getId(1, text)
                                                        return <h1 id={id} {...props}>{children}</h1>
                                                    },
                                                    h2: ({ children, ...props }) => {
                                                        const text = extractPlainText(children).trim()
                                                        const id = getId(2, text)
                                                        return <h2 id={id} {...props}>{children}</h2>
                                                    },
                                                    h3: ({ children, ...props }) => {
                                                        const text = extractPlainText(children).trim()
                                                        const id = getId(3, text)
                                                        return <h3 id={id} {...props}>{children}</h3>
                                                    },
                                                    h4: ({ children, ...props }) => {
                                                        const text = extractPlainText(children).trim()
                                                        const id = getId(4, text)
                                                        return <h4 id={id} {...props}>{children}</h4>
                                                    },
                                                    h5: ({ children, ...props }) => {
                                                        const text = extractPlainText(children).trim()
                                                        const id = getId(5, text)
                                                        return <h5 id={id} {...props}>{children}</h5>
                                                    },
                                                    h6: ({ children, ...props }) => {
                                                        const text = extractPlainText(children).trim()
                                                        const id = getId(6, text)
                                                        return <h6 id={id} {...props}>{children}</h6>
                                                    },
                                                }}
                                            >
                                                {activeChapter.content}
                                            </ReactMarkdown>
                                        )
                                    })()}
                                </div>

                                {toc.length > 0 && (
                                    <div className="hidden lg:block w-60 shrink-0">
                                        <div className="sticky top-8">
                                            <div className="text-sm font-medium text-foreground mb-2">本章目录</div>
                                            <div className="space-y-1 border-l pl-3">
                                                {(() => {
                                                    const baseLevel = toc.reduce((acc, h) => Math.min(acc, h.level), Infinity)
                                                    return toc.map((h) => (
                                                        <button
                                                            key={h.id}
                                                            type="button"
                                                            onClick={() => {
                                                                const el = document.getElementById(h.id)
                                                                el?.scrollIntoView({ behavior: "smooth", block: "start" })
                                                            }}
                                                            className="block w-full text-left text-sm text-muted-foreground hover:text-foreground"
                                                            style={{ paddingLeft: Math.max(0, (h.level - baseLevel) * 12) }}
                                                        >
                                                            {h.text}
                                                        </button>
                                                    ))
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            !isLoading && (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                    <BookOpen className="h-12 w-12 mb-4 opacity-20" />
                                    <p>请选择左侧章节查看详情</p>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
