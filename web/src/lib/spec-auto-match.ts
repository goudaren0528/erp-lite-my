import { prisma } from "@/lib/db"

/**
 * Auto-match specId by itemTitle + itemSku.
 * Looks up existing OnlineOrder and Order records that already have a specId set.
 * Returns the first matching specId, or null if none found.
 */
export async function autoMatchSpecId(
  itemTitle: string | null | undefined,
  itemSku: string | null | undefined
): Promise<string | null> {
  if (!itemTitle && !itemSku) return null

  const where = {
    itemTitle: itemTitle || undefined,
    itemSku: itemSku || undefined,
    specId: { not: null as null },
  }

  // Check OnlineOrder first
  const onlineMatch = await prisma.onlineOrder.findFirst({
    where,
    select: { specId: true },
  })
  if (onlineMatch?.specId) return onlineMatch.specId

  // Then check offline Order
  const offlineMatch = await prisma.order.findFirst({
    where: {
      itemTitle: itemTitle || undefined,
      itemSku: itemSku || undefined,
      specId: { not: null as null },
    },
    select: { specId: true },
  })
  return offlineMatch?.specId ?? null
}
