import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { validateBearerToken } from "@/lib/api-token"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const valid = await validateBearerToken(req.headers.get("authorization"))
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page     = Math.max(1, parseInt(searchParams.get("page") || "1"))
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "50")))
  const status   = searchParams.get("status") || undefined
  const platform = searchParams.get("platform") || undefined
  const orderNo  = searchParams.get("orderNo") || undefined
  const source   = searchParams.get("source") || undefined
  const startDate = searchParams.get("startDate") || undefined
  const endDate   = searchParams.get("endDate") || undefined

  const where: Record<string, unknown> = { creatorId: { not: "system" } }
  if (status)   where.status   = status
  if (platform) where.platform = platform
  if (source)   where.source   = source
  if (orderNo)  where.orderNo  = { contains: orderNo }
  if (startDate || endDate) {
    const createdAt: Record<string, Date> = {}
    if (startDate) { const d = new Date(startDate); d.setHours(0,0,0,0); createdAt.gte = d }
    if (endDate)   { const d = new Date(endDate);   d.setDate(d.getDate()+1); d.setHours(0,0,0,0); createdAt.lt = d }
    where.createdAt = createdAt
  }

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, orderNo: true, source: true, platform: true, status: true,
        customerXianyuId: true, sourceContact: true,
        productName: true, variantName: true, sn: true,
        duration: true, rentPrice: true, deposit: true, insurancePrice: true,
        overdueFee: true, totalAmount: true,
        address: true, recipientName: true, recipientPhone: true,
        logisticsCompany: true, trackingNumber: true, latestLogisticsInfo: true,
        returnLogisticsCompany: true, returnTrackingNumber: true, returnLatestLogisticsInfo: true,
        rentStartDate: true, returnDeadline: true, deliveryTime: true,
        actualDeliveryTime: true, completedAt: true,
        remark: true, creatorName: true, createdAt: true, updatedAt: true,
      },
    }),
  ])

  return NextResponse.json({
    total,
    page,
    pageSize,
    data: orders.map(o => ({
      ...o,
      rentStartDate:      o.rentStartDate?.toISOString()      ?? null,
      returnDeadline:     o.returnDeadline?.toISOString()     ?? null,
      deliveryTime:       o.deliveryTime?.toISOString()       ?? null,
      actualDeliveryTime: o.actualDeliveryTime?.toISOString() ?? null,
      completedAt:        o.completedAt?.toISOString()        ?? null,
      createdAt:          o.createdAt.toISOString(),
      updatedAt:          o.updatedAt.toISOString(),
    })),
  })
}
