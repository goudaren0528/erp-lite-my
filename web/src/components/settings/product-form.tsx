"use client"

import { useState } from "react"
import { Product, ProductVariant } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, Trash2 } from "lucide-react"
import { saveProduct } from "@/app/actions"

interface ProductFormProps {
  initialData?: Product
  onSuccess?: () => void
}

const DURATION_TIERS = ["1", "2", "3", "5", "7", "10", "15", "30", "60", "90"]

export function ProductForm({ initialData, onSuccess }: ProductFormProps) {
  const [name, setName] = useState(initialData?.name || "")
  const [variants, setVariants] = useState<ProductVariant[]>(initialData?.variants || [])

  const handleAddVariant = () => {
    setVariants([
        ...variants, 
        { 
            name: "新版本", 
            accessories: "", 
            insurancePrice: 0, 
            priceRules: {} 
        }
    ])
  }

  const handleRemoveVariant = (index: number) => {
    const newVariants = [...variants]
    newVariants.splice(index, 1)
    setVariants(newVariants)
  }

  const handleVariantChange = (index: number, field: keyof ProductVariant, value: any) => {
    const newVariants = [...variants]
    newVariants[index] = { ...newVariants[index], [field]: value }
    setVariants(newVariants)
  }

  const handlePriceRuleChange = (variantIndex: number, duration: string, price: number) => {
    const newVariants = [...variants]
    const rules = { ...newVariants[variantIndex].priceRules, [duration]: price }
    newVariants[variantIndex] = { ...newVariants[variantIndex], priceRules: rules }
    setVariants(newVariants)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const product: Product = {
        id: initialData?.id || Math.random().toString(36).substring(2, 9),
        name,
        variants
    }
    await saveProduct(product)
    if (onSuccess) onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>商品型号名称</Label>
        <Input 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="例如: 大疆Pocket3" 
            required 
        />
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
            <h3 className="font-semibold">版本配置 (SKU)</h3>
            <Button type="button" size="sm" onClick={handleAddVariant}>
                <Plus className="h-4 w-4 mr-1" /> 添加版本
            </Button>
        </div>

        {variants.map((variant, index) => (
            <Card key={index} className="bg-gray-50 border-gray-200">
                <CardContent className="pt-6 space-y-4">
                    <div className="flex justify-between items-start">
                        <div className="grid grid-cols-2 gap-4 flex-1 mr-4">
                            <div className="space-y-2">
                                <Label>版本名称</Label>
                                <Input 
                                    value={variant.name} 
                                    onChange={e => handleVariantChange(index, 'name', e.target.value)} 
                                    placeholder="例如: 标准版" 
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>保险费/安心保 (¥)</Label>
                                <Input 
                                    type="number" 
                                    value={variant.insurancePrice} 
                                    onChange={e => handleVariantChange(index, 'insurancePrice', Number(e.target.value))} 
                                />
                            </div>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveVariant(index)} className="text-red-500">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="space-y-2">
                        <Label>配件内容</Label>
                        <Textarea 
                            value={variant.accessories} 
                            onChange={e => handleVariantChange(index, 'accessories', e.target.value)} 
                            placeholder="描述该版本包含的配件..." 
                            className="h-20"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>阶梯价格表 (¥)</Label>
                        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                            {DURATION_TIERS.map(day => (
                                <div key={day} className="space-y-1">
                                    <Label className="text-xs text-gray-500">{day}天</Label>
                                    <Input 
                                        type="number" 
                                        className="h-8 text-sm px-1 text-center"
                                        value={variant.priceRules[day] || ''}
                                        onChange={e => handlePriceRuleChange(index, day, Number(e.target.value))}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="lg">保存商品信息</Button>
      </div>
    </form>
  )
}
