"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Product } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2, Edit2, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ProductForm } from "./product-form"
import { deleteProduct, migrateDeviceMappings } from "@/app/actions"
import { toast } from "sonner"

interface ProductListProps {
  products: Product[]
}

export function ProductList({ products }: ProductListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isMigrating, setIsMigrating] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const filteredProducts = products.filter(p => 
      p.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  )

  const totalPages = Math.ceil(filteredProducts.length / pageSize)
  const paginatedProducts = filteredProducts.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
  )

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value)
      setCurrentPage(1)
  }

  const handleMigrate = async () => {
      try {
          setIsMigrating(true)
          const res = await migrateDeviceMappings()
          if (res.success) {
              toast.success(res.message)
              startTransition(() => {
                  router.refresh()
              })
          } else {
              toast.error(res.message)
          }
      } catch (error) {
          console.error(error)
          toast.error("迁移失败")
      } finally {
          setIsMigrating(false)
      }
  }

  const confirmDelete = (product: Product) => {
    setProductToDelete(product)
    setIsDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!productToDelete) return

    try {
        const res = await deleteProduct(productToDelete.id)
        if (res?.success) {
            toast.success(res.message)
            setIsDeleteOpen(false)
            startTransition(() => {
                router.refresh()
            })
        } else {
            toast.error(res?.message || "操作失败")
        }
    } catch (error) {
        console.error(error)
        toast.error("操作失败: 请刷新页面重试")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">商品列表</h2>
        <div className="flex gap-2">
            <Button variant="outline" onClick={handleMigrate} disabled={isMigrating}>
                {isMigrating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                同步旧配置
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> 添加商品
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>添加新商品</DialogTitle>
                    </DialogHeader>
                    <ProductForm onSuccess={() => setIsCreateOpen(false)} />
                </DialogContent>
            </Dialog>
        </div>
      </div>

      <div className="bg-muted/30 p-4 rounded-lg flex flex-wrap gap-1 items-center">
        <Input 
            placeholder="搜索商品名称..." 
            value={searchQuery}
            onChange={handleSearchChange}
            className="max-w-sm bg-background"
        />
      </div>

      <div className="rounded-md border relative min-h-[200px]">
        {isPending && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10">
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">加载中...</span>
                </div>
            </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">商品ID</TableHead>
              <TableHead className="w-[240px]">型号名称</TableHead>
              <TableHead className="w-[200px]">映射关键词</TableHead>
              <TableHead>包含版本 (SKU)</TableHead>
              <TableHead className="text-right w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedProducts.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-mono text-xs">{product.id}</TableCell>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell className="max-w-[200px]">
                  {(() => {
                    let keywords: string[] = []
                    try {
                      if (product.matchKeywords) {
                        keywords = JSON.parse(product.matchKeywords)
                      }
                    } catch {}
                    
                    if (keywords.length === 0) return <span className="text-muted-foreground text-xs">-</span>
                    
                    const display = keywords.join(", ")
                    
                    return (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="truncate text-xs cursor-help">{display}</div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[300px] break-words">
                            <p>{display}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )
                  })()}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {product.variants.map(v => (
                        <span key={v.name} className="bg-gray-100 text-xs px-2 py-1 rounded">
                            {v.name}
                        </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingProduct(product)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => confirmDelete(product)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {products.length === 0 && (
                <TableRow>
                    <TableCell colSpan={4} className="text-center h-24">暂无商品</TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

            <div className="flex items-center justify-between mt-4 px-2">
                <div className="text-sm text-muted-foreground">
                    共 {filteredProducts.length} 条数据，本页显示 {paginatedProducts.length} 条
                </div>

                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-gray-500">每页行数</p>
                        <Select
                            value={`${pageSize}`}
                            onValueChange={(value) => {
                                setPageSize(Number(value))
                                setCurrentPage(1)
                            }}
                        >
                            <SelectTrigger className="h-8 w-[70px]">
                                <SelectValue placeholder={pageSize} />
                            </SelectTrigger>
                            <SelectContent side="top">
                                {[10, 20, 50, 100].map((size) => (
                                    <SelectItem key={size} value={`${size}`}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {totalPages > 1 && (
                        <Pagination className="justify-end w-auto mx-0">
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            setCurrentPage(p => Math.max(1, p - 1))
                                        }}
                                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                </PaginationItem>

                                {(() => {
                                    const generatePaginationItems = (current: number, total: number) => {
                                        if (total <= 7) {
                                            return Array.from({ length: total }, (_, i) => i + 1);
                                        }

                                        const items: (number | 'ellipsis-start' | 'ellipsis-end')[] = [1];
                                        let start = Math.max(2, current - 2);
                                        let end = Math.min(total - 1, current + 2);

                                        if (current < 4) {
                                            end = Math.min(total - 1, 5);
                                        }
                                        if (current > total - 3) {
                                            start = Math.max(2, total - 4);
                                        }

                                        if (start > 2) {
                                            items.push('ellipsis-start');
                                        }

                                        for (let i = start; i <= end; i++) {
                                            items.push(i);
                                        }

                                        if (end < total - 1) {
                                            items.push('ellipsis-end');
                                        }

                                        if (total > 1) {
                                            items.push(total);
                                        }

                                        return items;
                                    };

                                    return generatePaginationItems(currentPage, totalPages).map((item, index) => (
                                        <PaginationItem key={`${item}-${index}`}>
                                            {typeof item === 'number' ? (
                                                <PaginationLink
                                                    href="#"
                                                    isActive={currentPage === item}
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        setCurrentPage(item)
                                                    }}
                                                    className="cursor-pointer"
                                                >
                                                    {item}
                                                </PaginationLink>
                                            ) : (
                                                <PaginationEllipsis />
                                            )}
                                        </PaginationItem>
                                    ));
                                })()}

                                <PaginationItem>
                                    <PaginationNext
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            setCurrentPage(p => Math.min(totalPages, p + 1))
                                        }}
                                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    )}
                </div>
            </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
            <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>编辑商品</DialogTitle>
                </DialogHeader>
                {editingProduct && (
                    <ProductForm 
                        initialData={editingProduct} 
                        onSuccess={() => setEditingProduct(null)} 
                    />
                )}
            </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>确认删除商品?</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <p className="text-sm text-gray-500">
                        确定要删除商品 &quot;{productToDelete?.name}&quot; 吗？
                    </p>
                    <p className="text-sm text-red-500 mt-2">
                        注意: 这将影响关联的历史订单显示。
                    </p>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>取消</Button>
                    <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  )
}
