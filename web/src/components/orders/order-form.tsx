"use client"

import { useState, useEffect, useRef } from "react"
import { Order, Product, User, Promoter, OrderSource, OrderPlatform } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createOrder, updateOrder } from "@/app/actions"
import { addDays, format, subDays } from "date-fns"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { CHINA_REGIONS } from "@/lib/city-data"

import { toast } from "sonner"

interface OrderFormProps {
  products: Product[]
  promoters?: Promoter[]
  initialData?: Order
  onSuccess?: () => void
}

export function OrderForm({ products, promoters = [], initialData, onSuccess }: OrderFormProps) {
  const isEdit = !!initialData
  const safePromoters = Array.isArray(promoters) ? promoters : []
  const screenshotInputRef = useRef<HTMLInputElement>(null)
  
  // Find initial product and variant if editing
  const initialProduct = isEdit ? products.find(p => p.name === initialData.productName) : undefined
  const initialVariant = isEdit && initialProduct ? initialProduct.variants.find(v => v.name === initialData.variantName) : undefined

  const [selectedProductId, setSelectedProductId] = useState<string>(initialProduct?.id || "")
  const [selectedVariantName, setSelectedVariantName] = useState<string>(initialData?.variantName || "")
  const [duration, setDuration] = useState<number>(initialData?.duration || 3)
  
  // Date Logic
  const [rentStartDate, setRentStartDate] = useState<string>(initialData?.rentStartDate || format(new Date(), "yyyy-MM-dd"))
  const [rentEndDate, setRentEndDate] = useState<string>(
    initialData?.rentStartDate && initialData?.duration
      ? format(addDays(new Date(initialData.rentStartDate), initialData.duration - 1), "yyyy-MM-dd")
      : format(addDays(new Date(), 2), "yyyy-MM-dd") // Default 3 days (today + 2)
  )
  
  const [rentPrice, setRentPrice] = useState<number>(initialData?.rentPrice || 0)
  const [insurancePrice, setInsurancePrice] = useState<number>(initialData?.insurancePrice || 0)
  const [deposit, setDeposit] = useState<number>(initialData?.deposit || 0)

  // Address State
  // Try to parse existing address: "Province City Detail"
  const addressParts = initialData?.address ? initialData.address.split(' ') : []
  // Simple heuristic: if we have spaces, assume first is prov, second is city.
  // This might be flaky if old data is weird, but better than nothing.
  const initialProvince = addressParts.length >= 2 ? addressParts[0] : ""
  const initialCity = addressParts.length >= 2 ? addressParts[1] : ""
  const initialDetail = addressParts.length >= 2 ? addressParts.slice(2).join(' ') : (initialData?.address || "")

  const [province, setProvince] = useState<string>(initialProvince)
  const [city, setCity] = useState<string>(initialCity)
  const [detailAddress, setDetailAddress] = useState<string>(initialDetail)
  
  // Product Search State
  const [openProductSearch, setOpenProductSearch] = useState(false)
  
  const selectedProduct = products.find(p => p.id === selectedProductId)
  const selectedVariant = selectedProduct?.variants.find(v => v.name === selectedVariantName)

  const [source, setSource] = useState<OrderSource>(initialData?.source || "PART_TIME_AGENT")
  const [platform, setPlatform] = useState<OrderPlatform>(initialData?.platform || "OTHER")

  const [recipientName, setRecipientName] = useState(initialData?.recipientName || '')
  const [recipientPhone, setRecipientPhone] = useState(initialData?.recipientPhone || '')
  const [smartAddress, setSmartAddress] = useState('')
  const [sourceContact, setSourceContact] = useState(initialData?.sourceContact || "")

  const [extensions, setExtensions] = useState(initialData?.extensions || [])

  useEffect(() => {
    if (source === 'RETAIL') {
      setSourceContact("")
    }
  }, [source])

  const handleSmartParse = () => {
      const text = smartAddress.trim()
      if (!text) return

      // Phone
      const phoneMatch = text.match(/(1\d{10})/)
      const phone = phoneMatch ? phoneMatch[1] : ''
      if (phone) setRecipientPhone(phone)
      
      // Clean text for region matching (remove all spaces and invisible chars to be robust)
      const cleanText = text.replace(/[\s\u200B-\u200D\uFEFF]+/g, ''); 
      
      // Try to identify Province/City
      let foundProv = ''
      let foundCity = ''

      for (const region of CHINA_REGIONS) {
          // Check full name or short name (e.g. 广东 vs 广东省)
          if (cleanText.includes(region.name) || (region.name.length > 2 && cleanText.includes(region.name.substring(0, 2)))) {
             foundProv = region.name
             break
          }
      }
      
      if (foundProv) {
          setProvince(foundProv)
          const region = CHINA_REGIONS.find(r => r.name === foundProv)
          if (region) {
              for (const c of region.cities) {
                  // Check if the city name (or short name) exists in the clean text
                  if (cleanText.includes(c) || (c.length > 2 && cleanText.includes(c.substring(0, 2)))) {
                      foundCity = c
                      break
                  }
              }
          }
      }
      
      if (foundCity) {
          setCity(foundCity)
      }
      
      // Name & Detail
      // Use original text but with phone removed, to preserve spaces for splitting
      let remaining = text.replace(/(1\d{10})/, ' ').trim()
      
      // Remove province/city from remaining string if they exist
      if (foundProv) {
          remaining = remaining.replace(new RegExp(foundProv, 'g'), ' ')
          if (foundProv.length > 2) {
             const shortName = foundProv.substring(0, 2)
             // Protect short name if it's part of a longer region name (e.g. 县, 区, 旗)
             remaining = remaining.replace(new RegExp(shortName + '(?!([县区旗]))', 'g'), ' ')
          }
      }
      if (foundCity) {
          remaining = remaining.replace(new RegExp(foundCity, 'g'), ' ')
          if (foundCity.length > 2) {
             const shortName = foundCity.substring(0, 2)
             // Protect short name if it's part of a longer region name (e.g. 县, 区, 旗)
             remaining = remaining.replace(new RegExp(shortName + '(?!([县区旗]))', 'g'), ' ')
          }
      }
      
      // Clean up common separators
      remaining = remaining.replace(/[,，:：\-\s]+/g, ' ').trim()
      
      // Also remove "省" "市" suffix leftovers if any (standalone)
      remaining = remaining.replace(/\s+[省市区县]\s+/g, ' ').replace(/\s+/g, ' ').trim()

      const parts = remaining.split(' ').filter(s => s.length > 0)
      
      if (parts.length > 0) {
          // Sort by length
          const sorted = [...parts].sort((a, b) => a.length - b.length)
          const nameCandidate = sorted[0]
          
          // Heuristic: Name should be short, and NOT end with common address suffixes
          const isAddressPart = (str: string) => /.*[省市区县路街号室座园苑]$/.test(str) || str.includes('街道')
          
          if (nameCandidate.length <= 4 && !isAddressPart(nameCandidate)) {
              setRecipientName(nameCandidate)
              // The rest is address
              setDetailAddress(parts.filter(p => p !== nameCandidate).join(''))
          } else {
              // Assume all is address
              setDetailAddress(parts.join(''))
          }
      }
      
      toast.success("已尝试自动识别信息")
  }

  const handleDurationSelect = (days: number) => {
      setDuration(days)
      if (rentStartDate) {
          setRentEndDate(format(addDays(new Date(rentStartDate), days - 1), "yyyy-MM-dd"))
      }
  }

  const [isInitialized, setIsInitialized] = useState(false)

  // Calculate duration from dates
  useEffect(() => {
    if (rentStartDate && rentEndDate) {
        const start = new Date(rentStartDate)
        const end = new Date(rentEndDate)
        const diffTime = end.getTime() - start.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1 
        if (diffDays > 0) {
            setDuration(diffDays)
        }
    }
  }, [rentStartDate, rentEndDate])

  useEffect(() => {
    if (isEdit && !isInitialized) {
        setIsInitialized(true)
        return
    }

    if (selectedVariant && duration) {
      const exactPrice = selectedVariant.priceRules[String(duration)]
      if (exactPrice) {
          setRentPrice(exactPrice)
      }
      setInsurancePrice(selectedVariant.insurancePrice)
    }
  }, [selectedVariant, duration, isEdit, isInitialized])

  const totalAmount = (rentPrice || 0) + (insurancePrice || 0) + (deposit || 0)
  
  // Date Calculations
  const deliveryTime = rentStartDate ? format(subDays(new Date(rentStartDate), 2), "yyyy-MM-dd") : ""
  // Return Deadline: End Date + 1
  const returnDeadline = rentEndDate 
    ? format(addDays(new Date(rentEndDate), 1), "yyyy-MM-dd")
    : ""

  async function handleSubmit(formData: FormData) {
      // Validate dates
      if (rentStartDate && rentEndDate) {
          const start = new Date(rentStartDate)
          const end = new Date(rentEndDate)
          if (end < start) {
              toast.error("租期结束日期不能早于开始日期")
              return
          }
      }

      // Validate Mini Program Order No
      const miniProgramOrderNo = formData.get('miniProgramOrderNo') as string
      if (miniProgramOrderNo) {
        if (!/^SH\d{20}$/.test(miniProgramOrderNo)) {
          toast.error("小程序订单号格式错误，应为 SH + 20位数字")
          return
        }
      }

      // Combine address
      const fullAddress = province && city 
        ? `${province} ${city} ${detailAddress}`
        : detailAddress || formData.get('address') as string
      
      formData.set('address', fullAddress)

      try {
        let res;
        if (isEdit && initialData) {
            res = await updateOrder(initialData.id, formData)
        } else {
            res = await createOrder(formData)
        }
        
        if (res?.success) {
            toast.success(res.message)
            if (onSuccess) {
                onSuccess()
            }
        } else {
            toast.error(res?.message || "操作失败")
        }
      } catch (e: any) {
        console.error(e)
        toast.error("操作失败: 请刷新页面重试")
      }
  }

  const cities = CHINA_REGIONS.find(r => r.name === province)?.cities || []

  return (
    <form action={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>渠道类型</Label>
          <Select name="source" value={source} onValueChange={(v: OrderSource) => setSource(v)} required>
            <SelectTrigger>
              <SelectValue placeholder="选择渠道" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RETAIL">零售</SelectItem>
              <SelectItem value="PEER">同行</SelectItem>
              <SelectItem value="PART_TIME_AGENT">兼职代理</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
            <Label>推广员</Label>
            <Select 
              name="sourceContact" 
              value={sourceContact} 
              onValueChange={setSourceContact}
              disabled={source === 'RETAIL'}
              required={source !== 'RETAIL'}
            >
                <SelectTrigger>
                <SelectValue placeholder={source === 'RETAIL' ? "零售无需填写" : "选择推广员"} />
                </SelectTrigger>
                <SelectContent>
                {safePromoters.filter(p => {
                  if (!p) return false
                  if (source === 'RETAIL') return false
                  // Strict filtering by channel, but allow backward compatibility if needed
                  // or if user wants flexibility, we can relax this.
                  // User specifically asked why "Xiao Li" (no channel) appears.
                  // So we enforce strict matching.
                  
                  // Handle "No Channel" case: they shouldn't appear in specific lists unless we want them to.
                  // Current decision: Only show promoters matching the selected source.
                  // Note: p.channel might be undefined for old data.
                  
                  // If p.channel matches source, show it.
                  if (p.channel === source) return true
                  
                  // Legacy support: check 'channels' array if it exists
                  const legacyChannels = (p as any).channels as OrderSource[] | undefined
                  if (legacyChannels && legacyChannels.includes(source)) return true

                  return false
                }).map(p => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                ))}
                <SelectItem value="self">自主开发</SelectItem>
                </SelectContent>
            </Select>
            {source === 'RETAIL' && <input type="hidden" name="sourceContact" value="" />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>推广方式</Label>
          <Select name="platform" value={platform} onValueChange={(v: OrderPlatform) => setPlatform(v)} required>
            <SelectTrigger>
              <SelectValue placeholder="选择推广方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="XIAOHONGSHU">小红书</SelectItem>
              <SelectItem value="XIANYU">闲鱼</SelectItem>
              <SelectItem value="DOUYIN">抖音</SelectItem>
              <SelectItem value="OTHER">其他</SelectItem>
              <SelectItem value="OFFLINE">线下</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>用户昵称（闲鱼等） (选填)</Label>
          <Input name="customerXianyuId" defaultValue={initialData?.customerXianyuId} placeholder="请输入用户昵称" />
        </div>

        <div className="space-y-2">
            <Label>小程序订单号 (选填)</Label>
            <Input name="miniProgramOrderNo" defaultValue={initialData?.miniProgramOrderNo} placeholder="请输入小程序订单号" />
        </div>

        <div className="space-y-2">
            <Label>闲鱼订单号 (选填)</Label>
            <Input name="xianyuOrderNo" defaultValue={initialData?.xianyuOrderNo} placeholder="请输入闲鱼订单号" />
        </div>

        <div className="space-y-2">
            <Label>订单截图 (选填)</Label>
            <Input 
                type="file" 
                accept="image/*"
                onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    
                    const formData = new FormData()
                    formData.append('file', file)
                    
                    try {
                        const res = await fetch('/api/upload', {
                            method: 'POST',
                            body: formData
                        })
                        const data = await res.json()
                        if (data.success) {
                            // Create a hidden input to submit the URL
                            // Or use state if we were submitting via JSON, but here we use form action?
                            // Wait, the form action uses FormData directly from the form elements.
                            // But we need to pass the URL, not the file object, because the server action might expect the URL string
                            // OR we can handle file upload in the server action if we change it to use FormData.
                            // However, the current 'createOrder' action likely takes an object.
                            // Let's check how 'handleSubmit' works.
                            
                            // It uses 'action={handleSubmit}'.
                            // Let's check 'createOrder' in actions.ts.
                            // It takes 'Order'.
                            
                            // Strategy: Upload client-side, get URL, put URL in a hidden input.
                            if (screenshotInputRef.current) {
                                screenshotInputRef.current.value = data.url
                            }
                            toast.success("截图上传成功")
                        } else {
                            toast.error("上传失败")
                        }
                    } catch (err) {
                        console.error(err)
                        toast.error("上传出错")
                    }
                }}
            />
            <input type="hidden" name="screenshot" defaultValue={initialData?.screenshot || ''} ref={screenshotInputRef} />
            {initialData?.screenshot && (
                <div className="mt-1">
                    <a href={initialData.screenshot} target="_blank" className="text-xs text-blue-500 underline">查看当前截图</a>
                </div>
            )}
        </div>
      </div>

      <div className="space-y-4 border p-4 rounded-md bg-gray-50">
        <h3 className="font-semibold text-sm">租赁设备信息</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 flex flex-col">
            <Label className="mb-2">选择型号 (支持搜索)</Label>
            <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openProductSearch}
                  className="w-full justify-between"
                >
                  {selectedProductId
                    ? products.find((product) => product.id === selectedProductId)?.name
                    : "搜索选择设备..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0">
                <Command>
                  <CommandInput placeholder="搜索设备型号..." />
                  <CommandList>
                    <CommandEmpty>未找到设备</CommandEmpty>
                    <CommandGroup>
                      {products.map((product) => (
                        <CommandItem
                          key={product.id}
                          value={product.name}
                          onSelect={() => {
                            setSelectedProductId(product.id === selectedProductId ? "" : product.id)
                            setSelectedVariantName("")
                            setOpenProductSearch(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedProductId === product.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {product.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <input type="hidden" name="productName" value={selectedProduct?.name || ''} />
          </div>

          <div className="space-y-2">
            <Label>选择版本</Label>
            <Select 
              name="variantName" 
              value={selectedVariantName}
              onValueChange={setSelectedVariantName}
              disabled={!selectedProduct}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="选择版本" />
              </SelectTrigger>
              <SelectContent>
                {selectedProduct?.variants.map(v => (
                  <SelectItem key={v.name} value={v.name}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 col-span-2">
             <Label>设备SN码 (选填)</Label>
             <Input name="sn" defaultValue={initialData?.sn} placeholder="请输入设备SN码" />
          </div>
        </div>

        {selectedVariant && (
            <div className="text-xs text-gray-500 bg-white p-2 rounded border">
                <span className="font-bold">包含配件：</span> {selectedVariant.accessories}

                <div className="mt-2 pt-2 border-t border-gray-100">
                     <span className="font-bold block mb-1">可选租期：</span>
                     <div className="flex flex-wrap gap-2">
                         {Object.keys(selectedVariant.priceRules).map(d => (
                             <Button 
                                key={d} 
                                type="button" 
                                variant={duration.toString() === d ? "default" : "outline"}
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleDurationSelect(Number(d))}
                             >
                                {d}天 (¥{selectedVariant.priceRules[d]})
                             </Button>
                         ))}
                     </div>
                </div>
            </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
            <Label>租期开始日期</Label>
            <Input 
                type="date" 
                name="rentStartDate" 
                value={rentStartDate}
                onChange={(e) => setRentStartDate(e.target.value)}
                required 
            />
        </div>

        <div className="space-y-2">
            <Label>租期结束日期 ({duration}天)</Label>
            <Input 
                type="date" 
                value={rentEndDate}
                onChange={(e) => setRentEndDate(e.target.value)}
                required 
            />
            <input type="hidden" name="duration" value={duration} />
        </div>

        {/* Hidden Auto-calculated Fields */}
        <input type="hidden" name="deliveryTime" value={deliveryTime} />
        <input type="hidden" name="returnDeadline" value={returnDeadline} />
      </div>
      <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100">
        提示：系统自动计算发货与寄回时间。
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
            <Label>租金 (¥)</Label>
            <Input 
                type="number" 
                name="rentPrice" 
                value={rentPrice} 
                onChange={e => setRentPrice(Number(e.target.value))}
            />
        </div>
        <div className="space-y-2">
            <Label>安心保 (¥)</Label>
            <Input 
                type="number" 
                name="insurancePrice" 
                value={insurancePrice} 
                onChange={e => setInsurancePrice(Number(e.target.value))}
            />
        </div>
        <div className="space-y-2">
            <Label>租机押金 (¥)</Label>
            <Input 
                type="number" 
                name="deposit" 
                value={deposit} 
                onChange={e => setDeposit(Number(e.target.value))}
            />
        </div>
      </div>
      
      <div className="flex justify-end items-center space-x-2 border-t pt-4">
        <span className="text-sm font-bold">总金额:</span>
        <span className="text-xl text-red-600 font-bold">¥ {totalAmount}</span>
        <input type="hidden" name="totalAmount" value={totalAmount} />
      </div>

      {isEdit && (
          <div className="space-y-4 border p-4 rounded-md bg-blue-50 border-blue-100">
              <h3 className="font-semibold text-sm text-blue-800">续租管理</h3>
              
              <div className="space-y-2 mb-4">
                  <Label className="text-xs text-gray-500">已续租记录</Label>
                  <div className="space-y-2">
                      {extensions.map((ext, idx) => (
                          <div key={idx} className="flex gap-2 items-center bg-white p-2 rounded border">
                              <div className="flex-1 flex items-center gap-2">
                                  <Label className="text-xs whitespace-nowrap">天数:</Label>
                                  <Input 
                                    type="number" 
                                    value={ext.days} 
                                    className="h-7 text-xs w-20"
                                    onChange={(e) => {
                                        const newExtensions = [...extensions];
                                        newExtensions[idx] = { ...newExtensions[idx], days: Number(e.target.value) };
                                        setExtensions(newExtensions);
                                    }}
                                  />
                              </div>
                              <div className="flex-1 flex items-center gap-2">
                                  <Label className="text-xs whitespace-nowrap">金额:</Label>
                                  <Input 
                                    type="number" 
                                    value={ext.price} 
                                    className="h-7 text-xs w-20"
                                    onChange={(e) => {
                                        const newExtensions = [...extensions];
                                        newExtensions[idx] = { ...newExtensions[idx], price: Number(e.target.value) };
                                        setExtensions(newExtensions);
                                    }}
                                  />
                              </div>
                              <div className="text-xs text-gray-400 w-24 text-right">
                                {ext.createdAt.split('T')[0]}
                              </div>
                          </div>
                      ))}
                      {extensions.length === 0 && (
                          <div className="text-xs text-gray-400 italic">暂无续租记录</div>
                      )}
                  </div>
                  <input type="hidden" name="extensionsJSON" value={JSON.stringify(extensions)} />
              </div>

              <div className="border-t border-blue-200 pt-4 mt-4">
                  <Label className="text-sm font-semibold text-blue-800 mb-2 block">新增续租</Label>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <Label>续租天数</Label>
                          <Input type="number" name="extensionDays" placeholder="0" min="0" />
                      </div>
                      <div className="space-y-2">
                          <Label>续租金额</Label>
                          <Input type="number" name="extensionPrice" placeholder="0" min="0" />
                      </div>
                  </div>
              </div>
          </div>
      )}

      <div className="space-y-4 border p-4 rounded-md bg-gray-50">
        <h3 className="font-semibold text-sm">收货信息</h3>
        
        <div className="space-y-2 p-3 bg-blue-50 rounded border border-blue-100">
             <Label className="text-blue-800">智能识别 (粘贴整段地址)</Label>
             <div className="flex gap-2">
                 <Textarea 
                    value={smartAddress}
                    onChange={e => setSmartAddress(e.target.value)}
                    placeholder="例如: 张三 13800138000 广东省深圳市南山区xxx街道xxx号"
                    className="h-20 text-xs bg-white"
                 />
                 <Button type="button" onClick={handleSmartParse} className="h-20">识别</Button>
             </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label>收件人姓名</Label>
                <Input name="recipientName" value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="请输入收件人姓名" />
            </div>
            <div className="space-y-2">
                <Label>收件人电话</Label>
                <Input name="recipientPhone" value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)} placeholder="请输入收件人电话" />
            </div>
        </div>

        <div className="space-y-2">
            <Label>送达地址</Label>
            <div className="grid grid-cols-2 gap-4 mb-2">
            <Select value={province} onValueChange={(val) => { setProvince(val); setCity(""); }}>
                <SelectTrigger>
                    <SelectValue placeholder="省份" />
                </SelectTrigger>
                <SelectContent>
                    {CHINA_REGIONS.map(p => (
                        <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            
            <Select key={province} value={city} onValueChange={setCity} disabled={!province}>
                <SelectTrigger>
                    <SelectValue placeholder="城市" />
                </SelectTrigger>
                <SelectContent>
                    {cities.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        <Textarea 
            value={detailAddress} 
            onChange={e => setDetailAddress(e.target.value)} 
            placeholder="请输入详细地址（街道、小区、楼栋号等）" 
            className="min-h-[80px]"
        />
      </div>
      </div>

      <div className="space-y-2">
        <Label>备注 (选填)</Label>
        <Textarea name="remark" defaultValue={initialData?.remark} placeholder="填写其他注意事项..." className="h-20" />
      </div>

      <Button type="submit" size="lg" className="w-full">{isEdit ? '保存修改' : '创建订单'}</Button>
    </form>
  )
}
