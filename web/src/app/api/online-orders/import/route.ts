import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { autoMatchSpecId } from "@/lib/spec-auto-match"

export const dynamic = "force-dynamic"

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = parseCSVRow(lines[0])
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCSVRow(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? "" })
    rows.push(row)
  }
  return { headers, rows }
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

function buildUpdateData(row: Record<string, string>) {
  const fieldMap: Record<string, unknown> = {}
  const add = (key: string, val: unknown) => { if (val !== null && val !== undefined) fieldMap[key] = val }

  if (row["platform"]                  !== undefined && row["platform"] !== "")  add("platform", row["platform"])
  if (row["status"]                    !== undefined && row["status"] !== "")    add("status", row["status"])
  if (row["merchantName"]              !== undefined) add("merchantName",              str(row["merchantName"]))
  if (row["productName"]               !== undefined) add("productName",               str(row["productName"]))
  if (row["variantName"]               !== undefined) add("variantName",               str(row["variantName"]))
  if (row["itemTitle"]                 !== undefined) add("itemTitle",                 str(row["itemTitle"]))
  if (row["itemSku"]                   !== undefined) add("itemSku",                   str(row["itemSku"]))
  if (row["totalAmount"]               !== undefined) add("totalAmount",               toFloat(row["totalAmount"]))
  if (row["rentPrice"]                 !== undefined) add("rentPrice",                 toFloat(row["rentPrice"]))
  if (row["deposit"]                   !== undefined) add("deposit",                   toFloat(row["deposit"]))
  if (row["insurancePrice"]            !== undefined) add("insurancePrice",            toFloat(row["insurancePrice"]))
  if (row["duration"]                  !== undefined) add("duration",                  toInt(row["duration"]))
  if (row["rentStartDate"]             !== undefined) add("rentStartDate",             toDate(row["rentStartDate"]))
  if (row["returnDeadline"]            !== undefined) add("returnDeadline",            toDate(row["returnDeadline"]))
  if (row["customerName"]              !== undefined) add("customerName",              str(row["customerName"]))
  if (row["recipientPhone"]            !== undefined) add("recipientPhone",            str(row["recipientPhone"]))
  if (row["address"]                   !== undefined) add("address",                   str(row["address"]))
  if (row["logisticsCompany"]          !== undefined) add("logisticsCompany",          str(row["logisticsCompany"]))
  if (row["trackingNumber"]            !== undefined) add("trackingNumber",            str(row["trackingNumber"]))
  if (row["latestLogisticsInfo"]       !== undefined) add("latestLogisticsInfo",       str(row["latestLogisticsInfo"]))
  if (row["returnLogisticsCompany"]    !== undefined) add("returnLogisticsCompany",    str(row["returnLogisticsCompany"]))
  if (row["returnTrackingNumber"]      !== undefined) add("returnTrackingNumber",      str(row["returnTrackingNumber"]))
  if (row["returnLatestLogisticsInfo"] !== undefined) add("returnLatestLogisticsInfo", str(row["returnLatestLogisticsInfo"]))
  if (row["promotionChannel"]          !== undefined) add("promotionChannel",          str(row["promotionChannel"]))
  if (row["productId"]                 !== undefined) add("productId",                 str(row["productId"]))
  if (row["customerXianyuId"]          !== undefined) add("customerXianyuId",          str(row["customerXianyuId"]))
  if (row["sourceContact"]             !== undefined) add("sourceContact",             str(row["sourceContact"]))
  if (row["source"]                    !== undefined) add("source",                    str(row["source"]))
  if (row["manualSn"]                  !== undefined) add("manualSn",                  str(row["manualSn"]))

  fieldMap["updatedAt"] = new Date()
  return fieldMap
}

const BATCH = 50

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    // Detect encoding: UTF-8 BOM (EF BB BF) -> UTF-8, otherwise try GBK (Excel default)
    let text: string
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      text = new TextDecoder("utf-8").decode(buffer)
    } else {
      try { text = new TextDecoder("gbk").decode(buffer) }
      catch { text = new TextDecoder("utf-8").decode(buffer) }
    }
    const { headers: rawHeaders, rows } = parseCSV(text)
    if (rows.length === 0) return NextResponse.json({ error: "Empty or invalid CSV" }, { status: 400 })

    const dataHeaders = rawHeaders.filter(h => h !== "errorReason")
    const isUpdateOnly = !dataHeaders.includes("platform") && !dataHeaders.includes("status")
    const hasSnColumn = dataHeaders.includes("manualSn")

    const total = rows.length
    let upserted = 0
    let failed = 0

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))

        send({ type: "start", total })

        const processedOrderNos: string[] = []
        const errorRows: { row: Record<string, string>; reason: string }[] = []

        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH)

          const batchOrderNos = batch.map(r => r["orderNo"]?.trim()).filter(Boolean)
          const existingOrders = await prisma.onlineOrder.findMany({
            where: { orderNo: { in: batchOrderNos } },
            select: { orderNo: true },
          })
          const existingSet = new Set(existingOrders.map(o => o.orderNo))

          let validSnSet: Set<string> | null = null
          if (hasSnColumn) {
            const batchSns = batch.map(r => r["manualSn"]?.trim()).filter(Boolean)
            if (batchSns.length > 0) {
              const validItems = await prisma.inventoryItem.findMany({
                where: { sn: { in: batchSns }, status: { not: "DELETED" } },
                select: { sn: true },
              })
              validSnSet = new Set(validItems.map(o => o.sn).filter((s): s is string => Boolean(s)))
            } else {
              validSnSet = new Set()
            }
          }

          for (const row of batch) {
            const orderNo = row["orderNo"]?.trim()
            if (!orderNo) {
              failed++
              errorRows.push({ row, reason: "缺少订单号" })
              continue
            }

            if (isUpdateOnly && !existingSet.has(orderNo)) {
              failed++
              errorRows.push({ row, reason: "订单号不存在" })
              continue
            }

            if (hasSnColumn && validSnSet) {
              const sn = row["manualSn"]?.trim()
              if (sn && !validSnSet.has(sn)) {
                failed++
                errorRows.push({ row, reason: `SN "${sn}" 不在库存中` })
                continue
              }
            }

            try {
              if (isUpdateOnly) {
                await prisma.onlineOrder.update({
                  where: { orderNo },
                  data: buildUpdateData(row),
                })
              } else {
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
                await prisma.onlineOrder.upsert({
                  where: { orderNo },
                  update: { ...data },
                  create: { orderNo, ...data, specId: null, createdAt: toDate(row["createdAt"]) ?? new Date() },
                })
              }
              processedOrderNos.push(orderNo)
              upserted++
            } catch {
              failed++
              errorRows.push({ row, reason: "数据库写入失败" })
            }
          }

          send({ type: "progress", processed: Math.min(i + BATCH, total), total, upserted, failed })
        }

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

        send({ type: "done", total, upserted, failed, errorRows, dataHeaders })
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
