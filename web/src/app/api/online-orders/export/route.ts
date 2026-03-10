import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

// All exportable fields in order
const FIELDS = [
  "id", "orderNo", "platform", "status", "merchantName",
  "productName", "variantName", "itemTitle", "itemSku",
  "totalAmount", "rentPrice", "deposit", "insurancePrice",
  "duration", "rentStartDate", "returnDeadline",
  "customerName", "recipientPhone", "address",
  "logisticsCompany", "trackingNumber", "latestLogisticsInfo",
  "returnLogisticsCompany", "returnTrackingNumber", "returnLatestLogisticsInfo",
  "promotionChannel", "productId",
  "customerXianyuId", "sourceContact", "source", "manualSn",
  "createdAt", "updatedAt",
] as const

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const str = value instanceof Date ? value.toISOString() : String(value)
  // Wrap in quotes if contains comma, newline or quote
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(req: NextRequest) {
  try {
    const platform = req.nextUrl.searchParams.get("platform") || undefined

    const orders = await prisma.onlineOrder.findMany({
      where: platform ? { platform } : undefined,
      orderBy: { createdAt: "desc" },
    })

    const header = FIELDS.join(",")
    const rows = orders.map(order =>
      FIELDS.map(f => escapeCell((order as Record<string, unknown>)[f])).join(",")
    )

    const csv = [header, ...rows].join("\r\n")
    const date = new Date().toISOString().slice(0, 10)
    const asciiName = `online-orders-${date}.csv`
    const fullName = `online-orders${platform ? `-${platform}` : ""}-${date}.csv`
    // RFC 5987: encode non-ASCII filename for Content-Disposition
    const encodedName = encodeURIComponent(fullName)

    // Prepend UTF-8 BOM so Excel/Numbers correctly identifies encoding
    const bom = "\uFEFF"

    return new NextResponse(bom + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      },
    })
  } catch (e) {
    console.error("[Export] Error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
