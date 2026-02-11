import { NextRequest, NextResponse } from "next/server"
import { getSyncConfig, saveSyncConfig, OfflineSyncConfig } from "@/lib/offline-sync/service"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get("siteId") || "zanchen"
  const config = await getSyncConfig(siteId)
  return NextResponse.json(config)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const siteId = body.siteId || "zanchen"
    const config: OfflineSyncConfig = {
      enabled: Boolean(body.enabled),
      intervalMinutes: Math.max(5, Number(body.intervalMinutes) || 60)
    }
    await saveSyncConfig(siteId, config)
    return NextResponse.json(config)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
