
export function normalizeText(text: string) {
  return text.replace(/\s+/g, "").trim().toLowerCase()
}

export function parseVariantNames(raw: string | null | undefined) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => (typeof item === "string" ? item : (item as { name?: string }).name))
        .filter((item): item is string => Boolean(item))
    }
  } catch {
    void 0
  }
  return []
}

export function matchProductByTitle(
  itemTitle: string | undefined,
  itemSku: string | undefined,
  products: { id: string; name: string; variants: string | null }[]
) {
  const titleKey = normalizeText(itemTitle || "")
  const skuKey = normalizeText(itemSku || "")
  let matchedProduct: { id: string; name: string; variantName?: string } | null = null
  // 1) 先用商品标题匹配产品
  if (titleKey) {
    for (const product of products) {
      const productKey = normalizeText(product.name || "")
      if (!productKey) continue
      if (!titleKey.includes(productKey)) continue
      if (!matchedProduct || productKey.length > normalizeText(matchedProduct.name).length) {
        matchedProduct = { id: product.id, name: product.name }
      }
    }
  }
  // 2) 若标题未命中，再用 SKU 进行产品匹配
  if (!matchedProduct && skuKey) {
    for (const product of products) {
      const productKey = normalizeText(product.name || "")
      if (!productKey) continue
      if (!skuKey.includes(productKey)) continue
      if (!matchedProduct || productKey.length > normalizeText(matchedProduct.name).length) {
        matchedProduct = { id: product.id, name: product.name }
      }
    }
  }
  if (!matchedProduct) return null
  const variants = parseVariantNames(
    products.find(p => p.id === matchedProduct?.id)?.variants || ""
  )
  let matchedVariant: string | undefined
  for (const v of variants) {
    const variantKey = normalizeText(v)
    if (!variantKey) continue
    if ((skuKey && skuKey.includes(variantKey)) || titleKey.includes(variantKey)) {
      if (!matchedVariant || variantKey.length > normalizeText(matchedVariant).length) {
        matchedVariant = v
      }
    }
  }
  return { productId: matchedProduct.id, productName: matchedProduct.name, variantName: matchedVariant }
}

export function matchDeviceMapping(
  itemTitle: string | undefined,
  itemSku: string | undefined,
  products: { name: string; matchKeywords?: string | null; keywords?: string[] }[]
) {
  const titleKey = normalizeText(itemTitle || "")
  const skuKey = normalizeText(itemSku || "")
  if ((!titleKey && !skuKey) || products.length === 0) return null
  
  let matched: { name: string; keywordLength: number } | null = null
  
  for (const product of products) {
    let keywords: string[] = []
    
    if (Array.isArray(product.keywords)) {
        keywords = product.keywords
    } else if (product.matchKeywords) {
        try {
            const parsed = JSON.parse(product.matchKeywords)
            if (Array.isArray(parsed)) keywords = parsed
        } catch {
            continue
        }
    }

    if (keywords.length === 0) continue

    for (const keyword of keywords) {
        const key = normalizeText(keyword || "")
        if (!key) continue
        const hit = (!!titleKey && titleKey.includes(key)) || (!!skuKey && skuKey.includes(key))
        if (!hit) continue
        
        if (!matched || key.length > matched.keywordLength) {
          matched = { name: product.name, keywordLength: key.length }
        }
    }
  }
  return matched ? { deviceName: matched.name } : null
}
