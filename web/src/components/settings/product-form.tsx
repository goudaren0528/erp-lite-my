"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Product, ProductVariant } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, Trash2 } from "lucide-react"
import { saveProduct } from "@/app/actions"
import { toast } from "sonner"

interface ProductFormProps {
  initialData?: Product
  onSuccess?: () => void
}

type PriceRuleDraft = { id: string; days: string; price: number }
type VariantDraft = {
  name: string
  accessories: string
  insurancePrice: number
  priceRules: PriceRuleDraft[]
}

export function ProductForm({ initialData, onSuccess }: ProductFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initialData?.name || "")
  
  // Initialize keywords
  const [matchKeywords, setMatchKeywords] = useState(() => {
    try {
        if (initialData?.matchKeywords) {
            const parsed = JSON.parse(initialData.matchKeywords)
            return Array.isArray(parsed) ? parsed.join('\n') : ''
        }
        return ''
    } catch {
        return ''
    }
  })

  // Initialize variants with array-based priceRules for editing
  const [variants, setVariants] = useState<VariantDraft[]>(
    initialData?.variants?.map(v => ({
      ...v,
      priceRules: Object.entries(v.priceRules)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([days, price]) => ({
            id: Math.random().toString(36).substring(2),
            days,
            price
        }))
    })) || []
  )

  const handleAddVariant = () => {
    setVariants([
        ...variants, 
        { 
            name: "新版本", 
            accessories: "", 
            insurancePrice: 0, 
            priceRules: [
                { id: Math.random().toString(36).substring(2), days: "3", price: 0 },
                { id: Math.random().toString(36).substring(2), days: "7", price: 0 }
            ] 
        }
    ])
  }

  const handleRemoveVariant = (index: number) => {
    const newVariants = [...variants]
    newVariants.splice(index, 1)
    setVariants(newVariants)
  }

  const handleVariantChange = <K extends keyof VariantDraft>(index: number, field: K, value: VariantDraft[K]) => {
    const newVariants = [...variants]
    newVariants[index] = { ...newVariants[index], [field]: value }
    setVariants(newVariants)
  }

  // Rule Handlers
  const handleAddRule = (vIndex: number) => {
      const newVariants = [...variants]
      if (newVariants[vIndex].priceRules.length >= 15) {
          toast.error("最多支持15个价格规则")
          return
      }
      newVariants[vIndex].priceRules.push({ 
          id: Math.random().toString(36).substring(2), 
          days: "", 
          price: 0 
      })
      setVariants(newVariants)
  }

  const handleDeleteRule = (vIndex: number, rIndex: number) => {
      const newVariants = [...variants]
      newVariants[vIndex].priceRules.splice(rIndex, 1)
      setVariants(newVariants)
  }

  const handleRuleChange = (vIndex: number, rIndex: number, field: 'days'|'price', value: string | number) => {
      const newVariants = [...variants]
      if (field === 'days') {
          newVariants[vIndex].priceRules[rIndex][field] = String(value)
      } else {
          newVariants[vIndex].priceRules[rIndex][field] = Number(value)
      }
      setVariants(newVariants)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Convert back to Record
    const finalVariants: ProductVariant[] = variants.map(v => {
        const rules: Record<string, number> = {}
        v.priceRules.forEach(r => {
            if (r.days && r.days.trim() !== '') {
                rules[r.days] = Number(r.price)
            }
        })
        return {
            name: v.name,
            accessories: v.accessories,
            insurancePrice: Number(v.insurancePrice),
            priceRules: rules
        }
    })

    const product: { id?: string; name: string; variants: ProductVariant[]; matchKeywords?: string } = {
        name,
        variants: finalVariants
    }

    // Process keywords
    const keywords = matchKeywords.split(/[\n,]/).map(k => k.trim()).filter(Boolean)
    product.matchKeywords = JSON.stringify(keywords)

    if (initialData?.id) {
        product.id = initialData.id
    }

    try {
        const res = await saveProduct(product)
        
        if (res?.success) {
            toast.success(res.message)
            router.refresh()
            if (onSuccess) onSuccess()
        } else {
            toast.error(res?.message || "操作失败")
        }
    } catch (error) {
        console.error(error)
        toast.error("操作失败: 请刷新页面重试")
    }
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

      <div className="space-y-2">
        <Label>自动映射关键词 (可选)</Label>
        <Textarea 
            value={matchKeywords} 
            onChange={e => setMatchKeywords(e.target.value)} 
            placeholder="输入商品名称关键词，用于自动关联线上订单。支持换行分隔。例如：&#10;iPhone 13&#10;苹果13" 
            className="h-24 font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">当线上订单商品名称包含这些关键词时，将自动关联到此商品。</p>
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
                        <div className="flex justify-between items-center">
                            <Label>阶梯价格表 (¥)</Label>
                            <Button type="button" variant="outline" size="sm" onClick={() => handleAddRule(index)}>
                                <Plus className="h-3 w-3 mr-1" /> 添加规则
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {variant.priceRules.map((rule, rIndex) => (
                                <div key={rule.id} className="flex items-center gap-2 p-2 border rounded bg-white">
                                    <div className="flex items-center gap-1">
                                        <Input 
                                            value={rule.days}
                                            onChange={e => handleRuleChange(index, rIndex, 'days', e.target.value)}
                                            className="h-7 text-sm px-1 text-center w-14"
                                            placeholder="天"
                                        />
                                        <span className="text-xs text-gray-500 whitespace-nowrap">天</span>
                                    </div>
                                    <div className="flex items-center gap-1 flex-1">
                                        <span className="text-xs text-gray-500">¥</span>
                                        <Input 
                                            type="number"
                                            value={rule.price}
                                            onChange={e => handleRuleChange(index, rIndex, 'price', Number(e.target.value))}
                                            className="h-7 text-sm px-1 text-center flex-1"
                                            placeholder="价格"
                                        />
                                    </div>
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                                        onClick={() => handleDeleteRule(index, rIndex)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
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
