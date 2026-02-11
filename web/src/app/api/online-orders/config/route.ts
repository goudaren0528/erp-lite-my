import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { CONFIG_KEY, type OnlineOrdersConfig } from "@/lib/online-orders/zanchen"

export async function GET() {
  const config = await prisma.appConfig.findUnique({
    where: { key: CONFIG_KEY }
  })
  
  if (!config?.value) {
    const defaultConfig: OnlineOrdersConfig = {
      autoSyncEnabled: false,
      interval: 60,
      headless: true,
      nightMode: false,
      nightPeriod: { start: 22, end: 6 },
      webhookUrls: [],
      sites: []
    }
    return NextResponse.json(defaultConfig)
  }
  
  try {
    return NextResponse.json(JSON.parse(config.value))
  } catch {
    return NextResponse.json({})
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    // Validate or merge? For now just overwrite or merge top level
    const existing = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } })
    let newConfig = data
    if (existing?.value) {
        try {
            const old = JSON.parse(existing.value)
            newConfig = { ...old, ...data }
        } catch {}
    }

    await prisma.appConfig.upsert({
      where: { key: CONFIG_KEY },
      update: { value: JSON.stringify(newConfig) },
      create: { key: CONFIG_KEY, value: JSON.stringify(newConfig) }
    })
    
    return NextResponse.json(newConfig)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
