"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { InventoryItemType, Product, ProductVariant } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, Trash2 } from "lucide-react"
import { saveProduct } from "@/app/actions"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ProductFormProps {
  initialData?: Product
  onSuccess?: () => void
  itemTypes: InventoryItemType[]
}

type PriceRuleDraft = { id: string; days: string; price: number | string }
type VariantDraft = {
  name: string
  accessories: string
  insurancePrice: number
  priceRules: PriceRuleDraft[]
  specId: string
  bomItems: { id: string; itemTypeId: string; quantity: number }[]
}

export function ProductForm({ initialData, onSuccess, itemTypes }: ProductFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initialData?.name || "")
  
  const [matchKeywords, setMatchKeywords] = useState(() => {
    if (!initialData?.matchKeywords) return ""
    try {
      const parsed = JSON.parse(initialData.matchKeywords)
      return Array.isArray(parsed) ? parsed.join("\n") : ""
    } catch {
      return ""
    }
  })
  
  // Initialize variants with array-based priceRules for editing
  const [variants, setVariants] = useState<VariantDraft[]>(
    initialData?.variants?.map(v => ({
      name: v.name || "",
      accessories: v.accessories || "",
      insurancePrice: Number(v.insurancePrice) || 0,
      specId: v.specId || "",
      bomItems: (v.bomItems || []).map(b => ({
        id: Math.random().toString(36).substring(2),
        itemTypeId: b.itemTypeId,
        quantity: b.quantity
      })),
      priceRules: Object.entries(v.priceRules || {})
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([days, price]) => ({
            id: Math.random().toString(36).substring(2),
            days,
            price
        }))
    })) || []
  )



  const handleAddVariant = () => {
    setVariants([...variants, {
      name: "",
      accessories: "",
      insurancePrice: 0,
      specId: "",
      priceRules: [],
      bomItems: []
    }])
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
          if (value === "") {
              newVariants[vIndex].priceRules[rIndex][field] = ""
          } else {
              newVariants[vIndex].priceRules[rIndex][field] = Number(value)
          }
      }
      setVariants(newVariants)
  }

  const handleGenerateCommonTerms = (vIndex: number) => {
      const newVariants = [...variants]
      const commonTerms = ["1", "3", "5", "7", "10", "15", "30", "60", "90"]
      
      const existingDays = new Set(newVariants[vIndex].priceRules.map(r => r.days))
      const rulesToAdd = commonTerms.filter(d => !existingDays.has(d))
      
      if (rulesToAdd.length === 0) {
          toast.info("已存在所有通用租期规则")
          return
      }

      rulesToAdd.forEach(day => {
          newVariants[vIndex].priceRules.push({
              id: Math.random().toString(36).substring(2),
              days: day,
              price: ""
          })
      })
      
      // Sort by days
      newVariants[vIndex].priceRules.sort((a, b) => Number(a.days) - Number(b.days))
      setVariants(newVariants)
      toast.success(`已生成 ${rulesToAdd.length} 个通用租期规则`)
  }

  const handleAddBomItem = (vIndex: number) => {
      const newVariants = [...variants]
      newVariants[vIndex].bomItems.push({
          id: Math.random().toString(36).substring(2),
          itemTypeId: itemTypes[0]?.id || "",
          quantity: 1
      })
      setVariants(newVariants)
  }

  const handleRemoveBomItem = (vIndex: number, bIndex: number) => {
      const newVariants = [...variants]
      newVariants[vIndex].bomItems.splice(bIndex, 1)
      setVariants(newVariants)
  }

  const handleBomChange = (vIndex: number, bIndex: number, field: 'itemTypeId' | 'quantity', value: string | number) => {
      const newVariants = [...variants]
      if (field === 'quantity') {
          newVariants[vIndex].bomItems[bIndex][field] = Number(value)
      } else {
          newVariants[vIndex].bomItems[bIndex][field] = String(value)
      }
      setVariants(newVariants)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Convert back to Record
    const seenSpecIds = new Set<string>()
    const finalVariants: ProductVariant[] = []
    for (let i = 0; i < variants.length; i += 1) {
      const v = variants[i]
      const specId = v.specId.trim()
      // if (!specId) {
      //   toast.error(`第 ${i + 1} 个规格ID不能为空`)
      //   return
      // }
      if (specId && seenSpecIds.has(specId)) {
        toast.error(`规格ID重复：${specId}`)
        return
      }
      if (specId) seenSpecIds.add(specId)

      if (!v.bomItems || v.bomItems.length === 0) {
        toast.error(`第 ${i + 1} 个规格必须配置BOM`)
        return
      }

      const bomItems = v.bomItems
        .filter(b => b.itemTypeId)
        .map(b => ({ itemTypeId: b.itemTypeId, quantity: Number(b.quantity) || 1 }))

      if (bomItems.length === 0) {
        toast.error(`第 ${i + 1} 个规格必须配置BOM`)
        return
      }

      const rules: Record<string, number> = {}
      const seenDays = new Set<string>()
      for (const r of v.priceRules) {
        const days = r.days.trim()
        if (!days) continue
        const daysNumber = Number(days)
        if (!Number.isFinite(daysNumber) || daysNumber <= 0) {
          toast.error(`第 ${i + 1} 个规格的天数必须是正数`)
          return
        }
        if (seenDays.has(days)) {
          toast.error(`第 ${i + 1} 个规格的天数重复：${days}`)
          return
        }
        seenDays.add(days)
        if (!Number.isFinite(Number(r.price)) || Number(r.price) < 0) {
          toast.error(`第 ${i + 1} 个规格的价格必须为非负数`)
          return
        }
        rules[days] = Number(r.price)
      }

      if (Object.keys(rules).length === 0) {
        toast.error(`第 ${i + 1} 个规格至少需要一条价格规则`)
        return
      }

      finalVariants.push({
        specId,
        name: v.name.trim(),
        accessories: v.accessories,
        insurancePrice: Number(v.insurancePrice),
        priceRules: rules,
        bomItems
      })
    }

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
            <h3 className="font-semibold">规格配置</h3>
            <Button type="button" size="sm" onClick={handleAddVariant}>
                <Plus className="h-4 w-4 mr-1" /> 添加规格
            </Button>
        </div>

        {variants.map((variant, index) => (
            <Card key={index} className="bg-slate-50 border-slate-200 shadow-sm">
                <CardContent className="p-3 space-y-3">
                    {/* Top Row: Basic Info */}
                    <div className="flex gap-3 items-start">
                        <div className="grid grid-cols-12 gap-3 flex-1">
                            <div className="col-span-4 md:col-span-3 space-y-1">
                                <Label className="text-xs text-muted-foreground">规格名称</Label>
                                <Input 
                                    className="h-8 text-sm bg-white" 
                                    value={variant.name} 
                                    onChange={e => handleVariantChange(index, 'name', e.target.value)} 
                                    placeholder="例如: 标准版" 
                                />
                            </div>
                            <div className="col-span-4 md:col-span-3 space-y-1">
                                <Label className="text-xs text-muted-foreground">规格ID</Label>
                                <Input 
                                    className="h-8 text-sm font-mono bg-white text-muted-foreground" 
                                    value={variant.specId} 
                                    onChange={e => handleVariantChange(index, 'specId', e.target.value)} 
                                    placeholder="自动生成"
                                />
                            </div>
                            <div className="col-span-4 md:col-span-2 space-y-1">
                                <Label className="text-xs text-muted-foreground">保险费(¥)</Label>
                                <Input 
                                    type="number" 
                                    className="h-8 text-sm bg-white"
                                    value={variant.insurancePrice} 
                                    onChange={e => handleVariantChange(index, 'insurancePrice', Number(e.target.value))} 
                                />
                            </div>

                        </div>
                        <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleRemoveVariant(index)} 
                            className="text-gray-400 hover:text-red-500 hover:bg-red-50 h-8 w-8 mt-6"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="grid grid-cols-12 gap-4 pt-1">
                        {/* Left: BOM Items */}
                        <div className="col-span-12 md:col-span-5 space-y-2 border-r border-slate-200 pr-4 border-dashed">
                            <div className="flex justify-between items-center">
                                <Label className="text-xs font-medium text-slate-700">BOM 物品构成</Label>
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 px-2 text-xs hover:bg-slate-200"
                                    onClick={() => handleAddBomItem(index)} 
                                    disabled={itemTypes.length === 0}
                                >
                                    <Plus className="h-3 w-3 mr-1" /> 添加
                                </Button>
                            </div>
                            
                            {itemTypes.length === 0 ? (
                                <div className="text-[10px] text-muted-foreground">请先创建库存物品类型</div>
                            ) : (
                                <div className="space-y-1.5">
                                    {variant.bomItems.length === 0 && (
                                        <div className="text-[10px] text-muted-foreground italic py-1">暂无 BOM 物品</div>
                                    )}
                                    {variant.bomItems.map((bom, bIndex) => (
                                        <div key={bom.id} className="flex items-center gap-1.5">
                                            <Select value={bom.itemTypeId} onValueChange={(value) => handleBomChange(index, bIndex, 'itemTypeId', value)}>
                                                <SelectTrigger className="h-7 text-xs bg-white flex-1 min-w-0">
                                                    <SelectValue placeholder="选择物品" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {itemTypes.map(item => (
                                                        <SelectItem key={item.id} value={item.id} className="text-xs">
                                                            {item.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <div className="flex items-center gap-1 bg-white border rounded px-1 h-7">
                                                <span className="text-[10px] text-muted-foreground">x</span>
                                                <Input 
                                                    type="number"
                                                    value={bom.quantity}
                                                    onChange={e => handleBomChange(index, bIndex, 'quantity', Number(e.target.value))}
                                                    className="h-5 w-8 border-none p-0 text-xs focus-visible:ring-0 text-center shadow-none"
                                                    min={1}
                                                />
                                            </div>
                                            <Button 
                                                type="button" 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-7 w-7 text-gray-400 hover:text-red-500"
                                                onClick={() => handleRemoveBomItem(index, bIndex)}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Right: Price Rules */}
                        <div className="col-span-12 md:col-span-7 space-y-2">
                            <div className="flex justify-between items-center">
                                <Label className="text-xs font-medium text-slate-700">阶梯价格表 (天数 - 价格)</Label>
                                <div className="flex gap-1">
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-6 px-2 text-xs hover:bg-slate-200 text-blue-600"
                                        onClick={() => handleGenerateCommonTerms(index)}
                                    >
                                        <span className="text-[10px]">生成通用租期</span>
                                    </Button>
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-6 px-2 text-xs hover:bg-slate-200"
                                        onClick={() => handleAddRule(index)}
                                    >
                                        <Plus className="h-3 w-3 mr-1" /> 添加
                                    </Button>
                                </div>
                            </div>
                            
                            <div className="flex flex-wrap gap-2">
                                {variant.priceRules.length === 0 && (
                                    <div className="text-[10px] text-muted-foreground italic py-1">暂无价格规则</div>
                                )}
                                {variant.priceRules.map((rule, rIndex) => (
                                    <div key={rule.id} className="flex items-center gap-1 p-1 pl-2 border rounded bg-white shadow-sm h-7">
                                        <Input 
                                            value={rule.days}
                                            onChange={e => handleRuleChange(index, rIndex, 'days', e.target.value)}
                                            className="h-5 w-8 text-xs p-0 text-center border-none focus-visible:ring-0 shadow-none bg-transparent"
                                            placeholder="天"
                                        />
                                        <span className="text-[10px] text-muted-foreground">天</span>
                                        <div className="w-[1px] h-3 bg-gray-200 mx-1" />
                                        <span className="text-[10px] text-muted-foreground">¥</span>
                                        <Input 
                                            type="number"
                                            value={rule.price}
                                            onChange={e => handleRuleChange(index, rIndex, 'price', e.target.value)}
                                            className="h-5 w-12 text-xs p-0 border-none focus-visible:ring-0 shadow-none bg-transparent"
                                            placeholder="0"
                                        />
                                        <Button 
                                            type="button" 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-5 w-5 text-gray-300 hover:text-red-500 ml-1"
                                            onClick={() => handleDeleteRule(index, rIndex)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
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
