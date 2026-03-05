'use client'

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from 'react-markdown';
import { getManualChapters, upsertManualChapter, deleteManualChapter, ManualChapterInput } from './actions';

export default function ManualManagementPage() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [chapters, setChapters] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [editingChapter, setEditingChapter] = useState<ManualChapterInput | null>(null);

    // Form state
    const [formData, setFormData] = useState<ManualChapterInput>({
        title: '',
        content: '',
        order: 0,
        isEnabled: true
    });

    const fetchChapters = async () => {
        setIsLoading(true);
        try {
            const data = await getManualChapters();
            setChapters(data);
        } catch (error) {
            toast.error("Failed to fetch chapters");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchChapters();
    }, []);

    const handleOpenSheet = (chapter?: { id: string; title: string; content: string; order: number; isEnabled: boolean }) => {
        if (chapter) {
            setEditingChapter(chapter);
            setFormData({
                id: chapter.id,
                title: chapter.title,
                content: chapter.content,
                order: chapter.order,
                isEnabled: chapter.isEnabled
            });
        } else {
            setEditingChapter(null);
            setFormData({
                title: '',
                content: '',
                order: chapters.length + 1,
                isEnabled: true
            });
        }
        setIsSheetOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.title || !formData.content) {
            toast.error("Title and Content are required");
            return;
        }

        try {
            const res = await upsertManualChapter(formData);
            if (res.success) {
                toast.success("Chapter saved successfully");
                setIsSheetOpen(false);
                fetchChapters();
            } else {
                toast.error(res.error || "Failed to save");
            }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            toast.error("An error occurred");
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this chapter?")) {
            const res = await deleteManualChapter(id);
            if (res.success) {
                toast.success("Chapter deleted");
                fetchChapters();
            } else {
                toast.error(res.error || "Failed to delete");
            }
        }
    };

    return (
        <div className="space-y-6 p-8">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold tracking-tight">操作指南管理</h2>
                <Button onClick={() => handleOpenSheet()}>
                    <Plus className="mr-2 h-4 w-4" /> 新增章节
                </Button>
            </div>

            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetContent className="min-w-[1080px] sm:max-w-[1080px] flex flex-col p-0 h-full">
                    <SheetHeader className="px-6 py-4 border-b shrink-0">
                        <SheetTitle>{editingChapter ? '编辑章节' : '新增章节'}</SheetTitle>
                    </SheetHeader>
                    <div className="grid gap-4 p-6 flex-1 overflow-hidden">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">标题</label>
                                <Input 
                                    value={formData.title} 
                                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">排序</label>
                                <Input 
                                    type="number"
                                    value={formData.order} 
                                    onChange={(e) => setFormData({...formData, order: parseInt(e.target.value)})}
                                />
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                             <Switch 
                                checked={formData.isEnabled}
                                onCheckedChange={(checked) => setFormData({...formData, isEnabled: checked})}
                             />
                             <label className="text-sm font-medium">启用</label>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden min-h-[400px]">
                            <div className="flex flex-col space-y-2 h-full">
                                <label className="text-sm font-medium">内容 (Markdown)</label>
                                <Textarea 
                                    className="flex-1 font-mono text-sm resize-none"
                                    value={formData.content}
                                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                                    placeholder="# 标题&#10;- 列表项"
                                />
                            </div>
                            <div className="flex flex-col space-y-2 h-full overflow-hidden">
                                <label className="text-sm font-medium">预览</label>
                                <div className="flex-1 border rounded-md p-4 overflow-y-auto prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-1 prose-ul:my-2 prose-li:my-0 prose-headings:mt-4 prose-headings:mb-2">
                                    <ReactMarkdown>{formData.content}</ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 p-4 border-t shrink-0">
                        <Button variant="outline" onClick={() => setIsSheetOpen(false)}>取消</Button>
                        <Button onClick={handleSubmit}>保存</Button>
                    </div>
                </SheetContent>
            </Sheet>

            <div className="space-y-4">
                {isLoading ? (
                    <div className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </div>
                ) : chapters.map((chapter) => (
                    <div key={chapter.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-medium">{chapter.title}</span>
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                    chapter.isEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                    {chapter.isEnabled ? '启用' : '禁用'}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                                <span>Sort: {chapter.order}</span>
                                <span>Updated: {chapter.updatedAt ? new Date(chapter.updatedAt).toLocaleString() : '-'}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenSheet(chapter)}>
                                <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(chapter.id)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ))}
                {!isLoading && chapters.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                        暂无操作指南内容
                    </div>
                )}
            </div>
        </div>
    );
}
