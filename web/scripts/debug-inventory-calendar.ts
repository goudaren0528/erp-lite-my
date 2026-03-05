import { PrismaClient } from "@prisma/client"
import { addDays, parseISO, subDays } from "date-fns"

const prisma = new PrismaClient()

async function main() {
  const orderNo = process.argv[2] || "O202603042028984542376361984"
  const monthStartStr = process.argv[3] || "2026-03-01"
  const monthEndStr = process.argv[4] || "2026-04-30"

  const start = parseISO(monthStartStr)
  const end = parseISO(monthEndStr)
  const queryStart = subDays(start, 7)
  const queryEnd = addDays(end, 7)

  const o = await prisma.onlineOrder.findUnique({ where: { orderNo } })
  console.log("order", {
    orderNo: o?.orderNo,
    platform: o?.platform,
    status: o?.status,
    rentStartDate: o?.rentStartDate,
    returnDeadline: o?.returnDeadline,
    productId: o?.productId,
    specId: o?.specId,
    productName: o?.productName,
    variantName: o?.variantName,
  })

  const onlineOrders = await prisma.onlineOrder.findMany({
    where: {
      OR: [
        {
          rentStartDate: { lte: queryEnd },
          returnDeadline: { gte: queryStart },
        },
        {
          rentStartDate: { lte: queryEnd },
          returnDeadline: null,
        },
      ],
      status: {
        notIn: ["TRADE_CLOSED", "WAIT_BUYER_PAY", "CANCELED", "REFUNDED", "已关闭", "已取消", "已买断"],
      },
    },
    select: {
      orderNo: true,
      platform: true,
      status: true,
      rentStartDate: true,
      returnDeadline: true,
      productId: true,
      specId: true,
      productName: true,
      variantName: true,
    },
  })

  console.log("queryWindow", { monthStartStr, monthEndStr, queryStart, queryEnd })
  console.log("onlineOrdersCount", onlineOrders.length)
  console.log("containsTarget", onlineOrders.some((x) => x.orderNo === orderNo))

  if (o?.specId) {
    const spec = await prisma.productSpec.findFirst({
      where: { OR: [{ id: o.specId }, { specId: o.specId }] },
      select: { id: true, specId: true, name: true, productId: true, bomItems: { select: { itemTypeId: true, quantity: true } } },
    })
    console.log("specByOrderSpecId", spec)

    if (spec?.bomItems?.length) {
      const itemCounts = await prisma.inventoryItem.groupBy({
        by: ["itemTypeId"],
        where: { status: { notIn: ["SCRAPPED", "LOST", "SOLD", "DELETED"] } },
        _count: true,
      })
      const stocks = await prisma.inventoryStock.findMany({ select: { itemTypeId: true, quantity: true } })
      const stockMap = new Map<string, number>()
      itemCounts.forEach((i) => stockMap.set(i.itemTypeId, (stockMap.get(i.itemTypeId) || 0) + i._count))
      stocks.forEach((s) => stockMap.set(s.itemTypeId, (stockMap.get(s.itemTypeId) || 0) + s.quantity))

      const reqMap = new Map<string, number>()
      spec.bomItems.forEach((b) => reqMap.set(b.itemTypeId, (reqMap.get(b.itemTypeId) || 0) + b.quantity))

      let minBuildable = Number.MAX_SAFE_INTEGER
      for (const [itemTypeId, requiredQty] of reqMap.entries()) {
        if (requiredQty <= 0) continue
        const available = stockMap.get(itemTypeId) || 0
        const buildable = Math.floor(available / requiredQty)
        if (buildable < minBuildable) minBuildable = buildable
      }
      if (minBuildable === Number.MAX_SAFE_INTEGER) minBuildable = 0

      console.log("specBuildableByBom", {
        specId: spec.id,
        requirements: [...reqMap.entries()],
        buildable: minBuildable,
      })
    } else {
      console.log("specBuildableByBom", { specId: spec?.id, requirements: [], buildable: 0 })
    }
  }

  if (o?.productId) {
    const product = await prisma.product.findUnique({
      where: { id: o.productId },
      include: { specs: { select: { id: true, specId: true, name: true } } },
    })
    console.log("productByOrderProductId", product ? { id: product.id, name: product.name, specCount: product.specs.length } : null)
    if (product && o?.specId) {
      console.log(
        "productHasSpecId",
        product.specs.some((s) => s.id === o.specId),
        "productHasSpecSpecId",
        product.specs.some((s) => s.specId === o.specId)
      )
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
