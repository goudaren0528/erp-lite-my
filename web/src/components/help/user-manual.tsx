"use client"

import { useState, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { BookOpen, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import ReactMarkdown from 'react-markdown'
import { getEnabledManualChapters } from "@/app/system/manual/actions"

export function UserManual({ collapsed }: { collapsed?: boolean }) {
    const [chapters, setChapters] = useState<Array<{ id: string; title: string; content: string }>>([])
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
                    // If no active chapter is selected, select the first one
                    if (data.length > 0 && !activeChapterId) {
                        setActiveChapterId(data[0].id)
                    }
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
                            <div className="max-w-none prose prose-sm dark:prose-invert break-words prose-p:my-1 prose-ul:my-2 prose-li:my-0 prose-headings:mt-4 prose-headings:mb-2">
                                <h2 className="mb-4 text-2xl font-bold">{activeChapter.title}</h2>
                                <ReactMarkdown>{activeChapter.content}</ReactMarkdown>
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
