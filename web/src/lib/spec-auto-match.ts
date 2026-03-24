import { prisma } from "@/lib/db"

/**
 * Auto-match specId by productName+variantName (primary) or itemTitle+itemSku (fallback).
 * Looks up existing OnlineOrder records that already have a specId set.
 * Returns the first matching specId, or null if none found.
 */
export async function autoMatchSpecId(
  itemTitle: string | null | undefined,
  itemSku: string | null | undefined,
  productName?: string | null,
  variantName?: string | null,
): Promise<string | null> {
  // Try productName+variantName first (more reliable, used by most platforms)
  if (productName && variantName) {
    const match = await prisma.onlineOrder.findFirst({
      where: { productName, variantName, specId: { not: null as null } },
      select: { specId: true },
    })
    if (match?.specId) return match.specId
  }

  // Fallback: itemTitle+itemSku (used by zanchen)
  if (itemTitle && itemSku) {
    const match = await prisma.onlineOrder.findFirst({
      where: { itemTitle, itemSku, specId: { not: null as null } },
      select: { specId: true },
    })
    if (match?.specId) return match.specId

    const offlineMatch = await prisma.order.findFirst({
      where: { itemTitle, itemSku, specId: { not: null as null } },
      select: { specId: true },
    })
    if (offlineMatch?.specId) return offlineMatch.specId
  }

  return null
}
