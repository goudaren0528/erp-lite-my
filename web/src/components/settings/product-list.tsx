"use client"

import { useState } from "react"
import { Product } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2, Edit2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { ProductForm } from "./product-form"
import { deleteProduct } from "@/app/actions"
import { toast } from "sonner"

interface ProductListProps {
  products: Product[]
}

export function ProductList({ products }: ProductListProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)

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
        } else {
            toast.error(res?.message || "操作失败")
        }
    } catch (e: any) {
        console.error(e)
        toast.error("操作失败: 请刷新页面重试")
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>商品列表</CardTitle>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" /> 添加商品
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>添加新商品</DialogTitle>
                </DialogHeader>
                <ProductForm onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>型号名称</TableHead>
              <TableHead>包含版本 (SKU)</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium">{product.name}</TableCell>
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
                    <TableCell colSpan={3} className="text-center h-24">暂无商品</TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Edit Dialog */}
        <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
                        确定要删除商品 "{productToDelete?.name}" 吗？
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
      </CardContent>
    </Card>
  )
}
