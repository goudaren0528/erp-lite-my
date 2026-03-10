import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { autoMatchSpecId } from "@/lib/spec-auto-match"

export const dynamic = "force-dynamic"

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  if (lines.length < 2) return []
  const headers = parseCSVRow(lines[0])
  const result: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCSVRow(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? "" })
    result.push(row)
  }
  return result
}

function parseCSVRow(line: string): string[] {
  const cells: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      let cell = ""
      i++
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { cell += '"'; i += 2 }
        else if (line[i] === '"') { i++; break }
        else { cell += line[i++] }
      }
      cells.push(cell)
      if (line[i] === ",") i++
    } else {
      const end = line.indexOf(",", i)
      if (end === -1) { cells.push(line.slice(i)); break }
      cells.push(line.slice(i, end))
      i = end + 1
    }
  }
  return cells
}

const toFloat = (v: string) => { const n = parseFloat(v); return isNaN(n) ? null : n }
const toInt   = (v: string) => { const n = parseInt(v);   return isNaN(n) ? null : n }
const toDate  = (v: string) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d }
const str     = (v: string) => v === "" ? null : v

const BATCH = 50

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length === 0) return NextResponse.json({ error: "Empty or invalid CSV" }, { status: 400 })

    const total = rows.length
    let upserted = 0
    let failed = 0

    // Stream progress as newline-delimited JSON
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))

        send({ type: "start", total })

        // Track orderNos processed this import for post-import auto-match
        const processedOrderNos: string[] = []

        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH)

          for (const row of batch) {
            const orderNo = row["orderNo"]?.trim()
            if (!orderNo) { failed++; continue }

            const data = {
              platform:                  row["platform"] || "UNKNOWN",
              status:                    row["status"] || "UNKNOWN",
              merchantName:              str(row["merchantName"]),
              productName:               str(row["productName"]),
              variantName:               str(row["variantName"]),
              itemTitle:                 str(row["itemTitle"]),
              itemSku:                   str(row["itemSku"]),
              totalAmount:               toFloat(row["totalAmount"]),
              rentPrice:                 toFloat(row["rentPrice"]),
              deposit:                   toFloat(row["deposit"]),
              insurancePrice:            toFloat(row["insurancePrice"]),
              duration:                  toInt(row["duration"]),
              rentStartDate:             toDate(row["rentStartDate"]),
              returnDeadline:            toDate(row["returnDeadline"]),
              customerName:              str(row["customerName"]),
              recipientPhone:            str(row["recipientPhone"]),
              address:                   str(row["address"]),
              logisticsCompany:          str(row["logisticsCompany"]),
              trackingNumber:            str(row["trackingNumber"]),
              latestLogisticsInfo:       str(row["latestLogisticsInfo"]),
              returnLogisticsCompany:    str(row["returnLogisticsCompany"]),
              returnTrackingNumber:      str(row["returnTrackingNumber"]),
              returnLatestLogisticsInfo: str(row["returnLatestLogisticsInfo"]),
              promotionChannel:          str(row["promotionChannel"]),
              productId:                 str(row["productId"]),
              customerXianyuId:          str(row["customerXianyuId"]),
              sourceContact:             str(row["sourceContact"]),
              source:                    str(row["source"]),
              manualSn:                  str(row["manualSn"]),
              updatedAt:                 new Date(),
            }

            try {
              await prisma.onlineOrder.upsert({
                where: { orderNo },
                // update: never touch specId — preserve existing match
                update: { ...data },
                // create: specId starts null, auto-match runs after
                create: { orderNo, ...data, specId: null, createdAt: toDate(row["createdAt"]) ?? new Date() },
              })
              processedOrderNos.push(orderNo)
              upserted++
            } catch {
              failed++
            }
          }

          send({ type: "progress", processed: Math.min(i + BATCH, total), total, upserted, failed })
        }

        // Auto-match specId for processed orders that still have no specId
        if (processedOrderNos.length > 0) {
          const unmatched = await prisma.onlineOrder.findMany({
            where: { orderNo: { in: processedOrderNos }, specId: null },
            select: { id: true, itemTitle: true, itemSku: true },
          })
          for (const order of unmatched) {
            const matched = await autoMatchSpecId(order.itemTitle, order.itemSku)
            if (matched) {
              await prisma.onlineOrder.update({
                where: { id: order.id },
                data: { specId: matched },
              }).catch(() => void 0)
            }
          }
        }

        send({ type: "done", total, upserted, failed })
        controller.close()
      }
    })

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
